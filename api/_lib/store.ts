import { randomUUID } from "node:crypto";
import { ensureVapid, webPushSender } from "../../packages/core/src/node/webpush.js";
import { proxiedFetch } from "../../packages/core/src/node/proxyFetch.js";
import { COLLECTIONS, createDb, createPayGate, createSasPay, runWithPayments, type Gateway, DEFAULT_GOOGLE_CLIENT_ID, handleApi, preVerify, sendLoginCode, ToBeService, type ApiResult, type DbSnapshot, type EledjiProfile } from "../../packages/core/src/index.js";

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
    // Paiement réel dès que la clé secrète SasPay est configurée sur Vercel.
    checkout: !!gatewayFrom(env),
    // Validation de chaque publication par l'équipe (désactivable avec PREMODERATION=false).
    premoderation: env.PREMODERATION !== "false",
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
  req: { method: string; path: string; query?: Record<string, string | undefined>; body?: unknown; token?: string | null; eledji?: EledjiProfile; internal?: boolean },
): Promise<ApiResult> {
  await ensureSchema(pool);
  // Vérifications externes (Google) avant d'ouvrir la transaction.
  const pre = await preVerify(req, env);
  if (pre.error) return pre.error;
  const full = { ...req, verified: { ...pre.verified, eledji: req.eledji, internal: req.internal === true } };
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

let gatewayCache: { key: string; gw: Gateway } | null = null;
/**
 * Agrégateur de paiement, choisi par variable d'environnement :
 * PAYMENT_PROVIDER=paygate + PAYGATE_AUTH_TOKEN → PayGate Global ; sinon SasPay si SASPAY_SECRET_KEY.
 * Les envois d'argent passent par le relais à IP fixe (SASPAY_PROXY_URL / FIXIE_URL) dans les deux cas.
 */
export function gatewayFrom(env: Record<string, string | undefined>): Gateway | null {
  const proxy = env.SASPAY_PROXY_URL || env.FIXIE_URL || env.QUOTAGUARDSTATIC_URL || "";
  const pg = env.PAYGATE_AUTH_TOKEN?.trim();
  if (env.PAYMENT_PROVIDER === "paygate" && pg) {
    const k = `paygate|${pg}|${proxy}`;
    if (gatewayCache?.key !== k) gatewayCache = { key: k, gw: createPayGate({ authToken: pg, baseUrl: env.PAYGATE_BASE_URL || undefined, payoutFetcher: proxy ? proxiedFetch(proxy) : undefined }) };
    return gatewayCache.gw;
  }
  const key = env.SASPAY_SECRET_KEY?.trim();
  if (!key) return null;
  const cacheKey = `${key}|${proxy}`;
  if (gatewayCache?.key !== cacheKey) gatewayCache = { key: cacheKey, gw: createSasPay({ secretKey: key, baseUrl: env.SASPAY_BASE_URL || undefined, payoutFetcher: proxy ? proxiedFetch(proxy) : undefined }) };
  return gatewayCache.gw;
}

/** Vérifie (admin) que les reversements sortent bien par l'IP fixe du relais. */
async function relayCheck(pool: PgPool, env: Record<string, string | undefined>, token: string | null) {
  const auth = await runApi(pool, env, { method: "GET", path: "/admin/payments", token });
  if (auth.status !== 200) return auth;
  const proxy = env.SASPAY_PROXY_URL || env.FIXIE_URL || env.QUOTAGUARDSTATIC_URL || "";
  if (!proxy) return { status: 200, body: { relay: false } };
  try {
    const r = await proxiedFetch(proxy)("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(15000) });
    const { ip } = (await r.json()) as { ip: string };
    return { status: 200, body: { relay: true, ip } };
  } catch (e) {
    return { status: 200, body: { relay: true, error: (e as Error).message } };
  }
}

/** L'API complète, paiements compris : les appels à SasPay se font entre deux transactions. */
export function runApiWithPayments(
  pool: PgPool,
  env: Record<string, string | undefined>,
  req: { method: string; path: string; query: Record<string, string | undefined>; body: unknown; token: string | null; eledji?: EledjiProfile },
  raw?: { body: string; signature?: string | null; timestamp?: string | null },
) {
  if (req.method === "GET" && req.path.replace(/\/+$/, "") === "/admin/relay-check") return relayCheck(pool, env, req.token);
  return runWithPayments(
    (r) => runApi(pool, env, { method: r.method, path: r.path, query: r.query ?? {}, body: r.body, token: r.token ?? null, eledji: req.eledji, internal: r.verified?.internal === true }),
    { gateway: gatewayFrom(env), publicUrl: env.PUBLIC_URL || "https://tobe.eledji.com", webhookSecret: env.SASPAY_WEBHOOK_SECRET || null, raw },
    req,
  );
}

// ---------- Documents privés (pièces d'identité, preuves) : jamais publics ----------

let filesReady: Promise<void> | null = null;
function ensureFiles(pool: PgPool) {
  filesReady ??= (async () => {
    const c = await pool.connect();
    try {
      await c.query("CREATE TABLE IF NOT EXISTS private_files (id TEXT PRIMARY KEY, owner TEXT NOT NULL, mime TEXT NOT NULL, data BYTEA NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())");
    } finally {
      c.release();
    }
  })().catch((e) => {
    filesReady = null;
    throw e;
  });
  return filesReady;
}

export async function savePrivateFile(pool: PgPool, owner: string, mime: string, data: Buffer) {
  await ensureFiles(pool);
  const id = `doc_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const c = await pool.connect();
  try {
    await c.query("INSERT INTO private_files (id, owner, mime, data) VALUES ($1, $2, $3, $4)", [id, owner, mime, data]);
  } finally {
    c.release();
  }
  return id;
}

/** Le propriétaire ou un modérateur ToBe seulement. */
export async function readPrivateFile(pool: PgPool, env: Record<string, string | undefined>, id: string, token: string | null) {
  const userId = await sessionUser(pool, token);
  if (!userId) return { status: 401 as const };
  await ensureFiles(pool);
  const c = await pool.connect();
  let row: { owner: string; mime: string; data: Buffer } | undefined;
  try {
    row = (await c.query("SELECT owner, mime, data FROM private_files WHERE id = $1", [id])).rows[0];
  } finally {
    c.release();
  }
  if (!row) return { status: 404 as const };
  if (row.owner !== userId) {
    const mod = await runApi(pool, env, { method: "GET", path: "/admin/moderation", token });
    if (mod.status !== 200) return { status: 403 as const };
  }
  return { status: 200 as const, mime: row.mime, data: row.data };
}
