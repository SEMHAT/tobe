import { ensureVapid, webPushSender } from "../../packages/core/src/node/webpush.js";
import { COLLECTIONS, createDb, DEFAULT_GOOGLE_CLIENT_ID, handleApi, preVerify, sendLoginCode, ToBeService, type ApiResult, type DbSnapshot, type EledjiProfile } from "../../packages/core/src/index.js";

/** Le strict nécessaire d'un client Postgres (pg ou @neondatabase/serverless). */
export interface PgClient {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
  release(): void;
}
export interface PgPool {
  connect(): Promise<PgClient>;
}

let ready: Promise<void> | null = null;
export function ensureSchema(pool: PgPool) {
  ready ??= (async () => {
    const c = await pool.connect();
    try {
      await c.query("CREATE TABLE IF NOT EXISTS docs (collection TEXT NOT NULL, id TEXT NOT NULL, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (collection, id))");
    } finally {
      c.release();
    }
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

const list = (v?: string) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export function serviceOptions(env: Record<string, string | undefined>) {
  return {
    adminEmails: list(env.ADMIN_EMAILS),
    paymentsEnabled: env.PAYMENTS_ENABLED === "true",
    exposeOtp: env.EXPOSE_OTP === "true",
    googleClientId: env.GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID,
    sendCode: (email: string, code: string) => sendLoginCode(email, code, env),
  };
}

/**
 * Exécute une requête de l'API sur la base Postgres.
 * Toutes les écritures passent par un verrou unique : elles s'exécutent l'une après l'autre,
 * ce qui garantit que deux achats ou deux votes simultanés ne s'écrasent jamais.
 * Une lecture qui ne modifie rien n'attend pas le verrou.
 */
export async function runApi(
  pool: PgPool,
  env: Record<string, string | undefined>,
  req: { method: string; path: string; query: Record<string, string | undefined>; body: unknown; token: string | null; eledji?: EledjiProfile },
): Promise<ApiResult> {
  await ensureSchema(pool);
  // Vérifications externes (Google) avant d'ouvrir la transaction.
  const pre = await preVerify(req, env);
  if (pre.error) return pre.error;
  const full = { ...req, verified: { ...pre.verified, eledji: req.eledji } };
  const attempt = async (lock: boolean): Promise<ApiResult | null> => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (lock) await client.query("SELECT pg_advisory_xact_lock(734211)");
      const { rows } = await client.query("SELECT collection, data FROM docs");
      const snapshot: DbSnapshot = {};
      for (const name of COLLECTIONS) snapshot[name] = [];
      for (const r of rows) (snapshot as Record<string, unknown[]>)[r.collection]?.push(r.data);
      const dirty = new Map<string, [string, { id: string }]>();
      const removed = new Map<string, [string, string]>();
      const db = createDb(snapshot, {
        upsert: (c, d) => {
          dirty.set(`${c}\u0000${d.id}`, [c, d]);
          removed.delete(`${c}\u0000${d.id}`);
        },
        remove: (c, id) => {
          removed.set(`${c}\u0000${id}`, [c, id]);
          dirty.delete(`${c}\u0000${id}`);
        },
      });
      // Clés des notifications push : créées au premier appel puis gardées dans la base.
      const vapid = ensureVapid(db, env);
      const svc = new ToBeService(db, { ...serviceOptions(env), push: { publicKey: vapid.publicKey, send: webPushSender(vapid) } });
      const result = handleApi(svc, full);
      if (!dirty.size && !removed.size) {
        await client.query("COMMIT");
        await Promise.all(svc.pending);
        await dropGone(client, svc);
        return result;
      }
      if (!lock) {
        await client.query("ROLLBACK");
        return null; // la lecture a modifié quelque chose : on recommence sous verrou
      }
      if (dirty.size) {
        const vals = [...dirty.values()];
        await client.query(
          "INSERT INTO docs (collection, id, data, updated_at) SELECT c, i, d, now() FROM unnest($1::text[], $2::text[], $3::jsonb[]) AS t(c, i, d) ON CONFLICT (collection, id) DO UPDATE SET data = excluded.data, updated_at = now()",
          [vals.map((v) => v[0]), vals.map((v) => v[1].id), vals.map((v) => JSON.stringify(v[1]))],
        );
      }
      if (removed.size) {
        const vals = [...removed.values()];
        await client.query("DELETE FROM docs WHERE (collection, id) IN (SELECT * FROM unnest($1::text[], $2::text[]))", [vals.map((v) => v[0]), vals.map((v) => v[1])]);
      }
      await client.query("COMMIT");
      await Promise.all(svc.pending);
      await dropGone(client, svc);
      return result;
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  };
  const first = await attempt(req.method !== "GET");
  return first ?? (await attempt(true))!;
}

/** Supprime les abonnements push qui n'existent plus (téléphone changé, notifications désactivées). */
async function dropGone(client: PgClient, svc: ToBeService) {
  if (!svc.goneSubs.length) return;
  await client.query("DELETE FROM docs WHERE collection = 'pushSubs' AND id = ANY($1::text[])", [svc.goneSubs]).catch(() => {});
}

/** Vérifie un jeton de session sans charger toute la base (envoi d'images). */
export async function sessionUser(pool: PgPool, token: string | null): Promise<string | null> {
  if (!token) return null;
  await ensureSchema(pool);
  const c = await pool.connect();
  try {
    const { rows } = await c.query("SELECT data FROM docs WHERE collection = 'sessions' AND id = $1", [token]);
    return rows[0]?.data?.userId ?? null;
  } finally {
    c.release();
  }
}

/**
 * Compte unique ELEDJI : eledji.com pose son cookie de session sur *.eledji.com.
 * On retrouve la personne dans la base partagée (tables d'Auth.js), sans rien lui redemander.
 */
export async function profilEledji(pool: PgPool, cookie: string | undefined): Promise<EledjiProfile | null> {
  const jeton = (cookie ?? "")
    .split(/;\s*/)
    .map((c) => c.split("="))
    .find(([k]) => k === "__Secure-authjs.session-token" || k === "authjs.session-token")?.[1];
  if (!jeton || jeton.length > 200) return null;
  const c = await pool.connect();
  try {
    const { rows } = await c.query(
      `SELECT lower(u.email) AS email, u.name, u.image FROM public.session s JOIN public."user" u ON u.id = s."userId"
        WHERE s."sessionToken" = $1 AND s.expires > now() LIMIT 1`,
      [decodeURIComponent(jeton)],
    );
    const r = rows[0] as EledjiProfile | undefined;
    return r?.email ? r : null;
  } catch {
    return null; // tables absentes (base locale) : pas de compte ELEDJI
  } finally {
    c.release();
  }
}
