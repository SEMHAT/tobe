import assert from "node:assert/strict";
import { test } from "node:test";
import { createDb } from "./db.js";
import { handleApi } from "./api.js";
import { runWithPayments } from "./paymentFlow.js";
import { dynamicQr } from "./qr.js";
import type { Gateway } from "./saspay.js";
import { ToBeService } from "./service.js";

function setup(start = Date.now()) {
  let now = start;
  const db = createDb();
  const svc = new ToBeService(db, { exposeOtp: true, checkout: true, now: () => new Date(now) });
  const login = (email: string, name: string) => {
    const { devCode } = svc.requestOtp(email) as { devCode: string };
    return svc.verifyOtp(email, devCode, name) as { token: string; user: { id: string } };
  };
  const paid = new Set<string>();
  const payouts: { amount: number; phone: string; network: string; description: string }[] = [];
  let n = 0;
  const gw: Gateway = {
    mode: "sandbox",
    async createCheckout() {
      n++;
      return { id: `cs_${n}`, url: `https://pay.example/cs_${n}` };
    },
    async checkoutStatus(id) {
      return { status: paid.has(id) ? "paid" : "pending", transactionId: paid.has(id) ? `tx_${id}` : null };
    },
    async payout(p) {
      payouts.push(p);
      return { id: `po_${payouts.length}` };
    },
    async payoutStatus() {
      return "sent";
    },
  };
  const call = (method: string, path: string, token: string | null, body?: unknown) =>
    runWithPayments(async (q) => handleApi(svc, { method: q.method, path: q.path, body: q.body, token: q.token ?? null, verified: { internal: q.verified?.internal === true } }), { gateway: gw, publicUrl: "https://tobe.test" }, { method, path, token, body });
  /** Achat en ligne complet : page SasPay puis paiement validé. */
  const buy = async (path: string, token: string, body: unknown) => {
    const r = await call("POST", path, token, body);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const { intentId } = r.body as { intentId: string };
    paid.add(db.intents.get(intentId)!.gatewaySessionId!);
    const v = await call("POST", `/payments/${intentId}/verify`, token);
    assert.equal((v.body as { status: string }).status, "paid");
    return db.intents.get(intentId)!;
  };
  const verify = (userId: string) => db.users.update(userId, { verification: { status: "verified", fullName: "Orga", phone: "90000000", orgName: "Orga", link: "", about: "", submittedAt: "", reviewedAt: "", reviewedBy: null, reason: null } });
  const orga = login("orga@exemple.tg", "Orga");
  verify(orga.user.id);
  svc.setPayoutAccount(orga.user.id, { phone: "90123456", network: "togocel" });
  const ev = svc.createEvent(orga.user.id, { title: "Concert", category: "concert", startsAt: new Date(start + 5 * 86400_000).toISOString(), venue: "Palais", description: "", visibility: "public", access: "paid", ticketTypes: [{ name: "Standard", price: 5000, quota: 10 }], expectedAttendance: 100, reach: "ville", options: {} as never });
  db.events.update(ev.id, { approvedAt: new Date(start).toISOString() });
  return { db, svc, login, call, buy, payouts, orga, ev, tt: ev.ticketTypes[0].id, advance: (ms: number) => (now += ms), now: () => now };
}

test("QR dynamique : le QR du moment passe, une capture d'une minute plus tôt est refusée", async () => {
  const t = setup();
  const fan = t.login("fan@exemple.tg", "Fan");
  await t.buy(`/events/${t.ev.id}/tickets`, fan.token, { ticketTypeId: t.tt, qty: 1, method: "online" });
  const [tk] = t.svc.myTickets(fan.user.id);
  assert.ok(tk.secret, "le détenteur reçoit le secret de son QR");
  const shot = dynamicQr(tk.code, tk.secret!, t.now());
  t.advance(3 * 60_000);
  assert.deepEqual(t.svc.scanTicket(t.orga.user.id, shot), { ok: false, reason: "QR expiré : c'est une capture d'écran. Demandez le téléphone du détenteur." });
  assert.equal(t.svc.scanTicket(t.orga.user.id, dynamicQr(tk.code, "faux-secret", t.now())).ok, false);
  const ok = t.svc.scanTicket(t.orga.user.id, dynamicQr(tk.code, tk.secret!, t.now()));
  assert.equal(ok.ok, true);
  assert.equal((ok as { order: { secret?: string } }).order.secret, undefined, "le secret ne sort pas vers le scanner");
  // Un inconnu ne peut pas sonder les billets.
  const other = t.login("x@exemple.tg", "X");
  assert.equal((t.svc.scanTicket(other.user.id, tk.code) as { reason: string }).reason, "Ce billet n'est pas pour vos événements");
});

test("scanner hors connexion : liste des billets, entrées envoyées plus tard, doublon signalé", async () => {
  const t = setup();
  const fan = t.login("fan@exemple.tg", "Fan");
  await t.buy(`/events/${t.ev.id}/tickets`, fan.token, { ticketTypeId: t.tt, qty: 1, method: "online" });
  const fanTicket = t.svc.myTickets(fan.user.id)[0];
  const m = t.svc.scanManifest(t.orga.user.id, t.ev.id);
  assert.equal(m.tickets.length, 1);
  assert.equal(m.tickets[0].secret, fanTicket.secret);
  assert.throws(() => t.svc.scanManifest(fan.user.id, t.ev.id), /scanner/);
  // Porte A (hors connexion) et porte B (en ligne) valident le même billet d'une place.
  t.svc.scanTicket(t.orga.user.id, fanTicket.code);
  const sync = t.svc.scanSync(t.orga.user.id, t.ev.id, [{ code: fanTicket.code }]);
  assert.equal(sync.accepted, 0);
  assert.equal(sync.conflicts.length, 1);
});

test("séquestre : l'argent des billets attend la fin de l'événement + 24 h (sauf organisateur de confiance)", async () => {
  const t = setup();
  const fan = t.login("fan@exemple.tg", "Fan");
  await t.buy(`/events/${t.ev.id}/tickets`, fan.token, { ticketTypeId: t.tt, qty: 2, method: "online" });
  await t.call("POST", "/cron/payments", null);
  assert.equal(t.payouts.length, 0, "rien ne part avant l'événement");
  const e = t.svc.myEarnings(t.orga.user.id);
  assert.equal(e.escrow, 8500);
  assert.equal(e.available, 0);
  assert.throws(() => t.svc.withdrawNow(t.orga.user.id), /séquestre/);
  // Événement passé + 24 h : l'argent part tout seul.
  t.advance(5 * 86400_000 + 8 * 3600_000 + 24 * 3600_000 + 60_000);
  await t.call("POST", "/cron/payments", null);
  assert.equal(t.payouts.length, 1);
  assert.equal(t.payouts[0].amount, 8500);
});

test("annulation : billets invalidés, acheteurs remboursés en entier, part de l'organisateur annulée", async () => {
  const t = setup();
  const fan = t.login("fan@exemple.tg", "Fan");
  t.db.users.update(fan.user.id, { phone: "+228 99 11 22 33" });
  const other = t.login("ama@exemple.tg", "Ama");
  await t.buy(`/events/${t.ev.id}/tickets`, fan.token, { ticketTypeId: t.tt, qty: 2, method: "online" });
  await t.buy(`/events/${t.ev.id}/tickets`, other.token, { ticketTypeId: t.tt, qty: 1, method: "online" });
  const fanCode = t.svc.myTickets(fan.user.id)[0].code;
  assert.throws(() => t.svc.cancelEvent(fan.user.id, t.ev.id, "Pluie"), /organisateur/);
  const r = t.svc.cancelEvent(t.orga.user.id, t.ev.id, "Artiste malade");
  assert.equal(r.refunds, 2);
  assert.equal(r.refundTotal, 15000);
  assert.equal(r.owedByOrganizer, 0);
  assert.equal(t.svc.scanTicket(t.orga.user.id, fanCode).ok, false);
  assert.equal(t.db.payouts.filter((p) => (p.kind ?? "organizer") === "organizer" && p.status === "queued").length, 0);
  // Le fan a un numéro Moov sur son profil : remboursé automatiquement.
  await t.call("POST", "/cron/payments", null);
  assert.deepEqual(t.payouts.map((p) => [p.amount, p.phone, p.network, p.description]), [[10000, "99112233", "moov", "Remboursement ToBe"]]);
  // Ama donne son numéro, et c'est parti.
  const [refund] = t.svc.myRefunds(other.user.id);
  assert.equal(refund.needsNumber, true);
  t.svc.setRefundAccount(other.user.id, refund.id, { phone: "91 00 00 00", network: "togocel" });
  await t.call("POST", "/cron/payments", null);
  assert.equal(t.payouts[1].amount, 5000);
});

test("cotisation : 3 places réservées, chacun paie la sienne et reçoit son billet", async () => {
  const t = setup();
  const a = t.login("a@exemple.tg", "Afi");
  const b = t.login("b@exemple.tg", "Kodjo");
  const g = t.svc.createGroup(a.user.id, t.ev.id, { ticketTypeId: t.tt, seats: 3, name: "Les cousins" });
  assert.equal(g.seats, 3);
  // Les 3 places sont mises de côté : il en reste 7 pour les autres.
  const c = t.login("c@exemple.tg", "C");
  const big = await t.call("POST", `/events/${t.ev.id}/tickets`, c.token, { ticketTypeId: t.tt, qty: 8, method: "online" });
  assert.equal(big.status, 400);
  await t.buy(`/groups/${g.code}/pay`, a.token, { method: "online" });
  await t.buy(`/groups/${g.code}/pay`, b.token, { method: "online" });
  const v = t.svc.groupView(g.code, b.user.id);
  assert.equal(v.paid, 2);
  assert.equal(v.mine, true);
  assert.equal(t.svc.myTickets(b.user.id).length, 1);
  assert.equal((await t.call("POST", `/groups/${g.code}/pay`, b.token, { method: "online" })).status, 400);
  // Après 24 h, la place non payée est libérée.
  t.advance(25 * 3600_000);
  const after = await t.call("POST", `/events/${t.ev.id}/tickets`, c.token, { ticketTypeId: t.tt, qty: 8, method: "online" });
  assert.equal(after.status, 200);
});

test("revente officielle : prix plafonné, ancien QR invalidé, vendeur payé (95 %)", async () => {
  const t = setup();
  t.db.users.update(t.orga.user.id, { trusted: true });
  const seller = t.login("s@exemple.tg", "Sena");
  const buyer = t.login("b@exemple.tg", "Bob");
  await t.buy(`/events/${t.ev.id}/tickets`, seller.token, { ticketTypeId: t.tt, qty: 1, method: "online" });
  const [old] = t.svc.myTickets(seller.user.id);
  assert.throws(() => t.svc.listResale(seller.user.id, old.id, { phone: "90111111", network: "togocel", price: 9000 }), /prix officiel/);
  t.svc.listResale(seller.user.id, old.id, { phone: "90111111", network: "togocel" });
  const [offer] = t.svc.eventResales(t.ev.id, buyer.user.id);
  assert.equal(offer.price, 5000);
  t.payouts.length = 0;
  await t.buy(`/resales/${offer.id}/buy`, buyer.token, { method: "online" });
  const [mine] = t.svc.myTickets(buyer.user.id);
  assert.notEqual(mine.code, old.code);
  assert.equal(t.svc.myTickets(seller.user.id).length, 0);
  assert.match((t.svc.scanTicket(t.orga.user.id, old.code) as { reason: string }).reason, /revendu/);
  assert.equal(t.svc.scanTicket(t.orga.user.id, mine.code).ok, true);
  assert.deepEqual(t.payouts.map((p) => [p.amount, p.phone, p.description]), [[4750, "90111111", "Revente de votre billet ToBe"]]);
});

test("visage : consentement obligatoire, empreintes effacées après les durées prévues", () => {
  const t = setup();
  const fan = t.login("fan@exemple.tg", "Fan");
  const face = Array.from({ length: 128 }, (_, i) => Math.sin(i) / 4);
  assert.throws(() => t.svc.setFace(fan.user.id, face), /accord/);
  t.svc.setFace(fan.user.id, face, true);
  assert.ok(t.db.users.get(fan.user.id)!.faceConsentAt);
  t.svc.addPhotos(t.orga.user.id, t.ev.id, [{ url: "https://x/p.jpg", width: 10, height: 10, faces: [face] }]);
  t.advance(200 * 86400_000);
  assert.deepEqual(t.svc.purgeFaceData(), { accounts: 0, photos: 1 });
  assert.equal(t.db.photos.all()[0].faces.length, 0, "photo gardée, empreinte effacée");
  t.advance(200 * 86400_000);
  assert.deepEqual(t.svc.purgeFaceData(), { accounts: 1, photos: 0 });
  assert.equal(t.db.users.get(fan.user.id)!.faceDescriptor, null);
});
