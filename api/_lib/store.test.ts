import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { runApi, sessionUser, type PgPool } from "./store.js";

test("API sur Postgres : connexion, écriture sous verrou, lectures concurrentes", { timeout: 120_000 }, async () => {
  // Postgres réel (compilé en WebAssembly). Une seule connexion : on la prête à un client à la fois.
  const db = new PGlite();
  let queue = Promise.resolve();
  const pool: PgPool = {
    connect: () =>
      new Promise((resolve) => {
        queue = queue.then(
          () =>
            new Promise<void>((release) =>
              resolve({ query: async (text: string, params?: unknown[]) => ({ rows: (await db.query(text, params)).rows as any[] }), release: () => release() }),
            ),
        );
      }),
  };
  const env = { EXPOSE_OTP: "true", ADMIN_EMAILS: "admin@tobe.test" };
  const call = (method: string, p: string, body?: unknown, token: string | null = null, query: Record<string, string> = {}) => runApi(pool, env, { method, path: p, body: body ?? {}, query, token });
  try {
    assert.equal((await call("GET", "/home")).status, 200);
    const otp = (await call("POST", "/auth/otp", { email: "orga@exemple.tg" })).body as { devCode: string };
    const login = (await call("POST", "/auth/verify", { email: "orga@exemple.tg", code: otp.devCode, name: "Orga" })).body as { token: string };
    assert.ok(await sessionUser(pool, login.token));
    const ev = (await call("POST", "/events", { title: "Concert test", category: "concert", startsAt: new Date(Date.now() + 7 * 864e5).toISOString(), venue: "Salle", description: "", visibility: "public", access: "paid", ticketTypes: [{ name: "Standard", price: 2000, quota: 100 }], expectedAttendance: 100, reach: "ville", options: { votes: false, cagnotte: false, gallery: true, live: false } }, login.token)).body as { id: string; ticketTypes: { id: string }[] };
    // 10 achats simultanés : aucun ne doit en écraser un autre
    const buys = await Promise.all(Array.from({ length: 10 }, () => call("POST", `/events/${ev.id}/tickets`, { ticketTypeId: ev.ticketTypes[0].id, qty: 1, method: "cash" }, login.token)));
    assert.ok(buys.every((b) => b.status === 200));
    const view = (await call("GET", `/events/${ev.id}`, undefined, login.token)).body as { ticketTypes: { sold: number }[]; attendees: number };
    assert.equal(view.ticketTypes[0].sold, 10);
    assert.equal(view.attendees, 10);
    // une lecture qui compte une vue passe sous verrou et est bien enregistrée
    await Promise.all([call("GET", `/events/${ev.id}`), call("GET", `/events/${ev.id}`)]);
    const dash = (await call("GET", "/organizer", undefined, login.token)).body as { events: { views: number }[] };
    assert.equal(dash.events[0].views, 2);
    const list = (await call("GET", "/events")).body as unknown[];
    assert.equal(list.length, 1); // aucune donnée d'exemple en production
  } finally {
    await db.close();
  }
});

test("Compte unique ELEDJI : la session d'eledji.com ouvre une session ToBe", { timeout: 120_000 }, async () => {
  const { profilEledji } = await import("./store.js");
  const db = new PGlite();
  let queue = Promise.resolve();
  const pool: PgPool = {
    connect: () =>
      new Promise((resolve) => {
        queue = queue.then(() => new Promise<void>((release) => resolve({ query: async (text: string, params?: unknown[]) => ({ rows: (await db.query(text, params)).rows as any[] }), release: () => release() })));
      }),
  };
  // Sans tables Auth.js (base locale) : rien, sans erreur.
  assert.equal(await profilEledji(pool, "__Secure-authjs.session-token=abc"), null);
  // (le schéma « docs » est mis en cache par module : on le crée ici pour cette seconde base)
  await db.exec(`CREATE TABLE docs (collection TEXT NOT NULL, id TEXT NOT NULL, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (collection, id));
    CREATE TABLE "user" (id text primary key, name text, email text, image text);
    CREATE TABLE session ("sessionToken" text primary key, "userId" text, expires timestamptz);
    INSERT INTO "user" VALUES ('u1', 'Awa K.', 'Awa@Exemple.tg', null);
    INSERT INTO session VALUES ('jeton-ok', 'u1', now() + interval '1 day'), ('jeton-vieux', 'u1', now() - interval '1 day');`);
  assert.equal(await profilEledji(pool, undefined), null);
  assert.equal(await profilEledji(pool, "__Secure-authjs.session-token=jeton-vieux"), null);
  const p = await profilEledji(pool, "theme=dark; __Secure-authjs.session-token=jeton-ok");
  assert.equal(p?.email, "awa@exemple.tg");
  const env = { EXPOSE_OTP: "true" };
  // Sans session ELEDJI vérifiée par le serveur : refus, même si le corps prétend le contraire.
  assert.equal((await runApi(pool, env, { method: "POST", path: "/auth/eledji", body: { email: "x@y.tg" }, query: {}, token: null })).status, 401);
  const r = await runApi(pool, env, { method: "POST", path: "/auth/eledji", body: {}, query: {}, token: null, eledji: p! });
  assert.equal(r.status, 200);
  const { token, user } = r.body as { token: string; user: { email: string; name: string } };
  assert.equal(user.email, "awa@exemple.tg");
  assert.equal(user.name, "Awa K.");
  assert.ok(await sessionUser(pool, token));
  await db.close();
});
