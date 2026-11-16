import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError, createDb, REMINDER_STAGES, ToBeService, type PushPayload, type PushSub } from "./index.js";

const H = 3600_000;

function setup() {
  const db = createDb();
  let t = new Date("2026-11-20T10:00:00Z");
  const pushes: { sub: PushSub; payload: PushPayload }[] = [];
  const svc = new ToBeService(db, {
    now: () => t,
    exposeOtp: true,
    adminEmails: ["boss@tobe.test"],
    push: { publicKey: "pk", send: async (sub, payload) => (pushes.push({ sub, payload }), sub.endpoint.includes("gone") ? "gone" : "ok") },
  });
  const login = (email: string, name = "Ama") => {
    const { devCode } = svc.requestOtp(email);
    return svc.verifyOtp(email, devCode!, name).user;
  };
  const event = (organizerId: string, startsAt: string) =>
    svc.createEvent(organizerId, {
      title: "Soirée test",
      category: "soiree",
      startsAt,
      venue: "Lomé",
      description: "Une soirée",
      visibility: "public",
      access: "free",
      ticketTypes: [{ name: "Entrée", price: 0 }],
      expectedAttendance: 100,
      reach: "ville",
      options: { tickets: true, gallery: false, contest: false, cagnotte: false, live: false, program: false } as never,
    });
  return { db, svc, login, event, pushes, at: (d: string) => (t = new Date(d)), advance: (ms: number) => (t = new Date(t.getTime() + ms)) };
}

test("équipe d'un événement : invitation WhatsApp, droits limités par rôle", () => {
  const { svc, login, event } = setup();
  const orga = login("orga@exemple.tg", "Orga");
  const scan = login("scan@exemple.tg", "Kossi");
  const photo = login("photo@exemple.tg", "Afi");
  const e = event(orga.id, "2026-11-28T20:00:00Z");
  const inv = svc.team.inviteEvent(orga.id, e.id, { role: "controleur", label: "Kossi" });
  assert.match(inv.message, /contrôleur d'entrée/);
  assert.equal(inv.path, `/invitation/${inv.invite.id}`);
  assert.throws(() => svc.team.inviteEvent(scan.id, e.id, { role: "photographe" }), (x: ApiError) => x.status === 403);
  assert.equal(svc.team.getInvite(inv.invite.id).roleLabel, "Contrôleur d'entrée");
  const r = svc.team.acceptInvite(scan.id, inv.invite.id);
  assert.equal(r.redirect, `/scanner?event=${e.id}`);
  assert.throws(() => svc.team.acceptInvite(photo.id, inv.invite.id), ApiError, "lien déjà utilisé");

  // Le contrôleur scanne mais ne modifie pas l'événement et ne dépose pas de photos.
  const order = svc.buyTickets(orga.id, e.id, { ticketTypeId: e.ticketTypes[0].id, qty: 1, method: "cash" });
  assert.equal(svc.scanTicket(scan.id, order.code).ok, true);
  assert.throws(() => svc.updateEvent(scan.id, e.id, { title: "Piraté" }), (x: ApiError) => x.status === 403);
  assert.throws(() => svc.addPhotos(scan.id, e.id, []), (x: ApiError) => x.status === 403);

  // Le photographe dépose des photos mais ne scanne pas.
  const inv2 = svc.team.inviteEvent(orga.id, e.id, { role: "photographe" });
  svc.team.acceptInvite(photo.id, inv2.invite.id);
  assert.equal(svc.addPhotos(photo.id, e.id, [{ url: "/x.jpg", width: 10, height: 10, faces: [] }]).added, 1);
  assert.equal(svc.scanTicket(photo.id, order.code).ok, false);

  // Tableau de bord : l'événement apparaît, sans les montants.
  const dash = svc.organizerDashboard(scan.id);
  assert.equal(dash.events.length, 1);
  assert.equal(dash.events[0].myRole, "controleur");
  // L'organisateur retire le contrôleur.
  const team = svc.team.eventTeam(orga.id, e.id);
  assert.equal(team.members.length, 2);
  svc.team.removeMember(orga.id, team.members.find((m) => m.userId === scan.id)!.id);
  assert.equal(svc.scanTicket(scan.id, order.code).ok, false);
});

test("équipe ToBe : rôles, hiérarchie et dossiers confiés", () => {
  const { svc, login } = setup();
  const boss = login("boss@tobe.test", "Boss");
  assert.equal(svc.me(boss.id).team?.role, "super_admin");
  const a = login("admin@tobe.test", "Admin");
  const cp = login("cp@tobe.test", "Chef");
  const sup = login("sup@tobe.test", "Support");
  const client = login("client@exemple.tg", "Client");

  const invA = svc.team.inviteTeam(boss.id, { role: "admin" });
  svc.team.acceptInvite(a.id, invA.invite.id);
  assert.equal(svc.me(a.id).team?.role, "admin");
  // Un admin ne nomme pas d'autres admins, mais nomme un chef de projet.
  assert.throws(() => svc.team.inviteTeam(a.id, { role: "admin" }), (x: ApiError) => x.status === 403);
  svc.team.acceptInvite(cp.id, svc.team.inviteTeam(a.id, { role: "chef_projet" }).invite.id);
  svc.team.acceptInvite(sup.id, svc.team.inviteTeam(a.id, { role: "support" }).invite.id);
  assert.throws(() => svc.team.setTeamRole(a.id, boss.id, null), (x: ApiError) => x.status === 403);
  assert.throws(() => svc.team.inviteTeam(sup.id, { role: "support" }), (x: ApiError) => x.status === 403);

  // Demande « Confier à ToBe » : le chef de projet la prend, puis la traite.
  const req = svc.requestTobe(client.id, { level: "complete", services: ["deco"], phone: "90123456", eventTitle: "Mariage" });
  assert.equal(svc.adminOverview(cp.id).requests.length, 1, "le chef de projet voit les dossiers libres");
  assert.throws(() => svc.updateTobeRequest(cp.id, req.id, "contacte"), (x: ApiError) => x.status === 403);
  svc.team.assignRequest(cp.id, req.id, cp.id);
  svc.updateTobeRequest(cp.id, req.id, "contacte");
  // Le support voit mais ne modifie pas.
  assert.equal(svc.adminOverview(sup.id).requests.length, 1);
  assert.throws(() => svc.updateTobeRequest(sup.id, req.id, "signe"), (x: ApiError) => x.status === 403);
  assert.throws(() => svc.game.addReward(sup.id, { title: "Lot", cost: 100 }), (x: ApiError) => x.status === 403);
  assert.throws(() => svc.adminOverview(client.id), (x: ApiError) => x.status === 403);
  // Un admin retire le support de l'équipe.
  svc.team.setTeamRole(a.id, sup.id, null);
  assert.equal(svc.me(sup.id).team, null);
});

test("rappels : 2 jours avant, la veille, le jour J, 30 minutes avant, une seule fois chacun", async () => {
  const { svc, login, event, pushes, at } = setup();
  const orga = login("orga@exemple.tg", "Orga");
  const fan = login("fan@exemple.tg", "Fan");
  svc.reminders.subscribe(fan.id, { endpoint: "https://push.example/fan", keys: { p256dh: "k", auth: "a" } });
  const e = event(orga.id, "2026-11-25T19:00:00Z");
  svc.reminders.follow(fan.id, e.id, {});
  assert.equal(svc.getEvent(e.id, fan.id).following, true);

  const titles = async (d: string) => {
    at(d);
    pushes.length = 0;
    svc.reminders.processDue();
    await Promise.all(svc.pending.splice(0));
    return pushes.map((p) => p.payload.title);
  };
  assert.deepEqual(await titles("2026-11-23T18:00:00Z"), []);
  assert.deepEqual(await titles("2026-11-23T19:02:00Z"), ["Dans 2 jours : Soirée test"]);
  assert.deepEqual(await titles("2026-11-23T19:07:00Z"), [], "pas de doublon");
  assert.deepEqual(await titles("2026-11-24T19:05:00Z"), ["C'est demain : Soirée test"]);
  assert.deepEqual(await titles("2026-11-25T08:03:00Z"), ["C'est aujourd'hui ! Soirée test"]);
  assert.deepEqual(await titles("2026-11-25T18:31:00Z"), ["Ça commence dans 30 minutes"]);
  // Une notification dans l'application aussi.
  assert.equal(svc.notifications(fan.id).length, 4);
  assert.equal(REMINDER_STAGES.length, 4);
});

test("rappels : billet pris tard, visiteur sans compte, abonnement expiré", async () => {
  const { svc, db, login, event, pushes, at } = setup();
  const orga = login("orga@exemple.tg", "Orga");
  const e = event(orga.id, "2026-11-21T20:00:00Z"); // demain
  // Billet pris la veille au soir : pas de rappel « 2 jours » ni « veille » envoyé en retard.
  at("2026-11-20T21:30:00Z");
  const buyer = login("buyer@exemple.tg", "Buyer");
  svc.reminders.subscribe(buyer.id, { endpoint: "https://push.example/gone", keys: { p256dh: "k", auth: "a" } });
  svc.buyTickets(buyer.id, e.id, { ticketTypeId: e.ticketTypes[0].id, qty: 1, method: "cash" });
  svc.reminders.processDue();
  assert.equal(pushes.length, 0);
  at("2026-11-21T08:05:00Z");
  svc.reminders.processDue();
  await Promise.all(svc.pending.splice(0));
  assert.equal(pushes.length, 1);
  assert.match(pushes[0].payload.body, /billet/);
  assert.deepEqual(svc.goneSubs, [db.pushSubs.all()[0].id], "abonnement expiré repéré");

  // Visiteur sans compte : le rappel suit son téléphone.
  const anon = svc.reminders.subscribe(null, { endpoint: "https://push.example/anon", keys: { p256dh: "k", auth: "a" } });
  assert.throws(() => svc.reminders.follow(null, e.id, {}), ApiError);
  svc.reminders.follow(null, e.id, { endpoint: "https://push.example/anon" });
  assert.equal(svc.reminders.status(null, e.id, "https://push.example/anon").following, true);
  pushes.length = 0;
  at("2026-11-21T19:31:00Z");
  svc.reminders.processDue();
  await Promise.all(svc.pending.splice(0));
  assert.ok(pushes.some((p) => p.sub.id === anon.subId && p.payload.title === "Ça commence dans 30 minutes"));
  // Il se connecte : ses rappels passent sur son compte.
  const later = login("anon@exemple.tg", "Anon");
  svc.reminders.subscribe(later.id, { endpoint: "https://push.example/anon", keys: { p256dh: "k", auth: "a" } });
  assert.equal(db.reminders.filter((r) => r.userId === later.id).length, 1);
  void H;
});
