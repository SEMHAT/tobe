import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openSqliteDb } from "./store";
import { createApp } from "./app";

test("API complète de bout en bout, avec persistance SQLite", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tobe-"));
  const file = path.join(dir, "t.sqlite");
  const { db, close } = openSqliteDb(file);
  const { app } = createApp(db, { uploadDir: path.join(dir, "up"), exposeOtp: true, adminEmails: ["admin@tobe.test"], seed: true, webDir: dir });
  const server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  const api = async (method: string, p: string, body?: unknown, token?: string) => {
    const r = await fetch(`http://localhost:${port}/api${p}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: (await r.json()) as any };
  };
  try {
    assert.equal((await api("GET", "/health")).body.ok, true);
    const home = await api("GET", "/home");
    assert.ok(home.body.top.length > 5);
    assert.equal((await api("GET", "/me")).status, 401);
    assert.equal((await api("GET", "/config")).body.paymentsEnabled, false);
    const otp = await api("POST", "/auth/otp", { email: "Ama@Exemple.tg" });
    const login = await api("POST", "/auth/verify", { email: "ama@exemple.tg", code: otp.body.devCode, name: "Ama" });
    const t = login.body.token as string;
    assert.ok(t);
    const buy = await api("POST", "/events/lome-afro-night/tickets", { ticketTypeId: "tkt_afro_std", qty: 1, method: "cash" }, t);
    assert.equal(buy.status, 200);
    assert.equal(buy.body.status, "reserved"); // sans paiement en ligne : à régler à l'entrée
    assert.equal(buy.body.total, 5000);
    assert.equal((await api("GET", "/me/tickets", undefined, t)).body.length, 1);
    assert.equal((await api("GET", "/events/mariage-afi-koffi", undefined, t)).status, 403);
    assert.equal((await api("GET", "/events/mariage-afi-koffi?code=AFI2026", undefined, t)).status, 200);
    const vote = await api("POST", "/contests/cnt_miss/vote", { candidateId: "cdt_miss_1", pack: "free" }, t);
    assert.equal(vote.status, 200);
    const again = await api("POST", "/contests/cnt_miss/vote", { candidateId: "cdt_miss_1", pack: "free" }, t);
    assert.equal(again.status, 400);
    assert.match(again.body.error, /déjà/);
    // Envoi d'image
    const up = await fetch(`http://localhost:${port}/api/uploads`, { method: "POST", body: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), headers: { authorization: `Bearer ${t}`, "content-type": "image/jpeg" } });
    const upBody = (await up.json()) as { url: string };
    assert.match(upBody.url, /^\/uploads\//);
    assert.equal((await fetch(`http://localhost:${port}${upBody.url}`)).status, 200);
    assert.equal((await api("GET", "/admin", undefined, t)).status, 403);
  } finally {
    server.close();
    close();
  }
  // Les données survivent au redémarrage
  const again = openSqliteDb(file);
  assert.equal(again.db.orders.size, 1);
  assert.equal(again.db.votes.size, 1);
  again.close();
});
