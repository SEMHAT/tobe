import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { COLLECTIONS, createDb, type Db, type DbSnapshot, type Persistence } from "@tobe/core";

/**
 * Stockage SQLite (intégré à Node, aucune dépendance native).
 * Chaque collection est une table de documents JSON ; tout est chargé en mémoire au démarrage
 * et chaque écriture est enregistrée immédiatement sur disque.
 */
export function openSqliteDb(file: string): { db: Db; close: () => void } {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sql = new DatabaseSync(file);
  sql.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
  sql.exec("CREATE TABLE IF NOT EXISTS docs (collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (collection, id))");
  const upsert = sql.prepare("INSERT INTO docs (collection, id, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at");
  const del = sql.prepare("DELETE FROM docs WHERE collection = ? AND id = ?");
  const all = sql.prepare("SELECT data FROM docs WHERE collection = ?");

  const snapshot: DbSnapshot = {};
  for (const name of COLLECTIONS) snapshot[name] = (all.all(name) as { data: string }[]).map((r) => JSON.parse(r.data));

  const persistence: Persistence = {
    upsert: (collection, doc) => void upsert.run(collection, doc.id, JSON.stringify(doc), new Date().toISOString()),
    remove: (collection, id) => void del.run(collection, id),
  };
  return { db: createDb(snapshot, persistence), close: () => sql.close() };
}
