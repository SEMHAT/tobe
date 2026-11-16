// Base commune ELEDJI (novembre 2026) : ToBe écrit désormais dans la même base qu'eledji.com
// et admin.eledji.com (ELEDJI_DATABASE_URL, ajoutée par l'intégration Neon avec le préfixe ELEDJI).
// À chaque mise en production, tant que l'ancienne base (DATABASE_URL) est encore reliée, ses
// documents sont recopiés dans la base commune : rien ne se perd, rien n'est supprimé.
// Un document déjà présent n'est remplacé que si l'ancienne version est plus récente.
import { Pool, neonConfig } from "@neondatabase/serverless";

const ancienne = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
const commune = process.env.ELEDJI_DATABASE_URL;
if (!ancienne || !commune || ancienne === commune || process.env.VERCEL_ENV !== "production") {
  console.log("[fusion] rien à copier");
  process.exit(0);
}
neonConfig.webSocketConstructor = globalThis.WebSocket; // Node 22
const a = new Pool({ connectionString: ancienne });
const b = new Pool({ connectionString: commune });
try {
  const exist = await a.query("SELECT to_regclass('public.docs') AS t");
  if (!exist.rows[0].t) {
    console.log("[fusion] l'ancienne base n'a pas de documents");
    process.exit(0);
  }
  const { rows } = await a.query("SELECT collection, id, data, updated_at FROM docs ORDER BY (collection = 'users') DESC, updated_at");
  await b.query("CREATE TABLE IF NOT EXISTS docs (collection TEXT NOT NULL, id TEXT NOT NULL, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (collection, id))");
  let n = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const part = rows.slice(i, i + 500);
    const r = await b.query(
      `INSERT INTO docs (collection, id, data, updated_at)
       SELECT * FROM unnest($1::text[], $2::text[], $3::jsonb[], $4::timestamptz[])
       ON CONFLICT (collection, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
       WHERE docs.updated_at < excluded.updated_at`,
      [part.map((x) => x.collection), part.map((x) => x.id), part.map((x) => JSON.stringify(x.data)), part.map((x) => x.updated_at)],
    );
    n += r.rowCount ?? 0;
  }
  console.log(`[fusion] ${rows.length} documents lus dans l'ancienne base, ${n} copiés ou mis à jour dans la base commune`);
} finally {
  await a.end();
  await b.end();
}
