import { COLLECTIONS, createDb, handleApi, seedDb, snapshotDb, ToBeService, type DbSnapshot, type Persistence } from "@tobe/core";

const KEY = "tobe-demo-v1";
let saveTimer: number | undefined;

function load(): DbSnapshot | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DbSnapshot) : null;
  } catch {
    return null;
  }
}

const persistence: Persistence = {
  upsert: () => schedule(),
  remove: () => schedule(),
};

const snap = load();
const db = createDb(snap ?? {}, persistence);
if (!snap || !COLLECTIONS.every((c) => c in snap)) seedDb(db);
const svc = new ToBeService(db, { demo: true, exposeOtp: true });

function schedule() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(snapshotDb(db)));
    } catch (e) {
      console.warn("Stockage du navigateur plein", e);
    }
  }, 150);
}
schedule();

export function demoRequest(method: string, path: string, query: Record<string, string>, body: unknown, token: string | null) {
  return handleApi(svc, { method, path, query, body, token });
}

export function resetDemo() {
  localStorage.removeItem(KEY);
  location.href = "/";
}
