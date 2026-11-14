import { COLLECTIONS, createDb, handleApi, sendLoginCode, ToBeService, type ApiResult, type DbSnapshot } from "../../packages/core/src/index.js";

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
  req: { method: string; path: string; query: Record<string, string | undefined>; body: unknown; token: string | null },
): Promise<ApiResult> {
  await ensureSchema(pool);
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
      const svc = new ToBeService(db, serviceOptions(env));
      const result = handleApi(svc, req);
      if (!dirty.size && !removed.size) {
        await client.query("COMMIT");
        await Promise.all(svc.pending);
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
