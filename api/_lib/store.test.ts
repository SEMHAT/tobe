import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { runApi, sessionUser, type PgPool } from "./store";

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
