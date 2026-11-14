import { test } from "node:test";
import assert from "node:assert/strict";
import { createDb, seedDb, ToBeService, computeImpact, ticketFee, normalizePhone, normalizeEmail, ApiError } from "./index.js";

function setup(opts: { demo?: boolean; payments?: boolean } = {}) {
  const db = createDb();
  let t = new Date("2026-11-16T10:00:00Z"); // lundi
  seedDb(db, t);
  const sent: { email: string; code: string }[] = [];
  const svc = new ToBeService(db, {
    now: () => t,
    exposeOtp: true,
    demo: opts.demo,
    paymentsEnabled: opts.payments ?? false,
    adminEmails: ["admin@tobe.test"],
    sendCode: (email, code) => void sent.push({ email, code }),
  });
  const login = (email: string, name = "Test") => {
    const { devCode } = svc.requestOtp(email);
    return svc.verifyOtp(email, devCode!, name);
  };
  return { db, svc, login, sent, advance: (ms: number) => (t = new Date(t.getTime() + ms)) };
}

test("normalisation téléphone et e-mail", () => {
  assert.equal(normalizePhone("90 12 34 56"), "+22890123456");
  assert.equal(normalizeEmail("  Ama@Exemple.TG "), "ama@exemple.tg");
  assert.throws(() => normalizeEmail("pas-un-mail"));
});

test("connexion par code e-mail", () => {
  const { svc, sent, advance } = setup();
  svc.requestOtp("ama@exemple.tg");
  assert.equal(sent.length, 1);
  assert.throws(() => svc.requestOtp("ama@exemple.tg"), (e: ApiError) => e.status === 429);
  assert.throws(() => svc.verifyOtp("ama@exemple.tg", "000000"), ApiError);
  const r = svc.verifyOtp("ama@exemple.tg", sent[0].code, "Ama");
  assert.equal(r.user.name, "Ama");
  assert.equal((r.user as any).faceDescriptor, undefined);
  assert.equal(svc.userFromToken(r.token)?.email, "ama@exemple.tg");
  advance(61_000);
  svc.requestOtp("ama@exemple.tg");
});

test("admin par e-mail", () => {
  const { login } = setup();
  assert.equal(login("admin@tobe.test").user.role, "admin");
  assert.equal(login("kossi@exemple.tg").user.role, "user");
});

test("frais de billet et impact", () => {
  assert.equal(ticketFee(5000), 300);
  assert.equal(computeImpact({ expectedAttendance: 1500, reach: "national", category: "concert", views: 0, ticketTypes: [] }).tier, "majeur");
  assert.equal(computeImpact({ expectedAttendance: 30, reach: "quartier", category: "anniversaire", views: 0, ticketTypes: [] }).tier, "local");
});

test("sans paiement en ligne : billet réservé, à régler à l'entrée", () => {
  const { svc, login } = setup({ demo: true });
  const org = login("orga@exemple.tg", "Orga").user;
  const buyer = login("ama@exemple.tg", "Ama").user;
  const o = svc.buyTickets(buyer.id, "lome-afro-night", { ticketTypeId: "tkt_afro_std", qty: 2, method: "cash" });
  assert.equal(o.status, "reserved");
  assert.equal(o.fee, 0);
  assert.equal(o.total, 10000);
  assert.equal(svc.db.payments.size, 0);
  const s = svc.scanTicket(org.id, "TOBE:" + o.code);
  assert.equal(s.ok, true);
  assert.equal((s as any).amountDue, 10000);
  assert.throws(() => svc.vote(buyer.id, "cnt_miss", { candidateId: "cdt_miss_1", pack: "10", method: "mixx" }), /bientôt/);
  assert.throws(() => svc.contribute(buyer.id, "cag_mariage", { amount: 5000, method: "mixx", code: "AFI2026" }), /bientôt/);
  assert.throws(() => svc.buyBoost(org.id, "evt_afronight", "jour", "mixx"), /bientôt/);
});

test("avec paiement en ligne : frais et paiement enregistré", () => {
  const { svc, login } = setup({ payments: true });
  const buyer = login("ama@exemple.tg").user;
  const o = svc.buyTickets(buyer.id, "lome-afro-night", { ticketTypeId: "tkt_afro_std", qty: 1, method: "moov" });
  assert.equal(o.status, "paid");
  assert.equal(o.total, 5200); // organisateur Pro : 4 %
  const r = svc.vote(buyer.id, "cnt_miss", { candidateId: "cdt_miss_5", pack: "10", method: "moov" });
  assert.equal(r.vote.amount, 900);
});

test("événement privé : code requis, puis invité retenu", () => {
  const { svc, login } = setup();
  const u = login("yao@exemple.tg").user;
  assert.throws(() => svc.getEvent("mariage-afi-koffi", u.id), (e: ApiError) => e.status === 403);
  svc.getEvent("mariage-afi-koffi", u.id, "afi2026");
  assert.equal(svc.getEvent("mariage-afi-koffi", u.id).title, "Mariage d'Afi & Koffi");
});

test("vote gratuit une fois par jour + certificat", () => {
  const { svc, login, advance } = setup();
  const u = login("vote@exemple.tg").user;
  svc.vote(u.id, "cnt_miss", { candidateId: "cdt_miss_5", pack: "free" });
  assert.throws(() => svc.vote(u.id, "cnt_miss", { candidateId: "cdt_miss_5", pack: "free" }));
  advance(86_400_000);
  svc.vote(u.id, "cnt_miss", { candidateId: "cdt_miss_5", pack: "free" });
  const cert = svc.certificate("cnt_miss");
  assert.equal(cert.recordedVotes, 2);
  assert.equal(cert.uniqueVoters, 1);
});

test("Pass ToBe : photos retrouvées et notification", () => {
  const { svc, login } = setup({ demo: true });
  const org = login("orga@exemple.tg", "Orga").user;
  const fan = login("fan@exemple.tg", "Fan").user;
  const me = Array.from({ length: 128 }, (_, i) => Math.sin(i) / 10);
  const other = Array.from({ length: 128 }, (_, i) => Math.cos(i) / 10);
  svc.setFace(fan.id, me);
  const r = svc.addPhotos(org.id, "evt_afronight", [
    { url: "/a.jpg", width: 10, height: 10, faces: [me.map((x) => x + 0.01), other] },
    { url: "/b.jpg", width: 10, height: 10, faces: [other] },
  ]);
  assert.equal(r.notified, 1);
  assert.equal(svc.myPhotos(fan.id)[0].photos.length, 1);
  svc.setPass(fan.id, { neverShow: true });
  assert.equal(svc.listPhotos("evt_afronight", null).length, 1);
});

test("prestataire : inscription, validation, devis", () => {
  const { svc, login } = setup();
  const pro = login("mc@exemple.tg", "Kodjo").user;
  const p = svc.applyProvider(pro.id, { name: "Kodjo MC", category: "mc", bio: "Maître de cérémonie trilingue pour mariages et galas.", phone: "90112233" });
  assert.equal(p.status, "pending");
  assert.ok(!svc.listProviders().some((x) => x.id === p.id));
  const admin = login("admin@tobe.test").user;
  svc.setProviderStatus(admin.id, p.id, { status: "approved", certified: true });
  assert.ok(svc.listProviders().some((x) => x.id === p.id));
  const client = login("client@exemple.tg").user;
  svc.requestQuote(client.id, p.id, { message: "Mariage de 200 personnes" });
  assert.equal(svc.notifications(pro.id).length, 2);
});

test("création sans paiement : vote forcé gratuit, cagnotte et boost ignorés, demande ToBe", () => {
  const { svc, login } = setup();
  const u = login("kafui@exemple.tg", "Kafui").user;
  assert.throws(() => svc.createEvent(u.id, { title: "Gala", category: "concours", startsAt: "2026-12-05T19:00:00Z", venue: "Salle", description: "", visibility: "public", access: "free", expectedAttendance: 60, reach: "quartier", options: { votes: false, cagnotte: false, gallery: true, live: false }, tobe: { level: "devis", services: [] } }), /numéro/);
  const ev = svc.createEvent(u.id, {
    title: "Gala des talents",
    category: "concours",
    startsAt: "2026-12-05T19:00:00Z",
    venue: "Salle des fêtes",
    description: "Venez !",
    visibility: "private",
    access: "invite",
    invitees: ["ami@exemple.tg", "pas un mail"],
    expectedAttendance: 60,
    reach: "quartier",
    options: { votes: true, cagnotte: true, gallery: true, live: false },
    contest: { mode: "mixed", votePrice: 100, closesAt: "2026-12-05T18:00:00Z", results: "live", candidates: [{ name: "A" }, { name: "B" }] },
    cagnotte: { title: "Cadeau", goal: 100000 },
    tobe: { level: "carte", services: ["Décoration"], phone: "91000000" },
    boost: { plan: "jour", method: "mixx" },
  });
  assert.ok(ev.accessCode);
  assert.deepEqual(ev.invitees, ["ami@exemple.tg"]);
  assert.equal(svc.db.contests.get(ev.contestId!)!.mode, "free");
  assert.equal(ev.cagnotteId, null);
  assert.equal(ev.boostedUntil, null);
  assert.ok(ev.tobeRequestId);
  const admin = login("admin@tobe.test").user;
  assert.equal(svc.adminOverview(admin.id).requests[0].phone, "+22891000000");
});
