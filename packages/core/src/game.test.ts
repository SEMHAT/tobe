import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiError, createDb, facesDistance, handleApi, preVerify, quizOfDay, ToBeService, WHEEL } from "./index.js";

const DAY = 86_400_000;

function setup(opts: { google?: string } = {}) {
  const db = createDb();
  let t = new Date("2026-11-16T10:00:00Z");
  const svc = new ToBeService(db, { now: () => t, exposeOtp: true, adminEmails: ["admin@tobe.test"], googleClientId: opts.google ?? null });
  const login = (email: string, name = "Ama Kossi") => {
    const { devCode } = svc.requestOtp(email);
    return svc.verifyOtp(email, devCode!, name);
  };
  return { db, svc, login, advance: (ms: number) => (t = new Date(t.getTime() + ms)) };
}

test("bonus du jour : série et remise à zéro", () => {
  const { svc, login, advance } = setup();
  const { user } = login("ama@exemple.tg");
  assert.equal(svc.game.checkin(user.id).points, 5);
  assert.throws(() => svc.game.checkin(user.id), ApiError);
  advance(DAY);
  assert.equal(svc.game.checkin(user.id).points, 10);
  advance(DAY);
  const r = svc.game.checkin(user.id);
  assert.equal(r.streak, 3);
  advance(3 * DAY);
  assert.equal(svc.game.checkin(user.id).streak, 1, "la série repart à 1 après un jour manqué");
  assert.equal(svc.game.state(user.id).me!.points, 5 + 10 + 15 + 5);
});

test("roue du jour : une fois par jour, tirage côté serveur", () => {
  const { svc, login, advance } = setup();
  const { user } = login("ama@exemple.tg");
  const r = svc.game.spin(user.id, () => 0.999);
  assert.equal(r.index, WHEEL.length - 1);
  assert.throws(() => svc.game.spin(user.id), ApiError);
  advance(DAY);
  assert.equal(svc.game.spin(user.id, () => 0).points, WHEEL[0].points);
});

test("quiz : réponses vérifiées par le serveur, sans dévoiler les réponses avant", () => {
  const { svc, login, advance } = setup();
  const { user } = login("ama@exemple.tg");
  const q = svc.game.quiz(user.id);
  assert.equal(q.questions.length, 3);
  assert.equal((q.questions[0] as any).answer, undefined);
  const good = quizOfDay("2026-11-16").map((x) => x.answer);
  const r = svc.game.answerQuiz(user.id, good);
  assert.equal(r.score, 3);
  assert.equal(r.points, 50);
  assert.throws(() => svc.game.answerQuiz(user.id, good), ApiError);
  advance(DAY);
  assert.notDeepEqual(quizOfDay("2026-11-17").map((x) => x.id), quizOfDay("2026-11-16").map((x) => x.id));
});

test("missions, parrainage et récompenses", () => {
  const { svc, db, login } = setup();
  const sponsor = login("ama@exemple.tg").user;
  assert.throws(() => svc.game.claimMission(sponsor.id, "profil"), ApiError);
  svc.updateMe(sponsor.id, { phone: "90123456" });
  assert.equal(svc.game.claimMission(sponsor.id, "profil").points, 20);
  assert.throws(() => svc.game.claimMission(sponsor.id, "profil"), ApiError);

  const code = svc.game.state(sponsor.id).me!.refCode;
  const friend = login("kofi@exemple.tg", "Kofi").user;
  assert.throws(() => svc.game.referral(friend.id, "XXXXXX"), ApiError);
  svc.game.referral(friend.id, code);
  assert.throws(() => svc.game.referral(friend.id, code), ApiError);
  assert.equal(svc.game.state(friend.id).me!.points, 50);
  assert.equal(svc.game.claimMission(sponsor.id, "parrain").points, 50);
  assert.equal(svc.game.state(sponsor.id).me!.points, 20 + 50 + 50);

  // Pas assez de points pour le boost (400)
  assert.throws(() => svc.game.redeem(sponsor.id, "rw-boost"), (e: ApiError) => /manque/.test(e.message));
  db.players.update(sponsor.id, { points: 1000 });
  svc.game.redeem(sponsor.id, "rw-premium");
  assert.ok(svc.me(sponsor.id).premium);
  svc.game.redeem(sponsor.id, "rw-boost");
  assert.equal(svc.game.state(sponsor.id).me!.boostCredits, 1);
  assert.equal(svc.game.state(sponsor.id).me!.points, 0);
  // Classement du mois : seuls les gains comptent
  const board = svc.game.leaderboard();
  assert.equal(board[0].userId, sponsor.id);
  assert.equal(board[0].name, "Ama K.");
});

test("lots ajoutés par l'agence : stock et remise", () => {
  const { svc, db, login } = setup();
  const admin = login("admin@tobe.test", "Équipe ToBe").user;
  const u = login("ama@exemple.tg").user;
  assert.throws(() => svc.game.addReward(u.id, { title: "Lot", cost: 100 }), (e: ApiError) => e.status === 403);
  const lot = svc.game.addReward(admin.id, { title: "2 places VIP", cost: 100, stock: 1 });
  svc.game.player(u.id);
  db.players.update(u.id, { points: 300 });
  const { redemption } = svc.game.redeem(u.id, lot.id);
  assert.equal(redemption.status, "a-remettre");
  assert.throws(() => svc.game.redeem(u.id, lot.id), ApiError, "stock épuisé");
  svc.game.setRedemptionStatus(admin.id, redemption.id, "remis");
  assert.equal(db.redemptions.get(redemption.id)!.status, "remis");
});

test("connexion Google : jeton vérifié, jamais lu dans le corps de la requête", async () => {
  const { svc } = setup({ google: "client-123" });
  // Un client ne peut pas fabriquer un profil Google
  const forged = handleApi(svc, { method: "POST", path: "/auth/google", body: { email: "pirate@x.com" } });
  assert.equal(forged.status, 400);
  const okFetch = (async () => new Response(JSON.stringify({ aud: "client-123", iss: "https://accounts.google.com", exp: String(Date.now() / 1000 + 600), email: "Ama@Gmail.com", email_verified: "true", sub: "g-1", name: "Ama Kossi", picture: "https://x/p.jpg" }))) as typeof fetch;
  const pre = await preVerify({ method: "POST", path: "/auth/google", body: { credential: "abc" } }, { GOOGLE_CLIENT_ID: "client-123" }, okFetch);
  const r = handleApi(svc, { method: "POST", path: "/auth/google", body: {}, verified: pre.verified });
  assert.equal(r.status, 200);
  const body = r.body as { user: { email: string; name: string; google: boolean; avatar: string } };
  assert.equal(body.user.email, "ama@gmail.com");
  assert.equal(body.user.google, true);
  assert.equal(body.user.avatar, "https://x/p.jpg");
  const wrongAud = (async () => new Response(JSON.stringify({ aud: "autre", iss: "accounts.google.com", exp: "9999999999", email: "a@b.c", email_verified: "true", sub: "1" }))) as typeof fetch;
  const bad = await preVerify({ method: "POST", path: "/auth/google", body: { credential: "abc" } }, { GOOGLE_CLIENT_ID: "client-123" }, wrongAud);
  assert.equal(bad.error?.status, 400);
});

test("visage : plusieurs captures cohérentes, meilleure reconnaissance", () => {
  const { svc, login } = setup();
  const { user } = login("ama@exemple.tg");
  const base = Array.from({ length: 128 }, (_, i) => Math.sin(i) / 4);
  const jitter = (k: number) => base.map((x, i) => x + Math.cos(i * k) * 0.02);
  const stranger = base.map((x, i) => -x + (i % 2 ? 0.1 : -0.1));
  assert.throws(() => svc.setFace(user.id, [base, stranger], true), (e: ApiError) => /même personne/.test(e.message));
  const r = svc.setFace(user.id, [jitter(1), jitter(2), jitter(3)], true);
  assert.equal(r.user.hasFace, true);
  assert.ok(facesDistance([jitter(1), jitter(2), jitter(3)], [jitter(4)]) < 0.3);
  assert.ok(facesDistance([jitter(1), jitter(2)], [stranger]) > 0.5);
  assert.ok(svc.game.state(user.id).me!.missions.find((m) => m.id === "pass")!.ready);
});
