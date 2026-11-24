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

  // Sans pièce d'identité ni selfie : refusé.
  assert.throws(() => svc.requestVerification(orga.id, { fullName: "Kossi Mensah", phone: "90123456", orgName: "KM Events" }), (e: ApiError) => e.status === 400);
  assert.throws(() => svc.requestVerification(orga.id, { fullName: "Kossi Mensah", phone: "90123456", orgName: "KM Events", kind: "structure", idDocs: ["doc_a1"] }), /RCCM|structure/);
  svc.requestVerification(orga.id, { fullName: "Kossi Mensah", phone: "90123456", orgName: "KM Events", link: "facebook.com/kmevents", kind: "person", idDocs: ["doc_cni1"], selfie: "doc_selfie1" });
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

test("vérification de chaque événement : visible tout de suite, billetterie fermée jusqu'aux preuves validées", () => {
  const db = createDb();
  const svc = new ToBeService(db, { exposeOtp: true, checkout: true, premoderation: true, adminEmails: ["staff@tobe.tg"] } as never);
  const login = (email: string, name: string) => svc.verifyOtp(email, (svc.requestOtp(email) as { devCode: string }).devCode, name).user;
  const staff = login("staff@tobe.tg", "Staff");
  db.users.update(staff.id, { teamRole: "super_admin" } as never);
  const orga = login("orga@exemple.tg", "Orga");
  const fan = login("fan@exemple.tg", "Fan");
  svc.requestVerification(orga.id, { fullName: "Afi Mensah", phone: "90123456", orgName: "AM Prod", kind: "structure", idDocs: ["doc_cni"], structureDocs: ["doc_rccm"], structureNumber: "TG-LOM 2024 B 1234" });
  svc.reviewVerification(staff.id, orga.id, { decision: "verified" });
  const mk = (t: string) => ({ title: t, category: "concert" as const, startsAt: new Date(Date.now() + 9 * 86400_000).toISOString(), venue: "Palais", description: "", visibility: "public" as const, access: "paid" as const, ticketTypes: [{ name: "Standard", price: 3000, quota: 0 }], expectedAttendance: 50, reach: "ville" as const, options: {} as never });
  const e = svc.createEvent(orga.id, mk("Concert salsa"));
  const card = svc.listEvents({}).find((x) => x.id === e.id)!;
  assert.ok(card, "visible dans l'agenda");
  assert.equal(card.verified, false);
  const v = svc.getEvent(e.slug, fan.id);
  assert.equal(v.eventVerified, false);
  assert.match(String(v.salesBlocked), /vérifié cet événement/);
  assert.deepEqual(v.proofs, [], "les preuves ne sont pas publiques");
  assert.throws(() => svc.submitEventProof(fan.id, e.id, { files: [{ fileId: "doc_x", label: "Contrat" }] }), (x: ApiError) => x.status === 403);
  svc.submitEventProof(orga.id, e.id, { files: [{ fileId: "doc_contrat", label: "Contrat de location de la salle" }], note: "Salle réservée" });
  const q = svc.moderationQueue(staff.id).toVerify.find((x) => x.id === e.id)!;
  assert.equal(q.proofs.length, 1);
  svc.moderateEvent(staff.id, e.id, { action: "approve" });
  const after = svc.getEvent(e.slug, fan.id);
  assert.equal(after.eventVerified, true);
  assert.equal(after.salesBlocked, null);
  assert.equal(after.isOrganizer, false, "un visiteur ne peut pas modifier");
  assert.equal(svc.createEvent(staff.id, mk("Soirée de l'équipe")).eventVerified, true, "l'équipe ToBe publie vérifié");
});
