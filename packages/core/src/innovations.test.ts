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

test("photos : 3 offertes avec logo, puis formules 250 / 500 / 1000 (on paie la différence), 70 % organisateur", async () => {
  const t = setup();
  t.db.users.update(t.orga.user.id, { trusted: true });
  const fan = t.login("fan@exemple.tg", "Fan");
  const face = Array.from({ length: 128 }, (_, i) => Math.sin(i) / 4);
  t.svc.setFace(fan.user.id, face, true);
  const v = (n: number) => ({ url: `https://b/apercu-${n}.jpg`, logoUrl: `https://b/logo-${n}.jpg`, cleanUrl: `https://b/net-${n}.jpg`, hdUrl: `https://b/hd-${n}.jpg`, width: 10, height: 10, faces: [face] });
  t.svc.addPhotos(t.orga.user.id, t.ev.id, [1, 2, 3, 4, 5].map(v));
  // La galerie publique ne montre que l'aperçu.
  const pub = t.svc.listPhotos(t.ev.id, null) as unknown as Record<string, unknown>[];
  assert.ok(pub.every((p) => !("cleanUrl" in p) && !("hdUrl" in p) && !("logoUrl" in p)));
  const [g] = t.svc.myPhotos(fan.user.id);
  assert.equal(g.tier, "free");
  assert.equal(g.freeLeft, 3);
  const ids = g.photos.map((p) => p.id);
  for (const id of ids.slice(0, 3)) assert.match(t.svc.downloadPhoto(fan.user.id, id).url, /logo-/);
  assert.match(t.svc.downloadPhoto(fan.user.id, ids[0]).url, /logo-/, "une photo déjà choisie reste gratuite");
  assert.throws(() => t.svc.downloadPhoto(fan.user.id, ids[3]), /250/);
  // Un inconnu ne peut rien télécharger.
  const x = t.login("x@exemple.tg", "X");
  assert.throws(() => t.svc.downloadPhoto(x.user.id, ids[0]), /n'apparaissez pas/);
  // 250 F : toutes, avec logo.
  const fanTok = fan.token;
  await t.buy(`/events/${t.ev.id}/photo-pass`, fanTok, { tier: "plus" });
  assert.match(t.svc.downloadPhoto(fan.user.id, ids[4]).url, /logo-/);
  // Monter à 1000 F : on ne paie que 750.
  const intent = await t.buy(`/events/${t.ev.id}/photo-pass`, fanTok, { tier: "hd" });
  assert.equal(intent.amount, 750);
  assert.match(t.svc.downloadPhoto(fan.user.id, ids[4]).url, /hd-/);
  assert.equal((await t.call("POST", `/events/${t.ev.id}/photo-pass`, fanTok, { tier: "clean" })).status, 400);
  // 70 % pour l'organisateur.
  const share = t.db.payments.filter((p) => p.kind === "photos").reduce((n, p) => n + (p.organizerShare ?? 0), 0);
  assert.equal(share, 175 + 525);
});

test("pack Full HD : 3 proches, avec leur accord (lien) ou celui du parent (enfant)", async () => {
  const t = setup();
  const fan = t.login("fan@exemple.tg", "Fan");
  const me = Array.from({ length: 128 }, (_, i) => Math.sin(i) / 4);
  const ami = Array.from({ length: 128 }, (_, i) => Math.cos(i * 1.7) / 4);
  const enfant = Array.from({ length: 128 }, (_, i) => Math.sin(i * 3.1 + 1) / 4);
  t.svc.setFace(fan.user.id, me, true);
  t.svc.addPhotos(t.orga.user.id, t.ev.id, [
    { url: "https://b/a.jpg", logoUrl: "https://b/la.jpg", cleanUrl: "https://b/ca.jpg", hdUrl: "https://b/ha.jpg", width: 1, height: 1, faces: [ami] },
    { url: "https://b/b.jpg", logoUrl: "https://b/lb.jpg", cleanUrl: "https://b/cb.jpg", hdUrl: "https://b/hb.jpg", width: 1, height: 1, faces: [enfant] },
  ]);
  assert.throws(() => t.svc.addPhotoGuest(fan.user.id, t.ev.id, { name: "Kofi", kind: "adult" }), /Full HD/);
  await t.buy(`/events/${t.ev.id}/photo-pass`, fan.token, { tier: "hd" });
  assert.throws(() => t.svc.addPhotoGuest(fan.user.id, t.ev.id, { name: "Ama", kind: "child", descriptors: [enfant] }), /parent/);
  t.svc.addPhotoGuest(fan.user.id, t.ev.id, { name: "Ama", kind: "child", descriptors: [enfant], attest: true });
  const inv = t.svc.addPhotoGuest(fan.user.id, t.ev.id, { name: "Kofi", kind: "adult" });
  assert.equal(inv.status, "pending");
  // Tant que Kofi n'a pas accepté, ses photos n'apparaissent pas.
  assert.deepEqual(t.svc.myPhotos(fan.user.id)[0].photos.map((p) => p.guest), ["Ama"]);
  assert.throws(() => t.svc.acceptPhotoGuest(inv.code, [ami], false), /accord/);
  t.svc.acceptPhotoGuest(inv.code, [ami], true);
  const g = t.svc.myPhotos(fan.user.id)[0];
  assert.deepEqual(g.photos.map((p) => p.guest).sort(), ["Ama", "Kofi"]);
  assert.match(t.svc.downloadPhoto(fan.user.id, g.photos[0].id).url, /h[ab]\.jpg/);
  // Kofi retire son accord : visage effacé.
  t.svc.declinePhotoGuest(inv.code);
  assert.deepEqual(t.svc.myPhotos(fan.user.id)[0].photos.map((p) => p.guest), ["Ama"]);
  assert.equal(t.db.photoPasses.all()[0].guests.find((x) => x.name === "Kofi")!.descriptors.length, 0);
});

// Vecteurs de test : une personne, puis le même visage abîmé (tête baissée, nuit…) à une distance choisie.
function rnd(seed: number) {
  let x = seed;
  return () => ((x = (x * 16807) % 2147483647) / 2147483647) * 2 - 1;
}
function dir(seed: number) {
  const r = rnd(seed);
  const v = Array.from({ length: 128 }, () => r());
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
}
const plus = (a: number[], d: number[], k: number) => a.map((x, i) => x + d[i] * k);

test("Retrouve-moi : look de la soirée, tenue, « C'est moi » et apprentissage", () => {
  const t = setup();
  const fan = t.login("fan@exemple.tg", "Fan");
  const me = dir(1).map((x) => x * 0.6);
  const f1 = plus(me, dir(2), 0.42); // photo nette : reconnue (0,42)
  const f2 = plus(f1, dir(3), 0.35); // tête baissée : loin du selfie (~0,55) mais proche du visage du soir
  const f3 = plus(me, dir(4), 0.64); // de profil dans le noir : incertain, même tenue
  const other = dir(9).map((x) => x * 0.6); // une autre personne, même tenue
  const rouge = [0.6, 0.1, 0, 0, 0, 0, 0, 0, 0.2, 0.1, 0];
  const bleu = [0, 0, 0, 0, 0.7, 0.2, 0, 0, 0.1, 0, 0];
  const meta = (o: number[]) => ({ box: [0.4, 0.2, 0.1, 0.12] as [number, number, number, number], outfit: o });
  t.svc.setFace(fan.user.id, [me], true);
  t.svc.addPhotos(t.orga.user.id, t.ev.id, [
    { url: "https://b/1.jpg", logoUrl: "https://b/l1.jpg", width: 1, height: 1, faces: [f1], faceMeta: [meta(rouge)] },
    { url: "https://b/2.jpg", logoUrl: "https://b/l2.jpg", width: 1, height: 1, faces: [f2], faceMeta: [meta(bleu)] },
    { url: "https://b/3.jpg", logoUrl: "https://b/l3.jpg", width: 1, height: 1, faces: [f3], faceMeta: [meta(rouge)] },
    { url: "https://b/4.jpg", logoUrl: "https://b/l4.jpg", width: 1, height: 1, faces: [other], faceMeta: [meta(rouge)] },
  ]);
  const [g] = t.svc.myPhotos(fan.user.id);
  const byUrl = (u: string) => t.db.photos.find((p) => p.url === u)!.id;
  assert.deepEqual(
    g.photos.map((p) => [p.url, p.via]).sort(),
    [
      ["https://b/1.jpg", "visage"],
      ["https://b/2.jpg", "soirée"],
    ],
  );
  assert.deepEqual(g.suggestions.map((s) => s.url), ["https://b/3.jpg"], "même tenue + visage incertain = suggestion ; l'autre personne n'est pas proposée");
  // Pas de téléchargement d'une simple suggestion.
  assert.throws(() => t.svc.downloadPhoto(fan.user.id, byUrl("https://b/3.jpg")), /n'apparaissez pas/);
  assert.throws(() => t.svc.claimPhoto(fan.user.id, byUrl("https://b/4.jpg"), 0, true), /pas proposée/);
  t.svc.claimPhoto(fan.user.id, byUrl("https://b/3.jpg"), 0, true);
  assert.match(t.svc.downloadPhoto(fan.user.id, byUrl("https://b/3.jpg")).url, /l3/);
  assert.equal(t.db.users.get(fan.user.id)!.faceDescriptors!.length, 2, "le Pass a appris ce visage");
  // « Pas moi » : la suggestion disparaît.
  const [g2] = t.svc.myPhotos(fan.user.id);
  assert.equal(g2.photos.length, 3);
  assert.equal(g2.suggestions.length, 0);
});
