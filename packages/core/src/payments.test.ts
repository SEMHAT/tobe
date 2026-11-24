import assert from "node:assert/strict";
import { test } from "node:test";
import { createDb } from "./db.js";
import { handleApi } from "./api.js";
import { runWithPayments } from "./paymentFlow.js";
import { GatewayError, verifySasPayWebhook, type Gateway } from "./saspay.js";
import { ToBeService } from "./service.js";
import { PRICING } from "./rules.js";

function setup() {
  const db = createDb();
  const svc = new ToBeService(db, { exposeOtp: true, checkout: true });
  const login = (email: string, name: string) => {
    const { devCode } = svc.requestOtp(email) as { devCode: string };
    return svc.verifyOtp(email, devCode, name) as { token: string; user: { id: string } };
  };
  const paid = new Set<string>();
  const sessions = new Map<string, string>();
  const payouts: { amount: number; phone: string; network: string }[] = [];
  let payoutError: GatewayError | null = null;
  const gw: Gateway = {
    mode: "sandbox",
    async createCheckout(i) {
      const id = `cs_${sessions.size + 1}`;
      sessions.set(id, i.metadata.tobe_payment);
      return { id, url: `https://pay.example/${id}` };
    },
    async checkoutStatus(id) {
      return { status: paid.has(id) ? "paid" : "pending", transactionId: paid.has(id) ? `tx_${id}` : null };
    },
    async payout(p) {
      if (payoutError) throw payoutError;
      payouts.push(p);
      return { id: `po_${payouts.length}` };
    },
    async payoutStatus() {
      return "sent";
    },
  };
  const call = (method: string, path: string, token: string | null, body?: unknown) =>
    runWithPayments(async (q) => handleApi(svc, { method: q.method, path: q.path, body: q.body, token: q.token ?? null, verified: { internal: q.verified?.internal === true } }), { gateway: gw, publicUrl: "https://tobe.test" }, { method, path, token, body });
  const verify = (userId: string) => db.users.update(userId, { verification: { status: "verified", fullName: "Orga Test", phone: "90000000", orgName: "Orga", link: "", about: "", submittedAt: "", reviewedAt: "", reviewedBy: null, reason: null }, trusted: true });
  return { db, svc, login, call, paid, payouts, verify, failPayout: (e: GatewayError | null) => (payoutError = e) };
}

test("billet payé en ligne : page SasPay, confirmation, billet émis, 85 % reversés à l'organisateur", async () => {
  const t = setup();
  const orga = t.login("orga@exemple.tg", "Orga");
  const fan = t.login("fan@exemple.tg", "Fan");
  const ev = t.svc.createEvent(orga.user.id, { title: "Concert", category: "concert", startsAt: new Date(Date.now() + 5 * 86400_000).toISOString(), venue: "Palais", description: "", visibility: "public", access: "paid", ticketTypes: [{ name: "VIP", price: 10000, quota: 10 }], expectedAttendance: 100, reach: "ville", options: {} as never });
  t.svc.setPayoutAccount(orga.user.id, { phone: "90 12 34 56", network: "moov" });
  t.verify(orga.user.id);

  const r = await t.call("POST", `/events/${ev.id}/tickets`, fan.token, { ticketTypeId: ev.ticketTypes[0].id, qty: 2, method: "online" });
  assert.equal(r.status, 200);
  const { checkoutUrl, intentId } = r.body as { checkoutUrl: string; intentId: string };
  assert.match(checkoutUrl, /pay\.example/);
  assert.equal(t.db.orders.all().length, 0, "rien n'est émis avant le paiement");

  // Pas encore payé : toujours en attente.
  assert.equal(((await t.call("POST", `/payments/${intentId}/verify`, fan.token)).body as { status: string }).status, "pending");
  // Le client valide sur son téléphone.
  t.paid.add(t.db.intents.get(intentId)!.gatewaySessionId!);
  const v = await t.call("POST", `/payments/${intentId}/verify`, fan.token);
  assert.equal((v.body as { status: string }).status, "paid");
  const order = t.db.orders.all()[0];
  assert.equal(order.qty, 2);
  assert.equal(order.method, "online");
  assert.equal(t.db.events.get(ev.id)!.ticketTypes[0].sold, 2);
  const pay = t.db.payments.all()[0];
  assert.equal(pay.platformFee, 20000 * PRICING.ticketCommission);
  assert.equal(pay.organizerShare, 17000);
  // Reversement envoyé dans la foulée.
  assert.deepEqual(t.payouts, [{ amount: 17000, phone: "90123456", network: "moov", name: "Orga", email: "orga@exemple.tg", description: "Vos gains ToBe", idempotencyKey: t.db.payouts.all()[0].id + "-1" }]);
  // Deuxième vérification : rien n'est livré deux fois.
  await t.call("POST", `/payments/${intentId}/verify`, fan.token);
  await t.call("POST", "/cron/payments", null);
  assert.equal(t.db.orders.all().length, 1);
  assert.equal(t.db.payouts.all()[0].status, "sent");
});

test("vote payé : 10 % pour ToBe ; IP non autorisée → reversement à faire à la main", async () => {
  const t = setup();
  const orga = t.login("orga@exemple.tg", "Orga");
  const fan = t.login("fan@exemple.tg", "Fan");
  const ev = t.svc.createEvent(orga.user.id, {
    title: "Miss",
    category: "concours",
    startsAt: new Date(Date.now() + 5 * 86400_000).toISOString(),
    venue: "Salle",
    description: "",
    visibility: "public",
    access: "free",
    ticketTypes: [{ name: "Entrée", price: 0, quota: 0 }],
    expectedAttendance: 100,
    reach: "ville",
    options: { votes: true } as never,
    contest: { title: "Miss", mode: "paid", votePrice: 1000, closesAt: new Date(Date.now() + 86400_000).toISOString(), results: "live", candidates: [{ name: "Afi" }] } as never,
  });
  const contest = t.db.contests.all()[0];
  assert.ok(contest, "concours créé");
  t.svc.setPayoutAccount(orga.user.id, { phone: "99000000", network: "togocel" });
  t.verify(orga.user.id);
  t.failPayout(new GatewayError("IP non autorisée", "ip_not_whitelisted", 403));
  const r = await t.call("POST", `/contests/${contest.id}/vote`, fan.token, { candidateId: contest.candidates[0].id, pack: "10" });
  const { intentId } = r.body as { intentId: string };
  t.paid.add(t.db.intents.get(intentId)!.gatewaySessionId!);
  await t.call("POST", "/cron/payments", null);
  assert.equal(t.db.contests.get(contest.id)!.candidates[0].paidVotes, 10);
  const pay = t.db.payments.all().find((p) => p.kind === "vote")!;
  assert.equal(pay.amount, 9000);
  assert.equal(pay.platformFee, 900);
  const po = t.db.payouts.all()[0];
  assert.equal(po.amount, 8100);
  assert.equal(po.status, "manual");
  assert.ok(ev);
});

test("petites sommes cumulées jusqu'au seuil, et rien sans numéro de reversement", async () => {
  const t = setup();
  const orga = t.login("orga@exemple.tg", "Orga");
  const fan = t.login("fan@exemple.tg", "Fan");
  t.verify(orga.user.id);
  const ev = t.svc.createEvent(orga.user.id, { title: "Soirée", category: "soiree", startsAt: new Date(Date.now() + 5 * 86400_000).toISOString(), venue: "Bar", description: "", visibility: "public", access: "paid", ticketTypes: [{ name: "Entrée", price: 1000, quota: 0 }], expectedAttendance: 50, reach: "quartier", options: {} as never });
  for (let i = 0; i < 2; i++) {
    const r = await t.call("POST", `/events/${ev.id}/tickets`, fan.token, { ticketTypeId: ev.ticketTypes[0].id, qty: 1 });
    t.paid.add(t.db.intents.get((r.body as { intentId: string }).intentId)!.gatewaySessionId!);
  }
  await t.call("POST", "/cron/payments", null);
  assert.equal(t.db.orders.all().length, 2);
  assert.equal(t.payouts.length, 0, "pas de numéro : on attend");
  assert.equal(t.db.payouts.all()[0].amount, 1700);
  t.svc.setPayoutAccount(orga.user.id, { phone: "70112233", network: "mixx" });
  await t.call("POST", "/cron/payments", null);
  assert.equal(t.payouts.length, 1);
  assert.equal(t.payouts[0].amount, 1700);
});

test("routes internes inaccessibles depuis l'extérieur, signature des webhooks", async () => {
  const t = setup();
  const r = handleApi(t.svc, { method: "POST", path: "/internal/intents/x/settle", body: {} });
  assert.equal(r.status, 404);
  const secret = "whsec_test";
  const body = '{"event":"transaction.success","data":{}}';
  const ts = String(Math.floor(Date.now() / 1000));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}.${body}`)))].map((b) => b.toString(16).padStart(2, "0")).join("");
  assert.equal(await verifySasPayWebhook(body, { signature: sig, timestamp: ts }, secret), true);
  assert.equal(await verifySasPayWebhook(body + " ", { signature: sig, timestamp: ts }, secret), false);
  assert.equal(await verifySasPayWebhook(body, { signature: sig, timestamp: String(Number(ts) - 600) }, secret), false);
});

test("« Retirer maintenant » : envoie tout de suite une part sous le seuil automatique", async () => {
  const t = setup();
  const orga = t.login("orga@exemple.tg", "Orga");
  const fan = t.login("fan@exemple.tg", "Fan");
  t.verify(orga.user.id);
  const ev = t.svc.createEvent(orga.user.id, { title: "Petit concert", category: "concert", startsAt: new Date(Date.now() + 5 * 86400_000).toISOString(), venue: "Bar", description: "", visibility: "public", access: "paid", ticketTypes: [{ name: "Entrée", price: 1000, quota: 0 }], expectedAttendance: 50, reach: "quartier", options: {} as never });
  const r = await t.call("POST", `/events/${ev.id}/tickets`, fan.token, { ticketTypeId: ev.ticketTypes[0].id, qty: 1 });
  t.paid.add(t.db.intents.get((r.body as { intentId: string }).intentId)!.gatewaySessionId!);
  // Sans numéro : refusé.
  await t.call("POST", "/cron/payments", null);
  assert.equal((await t.call("POST", "/me/payouts/withdraw", orga.token)).status, 400);
  t.svc.setPayoutAccount(orga.user.id, { phone: "96112233", network: "moov" });
  await t.call("POST", "/cron/payments", null);
  assert.equal(t.payouts.length, 0, "850 FCFA < seuil automatique : rien ne part seul");
  const w = await t.call("POST", "/me/payouts/withdraw", orga.token);
  assert.equal(w.status, 200);
  assert.equal(t.payouts.length, 1);
  assert.equal(t.payouts[0].amount, 850);
  assert.equal((w.body as { available: number }).available, 0);
});
