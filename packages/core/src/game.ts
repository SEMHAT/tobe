import { quizOfDay } from "./quiz.js";
import { newId, randomCode, userFaces } from "./rules.js";
import type { Player, Reward, RewardKind, User } from "./types.js";
import { ApiError } from "./errors.js";
import type { ToBeService } from "./service.js";

// =====================================================================
// ToBe Club : chaque jour on joue, on gagne des points, on les échange.
// Tout se décide côté serveur (tirages, réponses, missions) : impossible de tricher depuis l'application.
// =====================================================================

export const LEVELS = [
  { min: 0, name: "Curieux", icon: "sparkles" },
  { min: 150, name: "Habitué", icon: "ticket" },
  { min: 400, name: "Ambianceur", icon: "music" },
  { min: 900, name: "Star de Lomé", icon: "star" },
  { min: 2000, name: "Légende", icon: "crown" },
] as const;

export function levelOf(earned: number) {
  let i = 0;
  while (i + 1 < LEVELS.length && earned >= LEVELS[i + 1].min) i++;
  const next = LEVELS[i + 1] ?? null;
  return {
    index: i,
    name: LEVELS[i].name,
    icon: LEVELS[i].icon,
    min: LEVELS[i].min,
    next: next ? { name: next.name, min: next.min } : null,
    progress: next ? Math.min(1, (earned - LEVELS[i].min) / (next.min - LEVELS[i].min)) : 1,
  };
}

/** Roue du jour : valeurs et probabilités (sur 100). Moyenne ≈ 22 points. */
export const WHEEL = [
  { points: 10, weight: 20 },
  { points: 25, weight: 12 },
  { points: 5, weight: 18 },
  { points: 50, weight: 6 },
  { points: 15, weight: 18 },
  { points: 100, weight: 2 },
  { points: 20, weight: 14 },
  { points: 30, weight: 10 },
];

/** Bonus du jour selon la série de jours consécutifs (au-delà de 7 : 50). */
export const DAILY = [5, 10, 15, 20, 25, 30, 50];

export const QUIZ_POINTS = { perAnswer: 10, perfect: 20 };
export const REFERRAL_POINTS = 50;
export const ATTEND_POINTS = 40;

interface MissionDef {
  id: string;
  title: string;
  hint: string;
  points: number;
  link: string;
  done: (u: User, p: Player, s: ToBeService) => boolean;
}

export const MISSIONS: MissionDef[] = [
  { id: "profil", title: "Compléter son profil", hint: "Nom et numéro de téléphone", points: 20, link: "/profil", done: (u) => !!u.name && !!u.phone },
  { id: "pass", title: "Activer son Pass ToBe", hint: "Vos photos vous trouvent toutes seules", points: 50, link: "/photos", done: (u) => userFaces(u).length > 0 },
  { id: "place", title: "Réserver sa première place", hint: "N'importe quel événement", points: 30, link: "/explorer", done: (u, _p, s) => s.db.orders.some((o) => o.userId === u.id && (o.status === "paid" || o.status === "reserved")) },
  { id: "vote", title: "Voter pour la première fois", hint: "Concours, élections, awards…", points: 20, link: "/explorer", done: (u, _p, s) => s.db.votes.some((v) => v.userId === u.id) },
  { id: "organiser", title: "Publier un événement", hint: "Public, et c'est parti", points: 100, link: "/creer", done: (u, _p, s) => s.db.events.some((e) => e.organizerId === u.id && e.visibility === "public") },
  { id: "notifs", title: "Activer les notifications", hint: "Vos rappels comme vos messages", points: 30, link: "/profil", done: (u, _p, s) => s.db.pushSubs.some((x) => x.userId === u.id) },
  { id: "app", title: "Installer l'application", hint: "ToBe sur votre écran d'accueil", points: 30, link: "/profil", done: (_u, p) => !!p.installedAt },
  { id: "parrain", title: "Inviter un ami", hint: "Il s'inscrit avec votre lien", points: 50, link: "/club#inviter", done: (_u, p) => p.referrals >= 1 },
  { id: "bande", title: "Faire venir 5 amis", hint: "La bande est au complet", points: 150, link: "/club#inviter", done: (_u, p) => p.referrals >= 5 },
  { id: "serie7", title: "7 jours d'affilée", hint: "Revenez chaque jour", points: 70, link: "/club", done: (_u, p) => p.bestStreak >= 7 },
];

/** Récompenses que la plateforme livre elle-même, sans intervention. */
export const BUILTIN_REWARDS: Reward[] = [
  { id: "rw-badge", title: "Badge Ambassadeur", description: "Un badge doré affiché sur votre profil et vos avis.", cost: 250, kind: "badge", stock: null, active: true, createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "rw-boost", title: "Boost offert : 3 jours en tête", description: "Votre événement passe en tête des listes pendant 72 heures.", cost: 400, kind: "boost", stock: null, active: true, createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "rw-premium", title: "1 mois Premium", description: "Vos photos en HD, sans filigrane, pendant 30 jours.", cost: 600, kind: "premium", stock: null, active: true, createdAt: "2026-01-01T00:00:00.000Z" },
];

const DAY = 86_400_000;
const dayOf = (d: Date) => d.toISOString().slice(0, 10); // Lomé vit à l'heure UTC
const shortName = (u: User | undefined) => {
  if (!u?.name) return "Membre ToBe";
  const [first, ...rest] = u.name.trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1][0].toUpperCase()}.` : first;
};

export class Game {
  constructor(private s: ToBeService) {}

  private get db() {
    return this.s.db;
  }
  private today() {
    return dayOf(this.s.now());
  }

  player(userId: string): Player {
    const existing = this.db.players.get(userId);
    if (existing) return existing;
    let refCode = randomCode(6);
    while (this.db.players.some((p) => p.refCode === refCode)) refCode = randomCode(6);
    return this.db.players.insert({
      id: userId,
      points: 0,
      earned: 0,
      streak: 0,
      bestStreak: 0,
      lastDay: null,
      spinDay: null,
      quizDay: null,
      quizResult: null,
      missions: {},
      attended: [],
      refCode,
      referredBy: null,
      referrals: 0,
      boostCredits: 0,
      badges: [],
    });
  }

  private earn(userId: string, amount: number, reason: string, label: string, patch: Partial<Player> = {}): Player {
    const p = this.player(userId);
    const next = this.db.players.update(userId, { ...patch, points: p.points + amount, earned: p.earned + Math.max(0, amount) });
    this.db.ledger.insert({ id: newId("pts"), userId, amount, reason, label, month: this.s.iso().slice(0, 7), createdAt: this.s.iso() });
    const before = levelOf(p.earned);
    const after = levelOf(next.earned);
    if (after.index > before.index) this.s.notify(userId, `Niveau ${after.name} atteint !`, "Bravo, vous montez d'un niveau dans le ToBe Club.", "/club");
    return next;
  }

  rewards(): Reward[] {
    const custom = this.db.rewards.all();
    return [...BUILTIN_REWARDS, ...custom].filter((r) => r.active).sort((a, b) => a.cost - b.cost);
  }

  leaderboard(limit = 10) {
    const month = this.s.iso().slice(0, 7);
    const totals = new Map<string, number>();
    for (const l of this.db.ledger.filter((l) => l.month === month && l.amount > 0)) totals.set(l.userId, (totals.get(l.userId) ?? 0) + l.amount);
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([userId, points], i) => {
        const u = this.db.users.get(userId);
        const p = this.db.players.get(userId);
        return { rank: i + 1, userId, name: shortName(u), avatar: u?.avatar ?? null, points, level: levelOf(p?.earned ?? 0).name, ambassador: !!p?.badges?.includes("ambassadeur") };
      })
      .slice(0, limit);
  }

  private missionsFor(u: User, p: Player) {
    return MISSIONS.map((m) => {
      const claimed = !!p.missions[m.id];
      return { id: m.id, title: m.title, hint: m.hint, points: m.points, link: m.link, claimed, ready: !claimed && m.done(u, p, this.s) };
    });
  }

  /** Événements où l'on a réellement été scanné à l'entrée et pas encore récompensés. */
  private attendable(u: User, p: Player) {
    const ids = new Set(this.db.orders.filter((o) => o.userId === u.id && o.scannedCount > 0).map((o) => o.eventId));
    return [...ids].filter((id) => !p.attended.includes(id));
  }

  state(userId: string | null) {
    const base = {
      levels: LEVELS,
      wheel: WHEEL.map((w) => w.points),
      daily: DAILY,
      rewards: this.rewards(),
      leaderboard: this.leaderboard(),
      month: this.s.iso().slice(0, 7),
      quizPoints: QUIZ_POINTS,
      referralPoints: REFERRAL_POINTS,
      attendPoints: ATTEND_POINTS,
    };
    if (!userId) return { ...base, me: null };
    const u = this.s.requireUser(userId);
    const p = this.player(u.id);
    const today = this.today();
    const yesterday = dayOf(new Date(this.s.now().getTime() - DAY));
    const streakAlive = p.lastDay === today || p.lastDay === yesterday;
    const currentStreak = streakAlive ? p.streak : 0;
    const nextStreak = p.lastDay === today ? p.streak : currentStreak + 1;
    const month = this.s.iso().slice(0, 7);
    const monthPoints = this.db.ledger.filter((l) => l.userId === u.id && l.month === month && l.amount > 0).reduce((s, l) => s + l.amount, 0);
    const board = this.leaderboard(1000);
    const rank = board.find((r) => r.userId === u.id)?.rank ?? null;
    return {
      ...base,
      me: {
        points: p.points,
        earned: p.earned,
        monthPoints,
        rank,
        level: levelOf(p.earned),
        streak: currentStreak,
        bestStreak: p.bestStreak,
        dailyDone: p.lastDay === today,
        dailyReward: DAILY[Math.min(nextStreak, DAILY.length) - 1],
        spinDone: p.spinDay === today,
        quizDone: p.quizDay === today,
        quizResult: p.quizDay === today ? p.quizResult : null,
        missions: this.missionsFor(u, p),
        attendReady: this.attendable(u, p).length,
        refCode: p.refCode,
        referrals: p.referrals,
        canBeReferred: !p.referredBy && this.s.now().getTime() - new Date(u.createdAt).getTime() < 7 * DAY,
        boostCredits: p.boostCredits,
        badges: p.badges,
        history: this.db.ledger
          .filter((l) => l.userId === u.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 20),
        redemptions: this.db.redemptions.filter((r) => r.userId === u.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      },
    };
  }

  checkin(userId: string) {
    const u = this.s.requireUser(userId);
    const p = this.player(u.id);
    const today = this.today();
    if (p.lastDay === today) throw new ApiError(400, "Bonus du jour déjà récupéré. Revenez demain !");
    const yesterday = dayOf(new Date(this.s.now().getTime() - DAY));
    const streak = p.lastDay === yesterday ? p.streak + 1 : 1;
    const points = DAILY[Math.min(streak, DAILY.length) - 1];
    this.earn(u.id, points, "daily", `Bonus du jour · série de ${streak} jour${streak > 1 ? "s" : ""}`, { streak, bestStreak: Math.max(p.bestStreak, streak), lastDay: today });
    return { points, streak, state: this.state(u.id) };
  }

  spin(userId: string, random: () => number = Math.random) {
    const u = this.s.requireUser(userId);
    const p = this.player(u.id);
    const today = this.today();
    if (p.spinDay === today) throw new ApiError(400, "Vous avez déjà tourné la roue aujourd'hui. Revenez demain !");
    const total = WHEEL.reduce((s, w) => s + w.weight, 0);
    let r = random() * total;
    let index = 0;
    for (; index < WHEEL.length - 1; index++) {
      r -= WHEEL[index].weight;
      if (r < 0) break;
    }
    const points = WHEEL[index].points;
    this.earn(u.id, points, "spin", "Roue du jour", { spinDay: today });
    return { index, points, state: this.state(u.id) };
  }

  quiz(userId: string | null) {
    const questions = quizOfDay(this.today()).map(({ answer, explain, ...q }) => q);
    if (!userId) return { done: false, questions, result: null };
    const p = this.player(this.s.requireUser(userId).id);
    const done = p.quizDay === this.today();
    return { done, questions, result: done ? p.quizResult : null };
  }

  answerQuiz(userId: string, answers: number[]) {
    const u = this.s.requireUser(userId);
    const p = this.player(u.id);
    const today = this.today();
    if (p.quizDay === today) throw new ApiError(400, "Quiz du jour déjà joué. Nouvelles questions demain !");
    const qs = quizOfDay(today);
    if (!Array.isArray(answers) || answers.length !== qs.length) throw new ApiError(400, "Répondez à toutes les questions");
    const details = qs.map((q, i) => ({ id: q.id, correct: q.answer, given: Number(answers[i]), ok: Number(answers[i]) === q.answer, explain: q.explain }));
    const score = details.filter((d) => d.ok).length;
    const points = score * QUIZ_POINTS.perAnswer + (score === qs.length ? QUIZ_POINTS.perfect : 0);
    const quizResult = { score, total: qs.length, points };
    if (points > 0) this.earn(u.id, points, "quiz", `Quiz du jour · ${score}/${qs.length}`, { quizDay: today, quizResult });
    else this.db.players.update(u.id, { quizDay: today, quizResult });
    return { ...quizResult, details, state: this.state(u.id) };
  }

  claimMission(userId: string, missionId: string) {
    const u = this.s.requireUser(userId);
    const p = this.player(u.id);
    if (missionId === "presence") {
      const ids = this.attendable(u, p);
      if (!ids.length) throw new ApiError(400, "Faites-vous scanner à l'entrée d'un événement pour gagner ces points");
      const points = ids.length * ATTEND_POINTS;
      this.earn(u.id, points, "presence", `Présence à ${ids.length} événement${ids.length > 1 ? "s" : ""}`, { attended: [...p.attended, ...ids] });
      return { points, state: this.state(u.id) };
    }
    const m = MISSIONS.find((x) => x.id === missionId);
    if (!m) throw new ApiError(404, "Mission inconnue");
    if (p.missions[m.id]) throw new ApiError(400, "Mission déjà validée");
    if (!m.done(u, p, this.s)) throw new ApiError(400, `Pas encore : ${m.hint.toLowerCase()}`);
    this.earn(u.id, m.points, "mission", m.title, { missions: { ...p.missions, [m.id]: this.s.iso() } });
    return { points: m.points, state: this.state(u.id) };
  }

  referral(userId: string, rawCode: string) {
    const u = this.s.requireUser(userId);
    const p = this.player(u.id);
    const code = String(rawCode ?? "").trim().toUpperCase();
    if (p.referredBy) throw new ApiError(400, "Vous avez déjà été parrainé");
    if (this.s.now().getTime() - new Date(u.createdAt).getTime() > 7 * DAY) throw new ApiError(400, "Le parrainage est réservé aux nouveaux comptes");
    const sponsor = this.db.players.find((x) => x.refCode === code);
    if (!sponsor || sponsor.id === u.id) throw new ApiError(400, "Code de parrainage invalide");
    if (sponsor.referrals >= 50) throw new ApiError(400, "Ce parrain a atteint la limite de filleuls");
    this.earn(u.id, REFERRAL_POINTS, "referral", "Bienvenue : parrainage", { referredBy: sponsor.id });
    this.earn(sponsor.id, REFERRAL_POINTS, "referral", `${shortName(u)} vous a rejoint`, { referrals: sponsor.referrals + 1 });
    this.s.notify(sponsor.id, `+${REFERRAL_POINTS} points : ${shortName(u)} vous a rejoint`, "Merci de faire grandir ToBe !", "/club");
    return { points: REFERRAL_POINTS, state: this.state(u.id) };
  }

  redeem(userId: string, rewardId: string) {
    const u = this.s.requireUser(userId);
    const p = this.player(u.id);
    const r = this.rewards().find((x) => x.id === rewardId);
    if (!r) throw new ApiError(404, "Récompense indisponible");
    if (p.points < r.cost) throw new ApiError(400, `Il vous manque ${r.cost - p.points} points`);
    if (r.stock !== null && r.stock <= 0) throw new ApiError(400, "Plus de stock pour cette récompense");
    if (r.kind === "badge" && p.badges.includes("ambassadeur")) throw new ApiError(400, "Vous avez déjà ce badge");
    const patch: Partial<Player> = {};
    if (r.kind === "boost") patch.boostCredits = p.boostCredits + 1;
    if (r.kind === "badge") patch.badges = [...p.badges, "ambassadeur"];
    if (r.kind === "premium") {
      const base = u.premiumUntil && new Date(u.premiumUntil) > this.s.now() ? new Date(u.premiumUntil) : this.s.now();
      this.db.users.update(u.id, { premiumUntil: new Date(base.getTime() + 30 * DAY).toISOString() });
    }
    if (r.stock !== null && this.db.rewards.get(r.id)) this.db.rewards.update(r.id, { stock: r.stock - 1 });
    this.earn(u.id, -r.cost, "reward", r.title, patch);
    const redemption = this.db.redemptions.insert({
      id: newId("rdm"),
      userId: u.id,
      userName: u.name,
      userEmail: u.email,
      rewardId: r.id,
      title: r.title,
      kind: r.kind,
      cost: r.cost,
      code: randomCode(6),
      status: r.kind === "lot" ? "a-remettre" : "livre",
      createdAt: this.s.iso(),
    });
    if (r.kind === "lot") for (const a of this.db.users.filter((x) => this.s.team.can(x, "club.manage"))) this.s.notify(a.id, `Lot à remettre : ${r.title}`, `${u.name || u.email} · code ${redemption.code}`, "/admin");
    return { redemption, state: this.state(u.id) };
  }

  /** L'application signale qu'elle est ouverte en mode installé (écran d'accueil). */
  markInstalled(userId: string) {
    const u = this.s.requireUser(userId);
    const p = this.player(u.id);
    if (!p.installedAt) this.db.players.update(u.id, { installedAt: this.s.iso() });
    return { ok: true };
  }

  /** Utiliser un crédit de boost gagné au ToBe Club. */
  useBoostCredit(userId: string, eventId: string) {
    const u = this.s.requireUser(userId);
    const p = this.player(u.id);
    if (p.boostCredits <= 0) throw new ApiError(400, "Aucun boost offert disponible. Gagnez-en au ToBe Club !");
    const e = this.s.db.events.get(eventId) ?? this.s.db.events.find((x) => x.slug === eventId);
    if (!e) throw new ApiError(404, "Événement introuvable");
    if (!this.s.team.access(e, u).edit) throw new ApiError(403, "Réservé à l'organisateur");
    const now = this.s.now();
    const base = e.boostedUntil && new Date(e.boostedUntil) > now ? new Date(e.boostedUntil) : now;
    const boostedUntil = new Date(base.getTime() + 72 * 3600_000).toISOString();
    this.db.events.update(e.id, { boostedUntil });
    this.db.players.update(u.id, { boostCredits: p.boostCredits - 1 });
    return { boostedUntil, boostCredits: p.boostCredits - 1 };
  }

  // ---------- Espace agence ----------
  private requireAdmin(userId: string) {
    return this.s.team.require(userId, "club.manage");
  }

  adminView(userId: string) {
    this.requireAdmin(userId);
    const players = this.db.players.all();
    return {
      rewards: [...BUILTIN_REWARDS.map((r) => ({ ...r, builtin: true })), ...this.db.rewards.all().map((r) => ({ ...r, builtin: false }))],
      redemptions: this.db.redemptions.all().sort((a, b) => (a.status === "a-remettre" ? -1 : 1) - (b.status === "a-remettre" ? -1 : 1) || b.createdAt.localeCompare(a.createdAt)),
      players: players.length,
      pointsInCirculation: players.reduce((s, p) => s + p.points, 0),
      leaderboard: this.leaderboard(10),
    };
  }

  addReward(userId: string, input: { title?: string; description?: string; cost?: number; stock?: number | null; kind?: RewardKind }) {
    this.requireAdmin(userId);
    const title = String(input.title ?? "").trim();
    const cost = Math.round(Number(input.cost));
    if (title.length < 3) throw new ApiError(400, "Donnez un nom au lot");
    if (!Number.isFinite(cost) || cost < 10) throw new ApiError(400, "Le coût doit être d'au moins 10 points");
    const stock = input.stock === null || input.stock === undefined || String(input.stock) === "" ? null : Math.max(0, Math.round(Number(input.stock)));
    return this.db.rewards.insert({ id: newId("rwd"), title: title.slice(0, 80), description: String(input.description ?? "").trim().slice(0, 200), cost, kind: "lot", stock, active: true, createdAt: this.s.iso() });
  }

  updateReward(userId: string, id: string, patch: { active?: boolean; stock?: number | null; cost?: number }) {
    this.requireAdmin(userId);
    const r = this.db.rewards.get(id);
    if (!r) throw new ApiError(404, "Lot introuvable (les récompenses intégrées ne se modifient pas)");
    return this.db.rewards.update(id, {
      active: patch.active ?? r.active,
      stock: patch.stock === undefined ? r.stock : patch.stock === null ? null : Math.max(0, Math.round(patch.stock)),
      cost: patch.cost ? Math.max(10, Math.round(patch.cost)) : r.cost,
    });
  }

  setRedemptionStatus(userId: string, id: string, status: "remis" | "a-remettre") {
    this.requireAdmin(userId);
    const r = this.db.redemptions.get(id);
    if (!r) throw new ApiError(404, "Échange introuvable");
    const next = this.db.redemptions.update(id, { status });
    if (status === "remis") this.s.notify(r.userId, `Lot remis : ${r.title}`, "Profitez-en bien !", "/club");
    return next;
  }
}
