import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError, createDb, ToBeService, type PushPayload } from "./index.js";

function setup() {
  const db = createDb();
  let t = new Date("2026-11-20T10:00:00Z");
  const pushes: PushPayload[] = [];
  const svc = new ToBeService(db, { now: () => t, exposeOtp: true, push: { publicKey: "pk", send: async (_s, p) => (pushes.push(p), "ok") } });
  const login = (email: string, name = "Ama") => {
    const { devCode } = svc.requestOtp(email);
    return svc.verifyOtp(email, devCode!, name).user;
  };
  const orga = login("orga@exemple.tg", "Orga");
  const e = svc.createEvent(orga.id, {
    title: "Concret Live",
    category: "concert",
    startsAt: "2026-11-28T20:00:00Z",
    venue: "Palais",
    description: "Erreur de frappe",
    visibility: "public",
    access: "paid",
    ticketTypes: [
      { name: "Standard", price: 5000, quota: 100 },
      { name: "VIP", price: 20000, quota: 20 },
    ],
    expectedAttendance: 200,
    reach: "ville",
    options: { tickets: true } as never,
  });
  return { db, svc, login, orga, e, pushes, at: (d: string) => (t = new Date(d)) };
}

test("modifier : titre, description et prix ; le lien ne change pas", () => {
  const { svc, orga, e } = setup();
  const v = svc.updateEvent(orga.id, e.id, {
    title: "Concert Live",
    description: "Le grand concert de l'année",
    ticketTypes: [
      { id: e.ticketTypes[0].id, name: "Standard", price: 3000, quota: 150 },
      { id: e.ticketTypes[1].id, name: "VIP", price: 15000, quota: 20 },
      { name: "Étudiant", price: 2000, quota: 50 },
    ],
  });
  assert.equal(v.title, "Concert Live");
  assert.equal(v.slug, e.slug, "les liens déjà partagés restent valables");
  assert.deepEqual(v.ticketTypes.map((t) => [t.name, t.price]), [["Standard", 3000], ["VIP", 15000], ["Étudiant", 2000]]);
  assert.ok(v.updatedAt);
});

test("modifier : les billets déjà réservés sont protégés", () => {
  const { svc, orga, e, login } = setup();
  const fan = login("fan@exemple.tg", "Fan");
  const order = svc.buyTickets(fan.id, e.id, { ticketTypeId: e.ticketTypes[1].id, qty: 3, method: "cash" });
  assert.throws(() => svc.updateEvent(orga.id, e.id, { ticketTypes: [{ id: e.ticketTypes[0].id, name: "Standard", price: 5000 }] }), (x: ApiError) => /VIP/.test(x.message));
  assert.throws(() => svc.updateEvent(orga.id, e.id, { ticketTypes: [{ id: e.ticketTypes[1].id, name: "VIP", price: 20000, quota: 2 }] }), (x: ApiError) => /3 places/.test(x.message));
  assert.throws(() => svc.updateEvent(orga.id, e.id, { access: "free" }), (x: ApiError) => /type d'accès/.test(x.message));
  // Changer le prix ne change pas ce qui a déjà été réservé.
  svc.updateEvent(orga.id, e.id, { ticketTypes: [{ id: e.ticketTypes[0].id, name: "Standard", price: 5000 }, { id: e.ticketTypes[1].id, name: "VIP", price: 25000, quota: 20 }] });
  assert.equal(svc.getTicket(fan.id, order.id).total, order.total);
  // Seul l'organisateur modifie.
  assert.throws(() => svc.updateEvent(fan.id, e.id, { title: "Piraté" }), (x: ApiError) => x.status === 403);
  assert.throws(() => svc.updateEvent(orga.id, e.id, { title: "" }), ApiError);
  assert.throws(() => svc.updateEvent(orga.id, e.id, { startsAt: "2026-11-01T20:00:00Z" }), (x: ApiError) => /passée/.test(x.message));
  assert.throws(() => svc.updateEvent(orga.id, e.id, { endsAt: "2026-11-28T19:00:00Z" }), (x: ApiError) => /après le début/.test(x.message));
});

test("modifier la date ou le lieu prévient les participants et recale les rappels", async () => {
  const { svc, db, orga, e, login, pushes, at } = setup();
  const fan = login("fan@exemple.tg", "Fan");
  svc.reminders.subscribe(fan.id, { endpoint: "https://push.example/fan", keys: { p256dh: "k", auth: "a" } });
  svc.buyTickets(fan.id, e.id, { ticketTypeId: e.ticketTypes[0].id, qty: 1, method: "cash" });
  // Sans changement de date ni de lieu, personne n'est dérangé.
  svc.updateEvent(orga.id, e.id, { description: "Nouvelle description" });
  await Promise.all(svc.pending.splice(0));
  assert.equal(pushes.length, 0);
  at("2026-11-26T21:00:00Z"); // « 2 jours avant » déjà passé pour l'ancienne date
  svc.reminders.processDue();
  svc.updateEvent(orga.id, e.id, { startsAt: "2026-12-05T19:00:00Z", venue: "Stade de Kégué" });
  await Promise.all(svc.pending.splice(0));
  const change = pushes.find((p) => p.title.startsWith("Changement"))!;
  assert.match(change.body, /Nouvelle date : samedi 5 décembre à 19h00 · nouveau lieu : Stade de Kégué/);
  assert.ok(svc.notifications(fan.id).some((n) => n.title === "Changement : Concret Live"));
  assert.deepEqual(db.reminders.all()[0].sent, [], "les rappels repartent de zéro pour la nouvelle date");
});

test("événement sans billetterie : infos d'entrée, pas de billets, rappels possibles", () => {
  const { svc, orga, login } = setup();
  const v = svc.createEvent(orga.id, {
    title: "Mariage Kossi & Afi",
    category: "mariage",
    startsAt: "2026-12-12T15:00:00Z",
    venue: "Hôtel 2 Février",
    description: "",
    visibility: "public",
    access: "none",
    entryInfo: "Entrée sur carton d'invitation",
    entryUrl: "wa.me/22890123456",
    expectedAttendance: 300,
    reach: "ville",
    options: {} as never,
  });
  assert.equal(v.access, "none");
  assert.equal(v.ticketTypes.length, 0);
  assert.equal(v.entryInfo, "Entrée sur carton d'invitation");
  assert.equal(v.entryUrl, "https://wa.me/22890123456");
  const card = svc.listEvents({}).find((c) => c.id === v.id)!;
  assert.equal(card.access, "none");
  assert.equal(card.entryInfo, "Entrée sur carton d'invitation");
  const fan = login("fan@exemple.tg", "Fan");
  assert.throws(() => svc.buyTickets(fan.id, v.id, { ticketTypeId: "x", qty: 1, method: "cash" }), /Pas de billetterie/);
  // Passer ensuite à une billetterie gratuite, puis revenir : possible tant que rien n'est réservé.
  const f = svc.updateEvent(orga.id, v.id, { access: "free", ticketTypes: [{ name: "Entrée", price: 0, quota: 100 }] });
  assert.equal(f.ticketTypes.length, 1);
  assert.equal(f.entryInfo, null);
  svc.buyTickets(fan.id, v.id, { ticketTypeId: f.ticketTypes[0].id, qty: 1, method: "cash" });
  assert.throws(() => svc.updateEvent(orga.id, v.id, { access: "none" }), ApiError);
});

test("« Organisé par » : modifiable par l'équipe ToBe seulement", () => {
  const { svc, orga, login, db } = setup();
  const base = { category: "concert" as const, startsAt: "2026-12-18T18:00:00Z", venue: "Palais", description: "", visibility: "public" as const, access: "none" as const, expectedAttendance: 100, reach: "ville" as const, options: {} as never };
  const a = svc.createEvent(orga.id, { ...base, title: "Concert A", organizerName: "Lix228" });
  assert.equal(a.organizerName, "Orga");
  const staff = login("staff@exemple.tg", "Staff");
  db.users.update(staff.id, { teamRole: "admin" });
  const b = svc.createEvent(staff.id, { ...base, title: "Concert B", organizerName: "Lix228" });
  assert.equal(b.organizerName, "Lix228");
  assert.equal(svc.updateEvent(staff.id, b.id, { organizerName: "Lix 228 Prod" }).organizerName, "Lix 228 Prod");
});

test("événement sur plusieurs jours : visible « aujourd'hui » tant qu'il est en cours", () => {
  const { svc, orga, at } = setup();
  const foire = svc.createEvent(orga.id, {
    title: "Foire de la semaine",
    category: "culture",
    startsAt: "2026-11-16T08:00:00Z",
    endsAt: "2026-11-22T18:00:00Z",
    venue: "CETEF",
    description: "Une semaine entière",
    visibility: "public",
    access: "free",
    expectedAttendance: 2000,
    reach: "ville",
    options: {} as never,
  } as never);
  at("2026-11-20T10:00:00Z");
  const today = svc.listEvents({ when: "today" });
  const card = today.find((c) => c.id === foire.id);
  assert.ok(card, "la foire commencée le 16 apparaît le 20");
  assert.equal(card!.endsAt, "2026-11-22T18:00:00.000Z");
  at("2026-11-23T10:00:00Z");
  assert.ok(!svc.listEvents({ when: "today" }).some((c) => c.id === foire.id), "terminée : elle disparaît");
});
