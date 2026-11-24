import assert from "node:assert/strict";
import { test } from "node:test";
import { createDb } from "./db.js";
import { ApiError } from "./errors.js";
import { ToBeService } from "./service.js";

function setup() {
  const db = createDb();
  const svc = new ToBeService(db, { exposeOtp: true, checkout: true, adminEmails: ["staff@tobe.tg"] } as never);
  const login = (email: string, name: string) => {
    const { devCode } = svc.requestOtp(email) as { devCode: string };
    return svc.verifyOtp(email, devCode, name).user;
  };
  const base = (title: string, days: number) => ({
    title,
    category: "concert" as const,
    startsAt: new Date(Date.now() + days * 86400_000).toISOString(),
    venue: "Palais des Congrès",
    description: "",
    visibility: "public" as const,
    access: "paid" as const,
    ticketTypes: [{ name: "Standard", price: 5000, quota: 100 }],
    expectedAttendance: 500,
    reach: "ville" as const,
    options: {} as never,
  });
  return { db, svc, login, base };
}

test("organisateur non vérifié : événement publié mais ventes en ligne fermées, puis ouvertes après vérification", () => {
  const { svc, login, base, db } = setup();
  const staff = login("staff@tobe.tg", "Staff");
  db.users.update(staff.id, { teamRole: "super_admin" } as never);
  const orga = login("orga@exemple.tg", "Orga");
  const fan = login("fan@exemple.tg", "Fan");
  const ev = svc.createEvent(orga.id, base("Concert de Noël", 10));
  assert.equal(ev.moderation, null);
  assert.match(String(svc.getEvent(ev.id, fan.id).salesBlocked), /vérifié/);
  assert.throws(() => svc.buyTickets(fan.id, ev.id, { ticketTypeId: ev.ticketTypes[0].id, qty: 1, method: "online" }), (e: ApiError) => e.status === 403);

  svc.requestVerification(orga.id, { fullName: "Kossi Mensah", phone: "90123456", orgName: "KM Events", link: "facebook.com/kmevents" });
  assert.equal(svc.moderationQueue(staff.id).verifications.length, 1);
  svc.reviewVerification(staff.id, orga.id, { decision: "verified" });
  assert.equal(svc.getEvent(ev.id, fan.id).salesBlocked, null);
  const r = svc.buyTickets(fan.id, ev.id, { ticketTypeId: ev.ticketTypes[0].id, qty: 1, method: "online" }) as unknown as { checkout: { intentId: string } };
  assert.ok(r.checkout.intentId);
});

test("clone : même titre, dates proches, autre organisateur → masqué et ventes fermées jusqu'à validation", () => {
  const { svc, login, base, db } = setup();
  const staff = login("staff@tobe.tg", "Staff");
  db.users.update(staff.id, { teamRole: "super_admin" } as never);
  const vrai = login("vrai@exemple.tg", "Vrai Orga");
  const faux = login("faux@exemple.tg", "Faux");
  const fan = login("fan@exemple.tg", "Fan");
  const a = svc.createEvent(vrai.id, base("Festival Son & Lumière de Lomé 2026", 20));
  const b = svc.createEvent(faux.id, base("FESTIVAL SON et LUMIERE Lomé", 21));
  assert.equal(b.moderation, "review");
  assert.ok(!svc.listEvents({}).some((e) => e.id === b.id), "masqué de l'agenda");
  assert.ok(svc.listEvents({}).some((e) => e.id === a.id));
  assert.throws(() => svc.getEvent(b.slug, fan.id), (e: ApiError) => e.status === 403);
  assert.equal(svc.getEvent(b.slug, faux.id).moderation, "review", "l'organisateur voit son événement");
  // Un événement sans rapport, ou très éloigné dans le temps, passe sans souci.
  assert.equal(svc.createEvent(faux.id, base("Soirée gospel", 21)).moderation, null);
  assert.equal(svc.createEvent(faux.id, base("Festival Son et Lumière", 60)).moderation, null);
  // L'équipe tranche.
  svc.moderateEvent(staff.id, b.id, { action: "suspend", reason: "Faux événement" });
  assert.throws(() => svc.getEvent(b.slug, fan.id), (e: ApiError) => e.status === 410);
  // Renommer un événement validé pour copier un autre : de nouveau en vérification.
  const c = svc.createEvent(faux.id, base("Nuit du rire", 20));
  assert.equal(svc.updateEvent(faux.id, c.id, { title: "Festival Son & Lumière" }).moderation, "review");
});

test("3 signalements de visiteurs différents → mis en vérification", () => {
  const { svc, login, base } = setup();
  const orga = login("orga@exemple.tg", "Orga");
  const ev = svc.createEvent(orga.id, base("Gala de charité", 15));
  for (const n of ["a", "b"]) svc.reportEvent(login(`${n}@exemple.tg`, n).id, ev.id, { reason: "arnaque" });
  const x = login("c@exemple.tg", "c");
  svc.reportEvent(x.id, ev.id, { reason: "arnaque" });
  svc.reportEvent(x.id, ev.id, { reason: "faux" }); // un seul signalement par personne
  assert.ok(!svc.listEvents({}).some((e) => e.id === ev.id));
});
