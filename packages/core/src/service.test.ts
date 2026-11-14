import { test } from "node:test";
import assert from "node:assert/strict";
import { createDb, seedDb, ToBeService, computeImpact, ticketFee, normalizePhone, ApiError } from "./index";

function setup(demo = false) {
  const db = createDb();
  let t = new Date("2026-11-16T10:00:00Z"); // lundi
  seedDb(db, t);
  const svc = new ToBeService(db, { now: () => t, exposeOtp: true, demo, adminPhones: ["+22899999999"] });
  const login = (phone: string, name = "Test") => {
    const { devCode } = svc.requestOtp(phone);
    return svc.verifyOtp(phone, devCode!, name);
  };
  return { db, svc, login, advance: (ms: number) => (t = new Date(t.getTime() + ms)) };
}

test("téléphone togolais normalisé", () => {
  assert.equal(normalizePhone("90 12 34 56"), "+22890123456");
  assert.equal(normalizePhone("+228 90 12 34 56"), "+22890123456");
  assert.throws(() => normalizePhone("123"));
});

test("connexion OTP : code faux puis bon", () => {
  const { svc } = setup();
  const { devCode } = svc.requestOtp("90123456");
  assert.throws(() => svc.verifyOtp("90123456", "000000"), ApiError);
  const r = svc.verifyOtp("90123456", devCode!, "Kossi");
  assert.equal(r.user.name, "Kossi");
  assert.equal(svc.userFromToken(r.token)?.id, r.user.id);
});

test("admin par numéro", () => {
  const { login } = setup();
  assert.equal(login("+22899999999").user.role, "admin");
  assert.equal(login("+22891111111").user.role, "user");
});

test("frais de billet et impact", () => {
  assert.equal(ticketFee(5000), 300);
  assert.equal(ticketFee(0), 0);
  const tier = computeImpact({ expectedAttendance: 1500, reach: "national", category: "concert", views: 0, ticketTypes: [] }).tier;
  assert.equal(tier, "majeur");
  assert.equal(computeImpact({ expectedAttendance: 30, reach: "quartier", category: "anniversaire", views: 0, ticketTypes: [] }).tier, "local");
});

test("l'accueil ne montre que les événements publics", () => {
  const { svc } = setup();
  const h = svc.home();
  assert.ok(h.total >= 7);
  assert.ok(!h.top.some((e) => e.visibility !== "public"));
  assert.ok(h.featured.length > 0);
});

test("événement privé : code requis", () => {
  const { svc, login } = setup();
  const u = login("+22891111111").user;
  assert.throws(() => svc.getEvent("mariage-afi-koffi", u.id), (e: ApiError) => e.status === 403);
  const ev = svc.getEvent("mariage-afi-koffi", u.id, "afi2026");
  assert.equal(ev.title, "Mariage d'Afi & Koffi");
  assert.equal(ev.accessCode, undefined);
});

test("achat de billet et scan", () => {
  const { svc, login } = setup(true);
  const org = login("+22891111111", "Orga").user; // en démo, reçoit Lomé Afro Night
  const buyer = login("+22892222222", "Ama").user;
  const o = svc.buyTickets(buyer.id, "lome-afro-night", { ticketTypeId: "tkt_afro_std", qty: 2, method: "mixx" });
  assert.equal(o.fee, 600);
  assert.equal(o.total, 10600);
  const s1 = svc.scanTicket(org.id, "TOBE:" + o.code);
  assert.equal(s1.ok, true);
  svc.scanTicket(org.id, o.code);
  const s3 = svc.scanTicket(org.id, o.code);
  assert.equal(s3.ok, false);
  const dash = svc.organizerDashboard(org.id);
  const row = dash.events.find((r) => r.event.id === "evt_afronight")!;
  assert.equal(row.scanned, 2);
});

test("vote gratuit une fois par jour, packs payants", () => {
  const { svc, login, advance } = setup();
  const u = login("+22893333333").user;
  svc.vote(u.id, "cnt_miss", { candidateId: "cdt_miss_5", pack: "free" });
  assert.throws(() => svc.vote(u.id, "cnt_miss", { candidateId: "cdt_miss_5", pack: "free" }));
  const r = svc.vote(u.id, "cnt_miss", { candidateId: "cdt_miss_5", pack: "10", method: "moov" });
  assert.equal(r.vote.amount, 900);
  advance(86_400_000);
  svc.vote(u.id, "cnt_miss", { candidateId: "cdt_miss_5", pack: "free" });
  const cert = svc.certificate("cnt_miss");
  assert.equal(cert.recordedVotes, 12);
  assert.equal(cert.uniqueVoters, 1);
  assert.equal(svc.db.payments.filter((p) => p.kind === "vote")[0].platformFee, 135);
});

test("concours top 3 : les autres rangs sont masqués", () => {
  const { svc } = setup();
  const c = svc.contestView("cnt_danse", null);
  assert.equal(c.candidates.filter((x) => x.votes !== null).length, 3);
});

test("cagnotte", () => {
  const { svc, login } = setup();
  const u = login("+22894444444", "Yao").user;
  assert.throws(() => svc.contribute(u.id, "cag_mariage", { amount: 10000, method: "card" }), (e: ApiError) => e.status === 403);
  svc.db.events.update("evt_mariage", (e) => ({ ...e, invitees: [u.phone] }));
  const c = svc.contribute(u.id, "cag_mariage", { amount: 10000, method: "card", message: "Bravo" });
  assert.equal(c.collected, 1_260_000);
});

test("Pass ToBe : photos retrouvées et notification", () => {
  const { svc, login } = setup(true);
  const org = login("+22891111111", "Orga").user;
  const fan = login("+22895555555", "Fan").user;
  const me = Array.from({ length: 128 }, (_, i) => Math.sin(i) / 10);
  const other = Array.from({ length: 128 }, (_, i) => Math.cos(i) / 10);
  svc.setFace(fan.id, me);
  const near = me.map((x) => x + 0.01);
  const r = svc.addPhotos(org.id, "evt_afronight", [
    { url: "/a.jpg", width: 10, height: 10, faces: [near, other] },
    { url: "/b.jpg", width: 10, height: 10, faces: [other] },
  ]);
  assert.equal(r.added, 2);
  assert.equal(r.notified, 1);
  const groups = svc.myPhotos(fan.id);
  assert.equal(groups[0].photos.length, 1);
  assert.equal(svc.notifications(fan.id).length, 1);
  svc.setPass(fan.id, { neverShow: true });
  assert.equal(svc.listPhotos("evt_afronight", null).length, 1);
});

test("création complète avec vote, cagnotte, demande ToBe et boost", () => {
  const { svc, login } = setup();
  const u = login("+22896666666", "Kafui").user;
  const ev = svc.createEvent(u.id, {
    title: "Anniversaire de Kafui",
    category: "anniversaire",
    startsAt: "2026-12-05T19:00:00Z",
    venue: "Chez moi",
    description: "Venez !",
    visibility: "private",
    access: "invite",
    expectedAttendance: 60,
    reach: "quartier",
    options: { votes: true, cagnotte: true, gallery: true, live: false },
    contest: { mode: "free", votePrice: 0, closesAt: "2026-12-05T18:00:00Z", results: "live", candidates: [{ name: "Gâteau chocolat" }, { name: "Gâteau vanille" }] },
    cagnotte: { title: "Cadeau commun", goal: 100000 },
    tobe: { level: "carte", services: ["Décoration"], budget: "300 000" },
    boost: { plan: "jour", method: "mixx" },
  });
  assert.ok(ev.accessCode);
  assert.ok(ev.contestId && ev.cagnotteId && ev.tobeRequestId && ev.boostedUntil);
  assert.throws(() => svc.adminOverview(u.id));
  const admin = login("+22899999999").user;
  const ov = svc.adminOverview(admin.id);
  assert.equal(ov.requests.length, 1);
  assert.equal(ov.revenue.boost.platform, 2000);
});
