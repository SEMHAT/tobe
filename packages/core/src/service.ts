import type { Db } from "./db.js";
import { Game } from "./game.js";
import { Team, TEAM_ROLES } from "./team.js";
import { Reminders, type PushPayload, type PushSender } from "./reminders.js";
import type { EledjiProfile, GoogleProfile } from "./google.js";
import {
  FACE_CONSISTENCY_MAX,
  FACE_MATCH_THRESHOLD,
  PRICING,
  faceDistance,
  facesDistance,
  facesMatch,
  isDescriptor,
  meanDescriptor,
  userFaces,
  computeImpact,
  fingerprint,
  newId,
  normalizeEmail,
  normalizePhone,
  randomCode,
  randomToken,
  slugify,
  ticketFee,
  votePackPrice,
  type BoostPlan,
  type Impact,
} from "./rules.js";
import type {
  PushSub,
  Access,
  Cagnotte,
  Candidate,
  Category,
  Contest,
  EventOptions,
  Notification,
  Order,
  PayMethod,
  Photo,
  Provider,
  Reach,
  Theme,
  TobeEvent,
  TobeRequest,
  User,
  Visibility,
  TicketGroup,
  PhotoGuest,
  PhotoTier,
} from "./types.js";

import { ApiError } from "./errors.js";
import { checkDynamicQr, parseQr } from "./qr.js";
import { matchEventFaces, type EventMatch, type FaceMeta, type MatchVia } from "./faceMatch.js";
import { CATEGORY_LABELS } from "./rules.js";

/** Visages et signatures de tenue reçus du téléphone de l'organisateur : on garde ce qui est bien formé. */
function cleanFaces(faces: unknown, meta: unknown) {
  const list = Array.isArray(faces) ? faces : [];
  const m = Array.isArray(meta) ? meta : [];
  const keep: number[][] = [];
  const keepMeta: FaceMeta[] = [];
  list.forEach((f, i) => {
    if (!isDescriptor(f)) return;
    keep.push(f);
    const x = m[i] as FaceMeta | undefined;
    const box = Array.isArray(x?.box) && x.box.length === 4 && x.box.every((n) => typeof n === "number" && n >= -0.1 && n <= 1.1) ? x.box : null;
    const outfit = Array.isArray(x?.outfit) && x.outfit.length <= 32 && x.outfit.every((n) => typeof n === "number" && n >= 0 && n <= 1) ? x.outfit : [];
    keepMeta.push({ box: box ?? [0, 0, 0, 0], outfit });
  });
  return { faces: keep, faceMeta: m.length ? keepMeta : null };
}

/** Version du texte de consentement au Pass ToBe (visage). */
export const FACE_CONSENT_VERSION = "2026-11";
const FACE_ACCOUNT_RETENTION_MS = 365 * 86400_000;
const FACE_PHOTO_RETENTION_MS = 182 * 86400_000;

/** Réseau Mobile Money d'après le préfixe togolais (Togocel/Yas : 70-73, 90-93 · Moov : 78-79, 96-99). */
export function guessNetwork(local: string): PayoutNetwork | null {
  const p = Number(local.slice(0, 2));
  if ([70, 71, 72, 73, 90, 91, 92, 93].includes(p)) return "togocel";
  if ([78, 79, 96, 97, 98, 99].includes(p)) return "moov";
  return null;
}
import type { EventReport, IntentAction, PaymentIntent, Payout, PayoutNetwork } from "./types.js";
export { ApiError };

export interface ServiceOptions {
  now?: () => Date;
  /** Renvoie le code de connexion dans la réponse (développement et démo uniquement). */
  exposeOtp?: boolean;
  /** Adresses e-mail qui ont accès à l'espace ToBe (demandes d'organisation, prestataires, revenus). */
  adminEmails?: string[];
  /** Mode démonstration : chaque compte est admin et reçoit un événement d'exemple. */
  demo?: boolean;
  /** Paiements en ligne actifs (agrégateur Mobile Money branché). Sinon : réservation et paiement à l'entrée. */
  paymentsEnabled?: boolean;
  /** Paiement réel par page hébergée (SasPay) : chaque achat crée un paiement à confirmer. */
  checkout?: boolean;
  /** Chaque nouvel événement (hors équipe ToBe) attend la validation de l'équipe avant d'être visible. */
  premoderation?: boolean;
  /** Identifiant client OAuth Google (connexion avec Google). */
  googleClientId?: string | null;
  /** Envoi du code de connexion par e-mail. */
  sendCode?: (email: string, code: string) => Promise<void> | void;
  /** Notifications push (Web Push) : clé publique VAPID et fonction d'envoi. */
  push?: { publicKey: string; send: PushSender } | null;
}

// ---------- Vues renvoyées à l'interface ----------
export interface EventCard {
  id: string;
  slug: string;
  title: string;
  category: Category;
  startsAt: string;
  /** Fin annoncée (null : l'événement dure une soirée). Sert à afficher « En cours ». */
  endsAt: string | null;
  venue: string;
  city: string;
  lat: number | null;
  lng: number | null;
  cover: string | null;
  theme: Theme;
  access: Access;
  entryInfo: string | null;
  moderation: "review" | "suspended" | null;
  cancelled: boolean;
  verified: boolean;
  visibility: Visibility;
  priceFrom: number;
  impact: Impact;
  boosted: boolean;
  organizerName: string;
  attendees: number;
  hasVotes: boolean;
  hasCagnotte: boolean;
}

export interface EventView extends Omit<TobeEvent, "accessCode" | "invitees"> {
  impact: Impact;
  isOrganizer: boolean;
  attendees: number;
  accessCode?: string | null;
  invitees?: string[];
  photoCount: number;
  myTickets: number;
  organizerPro: boolean;
  organizerVerified: boolean;
  eventVerified: boolean;
  proofs: { fileId: string; label: string }[];
  proofSubmittedAt: string | null;
  /** Raison pour laquelle on ne peut pas acheter en ligne (null : ventes ouvertes). */
  salesBlocked: string | null;
  cancelReason?: string | null;
  moderation: "review" | "suspended" | null;
  moderationReason: string | null;
  /** Rôle de l'utilisateur sur cet événement (organisateur, équipe ToBe, co-organisateur, contrôleur, photographe). */
  myRole: "owner" | "staff" | "co_organisateur" | "controleur" | "photographe" | null;
  canScan: boolean;
  canPhotos: boolean;
  /** L'utilisateur a demandé un rappel. */
  following: boolean;
  followers: number;
}

export interface CandidateView extends Candidate {
  votes: number | null;
  rank: number | null;
  score: number | null;
}

export interface ContestView extends Omit<Contest, "candidates"> {
  candidates: CandidateView[];
  totalVotes: number | null;
  isOpen: boolean;
  freeVoteAvailable: boolean;
  eventTitle: string;
  isOrganizer: boolean;
}

/** Ce que l'organisateur peut corriger après publication. */
export interface EditEventInput {
  title?: string;
  category?: Category;
  description?: string;
  startsAt?: string;
  endsAt?: string | null;
  venue?: string;
  city?: string;
  lat?: number | null;
  lng?: number | null;
  cover?: string | null;
  theme?: Theme | null;
  visibility?: Visibility;
  accessCode?: string | null;
  invitees?: string[];
  access?: Access;
  ticketTypes?: { id?: string; name: string; price: number; quota?: number }[];
  expectedAttendance?: number;
  reach?: Reach | null;
  program?: { time: string; label: string }[];
  liveUrl?: string | null;
  entryInfo?: string | null;
  entryUrl?: string | null;
  organizerName?: string | null;
  options?: Partial<EventOptions>;
}

export interface CreateEventInput {
  title: string;
  category: Category;
  startsAt: string;
  endsAt?: string | null;
  venue: string;
  city?: string;
  lat?: number | null;
  lng?: number | null;
  description: string;
  program?: { time: string; label: string }[];
  cover?: string | null;
  theme?: Theme;
  visibility: Visibility;
  access: Access;
  accessCode?: string | null;
  invitees?: string[];
  ticketTypes?: { name: string; price: number; quota?: number }[];
  expectedAttendance: number;
  reach: Reach;
  options: EventOptions;
  liveUrl?: string | null;
  entryInfo?: string | null;
  entryUrl?: string | null;
  /** Équipe ToBe seulement : nom de l'organisateur réel affiché (« Organisé par »). */
  organizerName?: string | null;
  contest?: {
    title?: string;
    mode: Contest["mode"];
    votePrice: number;
    closesAt: string;
    results: Contest["results"];
    juryWeight?: number;
    candidates: { name: string; bio?: string; photo?: string | null }[];
  } | null;
  cagnotte?: { title: string; description?: string; goal: number } | null;
  tobe?: { level: TobeRequest["level"]; services: string[]; budget?: string; note?: string; phone?: string } | null;
  boost?: { plan: BoostPlan; method: PayMethod } | null;
}

const DAY = 86_400_000;

function cleanText(v: unknown, max: number): string | null {
  const t = String(v ?? "").trim().slice(0, max);
  return t || null;
}

/** Lien externe accepté seulement en http(s). */
function cleanUrl(v: unknown): string | null {
  let t = String(v ?? "").trim();
  if (!t) return null;
  if (!/^https?:\/\//i.test(t)) t = `https://${t}`;
  try {
    const u = new URL(t);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href.slice(0, 500) : null;
  } catch {
    throw new ApiError(400, "Le lien d'entrée n'est pas valide");
  }
}

export interface ClientError {
  message: string;
  path: string;
  stack: string;
  ua: string;
  userId: string | null;
  count: number;
  firstAt: string;
  lastAt: string;
}

export class ToBeService {
  private opts: Required<Omit<ServiceOptions, "sendCode" | "googleClientId" | "push">> & Pick<ServiceOptions, "sendCode" | "googleClientId" | "push">;
  /** ToBe Club : jeu, points et récompenses. */
  readonly game: Game;
  /** Rôles : équipe d'un événement et équipe ToBe. */
  readonly team: Team;
  /** Rappels d'événements et notifications push. */
  readonly reminders: Reminders;
  /** Abonnements push qui n'existent plus (à supprimer après la requête). */
  goneSubs: string[] = [];
  /** Tâches asynchrones à attendre avant de répondre (envoi d'e-mails). */
  pending: Promise<unknown>[] = [];

  constructor(
    public db: Db,
    options: ServiceOptions = {},
  ) {
    this.opts = {
      now: options.now ?? (() => new Date()),
      exposeOtp: options.exposeOtp ?? false,
      adminEmails: (options.adminEmails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean),
      demo: options.demo ?? false,
      paymentsEnabled: !!(options.paymentsEnabled || options.checkout),
      checkout: options.checkout ?? false,
      premoderation: options.premoderation ?? false,
      sendCode: options.sendCode,
      googleClientId: options.googleClientId ?? null,
      push: options.push ?? null,
    };
    this.game = new Game(this);
    this.team = new Team(this);
    this.reminders = new Reminders(this);
  }

  /** Envoie une notification push (sans bloquer : elle part juste après la réponse). */
  sendPush(sub: PushSub, payload: PushPayload) {
    const push = this.opts.push;
    if (!push) return;
    this.pending.push(
      push
        .send(sub, payload)
        .then((r) => {
          if (r === "gone") this.goneSubs.push(sub.id);
        })
        .catch((e) => console.error("[push] échec", e)),
    );
  }

  findEventPublic(idOrSlug: string): TobeEvent {
    return this.findEvent(idOrSlug);
  }

  /** E-mails des super administrateurs fixés par la configuration du serveur. */
  get adminEmails(): string[] {
    return this.opts.adminEmails;
  }

  now(): Date {
    return this.opts.now();
  }
  get isDemo() {
    return this.opts.demo;
  }
  iso(): string {
    return this.now().toISOString();
  }

  // =====================================================================
  // Authentification par code envoyé par e-mail
  // =====================================================================
  config() {
    return { paymentsEnabled: this.opts.paymentsEnabled, paymentsMode: this.opts.checkout ? ("online" as const) : this.opts.paymentsEnabled ? ("simulated" as const) : null, auth: "email" as const, demo: this.opts.demo, googleClientId: this.opts.googleClientId || null, vapidPublicKey: this.opts.push?.publicKey ?? null };
  }

  requestOtp(rawEmail: string): { sent: true; email: string; devCode?: string } {
    const email = normalizeEmail(rawEmail);
    const existing = this.db.otps.get(email);
    if (existing && new Date(existing.expiresAt).getTime() - this.now().getTime() > 9 * 60_000) {
      throw new ApiError(429, "Un code vient d'être envoyé. Patientez une minute avant d'en demander un autre.");
    }
    const code = this.opts.demo ? "123456" : String(100000 + Math.floor(Math.random() * 900000));
    this.db.otps.insert({ id: email, code, attempts: 0, expiresAt: new Date(this.now().getTime() + 10 * 60_000).toISOString() });
    const task = this.opts.sendCode?.(email, code);
    if (task) this.pending.push(Promise.resolve(task).catch((e) => console.error("[email] échec", e)));
    return { sent: true, email, ...(this.opts.exposeOtp ? { devCode: code } : {}) };
  }

  verifyOtp(rawEmail: string, code: string, name?: string): { token: string; user: User; isNew: boolean } {
    const email = normalizeEmail(rawEmail);
    const otp = this.db.otps.get(email);
    if (!otp) throw new ApiError(400, "Demandez d'abord un code");
    if (new Date(otp.expiresAt) < this.now()) throw new ApiError(400, "Ce code a expiré, demandez-en un nouveau");
    if (otp.attempts >= 5) throw new ApiError(429, "Trop d'essais, demandez un nouveau code");
    if (otp.code !== code.trim()) {
      this.db.otps.update(email, { attempts: otp.attempts + 1 });
      throw new ApiError(400, "Code incorrect");
    }
    this.db.otps.remove(email);
    return this.signIn(email, { name });
  }

  /** Connexion avec Google : le profil a déjà été vérifié auprès de Google (voir google.ts). */
  loginWithGoogle(profile: GoogleProfile | undefined) {
    if (!profile) throw new ApiError(400, "Connexion Google invalide");
    if (!this.opts.googleClientId) throw new ApiError(400, "Connexion Google non disponible");
    return this.signIn(normalizeEmail(profile.email), { name: profile.name, avatar: profile.picture, googleId: profile.sub });
  }

  loginWithEledji(profile: EledjiProfile | undefined) {
    if (!profile?.email) throw new ApiError(401, "Aucune session ELEDJI");
    return this.signIn(normalizeEmail(profile.email), { name: profile.name ?? undefined, avatar: profile.image ?? null });
  }

  private signIn(email: string, extra: { name?: string; avatar?: string | null; googleId?: string }): { token: string; user: User; isNew: boolean } {
    let user = this.db.users.find((u) => u.email === email);
    const isNew = !user;
    const isAdmin = this.opts.demo || this.opts.adminEmails.includes(email);
    if (!user) {
      user = this.db.users.insert({
        id: newId("usr"),
        email,
        phone: null,
        name: extra.name?.trim().slice(0, 60) || "",
        createdAt: this.iso(),
        role: isAdmin ? "admin" : "user",
        passEnabled: false,
        faceDescriptor: null,
        faceDescriptors: null,
        neverShow: false,
        premiumUntil: null,
        pro: false,
        avatar: extra.avatar ?? null,
        googleId: extra.googleId ?? null,
      });
      if (this.opts.demo) this.giveDemoEvents(user);
    } else {
      const patch: Partial<User> = {};
      if (isAdmin && user.role !== "admin") patch.role = "admin";
      if (extra.googleId && !user.googleId) patch.googleId = extra.googleId;
      if (extra.avatar && !user.avatar) patch.avatar = extra.avatar;
      if (!user.name && extra.name?.trim()) patch.name = extra.name.trim().slice(0, 60);
      if (Object.keys(patch).length) user = this.db.users.update(user.id, patch);
    }
    const token = randomToken();
    this.db.sessions.insert({ id: token, userId: user.id, createdAt: this.iso() });
    return { token, user: this.publicUser(user) as unknown as User, isNew };
  }

  private giveDemoEvents(user: User) {
    for (const e of this.db.events.filter((e) => !!e.demoOwned)) {
      this.db.events.update(e.id, { organizerId: user.id, demoOwned: false });
    }
  }

  userFromToken(token: string | null | undefined): User | null {
    if (!token) return null;
    const s = this.db.sessions.get(token);
    if (!s) return null;
    return this.db.users.get(s.userId) ?? null;
  }

  logout(token: string) {
    if (this.db.sessions.get(token)) this.db.sessions.remove(token);
  }

  requireUser(userId: string | null | undefined): User {
    const u = userId ? this.db.users.get(userId) : undefined;
    if (!u) throw new ApiError(401, "Connectez-vous pour continuer");
    return u;
  }

  me(userId: string) {
    const u = this.requireUser(userId);
    const orders = this.db.orders.filter((o) => o.userId === u.id && (o.status === "paid" || o.status === "reserved"));
    const votes = this.db.votes.filter((v) => v.userId === u.id).reduce((s, v) => s + v.count, 0);
    const events = new Set(orders.map((o) => o.eventId));
    const photos = userFaces(u).length && u.passEnabled ? this.myPhotos(u.id).reduce((s, g) => s + g.photos.length, 0) : 0;
    const unread = this.db.notifications.filter((n) => n.userId === u.id && !n.read).length;
    return {
      user: this.publicUser(u),
      stats: { events: events.size, tickets: orders.reduce((s, o) => s + o.qty, 0), votes, photos, organized: this.db.events.filter((e) => e.organizerId === u.id).length },
      unread,
      team: (() => {
        const r = this.team.teamRole(u);
        return r ? { role: r, label: TEAM_ROLES[r].label, perms: TEAM_ROLES[r].perms } : null;
      })(),
      eventRoles: this.db.members.filter((m) => m.userId === u.id).length,
      premium: !!u.premiumUntil && new Date(u.premiumUntil) > this.now(),
    };
  }

  publicUser(u: User) {
    const { faceDescriptor, faceDescriptors, googleId, ...rest } = u;
    return { ...rest, hasFace: !!faceDescriptor || !!faceDescriptors?.length, google: !!googleId };
  }

  updateMe(userId: string, patch: { name?: string; phone?: string | null }) {
    const u = this.requireUser(userId);
    const name = (patch.name ?? u.name).trim().slice(0, 60);
    let phone = u.phone;
    if (patch.phone !== undefined) {
      try {
        phone = patch.phone ? normalizePhone(patch.phone) : null;
      } catch {
        throw new ApiError(400, "Numéro de téléphone invalide");
      }
    }
    return this.publicUser(this.db.users.update(u.id, { name, phone }));
  }

  deleteAccount(userId: string) {
    const u = this.requireUser(userId);
    for (const s of this.db.sessions.filter((s) => s.userId === u.id)) this.db.sessions.remove(s.id);
    this.db.users.update(u.id, { name: "Compte supprimé", faceDescriptor: null, faceDescriptors: null, avatar: null, googleId: null, passEnabled: false, phone: null, email: `supprime-${u.id}@tobe.invalid` });
    return { ok: true };
  }

  // =====================================================================
  // Événements
  // =====================================================================
  private attendees(e: TobeEvent): number {
    return this.db.orders.filter((o) => o.eventId === e.id && (o.status === "paid" || o.status === "reserved")).reduce((s, o) => s + o.qty, 0);
  }

  private isBoosted(e: TobeEvent): boolean {
    return !!e.boostedUntil && new Date(e.boostedUntil) > this.now();
  }

  toCard(e: TobeEvent): EventCard {
    const prices = e.ticketTypes.map((t) => t.price);
    return {
      id: e.id,
      slug: e.slug,
      title: e.title,
      category: e.category,
      startsAt: e.startsAt,
      endsAt: e.endsAt ?? null,
      venue: e.venue,
      city: e.city,
      lat: e.lat,
      lng: e.lng,
      cover: e.cover,
      theme: e.theme,
      access: e.access,
      entryInfo: e.access === "none" ? (e.entryInfo ?? null) : null,
      moderation: e.moderation ?? null,
      cancelled: !!e.cancelledAt,
      verified: this.isEventVerified(e),
      visibility: e.visibility,
      priceFrom: e.access === "paid" && prices.length ? Math.min(...prices) : 0,
      impact: computeImpact(e),
      boosted: this.isBoosted(e),
      organizerName: e.organizerName,
      attendees: this.attendees(e),
      hasVotes: !!e.contestId,
      hasCagnotte: !!e.cagnotteId,
    };
  }

  private isUpcoming(e: TobeEvent): boolean {
    const end = e.endsAt ? new Date(e.endsAt) : new Date(new Date(e.startsAt).getTime() + 8 * 3600_000);
    return end >= this.now();
  }

  listEvents(filters: { q?: string; category?: string; when?: string; price?: string; sort?: string; past?: boolean } = {}): EventCard[] {
    const now = this.now();
    let list = this.db.events.filter((e) => e.visibility === "public" && !e.moderation && !e.cancelledAt && (filters.past ? !this.isUpcoming(e) : this.isUpcoming(e)));
    if (filters.category && filters.category !== "all") list = list.filter((e) => e.category === filters.category);
    if (filters.q) {
      const q = slugify(filters.q).replace(/-/g, " ");
      list = list.filter((e) => slugify(`${e.title} ${e.venue} ${e.city} ${e.organizerName} ${e.category}`).replace(/-/g, " ").includes(q));
    }
    if (filters.price === "free") list = list.filter((e) => e.access !== "paid");
    if (filters.price === "paid") list = list.filter((e) => e.access === "paid");
    if (filters.when && filters.when !== "all") {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      let from = start.getTime();
      let to = from + DAY;
      if (filters.when === "weekend") {
        // Du vendredi au dimanche soir (le week-end en cours s'il a commencé).
        const dow = start.getDay(); // 0 = dimanche
        const friday = dow === 6 ? start.getTime() - DAY : dow === 0 ? start.getTime() - 2 * DAY : start.getTime() + ((5 - dow + 7) % 7) * DAY;
        from = Math.max(friday, start.getTime());
        to = friday + 3 * DAY;
      } else if (filters.when === "week") {
        to = from + 7 * DAY;
      } else if (filters.when === "month") {
        to = from + 31 * DAY;
      }
      // Un événement sur plusieurs jours (foire, semaine…) compte tant qu'il est en cours sur la période.
      list = list.filter((e) => {
        const t = new Date(e.startsAt).getTime();
        const end = e.endsAt ? new Date(e.endsAt).getTime() : t + 8 * 3600_000;
        return t < to && end >= from;
      });
    }
    const cards = list.map((e) => this.toCard(e));
    if (filters.sort === "impact") cards.sort((a, b) => Number(b.boosted) - Number(a.boosted) || b.impact.score - a.impact.score);
    else if (filters.past) cards.sort((a, b) => b.startsAt.localeCompare(a.startsAt));
    else cards.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return cards;
  }

  home() {
    const all = this.listEvents({ sort: "impact" });
    const featured = all.filter((e) => e.boosted || e.impact.tier === "phare").slice(0, 6);
    const weekend = this.listEvents({ when: "weekend" });
    const soon = this.listEvents({ when: "week" });
    const contests = this.db.contests
      .filter((c) => new Date(c.closesAt) > this.now())
      .map((c) => {
        const e = this.db.events.get(c.eventId);
        if (!this.isLive(e) || e.visibility !== "public") return null;
        return this.contestView(c.id, null);
      })
      .filter((c): c is ContestView => !!c)
      .slice(0, 4);
    const counts: Record<string, number> = {};
    for (const e of all) counts[e.category] = (counts[e.category] ?? 0) + 1;
    return { featured, weekend: weekend.length ? weekend : soon, top: all.slice(0, 10), contests, counts, total: all.length };
  }

  private findEvent(idOrSlug: string): TobeEvent {
    const e = this.db.events.get(idOrSlug) ?? this.db.events.find((x) => x.slug === idOrSlug);
    if (!e) throw new ApiError(404, "Événement introuvable");
    return e;
  }

  /**
   * Vote, cagnotte, galerie, reventes… suivent leur événement : supprimé, retiré par ToBe ou en vérification,
   * ils sont fermés au public partout (seuls l'équipe de l'événement et ToBe y gardent accès).
   * `agir` ferme aussi les nouvelles actions (voter, contribuer) quand l'événement est annulé.
   */
  private gateEvent(eventId: string | null | undefined, user: User | null, agir = false): TobeEvent | null {
    if (!eventId) return null;
    const e = this.db.events.get(eventId);
    if (!e) throw new ApiError(410, "Cet événement a été supprimé.");
    const equipe = !!user && (!!this.team.access(e, user).role || this.team.can(user, "providers.moderate"));
    if (e.moderation && !equipe)
      throw new ApiError(e.moderation === "suspended" ? 410 : 403, e.moderation === "suspended" ? "Cet événement a été retiré par ToBe." : "Cet événement est en cours de vérification par l'équipe ToBe.");
    if (agir && e.cancelledAt) throw new ApiError(400, "Cet événement a été annulé.");
    return e;
  }

  /** Visible du public : existe, ni retiré, ni en vérification, ni annulé. */
  private isLive(e: TobeEvent | undefined | null): e is TobeEvent {
    return !!e && !e.moderation && !e.cancelledAt;
  }

  /** Droit de modifier l'événement (organisateur, co-organisateur, équipe ToBe habilitée). */
  private canManage(e: TobeEvent, user: User | null): boolean {
    return this.team.access(e, user).edit;
  }

  private canView(e: TobeEvent, user: User | null, code?: string | null): boolean {
    if (e.visibility !== "private") return true;
    if (user && user.id === e.organizerId) return true; // l'équipe ToBe (admin) n'a pas d'accès automatique aux événements privés
    // L'équipe de l'événement (invitée par l'organisateur) et le chef de projet ToBe en charge y ont accès.
    if (user && this.db.members.some((m) => m.eventId === e.id && m.userId === user.id)) return true;
    if (user && e.tobeRequestId && this.db.tobeRequests.get(e.tobeRequestId)?.assignedTo === user.id) return true;
    if (code && e.accessCode && code.trim().toUpperCase() === e.accessCode.toUpperCase()) return true;
    if (!user) return false;
    if (e.invitees.includes(user.email)) return true;
    return this.db.orders.some((o) => o.eventId === e.id && o.userId === user.id && (o.status === "paid" || o.status === "reserved"));
  }

  getEvent(idOrSlug: string, userId: string | null, code?: string | null): EventView {
    const e = this.findEvent(idOrSlug);
    const user = userId ? (this.db.users.get(userId) ?? null) : null;
    // Événement en vérification ou suspendu : visible seulement par son équipe et par ToBe.
    if (e.moderation && !(user && (this.team.access(e, user).role || this.team.can(user, "providers.moderate"))))
      throw new ApiError(e.moderation === "suspended" ? 410 : 403, e.moderation === "suspended" ? "Cet événement a été retiré par ToBe." : "Cet événement est en cours de vérification par l'équipe ToBe. Revenez un peu plus tard.");
    if (!this.canView(e, user, code)) {
      throw new ApiError(403, "Cet événement est privé. Entrez le code d'accès reçu avec votre invitation.", {
        needCode: true,
        title: e.title,
        theme: e.theme,
      });
    }
    const acc = this.team.access(e, user);
    const manage = acc.edit;
    // Un invité connecté qui saisit le bon code est ajouté à la liste : il n'aura plus à le retaper.
    if (user && e.visibility === "private" && code && !e.invitees.includes(user.email) && user.id !== e.organizerId && e.accessCode && code.trim().toUpperCase() === e.accessCode.toUpperCase()) {
      this.db.events.update(e.id, { invitees: [...e.invitees, user.email] });
    }
    const fresh = this.db.events.get(e.id)!;
    const ev = acc.role ? fresh : this.db.events.update(e.id, { views: fresh.views + 1 });
    const { accessCode, invitees, ...rest } = ev;
    return {
      ...rest,
      ...(manage ? { accessCode, invitees } : {}),
      impact: computeImpact(ev),
      isOrganizer: manage,
      myRole: acc.role,
      canScan: acc.scan,
      canPhotos: acc.photos,
      followers: new Set(this.db.reminders.filter((r) => r.eventId === ev.id).map((r) => r.userId ?? r.subId ?? r.id)).size,
      following: user ? this.db.reminders.some((r) => r.eventId === ev.id && r.userId === user.id) : false,
      attendees: this.attendees(ev),
      photoCount: this.db.photos.filter((p) => p.eventId === ev.id).length,
      organizerPro: !!this.db.users.get(ev.organizerId)?.pro,
      organizerVerified: this.isVerifiedOrganizer(ev.organizerId),
      eventVerified: this.isEventVerified(ev),
      proofs: manage ? (ev.proofs ?? []) : [],
      proofSubmittedAt: manage ? (ev.proofSubmittedAt ?? null) : null,
      salesBlocked: this.salesBlocked(ev),
      cancelReason: ev.cancelledAt ? (ev.cancelReason ?? "Annulé par l'organisateur") : null,
      moderation: ev.moderation ?? null,
      moderationReason: manage ? (ev.moderationReason ?? null) : null,
      myTickets: user ? this.db.orders.filter((o) => o.eventId === ev.id && o.userId === user.id && (o.status === "paid" || o.status === "reserved")).reduce((s, o) => s + o.qty, 0) : 0,
    };
  }

  createEvent(userId: string, input: CreateEventInput): EventView {
    const user = this.requireUser(userId);
    const title = input.title?.trim();
    if (!title || title.length < 3) throw new ApiError(400, "Donnez un titre à votre événement");
    if (!input.venue?.trim()) throw new ApiError(400, "Indiquez le lieu");
    const starts = new Date(input.startsAt);
    if (Number.isNaN(starts.getTime())) throw new ApiError(400, "Date invalide");
    if (input.access === "paid" && !(input.ticketTypes ?? []).some((t) => t.price > 0)) throw new ApiError(400, "Ajoutez au moins un billet payant");

    const id = newId("evt");
    let slug = slugify(title) || "evenement";
    if (this.db.events.find((x) => x.slug === slug)) slug = `${slug}-${randomCode(4).toLowerCase()}`;
    if (!["free", "paid", "invite", "none"].includes(input.access)) throw new ApiError(400, "Type d'accès inconnu");
    const ticketTypes =
      input.access === "none"
        ? []
        : input.access === "paid"
        ? (input.ticketTypes ?? []).filter((t) => t.name.trim()).map((t) => ({ id: newId("tkt"), name: t.name.trim(), price: Math.max(0, Math.round(t.price)), quota: Math.max(0, t.quota ?? 0), sold: 0 }))
        : [{ id: newId("tkt"), name: input.access === "invite" ? "Invitation" : "Entrée libre", price: 0, quota: Math.max(0, input.ticketTypes?.[0]?.quota ?? 0), sold: 0 }];

    const event: TobeEvent = {
      id,
      slug,
      organizerId: user.id,
      organizerName: (input.organizerName?.trim() && this.team.can(user, "events.all") ? input.organizerName.trim().slice(0, 80) : "") || user.name || "Organisateur",
      title,
      category: input.category,
      startsAt: starts.toISOString(),
      endsAt: input.endsAt ? new Date(input.endsAt).toISOString() : null,
      venue: input.venue.trim(),
      city: input.city?.trim() || "Lomé",
      lat: input.lat ?? null,
      lng: input.lng ?? null,
      description: input.description?.trim() ?? "",
      program: (input.program ?? []).filter((p) => p.label.trim()),
      cover: input.cover ?? null,
      theme: input.theme ?? "or",
      visibility: input.visibility,
      access: input.access,
      entryInfo: input.access === "none" ? cleanText(input.entryInfo, 300) : null,
      entryUrl: input.access === "none" ? cleanUrl(input.entryUrl) : null,
      accessCode: input.visibility === "private" ? (input.accessCode?.trim().toUpperCase() || randomCode(6)) : null,
      invitees: (input.invitees ?? []).map((p) => {
        try {
          return normalizeEmail(p);
        } catch {
          return "";
        }
      }).filter(Boolean),
      ticketTypes,
      expectedAttendance: Math.max(1, Math.round(input.expectedAttendance || 50)),
      reach: input.reach,
      options: { ...input.options, cagnotte: input.options.cagnotte && this.opts.paymentsEnabled },
      liveUrl: input.liveUrl ?? null,
      boostedUntil: null,
      views: 0,
      contestId: null,
      cagnotteId: null,
      tobeRequestId: null,
      createdAt: this.iso(),
    };
    // Garde-fou : même titre (ou presque) et dates proches qu'un événement d'un autre organisateur.
    const twin = this.lookalike(event);
    const staff = this.team.can(user, "events.all");
    if (twin && !staff) {
      event.moderation = "review";
      event.moderationReason = `Ressemble à « ${twin.title} » (${twin.organizerName}) prévu le ${twin.startsAt.slice(0, 10)}`;
    }
    // Publié par l'équipe ToBe : vérifié d'office.
    if (staff) event.approvedAt = this.iso();
    this.db.events.insert(event);
    if (event.moderation) {
      this.notifyModerators("Événement à vérifier", `« ${event.title} » de ${user.name || user.email} ressemble à un événement existant.`, "/tobe");
      this.notify(user.id, "Votre événement est en vérification", "Il ressemble à un événement déjà publié par un autre organisateur. L'équipe ToBe le vérifie, en général en quelques heures.", `/organisateur/${event.id}`);
    } else if (!staff && this.opts.premoderation) {
      this.notifyModerators("Nouvel événement à vérifier", `« ${event.title} » de ${user.name || user.email}`, "/tobe");
      if (event.access === "paid")
        this.notify(user.id, "Ajoutez vos preuves pour ouvrir la billetterie", "Votre événement est visible. Pour ouvrir les ventes, ToBe vérifie qu'il est bien le vôtre : ajoutez une preuve (contrat de salle, autorisation…) depuis votre espace organisateur.", `/organisateur/${event.id}`);
    }

    if (input.options.votes && input.contest) {
      const c = input.contest;
      if (c.mode !== "free" && !this.opts.paymentsEnabled) c.mode = "free";
      const contest: Contest = {
        id: newId("cnt"),
        eventId: id,
        title: c.title?.trim() || title,
        mode: c.mode,
        votePrice: c.mode === "free" ? 0 : Math.max(25, Math.round(c.votePrice || 100)),
        opensAt: this.iso(),
        closesAt: new Date(c.closesAt || event.startsAt).toISOString(),
        results: c.results,
        juryWeight: Math.min(100, Math.max(0, c.juryWeight ?? 0)),
        candidates: c.candidates.filter((x) => x.name.trim()).map((x, i) => ({ id: newId("cdt"), number: i + 1, name: x.name.trim(), bio: x.bio?.trim() ?? "", photo: x.photo ?? null, freeVotes: 0, paidVotes: 0, juryScore: null })),
      };
      this.db.contests.insert(contest);
      this.db.events.update(id, { contestId: contest.id });
    }
    if (input.options.cagnotte && input.cagnotte && this.opts.paymentsEnabled) {
      const cg: Cagnotte = { id: newId("cag"), eventId: id, title: input.cagnotte.title?.trim() || title, description: input.cagnotte.description?.trim() ?? "", goal: Math.max(0, Math.round(input.cagnotte.goal || 0)), collected: 0, contributors: 0, createdAt: this.iso() };
      this.db.cagnottes.insert(cg);
      this.db.events.update(id, { cagnotteId: cg.id });
    }
    if (input.tobe) this.requestTobe(user.id, { ...input.tobe, eventId: id });
    if (input.boost && this.opts.paymentsEnabled && !this.opts.checkout) this.buyBoost(user.id, id, input.boost.plan, input.boost.method);
    return this.getEvent(id, user.id);
  }

  /**
   * Modification d'un événement par son organisateur (ou un co-organisateur).
   * Le lien de l'événement ne change pas. Les billets déjà vendus sont protégés,
   * et les participants sont prévenus si la date, l'heure ou le lieu changent.
   */
  updateEvent(userId: string, idOrSlug: string, patch: EditEventInput): EventView {
    const user = this.requireUser(userId);
    const e = this.findEvent(idOrSlug);
    if (!this.canManage(e, user)) throw new ApiError(403, "Seul l'organisateur peut modifier cet événement");
    const next: Partial<TobeEvent> = {};

    if (patch.title !== undefined) {
      const title = String(patch.title).trim();
      if (title.length < 3) throw new ApiError(400, "Donnez un titre à votre événement");
      next.title = title.slice(0, 80);
    }
    if (patch.venue !== undefined) {
      if (!String(patch.venue).trim()) throw new ApiError(400, "Indiquez le lieu");
      next.venue = String(patch.venue).trim();
    }
    if (patch.city !== undefined) next.city = String(patch.city).trim() || "Lomé";
    if (patch.description !== undefined) next.description = String(patch.description).trim();
    if (patch.category !== undefined) next.category = patch.category;
    for (const k of ["cover", "theme", "lat", "lng", "liveUrl", "reach"] as const) if (k in patch) (next as Record<string, unknown>)[k] = patch[k] ?? null;
    if (patch.theme === null) next.theme = e.theme;
    if (patch.reach === null) next.reach = e.reach;
    if (patch.program !== undefined) next.program = (patch.program ?? []).filter((x) => x.label?.trim()).map((x) => ({ time: String(x.time ?? "").slice(0, 10), label: x.label.trim().slice(0, 120) }));
    if (patch.expectedAttendance !== undefined) next.expectedAttendance = Math.max(1, Math.round(Number(patch.expectedAttendance) || e.expectedAttendance));
    if (patch.options !== undefined) next.options = { ...e.options, ...patch.options, cagnotte: !!e.cagnotteId || (!!patch.options.cagnotte && this.opts.paymentsEnabled) };

    // Date et heure
    const startsAt = patch.startsAt !== undefined ? new Date(patch.startsAt) : new Date(e.startsAt);
    if (Number.isNaN(startsAt.getTime())) throw new ApiError(400, "Date invalide");
    if (patch.startsAt !== undefined && startsAt.toISOString() !== e.startsAt) {
      if (startsAt.getTime() < this.now().getTime() - 3600_000) throw new ApiError(400, "La nouvelle date est déjà passée");
      next.startsAt = startsAt.toISOString();
    }
    if (patch.endsAt !== undefined) {
      const end = patch.endsAt ? new Date(patch.endsAt) : null;
      if (end && Number.isNaN(end.getTime())) throw new ApiError(400, "Heure de fin invalide");
      if (end && end.getTime() <= startsAt.getTime()) throw new ApiError(400, "La fin doit être après le début");
      next.endsAt = end ? end.toISOString() : null;
    }

    // Visibilité, code d'accès, invités
    if (patch.visibility !== undefined) next.visibility = patch.visibility;
    const visibility = next.visibility ?? e.visibility;
    if (visibility === "private") {
      if (patch.accessCode !== undefined && String(patch.accessCode ?? "").trim()) next.accessCode = String(patch.accessCode).trim().toUpperCase().replace(/\s/g, "").slice(0, 20);
      else if (!e.accessCode) next.accessCode = randomCode(6);
    } else if (patch.visibility !== undefined) next.accessCode = null;
    if (patch.invitees !== undefined)
      next.invitees = (patch.invitees ?? [])
        .map((p) => {
          try {
            return normalizeEmail(p);
          } catch {
            return "";
          }
        })
        .filter(Boolean);

    // Accès et billets : ce qui est déjà réservé reste valable.
    const soldPaid = e.ticketTypes.some((t) => t.sold > 0 && t.price > 0);
    const access = patch.access ?? e.access;
    if (access !== e.access && soldPaid) throw new ApiError(400, "Des billets payants sont déjà réservés : vous ne pouvez plus changer le type d'accès");
    if (!["free", "paid", "invite", "none"].includes(access)) throw new ApiError(400, "Type d'accès inconnu");
    const booked = e.ticketTypes.reduce((n, t) => n + t.sold, 0);
    if (access === "none" && e.access !== "none" && booked) throw new ApiError(400, `${booked} place(s) déjà réservée(s) sur ToBe : la billetterie ne peut plus être retirée`);
    if (patch.access !== undefined) next.access = access;
    if (patch.organizerName !== undefined && this.team.can(user, "events.all")) next.organizerName = patch.organizerName?.trim().slice(0, 80) || this.db.users.get(e.organizerId)?.name || "Organisateur";
    if (access === "none") {
      if (patch.entryInfo !== undefined) next.entryInfo = cleanText(patch.entryInfo, 300);
      if (patch.entryUrl !== undefined) next.entryUrl = cleanUrl(patch.entryUrl);
    } else {
      next.entryInfo = null;
      next.entryUrl = null;
    }
    if (patch.ticketTypes !== undefined || access !== e.access) {
      const wanted = (patch.ticketTypes ?? []).filter((t) => String(t.name ?? "").trim() || t.id);
      let types: TobeEvent["ticketTypes"];
      if (access === "none") {
        types = [];
      } else if (access === "paid") {
        types = wanted.map((t) => {
          const old = t.id ? e.ticketTypes.find((x) => x.id === t.id) : undefined;
          const name = String(t.name ?? "").trim() || old?.name || "Billet";
          const price = Math.max(0, Math.round(Number(t.price) || 0));
          const quota = Math.max(0, Math.round(Number(t.quota) || 0));
          if (old && quota && quota < old.sold) throw new ApiError(400, `« ${name} » : ${old.sold} places déjà réservées, le nombre de places ne peut pas être inférieur`);
          return { id: old?.id ?? newId("tkt"), name: name.slice(0, 40), price, quota, sold: old?.sold ?? 0 };
        });
        if (!types.some((t) => t.price > 0)) throw new ApiError(400, "Ajoutez au moins un billet payant");
      } else {
        const first = e.ticketTypes[0];
        const q = Math.max(0, Math.round(Number(wanted[0]?.quota ?? first?.quota ?? 0) || 0));
        const sold = e.ticketTypes.reduce((n, t) => n + t.sold, 0);
        if (q && q < sold) throw new ApiError(400, `${sold} places déjà réservées : le nombre de places ne peut pas être inférieur`);
        types = [{ id: first?.id ?? newId("tkt"), name: access === "invite" ? "Invitation" : "Entrée libre", price: 0, quota: q, sold: first?.sold ?? 0 }];
      }
      for (const old of e.ticketTypes)
        if (old.sold > 0 && !types.some((t) => t.id === old.id))
          throw new ApiError(400, `« ${old.name} » a déjà ${old.sold} réservation(s) : il ne peut pas être supprimé. Mettez son nombre de places à ${old.sold} pour arrêter la vente.`);
      next.ticketTypes = types;
    }

    // Garde-fou : un titre ou une date qui ferait ressembler l'événement à celui d'un autre organisateur.
    if ((next.title || next.startsAt) && !e.moderation && !this.team.can(user, "events.all")) {
      const twin = this.lookalike({ ...e, ...next } as TobeEvent);
      if (twin) {
        next.moderation = "review";
        next.moderationReason = `Ressemble à « ${twin.title} » (${twin.organizerName}) prévu le ${twin.startsAt.slice(0, 10)}`;
        this.notifyModerators("Événement à vérifier", `« ${next.title ?? e.title} » a été modifié et ressemble à un événement existant.`, "/tobe");
      }
    }
    const updated = this.db.events.update(e.id, { ...next, updatedAt: this.iso() });

    // Prévenir les participants et les personnes qui ont demandé un rappel.
    const changes: string[] = [];
    if (next.startsAt) changes.push(`nouvelle date : ${new Date(updated.startsAt).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })} à ${updated.startsAt.slice(11, 16).replace(":", "h")}`);
    if (next.venue && next.venue !== e.venue) changes.push(`nouveau lieu : ${updated.venue}`);
    if (next.city && next.city !== e.city) changes.push(`ville : ${updated.city}`);
    if (changes.length) {
      const people = new Set<string>();
      for (const o of this.db.orders.filter((o) => o.eventId === e.id && (o.status === "paid" || o.status === "reserved"))) people.add(o.userId);
      for (const r of this.db.reminders.filter((r) => r.eventId === e.id && !!r.userId)) people.add(r.userId!);
      people.delete(user.id);
      const title = `Changement : ${updated.title}`;
      const body = changes.map((c, i) => (i ? c : c[0].toUpperCase() + c.slice(1))).join(" · ") + ".";
      for (const uid of people) this.notify(uid, title, body, `/evenement/${updated.slug}`, { title, body, url: `/evenement/${updated.slug}`, tag: `changement-${e.id}` });
      for (const r of this.db.reminders.filter((r) => r.eventId === e.id && !r.userId && !!r.subId)) {
        const sub = this.db.pushSubs.get(r.subId!);
        if (sub) this.sendPush(sub, { title, body, url: `/evenement/${updated.slug}`, tag: `changement-${e.id}` });
      }
    }
    // Nouvelle date : les rappels repartent sur le nouveau calendrier.
    if (next.startsAt) this.reminders.reschedule(updated);
    return this.getEvent(e.id, user.id);
  }

  /**
   * Annuler un événement : billets invalidés, chaque acheteur en ligne est remboursé en entier (commission ToBe comprise)
   * sur son Mobile Money. La part de l'organisateur encore en attente est annulée ; ce qui lui a déjà été versé est signalé à l'équipe.
   */
  cancelEvent(userId: string, idOrSlug: string, reason: string) {
    const user = this.requireUser(userId);
    const e = this.findEvent(idOrSlug);
    const staff = this.team.can(user, "events.all");
    if (!this.team.access(e, user).delete && !staff) throw new ApiError(403, "Seul l'organisateur peut annuler cet événement");
    if (e.cancelledAt) throw new ApiError(400, "Événement déjà annulé");
    const why = String(reason ?? "").trim().slice(0, 300);
    if (why.length < 5) throw new ApiError(400, "Expliquez en quelques mots pourquoi l'événement est annulé");
    this.db.events.update(e.id, { cancelledAt: this.iso(), cancelReason: why });

    let refunds = 0;
    let refundTotal = 0;
    for (const o of this.db.orders.filter((x) => x.eventId === e.id && (x.status === "paid" || x.status === "reserved"))) {
      this.db.orders.update(o.id, { status: "cancelled" });
      const paid = this.db.payments.find((p) => p.kind === "ticket" && p.refId === o.id && !!p.intentId);
      if (paid && paid.amount > 0) {
        const buyer = this.db.users.get(o.userId);
        // Le numéro qui a payé (PayGate) d'abord, sinon celui du profil.
        const intent = this.db.intents.get(paid.intentId!);
        const phone = intent?.payerPhone ?? (buyer?.phone ? this.localPhone(buyer.phone) : null);
        const network = intent?.payerNetwork ?? (phone ? guessNetwork(phone) : null);
        this.db.payouts.insert({ id: newId("rmb"), userId: o.userId, eventId: e.id, intentIds: [paid.intentId!], amount: paid.amount, phone: network ? phone : null, network, status: "queued", kind: "refund", orderId: o.id, gatewayId: null, attempts: 0, error: null, createdAt: this.iso(), updatedAt: this.iso() });
        refunds++;
        refundTotal += paid.amount;
        this.notify(o.userId, "Événement annulé : vous êtes remboursé", network ? `« ${e.title} » est annulé. ${paid.amount.toLocaleString("fr-FR")} FCFA reviennent sur votre Mobile Money ${phone}.` : `« ${e.title} » est annulé. Indiquez votre numéro Mobile Money pour recevoir ${paid.amount.toLocaleString("fr-FR")} FCFA.`, "/billets");
      } else this.notify(o.userId, "Événement annulé", `« ${e.title} » est annulé : ${why}`, "/billets");
    }

    // Part de l'organisateur sur les billets de cet événement : retirée des reversements pas encore partis.
    const ticketIntents = new Set(this.db.payments.filter((p) => p.kind === "ticket" && p.eventId === e.id && !!p.intentId).map((p) => p.intentId!));
    const shareOf = (ids: string[]) => this.db.payments.filter((p) => p.kind === "ticket" && p.eventId === e.id && !!p.intentId && ids.includes(p.intentId)).reduce((n, p) => n + (p.organizerShare ?? 0), 0);
    let recovered = 0;
    for (const p of this.db.payouts.filter((x) => x.userId === e.organizerId && x.status === "queued" && (x.kind ?? "organizer") === "organizer" && x.intentIds.some((i) => ticketIntents.has(i)))) {
      const share = Math.min(p.amount, shareOf(p.intentIds));
      recovered += share;
      const left = p.amount - share;
      this.db.payouts.update(p.id, { amount: left, intentIds: p.intentIds.filter((i) => !ticketIntents.has(i)), status: left > 0 ? "queued" : "void", updatedAt: this.iso() });
    }
    const owed = this.db.payments.filter((p) => p.kind === "ticket" && p.eventId === e.id && !!p.intentId).reduce((n, p) => n + (p.organizerShare ?? 0), 0) - recovered;
    this.notifyModerators(
      "Événement annulé",
      `« ${e.title} » annulé par ${user.name || user.email}. ${refunds} remboursement(s), ${refundTotal.toLocaleString("fr-FR")} FCFA.${owed > 0 ? ` ${owed.toLocaleString("fr-FR")} FCFA déjà versés à l'organisateur : à récupérer.` : ""}`,
      "/tobe",
    );
    this.reminders.cancel(e.id);
    for (const r of this.db.resales.filter((x) => x.eventId === e.id && x.status === "listed")) this.db.resales.update(r.id, { status: "cancelled" });
    for (const g of this.db.groups.filter((x) => x.eventId === e.id)) this.db.groups.update(g.id, { expiresAt: this.iso() });
    return { ok: true, refunds, refundTotal, owedByOrganizer: Math.max(0, owed) };
  }

  /** Remboursements de l'utilisateur (événements annulés). */
  myRefunds(userId: string) {
    const user = this.requireUser(userId);
    return this.db.payouts
      .filter((p) => p.userId === user.id && p.kind === "refund")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((p) => {
        const e = p.eventId ? this.db.events.get(p.eventId) : undefined;
        return { id: p.id, amount: p.amount, status: p.status, phone: p.phone, network: p.network, needsNumber: !p.phone || !p.network, eventTitle: e?.title ?? "Événement", reason: e?.cancelReason ?? null, createdAt: p.createdAt };
      });
  }

  /** L'acheteur indique (ou corrige) le numéro où recevoir son remboursement. */
  setRefundAccount(userId: string, payoutId: string, input: { phone: string; network: PayoutNetwork }) {
    const user = this.requireUser(userId);
    const p = this.db.payouts.get(payoutId);
    if (!p || p.userId !== user.id || (p.kind !== "refund" && p.kind !== "resale")) throw new ApiError(404, "Remboursement introuvable");
    if (p.status !== "queued" && p.status !== "failed") throw new ApiError(400, "Ce remboursement est déjà en route");
    const local = this.localPhone(input.phone);
    if (!/^[79]\d{7}$/.test(local)) throw new ApiError(400, "Numéro Mobile Money togolais invalide (8 chiffres, ex. 90 12 34 56)");
    if (!["moov", "togocel", "mixx"].includes(input.network)) throw new ApiError(400, "Réseau inconnu");
    this.db.payouts.update(p.id, { phone: local, network: input.network, status: "queued", attempts: 0, error: null, updatedAt: this.iso() });
    return this.myRefunds(user.id);
  }

  private localPhone(phone: string) {
    const digits = String(phone ?? "").replace(/\D/g, "");
    return digits.startsWith("228") && digits.length === 11 ? digits.slice(3) : digits.slice(-8);
  }

  /** L'équipe marque un organisateur « de confiance » : plus de séquestre sur ses billets. */
  setTrusted(adminId: string, userId: string, trusted: boolean) {
    this.requireAdmin(adminId, "team.manage");
    const u = this.db.users.get(userId);
    if (!u) throw new ApiError(404, "Utilisateur introuvable");
    this.db.users.update(u.id, { trusted: !!trusted });
    // Plus de séquestre sur ce qui attend déjà.
    if (trusted) for (const p of this.db.payouts.filter((x) => x.userId === u.id && x.status === "queued" && !!x.releaseAt)) this.db.payouts.update(p.id, { releaseAt: null, updatedAt: this.iso() });
    return this.adminPayments(adminId);
  }

  deleteEvent(userId: string, idOrSlug: string) {
    const user = this.requireUser(userId);
    const e = this.findEvent(idOrSlug);
    if (!this.team.access(e, user).delete) throw new ApiError(403, "Seul l'organisateur peut supprimer cet événement");
    if (this.attendees(e) > 0) throw new ApiError(400, "Des billets ont été vendus : annulez l'événement, les acheteurs seront remboursés automatiquement");
    // L'argent déjà versé (votes payants, contributions) doit rester traçable : on annule plutôt que de supprimer.
    const contests = this.db.contests.filter((c) => c.eventId === e.id);
    const cagnottes = this.db.cagnottes.filter((c) => c.eventId === e.id);
    if (this.db.votes.some((v) => v.kind === "paid" && contests.some((c) => c.id === v.contestId)) || this.db.contributions.some((x) => cagnottes.some((c) => c.id === x.cagnotteId)))
      throw new ApiError(400, "De l'argent a été versé (votes payants ou cagnotte) : annulez l'événement plutôt que de le supprimer");
    // Tout ce qui dépend de l'événement disparaît avec lui, pour qu'aucune page n'y renvoie encore.
    for (const c of contests) {
      for (const v of this.db.votes.filter((x) => x.contestId === c.id)) this.db.votes.remove(v.id);
      this.db.contests.remove(c.id);
    }
    for (const c of cagnottes) this.db.cagnottes.remove(c.id);
    for (const ph of this.db.photos.filter((x) => x.eventId === e.id)) this.db.photos.remove(ph.id);
    for (const r of this.db.reminders.filter((x) => x.eventId === e.id)) this.db.reminders.remove(r.id);
    for (const m of this.db.members.filter((x) => x.eventId === e.id)) this.db.members.remove(m.id);
    for (const r of this.db.resales.filter((x) => x.eventId === e.id)) this.db.resales.remove(r.id);
    this.db.events.remove(e.id);
    return { ok: true };
  }

  // =====================================================================
  // Paiements (passerelle simulée — voir server/src/payments.ts pour brancher un vrai fournisseur)
  // =====================================================================
  private requirePayments(what: string) {
    if (!this.opts.paymentsEnabled) throw new ApiError(400, `${what} : le paiement en ligne arrive bientôt sur ToBe.`);
  }

  private pay(userId: string, kind: Parameters<ToBeService["recordPayment"]>[0]["kind"], refId: string, eventId: string | null, amount: number, platformFee: number, method: PayMethod, settle?: PaymentIntent | null, organizerId?: string | null) {
    if (amount < 0) throw new ApiError(400, "Montant invalide");
    const organizerShare = organizerId ? Math.max(0, amount - platformFee) : 0;
    const p = this.recordPayment({ userId, kind, refId, eventId, amount, platformFee, method: settle ? "online" : method, intentId: settle?.id ?? null, organizerShare, organizerId: organizerId ?? null });
    // Paiement réel : la part de l'organisateur part sur son Mobile Money.
    if (settle && organizerId && organizerShare > 0) {
      // Séquestre : l'argent des billets d'un organisateur pas encore « de confiance » attend la fin de l'événement + 24 h.
      const ev = kind === "ticket" && eventId ? this.db.events.get(eventId) : undefined;
      this.queuePayout(organizerId, eventId, settle.id, organizerShare, ev && !this.isTrusted(organizerId) ? this.escrowRelease(ev) : null);
    }
    return p;
  }

  private recordPayment(p: { userId: string; kind: "ticket" | "vote" | "contribution" | "boost" | "premium" | "pro" | "photos"; refId: string; eventId: string | null; amount: number; platformFee: number; method: PayMethod; intentId?: string | null; organizerShare?: number; organizerId?: string | null }) {
    return this.db.payments.insert({ id: newId("pay"), createdAt: this.iso(), ...p });
  }

  /** Paiement réel nécessaire ? Alors on crée un paiement à régler sur la page SasPay au lieu d'agir tout de suite. */
  private needsCheckout(amount: number, settle?: PaymentIntent | null) {
    return !!this.opts.checkout && amount > 0 && !settle;
  }

  private openIntent(userId: string, action: IntentAction, amount: number, eventId: string | null, description: string) {
    const intent = this.db.intents.insert({
      id: newId("pmt"),
      userId,
      action,
      eventId,
      amount: Math.round(amount),
      description,
      status: "created",
      gatewaySessionId: null,
      checkoutUrl: null,
      transactionId: null,
      resultRef: null,
      resultLink: null,
      error: null,
      createdAt: this.iso(),
      paidAt: null,
    });
    return { checkout: { intentId: intent.id, amount: intent.amount } };
  }

  // ---------- Garde-fous contre les faux événements ----------

  /** Organisateur vérifié par ToBe (ou membre de l'équipe ToBe). */
  isVerifiedOrganizer(userId: string) {
    const u = this.db.users.get(userId);
    return !!u && (u.verification?.status === "verified" || this.team.can(u, "events.all"));
  }

  /** Pourquoi les ventes en ligne sont fermées (null si ouvertes). */
  private salesBlocked(e: TobeEvent): string | null {
    if (e.cancelledAt) return "Événement annulé";
    if (e.moderation === "suspended") return "Événement retiré par ToBe";
    if (e.moderation === "review") return "Événement en cours de vérification par ToBe";
    if (this.opts.checkout && !this.isVerifiedOrganizer(e.organizerId)) return "Billetterie ouverte dès que l'organisateur est vérifié par ToBe";
    if (this.opts.checkout && this.opts.premoderation && !this.isEventVerified(e)) return "Billetterie ouverte dès que ToBe a vérifié cet événement";
    return null;
  }

  /** Événement vérifié par ToBe (ou publié par l'équipe ToBe). */
  isEventVerified(e: TobeEvent) {
    if (e.moderation) return false;
    if (e.approvedAt) return true;
    const u = this.db.users.get(e.organizerId);
    return !!u && this.team.can(u, "events.all");
  }

  /** L'organisateur prouve qu'il organise bien cet événement (contrat de salle, autorisation de l'artiste…). */
  submitEventProof(userId: string, idOrSlug: string, input: { files: { fileId: string; label: string }[]; note?: string }) {
    const user = this.requireUser(userId);
    const e = this.findEvent(idOrSlug);
    if (!this.canManage(e, user)) throw new ApiError(403, "Seul l'organisateur peut envoyer des preuves");
    const files = (input.files ?? []).filter((f) => typeof f.fileId === "string" && /^doc_[a-z0-9]+$/i.test(f.fileId)).slice(0, 8).map((f) => ({ fileId: f.fileId, label: String(f.label ?? "Document").slice(0, 80) }));
    if (!files.length) throw new ApiError(400, "Ajoutez au moins un document");
    this.db.events.update(e.id, { proofs: [...(e.proofs ?? []), ...files].slice(-12), proofNote: String(input.note ?? "").trim().slice(0, 1000) || e.proofNote || null, proofSubmittedAt: this.iso() });
    this.notifyModerators("Preuves reçues", `« ${e.title} » : ${files.length} document(s) à vérifier.`, "/tobe");
    return this.getEvent(e.id, user.id);
  }

  private assertCanSell(e: TobeEvent) {
    const why = this.salesBlocked(e);
    if (why) throw new ApiError(403, why);
  }

  private notifyModerators(title: string, body: string, link: string) {
    for (const u of this.db.users.filter((x) => this.team.can(x, "providers.moderate"))) this.notify(u.id, title, body, link);
  }

  /** Événement d'un autre organisateur au titre très proche, à moins de 3 jours d'écart. */
  private lookalike(e: TobeEvent): TobeEvent | null {
    if (e.approvedAt) return null;
    const words = (t: string) =>
      new Set(
        t
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, " ")
          .split(" ")
          .filter((w) => w.length >= 3 && !["les", "des", "avec", "pour", "the", "edition", "lome", "togo"].includes(w)),
      );
    const a = words(e.title);
    if (!a.size) return null;
    const t = new Date(e.startsAt).getTime();
    return (
      this.db.events.find((o) => {
        if (o.id === e.id || o.organizerId === e.organizerId || o.moderation === "suspended") return false;
        if (Math.abs(new Date(o.startsAt).getTime() - t) > 3 * 86400_000) return false;
        const b = words(o.title);
        const inter = [...a].filter((w) => b.has(w)).length;
        return inter / Math.min(a.size, b.size || 1) >= 0.6 && inter >= 1;
      }) ?? null
    );
  }

  /** Demande de vérification d'organisateur. */
  requestVerification(userId: string, input: { fullName: string; phone: string; orgName: string; link?: string; about?: string; kind?: "person" | "structure"; idDocs?: string[]; selfie?: string | null; structureDocs?: string[]; structureNumber?: string; role?: string }) {
    const user = this.requireUser(userId);
    const fullName = String(input.fullName ?? "").trim();
    const phone = String(input.phone ?? "").replace(/[^\d+]/g, "");
    if (fullName.length < 4) throw new ApiError(400, "Indiquez votre nom complet (comme sur votre pièce d'identité)");
    if (phone.replace(/\D/g, "").length < 8) throw new ApiError(400, "Indiquez un numéro WhatsApp joignable");
    if (!String(input.orgName ?? "").trim()) throw new ApiError(400, "Indiquez le nom de votre structure ou de votre événement");
    if (user.verification?.status === "verified") return this.myVerification(user.id);
    const doc = (x: unknown) => typeof x === "string" && /^doc_[a-z0-9]+$/i.test(x);
    const kind = input.kind === "structure" ? "structure" : "person";
    const idDocs = (input.idDocs ?? []).filter(doc).slice(0, 4);
    const structureDocs = (input.structureDocs ?? []).filter(doc).slice(0, 4);
    const selfie = doc(input.selfie) ? (input.selfie as string) : null;
    if (!idDocs.length) throw new ApiError(400, "Ajoutez la photo de votre pièce d'identité (CNI, passeport, permis)");
    if (kind === "person" && !selfie) throw new ApiError(400, "Ajoutez un selfie en tenant votre pièce d'identité");
    if (kind === "structure" && !structureDocs.length) throw new ApiError(400, "Ajoutez le document officiel de la structure (RCCM, récépissé d'association…)");
    if (kind === "structure" && !String(input.structureNumber ?? "").trim()) throw new ApiError(400, "Indiquez le numéro RCCM ou du récépissé");
    this.db.users.update(user.id, {
      verification: { status: "pending", kind, idDocs, selfie, structureDocs, structureNumber: String(input.structureNumber ?? "").trim().slice(0, 60), role: String(input.role ?? "").trim().slice(0, 60), fullName, phone, orgName: String(input.orgName).trim().slice(0, 100), link: String(input.link ?? "").trim().slice(0, 300), about: String(input.about ?? "").trim().slice(0, 1000), submittedAt: this.iso(), reviewedAt: null, reviewedBy: null, reason: null },
    });
    this.notifyModerators("Organisateur à vérifier", `${fullName} (${String(input.orgName).trim()}) demande à vendre en ligne.`, "/tobe");
    return this.myVerification(user.id);
  }

  myVerification(userId: string) {
    const u = this.requireUser(userId);
    return { verified: this.isVerifiedOrganizer(u.id), request: u.verification ?? null };
  }

  /** Signaler un événement (faux, arnaque, doublon…). 3 signalements différents : mis en vérification. */
  reportEvent(userId: string, idOrSlug: string, input: { reason: EventReport["reason"]; details?: string }) {
    const user = this.requireUser(userId);
    const e = this.findEvent(idOrSlug);
    if (!["faux", "arnaque", "doublon", "autre"].includes(input.reason)) throw new ApiError(400, "Choisissez un motif");
    if (this.db.reports.some((r) => r.eventId === e.id && r.userId === user.id)) return { ok: true, already: true };
    this.db.reports.insert({ id: newId("sig"), eventId: e.id, userId: user.id, reason: input.reason, details: String(input.details ?? "").trim().slice(0, 1000), createdAt: this.iso(), handled: false });
    const open = this.db.reports.filter((r) => r.eventId === e.id && !r.handled).length;
    if (open >= 3 && !e.moderation && !e.approvedAt) {
      this.db.events.update(e.id, { moderation: "review", moderationReason: `${open} signalements de visiteurs` });
      this.notify(e.organizerId, "Votre événement est en vérification", "Des visiteurs l'ont signalé. L'équipe ToBe vérifie et vous recontacte si besoin.", `/organisateur/${e.id}`);
    }
    this.notifyModerators("Événement signalé", `« ${e.title} » : ${input.reason}${open >= 3 ? ` (${open} signalements, mis en vérification)` : ""}.`, "/tobe");
    return { ok: true };
  }

  /** Espace ToBe : vérifications, événements en attente, signalements. */
  moderationQueue(userId: string) {
    this.requireAdmin(userId, "providers.moderate");
    const users = this.db.users.filter((u) => u.verification?.status === "pending");
    const ev = (e: TobeEvent) => ({ id: e.id, slug: e.slug, title: e.title, startsAt: e.startsAt, organizerName: e.organizerName, organizerVerified: this.isVerifiedOrganizer(e.organizerId), moderation: e.moderation ?? null, reason: e.moderationReason ?? null, reports: this.db.reports.filter((r) => r.eventId === e.id && !r.handled).length, paid: e.access === "paid" });
    return {
      verifications: users.map((u) => ({ userId: u.id, email: u.email, events: this.db.events.filter((e) => e.organizerId === u.id).length, ...u.verification! })),
      events: this.db.events.filter((e) => !!e.moderation).map(ev),
      reports: this.db.reports
        .filter((r) => !r.handled)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 50)
        .map((r) => ({ ...r, event: this.db.events.get(r.eventId) ? ev(this.db.events.get(r.eventId)!) : null, by: this.db.users.get(r.userId)?.name ?? "?" })),
      unverifiedSelling: this.db.events.filter((e) => e.access === "paid" && this.isUpcoming(e) && !this.isVerifiedOrganizer(e.organizerId)).map(ev),
      toVerify: this.db.events
        .filter((e) => !e.moderation && this.isUpcoming(e) && !this.isEventVerified(e))
        .sort((a, b) => (b.proofSubmittedAt ?? "").localeCompare(a.proofSubmittedAt ?? "") || a.startsAt.localeCompare(b.startsAt))
        .map((e) => ({ ...ev(e), proofs: e.proofs ?? [], proofNote: e.proofNote ?? null, proofSubmittedAt: e.proofSubmittedAt ?? null, organizerRequest: this.db.users.get(e.organizerId)?.verification?.status ?? null })),
    };
  }

  reviewVerification(adminId: string, userId: string, input: { decision: "verified" | "rejected"; reason?: string }) {
    const admin = this.requireAdmin(adminId, "providers.moderate");
    const u = this.db.users.get(userId);
    if (!u) throw new ApiError(404, "Utilisateur introuvable");
    const base = u.verification ?? { status: "pending", fullName: u.name, phone: u.phone ?? "", orgName: "", link: "", about: "", submittedAt: this.iso(), reviewedAt: null, reviewedBy: null, reason: null };
    this.db.users.update(u.id, { verification: { ...base, status: input.decision, reviewedAt: this.iso(), reviewedBy: admin.id, reason: input.reason?.trim() || null } });
    if (input.decision === "verified") this.notify(u.id, "Vous êtes organisateur vérifié", "Vos ventes en ligne sont ouvertes et vos gains vous sont reversés automatiquement.", "/organisateur");
    else this.notify(u.id, "Vérification refusée", input.reason?.trim() || "Contactez l'équipe ToBe pour en savoir plus.", "/organisateur");
    return this.moderationQueue(adminId);
  }

  moderateEvent(adminId: string, idOrSlug: string, input: { action: "approve" | "suspend"; reason?: string }) {
    this.requireAdmin(adminId, "providers.moderate");
    const e = this.findEvent(idOrSlug);
    if (input.action === "approve") {
      this.db.events.update(e.id, { moderation: null, moderationReason: null, approvedAt: this.iso() });
      this.notify(e.organizerId, "Événement vérifié par ToBe", `« ${e.title} » porte maintenant le badge « Événement vérifié »${e.access === "paid" ? " et sa billetterie est ouverte" : ""}.`, `/evenement/${e.slug}`);
    } else {
      this.db.events.update(e.id, { moderation: "suspended", moderationReason: input.reason?.trim() || "Retiré par ToBe" });
      this.notify(e.organizerId, "Événement retiré", `« ${e.title} » a été retiré par ToBe${input.reason ? ` : ${input.reason}` : ""}. Vos reversements sont suspendus le temps de régler la situation.`, `/organisateur/${e.id}`);
    }
    for (const r of this.db.reports.filter((x) => x.eventId === e.id && !x.handled)) this.db.reports.update(r.id, { handled: true });
    return this.moderationQueue(adminId);
  }

  /** Billets en cours de paiement depuis moins de 30 minutes (places mises de côté). */
  private heldTickets(ticketTypeId: string) {
    const since = this.now().getTime() - 30 * 60_000;
    return this.db.intents
      .filter((i) => i.action.kind === "ticket" && i.action.ticketTypeId === ticketTypeId && !i.action.group && (i.status === "created" || i.status === "pending") && new Date(i.createdAt).getTime() > since)
      .reduce((n, i) => n + (i.action as { qty: number }).qty, 0) + this.db.groups.filter((g) => g.ticketTypeId === ticketTypeId).reduce((n, g) => n + this.groupHeld(g), 0);
  }

  // ---------- Paiement en ligne (SasPay) : appelé par la couche serveur, jamais directement par le client ----------

  /** Ce qu'il faut pour ouvrir la page de paiement. */
  intentForCheckout(intentId: string) {
    const i = this.db.intents.get(intentId);
    if (!i) throw new ApiError(404, "Paiement introuvable");
    const u = this.db.users.get(i.userId);
    return { intent: i, customer: { email: u?.email || "client@tobe.eledji.com", name: u?.name || "Client ToBe", phone: u?.phone ?? null } };
  }

  attachCheckout(intentId: string, sessionId: string, url: string) {
    const i = this.db.intents.get(intentId);
    if (!i) throw new ApiError(404, "Paiement introuvable");
    this.db.intents.update(i.id, { status: "pending", gatewaySessionId: sessionId, checkoutUrl: url });
    return { checkoutUrl: url, intentId: i.id };
  }

  failIntent(intentId: string, status: "failed" | "expired", error: string | null) {
    const i = this.db.intents.get(intentId);
    if (!i || i.status === "paid") return i ?? null;
    return this.db.intents.update(i.id, { status, error });
  }

  /** Paiements à revérifier auprès de SasPay (en cours depuis moins de 26 heures). */
  pendingIntents() {
    const since = this.now().getTime() - 26 * 3600_000;
    return this.db.intents.filter((i) => i.status === "pending" && !!i.gatewaySessionId && new Date(i.createdAt).getTime() > since).map((i) => ({ id: i.id, sessionId: i.gatewaySessionId! }));
  }

  /** Paiement confirmé par SasPay : on délivre ce qui a été acheté (une seule fois). */
  settleIntent(intentId: string, transactionId: string | null) {
    const i = this.db.intents.get(intentId);
    if (!i) throw new ApiError(404, "Paiement introuvable");
    if (i.status === "paid") return i;
    const paid = this.db.intents.update(i.id, { status: "paid", transactionId, paidAt: this.iso() });
    const a = i.action;
    let ref: string | null = null;
    let link: string | null = null;
    try {
      if (a.kind === "ticket") {
        const o = this.buyTickets(i.userId, a.eventId, { ticketTypeId: a.ticketTypeId, qty: a.qty, method: "online", code: a.code, group: a.group ?? null }, paid);
        ref = o.id;
        link = "/billets?nouveau=1";
        const e = this.db.events.get(a.eventId);
        this.notify(i.userId, "Paiement reçu, vos billets sont prêts", `${a.qty} billet${a.qty > 1 ? "s" : ""} pour ${e?.title ?? "l'événement"}. Présentez le QR code à l'entrée.`, "/billets");
        if (e) this.notify(e.organizerId, "Nouvelle vente", `${a.qty} billet${a.qty > 1 ? "s" : ""} ${o.ticketTypeName} vendu${a.qty > 1 ? "s" : ""} pour ${e.title}.`, `/organisateur/${e.id}`);
      } else if (a.kind === "photos") {
        const r = this.buyPhotoPass(i.userId, a.eventId, a.tier, "online", paid);
        ref = this.photoPass(i.userId, a.eventId)?.id ?? null;
        link = `/photos?event=${a.eventId}`;
        const e = this.db.events.get(a.eventId);
        this.notify(i.userId, "Photos débloquées", r.tier === "hd" ? "Toutes vos photos en Full HD, sans logo. Ajoutez jusqu'à 3 proches." : r.tier === "clean" ? "Toutes vos photos sans logo." : "Toutes vos photos de l'événement.", link);
        if (e) this.notify(e.organizerId, "Vente de photos", `Un participant a acheté ses photos de ${e.title}.`, `/organisateur/${e.id}`);
      } else if (a.kind === "resale") {
        const o = this.buyResale(i.userId, a.resaleId, { method: "online" }, paid);
        ref = o.id;
        link = "/billets?nouveau=1";
        this.notify(i.userId, "Billet reçu", "Votre billet acheté en revente officielle est prêt, avec un QR tout neuf.", "/billets");
      } else if (a.kind === "vote") {
        const r = this.vote(i.userId, a.contestId, { candidateId: a.candidateId, pack: a.pack as "1" | "10" | "50", method: "online" }, paid) as { vote: { id: string } };
        ref = r.vote.id;
        const c = this.db.contests.get(a.contestId);
        link = c ? `/vote/${c.eventId}` : null;
      } else if (a.kind === "contribution") {
        this.contribute(i.userId, a.cagnotteId, { amount: a.amount, message: a.message, anonymous: a.anonymous, name: a.name, method: "online", code: a.code }, paid);
        ref = a.cagnotteId;
        const cg = this.db.cagnottes.get(a.cagnotteId);
        link = cg ? `/cagnotte/${cg.eventId}` : null;
      } else if (a.kind === "boost") {
        this.buyBoost(i.userId, a.eventId, a.plan as BoostPlan, "online", paid);
        ref = a.eventId;
        link = `/organisateur/${a.eventId}`;
      } else if (a.kind === "subscription") {
        this.subscribe(i.userId, a.plan, "online", paid);
        ref = a.plan;
        link = a.plan === "pro" ? "/organisateur" : "/photos";
      }
      return this.db.intents.update(i.id, { resultRef: ref, resultLink: link, error: null });
    } catch (e) {
      // Argent reçu mais action impossible (candidat supprimé…) : l'équipe ToBe doit rembourser.
      const msg = e instanceof Error ? e.message : String(e);
      for (const u of this.db.users.filter((x) => this.team.can(x, "team.manage"))) this.notify(u.id, "Paiement reçu à traiter", `${i.amount} FCFA payés mais « ${i.description} » n'a pas pu être délivré : ${msg}. Remboursement à prévoir.`, "/tobe");
      return this.db.intents.update(i.id, { error: msg });
    }
  }

  /** Où en est un paiement (page de retour après SasPay). */
  paymentStatus(userId: string | null, intentId: string) {
    const i = this.db.intents.get(intentId);
    if (!i) throw new ApiError(404, "Paiement introuvable");
    return { id: i.id, status: i.status, amount: i.amount, description: i.description, link: i.resultLink, error: i.status === "paid" ? i.error : null, mine: !!userId && userId === i.userId, payer: i.payerPhone ?? null };
  }

  /** Numéro qui paie (PayGate) : seul le client concerné peut le choisir, avant le paiement. */
  setIntentPayer(userId: string, intentId: string, input: { phone: string; network: PayoutNetwork }) {
    const user = this.requireUser(userId);
    const i = this.db.intents.get(intentId);
    if (!i || i.userId !== user.id) throw new ApiError(404, "Paiement introuvable");
    if (i.status === "paid") throw new ApiError(400, "Ce paiement est déjà fait");
    const local = this.localPhone(input?.phone);
    if (!/^[79]\d{7}$/.test(local)) throw new ApiError(400, "Numéro Mobile Money togolais invalide (8 chiffres, ex. 90 12 34 56)");
    if (!["moov", "togocel", "mixx"].includes(input?.network)) throw new ApiError(400, "Choisissez Moov Money ou Mixx by Yas");
    this.db.intents.update(i.id, { payerPhone: local, payerNetwork: input.network, status: "pending" });
    // Gardé sur le profil (s'il n'y en a pas) : remboursements automatiques et paiements suivants plus rapides.
    if (!user.phone) this.db.users.update(user.id, { phone: local });
    return { id: i.id, amount: i.amount, description: i.description, phone: local, network: input.network, sessionId: i.gatewaySessionId ?? i.id };
  }

  // ---------- Reversements aux organisateurs ----------

  private queuePayout(organizerId: string, eventId: string | null, intentId: string, amount: number, releaseAt: string | null = null) {
    const open = this.db.payouts.find(
      (p) => p.userId === organizerId && p.status === "queued" && (p.kind ?? "organizer") === "organizer" && (releaseAt ? p.releaseAt === releaseAt && p.eventId === eventId : !p.releaseAt),
    );
    if (open) return this.db.payouts.update(open.id, { amount: open.amount + amount, intentIds: [...open.intentIds, intentId], eventId: open.eventId === eventId ? eventId : null, updatedAt: this.iso() });
    return this.db.payouts.insert({ id: newId("vrs"), userId: organizerId, eventId, intentIds: [intentId], amount, phone: null, network: null, status: "queued", kind: "organizer", releaseAt, gatewayId: null, attempts: 0, error: null, createdAt: this.iso(), updatedAt: this.iso() });
  }

  /** Organisateur de confiance : choisi par ToBe, ou membre de l'équipe ToBe. */
  isTrusted(userId: string) {
    const u = this.db.users.get(userId);
    return !!u && (!!u.trusted || this.team.can(u, "events.all"));
  }

  /** Fin de l'événement + 24 h : l'argent des billets est libéré si personne ne s'est plaint. */
  private escrowRelease(e: TobeEvent) {
    const end = e.endsAt ? new Date(e.endsAt).getTime() : new Date(e.startsAt).getTime() + 8 * 3600_000;
    return new Date(end + 24 * 3600_000).toISOString();
  }

  private released(p: Payout) {
    return !p.releaseAt || new Date(p.releaseAt).getTime() <= this.now().getTime();
  }

  /** Reversements prêts à partir : montant suffisant et numéro renseigné ; échecs retentés toutes les 10 minutes (5 fois). */
  duePayouts() {
    const now = this.now().getTime();
    return this.db.payouts
      .filter((p) => {
        if (p.status === "failed") return p.attempts < 5 && now - new Date(p.updatedAt).getTime() > 10 * 60_000;
        // Remboursement ou revente : l'argent part sur le numéro indiqué, quel que soit le montant.
        if (p.kind === "refund" || p.kind === "resale") return p.status === "queued" && !!p.phone && !!p.network && p.amount > 0;
        const u = this.db.users.get(p.userId);
        if (!u?.payoutPhone || !u.payoutNetwork) return false;
        if (!this.released(p)) return false;
        // Argent retenu tant que l'organisateur n'est pas vérifié ou qu'un de ses événements est suspendu.
        if (!this.isVerifiedOrganizer(u.id) || this.db.events.some((e) => e.organizerId === u.id && e.moderation === "suspended")) return false;
        if (p.status === "queued") return p.amount >= PRICING.payoutMin || (!!p.requested && p.amount >= PRICING.withdrawMin);
        return false;
      })
      .map((p) => {
        const u = this.db.users.get(p.userId);
        const own = p.kind === "refund" || p.kind === "resale";
        const phone = own || p.status === "failed" ? (p.phone ?? u?.payoutPhone) : u?.payoutPhone;
        const network = own || p.status === "failed" ? (p.network ?? u?.payoutNetwork) : u?.payoutNetwork;
        const description = p.kind === "refund" ? "Remboursement ToBe" : p.kind === "resale" ? "Revente de votre billet ToBe" : "Vos gains ToBe";
        return { id: p.id, amount: p.amount, phone: phone!, network: network!, name: u?.name ?? "Client ToBe", email: u?.email ?? "", attempts: p.attempts, description };
      })
      .filter((p) => !!p.phone && !!p.network);
  }

  /** Reversements envoyés dont on attend la confirmation. */
  sendingPayouts() {
    return this.db.payouts.filter((p) => p.status === "sending" && !!p.gatewayId).map((p) => ({ id: p.id, gatewayId: p.gatewayId! }));
  }

  /** On s'apprête à envoyer : le montant est figé (les prochaines ventes iront dans un nouveau reversement). */
  lockPayout(payoutId: string) {
    const p = this.db.payouts.get(payoutId);
    if (!p || (p.status !== "queued" && p.status !== "failed")) return null;
    const u = this.db.users.get(p.userId);
    const own = p.kind === "refund" || p.kind === "resale";
    return this.db.payouts.update(p.id, { status: "sending", attempts: p.attempts + 1, phone: own ? p.phone : (u?.payoutPhone ?? null), network: own ? p.network : (u?.payoutNetwork ?? null), updatedAt: this.iso() });
  }

  recordPayout(payoutId: string, r: { status: "sending" | "sent" | "failed" | "manual"; gatewayId?: string | null; error?: string | null }) {
    const p = this.db.payouts.get(payoutId);
    if (!p) return null;
    // Après 5 échecs, on arrête de réessayer en silence : l'équipe est prévenue.
    if (r.status === "failed" && p.attempts >= 5) r = { ...r, status: "manual", error: `5 essais échoués : ${r.error ?? "erreur SasPay"}` };
    const next = this.db.payouts.update(p.id, { status: r.status, gatewayId: r.gatewayId ?? p.gatewayId, error: r.error ?? null, updatedAt: this.iso() });
    if (r.status === "sent" && p.status !== "sent" && p.kind === "refund") this.notify(p.userId, "Remboursement envoyé", `${p.amount.toLocaleString("fr-FR")} FCFA renvoyés sur votre Mobile Money ${p.phone ?? ""}.`, "/billets");
    else if (r.status === "sent" && p.status !== "sent" && p.kind === "resale") this.notify(p.userId, "Billet revendu : argent reçu", `${p.amount.toLocaleString("fr-FR")} FCFA envoyés sur votre Mobile Money ${p.phone ?? ""}.`, "/billets");
    else if (r.status === "sent" && p.status !== "sent") this.notify(p.userId, "Vos gains sont arrivés", `${p.amount.toLocaleString("fr-FR")} FCFA envoyés sur votre Mobile Money ${p.phone ?? ""}.`, "/organisateur");
    if (r.status === "manual" && p.status !== "manual")
      for (const u of this.db.users.filter((x) => this.team.can(x, "team.manage"))) this.notify(u.id, p.kind === "refund" ? "Remboursement bloqué" : "Reversement à faire", `${p.amount.toLocaleString("fr-FR")} FCFA à envoyer ${p.kind === "refund" ? "à un acheteur (remboursement)" : p.kind === "resale" ? "au vendeur d'un billet revendu" : "à un organisateur"} : ${r.error ?? ""}`, "/tobe");
    return next;
  }

  /** « Retirer maintenant » : la part disponible part tout de suite sur le Mobile Money de l'organisateur. */
  withdrawNow(userId: string) {
    const user = this.requireUser(userId);
    const ready = this.db.payouts.filter((p) => p.userId === user.id && p.status === "queued" && (p.kind ?? "organizer") === "organizer" && this.released(p));
    const amount = ready.reduce((n, p) => n + p.amount, 0);
    if (amount <= 0) {
      const held = this.db.payouts.filter((p) => p.userId === user.id && p.status === "queued" && !this.released(p));
      if (held.length) throw new ApiError(400, `Argent en séquestre jusqu'au ${new Date(held.map((p) => p.releaseAt!).sort()[0]).toLocaleDateString("fr-FR")} (24 h après l'événement). Il part ensuite automatiquement.`);
      throw new ApiError(400, "Aucun montant disponible pour l'instant");
    }
    if (amount < PRICING.withdrawMin) throw new ApiError(400, `Retrait possible à partir de ${PRICING.withdrawMin.toLocaleString("fr-FR")} FCFA`);
    if (!user.payoutPhone || !user.payoutNetwork) throw new ApiError(400, "Indiquez d'abord votre numéro Mobile Money");
    if (!this.isVerifiedOrganizer(user.id)) throw new ApiError(403, "Retraits possibles dès que ToBe a vérifié votre identité");
    if (this.db.events.some((e) => e.organizerId === user.id && e.moderation === "suspended")) throw new ApiError(403, "Retraits suspendus : un de vos événements a été retiré par ToBe. Contactez l'équipe.");
    for (const p of ready) this.db.payouts.update(p.id, { requested: true, updatedAt: this.iso() });
    return this.myEarnings(user.id);
  }

  /** Numéro Mobile Money où l'organisateur reçoit ses gains. */
  setPayoutAccount(userId: string, input: { phone: string; network: PayoutNetwork }) {
    const user = this.requireUser(userId);
    const digits = String(input.phone ?? "").replace(/\D/g, "");
    const local = digits.startsWith("228") && digits.length === 11 ? digits.slice(3) : digits;
    if (!/^[79]\d{7}$/.test(local)) throw new ApiError(400, "Numéro Mobile Money togolais invalide (8 chiffres, ex. 90 12 34 56)");
    if (!["moov", "togocel", "mixx"].includes(input.network)) throw new ApiError(400, "Réseau inconnu");
    this.db.users.update(user.id, { payoutPhone: local, payoutNetwork: input.network });
    return this.myEarnings(user.id);
  }

  /** Gains de l'organisateur : ce qui attend, ce qui est parti. */
  myEarnings(userId: string) {
    const user = this.requireUser(userId);
    const list = this.db.payouts.filter((p) => p.userId === user.id && (p.kind ?? "organizer") === "organizer" && p.status !== "void").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const sum = (f: (p: Payout) => boolean) => list.filter(f).reduce((n, p) => n + p.amount, 0);
    return {
      phone: user.payoutPhone ?? null,
      network: user.payoutNetwork ?? null,
      pending: sum((p) => p.status !== "sent"),
      available: sum((p) => p.status === "queued" && this.released(p)),
      escrow: sum((p) => p.status === "queued" && !this.released(p)),
      escrowUntil: list.filter((p) => p.status === "queued" && !this.released(p)).map((p) => p.releaseAt!).sort()[0] ?? null,
      trusted: this.isTrusted(user.id),
      withdrawMin: PRICING.withdrawMin,
      canWithdraw: this.isVerifiedOrganizer(user.id) && !!user.payoutPhone && !!user.payoutNetwork,
      sent: sum((p) => p.status === "sent"),
      min: PRICING.payoutMin,
      commission: { ticket: PRICING.ticketCommission, vote: PRICING.voteCommission, cagnotte: PRICING.cagnotteCommission },
      payouts: list.slice(0, 30).map((p) => ({ id: p.id, amount: p.amount, status: p.status, releaseAt: p.releaseAt ?? null, createdAt: p.createdAt, updatedAt: p.updatedAt, eventTitle: p.eventId ? (this.db.events.get(p.eventId)?.title ?? null) : null })),
    };
  }

  /** Espace ToBe : paiements reçus et reversements. */
  adminPayments(userId: string) {
    this.requireAdmin(userId, "team.manage");
    const intents = this.db.intents.all().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const paid = intents.filter((i) => i.status === "paid");
    const revenue = this.db.payments.filter((p) => !!p.intentId).reduce((n, p) => n + p.platformFee, 0);
    return {
      totals: { collected: paid.reduce((n, i) => n + i.amount, 0), commission: revenue, toPay: this.db.payouts.filter((p) => p.status !== "sent" && p.status !== "void").reduce((n, p) => n + p.amount, 0) },
      intents: intents.slice(0, 40).map((i) => ({ id: i.id, description: i.description, amount: i.amount, status: i.status, error: i.error, createdAt: i.createdAt, user: this.db.users.get(i.userId)?.name ?? "?" })),
      payouts: this.db.payouts
        .all()
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 60)
        .map((p) => {
          const u = this.db.users.get(p.userId);
          return { ...p, organizer: u?.name ?? "?", trusted: this.isTrusted(p.userId), phone: p.phone ?? u?.payoutPhone ?? null, network: p.network ?? u?.payoutNetwork ?? null };
        }),
    };
  }

  /** Reversement fait à la main depuis le tableau de bord SasPay, ou à relancer. */
  adminPayoutAction(userId: string, payoutId: string, action: "done" | "retry" | "send") {
    this.requireAdmin(userId, "team.manage");
    const p = this.db.payouts.get(payoutId);
    if (!p) throw new ApiError(404, "Reversement introuvable");
    if (action === "send") {
      if (p.status !== "queued") throw new ApiError(400, "Ce reversement est déjà en cours");
      // L'équipe peut libérer un séquestre en avance.
      this.db.payouts.update(p.id, { requested: true, releaseAt: null, updatedAt: this.iso() });
    } else if (action === "done") this.recordPayout(p.id, { status: "sent", error: null });
    else this.db.payouts.update(p.id, { status: "failed", attempts: 0, error: null, updatedAt: new Date(0).toISOString() });
    return this.adminPayments(userId);
  }

  // =====================================================================
  // Billetterie
  // =====================================================================
  buyTickets(userId: string, idOrSlug: string, input: { ticketTypeId: string; qty: number; method: PayMethod; code?: string | null; group?: string | null }, settle?: PaymentIntent | null): Order {
    const user = this.requireUser(userId);
    const e = this.findEvent(idOrSlug);
    if (!settle && !this.canView(e, user, input.code)) throw new ApiError(403, "Accès réservé aux invités");
    if (!settle && !this.isUpcoming(e)) throw new ApiError(400, "Cet événement est terminé");
    if (e.access === "none") throw new ApiError(400, "Pas de billetterie ToBe pour cet événement : voyez les infos d'entrée de l'organisateur");
    const tt = e.ticketTypes.find((t) => t.id === input.ticketTypeId);
    if (!tt) throw new ApiError(400, "Type de billet introuvable");
    // Cotisation : une place du groupe, déjà mise de côté.
    const group = input.group ? this.db.groups.find((g) => g.code === String(input.group).toUpperCase()) : undefined;
    if (input.group && !group) throw new ApiError(404, "Groupe introuvable");
    if (group && !settle) {
      if (group.eventId !== e.id || group.ticketTypeId !== tt.id) throw new ApiError(400, "Ce groupe est pour un autre billet");
      if (group.members.some((m) => m.userId === user.id)) throw new ApiError(400, "Vous avez déjà payé votre place dans ce groupe");
      if (group.members.length >= group.seats) throw new ApiError(400, "Toutes les places du groupe sont payées");
      if (new Date(group.expiresAt) <= this.now()) throw new ApiError(400, "Ce groupe a expiré : les places non payées ont été libérées");
    }
    const qty = group ? 1 : Math.round(input.qty);
    if (qty < 1 || qty > 10) throw new ApiError(400, "Entre 1 et 10 billets par commande");
    // Places déjà en cours de paiement (moins de 30 minutes) : réservées pour leurs acheteurs.
    const holding = settle ? 0 : this.heldTickets(tt.id);
    if (!settle && !group && tt.quota && tt.sold + holding + qty > tt.quota) throw new ApiError(400, `Plus que ${Math.max(0, tt.quota - tt.sold - holding)} place(s) disponible(s)`);
    const online = this.opts.paymentsEnabled && tt.price > 0;
    if (online && input.method === "cash" && !this.opts.checkout) throw new ApiError(400, "Choisissez un paiement Mobile Money ou carte");
    if (this.needsCheckout(tt.price * qty, settle)) {
      this.assertCanSell(e);
      return this.openIntent(user.id, { kind: "ticket", eventId: e.id, ticketTypeId: tt.id, qty, code: input.code ?? null, group: group?.code ?? null }, tt.price * qty, e.id, `${qty} billet${qty > 1 ? "s" : ""} ${tt.name} · ${e.title}${group ? ` · groupe ${group.name}` : ""}`) as unknown as Order;
    }
    const organizer = this.db.users.get(e.organizerId);
    const fee = online ? ticketFee(tt.price, !!organizer?.pro) * qty : 0;
    const total = tt.price * qty + fee;
    const order: Order = {
      id: newId("ord"),
      eventId: e.id,
      userId: user.id,
      ticketTypeId: tt.id,
      ticketTypeName: tt.name,
      qty,
      unitPrice: tt.price,
      fee,
      total,
      method: online ? input.method : "cash",
      status: online || tt.price === 0 ? "paid" : "reserved",
      code: randomCode(10),
      secret: randomCode(24),
      scannedCount: 0,
      createdAt: this.iso(),
    };
    this.db.orders.insert(order);
    this.db.events.update(e.id, (ev) => ({ ...ev, ticketTypes: ev.ticketTypes.map((t) => (t.id === tt.id ? { ...t, sold: t.sold + qty } : t)) }));
    if (online && total > 0) this.pay(user.id, "ticket", order.id, e.id, total, settle ? Math.round(total * PRICING.ticketCommission) : fee, input.method, settle, settle ? e.organizerId : null);
    // Billet pris : rappels automatiques 2 jours avant, la veille, le jour J et 30 minutes avant.
    this.reminders.add(e, { userId: user.id, subId: null }, "ticket");
    if (group) {
      const g = this.db.groups.update(group.id, (x) => ({ ...x, members: [...x.members, { userId: user.id, orderId: order.id, paidAt: this.iso() }] }));
      if (g.members.length === g.seats) this.notify(g.ownerId, "Groupe complet", `Les ${g.seats} places de « ${g.name} » sont payées. Chacun a son billet.`, `/groupe/${g.code}`);
      else if (g.ownerId !== user.id) this.notify(g.ownerId, "Une place payée", `${user.name || "Un membre"} a payé sa place (${g.members.length}/${g.seats}).`, `/groupe/${g.code}`);
    }
    return order;
  }

  // ---------- Observatoire des événements (page publique, chiffres agrégés seulement) ----------

  observatory() {
    const now = this.now();
    const pub = this.db.events.filter((e) => e.visibility === "public" && !e.moderation);
    const yearAgo = now.getTime() - 365 * 86400_000;
    const recent = pub.filter((e) => new Date(e.startsAt).getTime() >= yearAgo);
    const sold = (e: TobeEvent) => e.ticketTypes.reduce((n, t) => n + t.sold, 0);
    const count = <K extends string>(list: TobeEvent[], key: (e: TobeEvent) => K) => {
      const m = new Map<K, number>();
      for (const e of list) m.set(key(e), (m.get(key(e)) ?? 0) + 1);
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    const months: { month: string; events: number; tickets: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const key = d.toISOString().slice(0, 7);
      const list = pub.filter((e) => e.startsAt.slice(0, 7) === key);
      months.push({ month: key, events: list.length, tickets: list.reduce((n, e) => n + sold(e), 0) });
    }
    const paidTickets = recent.filter((e) => e.access === "paid").flatMap((e) => e.ticketTypes.filter((t) => t.price > 0));
    const avgPrice = paidTickets.length ? Math.round(paidTickets.reduce((n, t) => n + t.price, 0) / paidTickets.length) : 0;
    const organizers = new Set(recent.map((e) => e.organizerId));
    const toOrganizers = this.db.payouts.filter((p) => (p.kind ?? "organizer") === "organizer" && p.status === "sent").reduce((n, p) => n + p.amount, 0);
    const weekday = [0, 0, 0, 0, 0, 0, 0];
    for (const e of recent) weekday[new Date(e.startsAt).getUTCDay()]++;
    return {
      generatedAt: this.iso(),
      totals: {
        events: recent.length,
        upcoming: pub.filter((e) => this.isUpcoming(e) && !e.cancelledAt).length,
        tickets: recent.reduce((n, e) => n + sold(e), 0),
        organizers: organizers.size,
        verifiedOrganizers: [...organizers].filter((id) => this.isVerifiedOrganizer(id)).length,
        verifiedEvents: recent.filter((e) => this.isEventVerified(e)).length,
        cancelled: recent.filter((e) => !!e.cancelledAt).length,
        freeShare: recent.length ? Math.round((recent.filter((e) => e.access !== "paid").length / recent.length) * 100) : 0,
        avgPrice,
        paidToOrganizers: toOrganizers,
        photos: this.db.photos.filter((p) => recent.some((e) => e.id === p.eventId)).length,
      },
      byCategory: count(recent, (e) => e.category).map(([category, events]) => ({ category, label: CATEGORY_LABELS[category] ?? category, events })),
      byCity: count(recent, (e) => (e.city || "Lomé").trim()).slice(0, 8).map(([city, events]) => ({ city, events })),
      byWeekday: ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"].map((day, i) => ({ day, events: weekday[i] })),
      months,
    };
  }

  // ---------- Cotisation : payer à plusieurs ----------

  private groupHeld(g: TicketGroup) {
    return new Date(g.expiresAt) > this.now() ? Math.max(0, g.seats - g.members.length) : 0;
  }

  /** Un groupe met N places de côté (24 h au plus) ; chacun paie la sienne depuis le lien partagé. */
  createGroup(userId: string, idOrSlug: string, input: { ticketTypeId: string; seats: number; name?: string }) {
    const user = this.requireUser(userId);
    const e = this.findEvent(idOrSlug);
    if (!this.isUpcoming(e) || e.cancelledAt) throw new ApiError(400, "Cet événement n'est plus en vente");
    if (e.access === "none") throw new ApiError(400, "Pas de billetterie ToBe pour cet événement");
    const tt = e.ticketTypes.find((t) => t.id === input.ticketTypeId);
    if (!tt) throw new ApiError(400, "Type de billet introuvable");
    if (tt.price <= 0) throw new ApiError(400, "Billet gratuit : chacun peut prendre le sien directement");
    const seats = Math.round(Number(input.seats));
    if (!(seats >= 2 && seats <= 10)) throw new ApiError(400, "Un groupe compte de 2 à 10 places");
    this.assertCanSell(e);
    const held = this.heldTickets(tt.id);
    if (tt.quota && tt.sold + held + seats > tt.quota) throw new ApiError(400, `Plus que ${Math.max(0, tt.quota - tt.sold - held)} place(s) disponible(s)`);
    const expires = Math.min(this.now().getTime() + 24 * 3600_000, new Date(e.startsAt).getTime());
    const g = this.db.groups.insert({
      id: newId("grp"),
      code: randomCode(6),
      eventId: e.id,
      ticketTypeId: tt.id,
      ownerId: user.id,
      name: String(input.name ?? "").trim().slice(0, 40) || `Groupe de ${user.name || "amis"}`,
      seats,
      unitPrice: tt.price,
      members: [],
      expiresAt: new Date(expires).toISOString(),
      createdAt: this.iso(),
    });
    return this.groupView(g.code, user.id);
  }

  groupView(code: string, userId: string | null) {
    const g = this.db.groups.find((x) => x.code === String(code).toUpperCase());
    if (!g) throw new ApiError(404, "Groupe introuvable");
    const e = this.db.events.get(g.eventId);
    const tt = e?.ticketTypes.find((t) => t.id === g.ticketTypeId);
    const owner = this.db.users.get(g.ownerId);
    return {
      code: g.code,
      name: g.name,
      event: e ? this.toCard(e) : null,
      ticketTypeId: g.ticketTypeId,
      ticketTypeName: tt?.name ?? "Billet",
      unitPrice: g.unitPrice,
      seats: g.seats,
      paid: g.members.length,
      members: g.members.map((m) => this.db.users.get(m.userId)?.name?.split(" ")[0] || "Membre"),
      owner: owner?.name || "Organisateur du groupe",
      expiresAt: g.expiresAt,
      expired: new Date(g.expiresAt) <= this.now(),
      full: g.members.length >= g.seats,
      mine: !!userId && g.members.some((m) => m.userId === userId),
      isOwner: userId === g.ownerId,
    };
  }

  // ---------- Revente officielle à prix plafonné ----------

  /** Remettre son billet en vente : au prix payé au maximum, avant le premier scan. */
  listResale(userId: string, orderId: string, input: { phone: string; network: PayoutNetwork; price?: number }) {
    const user = this.requireUser(userId);
    const o = this.db.orders.get(orderId);
    if (!o || o.userId !== user.id) throw new ApiError(404, "Billet introuvable");
    if (o.status !== "paid" || o.unitPrice <= 0) throw new ApiError(400, "Seuls les billets payés peuvent être revendus");
    if (o.scannedCount > 0) throw new ApiError(400, "Billet déjà utilisé à l'entrée");
    const e = this.db.events.get(o.eventId);
    if (!e || !this.isUpcoming(e) || e.cancelledAt) throw new ApiError(400, "Cet événement n'est plus en vente");
    if (this.db.resales.some((r) => r.orderId === o.id && r.status === "listed")) throw new ApiError(400, "Ce billet est déjà en revente");
    const cap = o.unitPrice * o.qty;
    const price = input.price ? Math.round(Number(input.price)) : cap;
    if (!(price >= 100 && price <= cap)) throw new ApiError(400, `Prix de revente entre 100 et ${cap.toLocaleString("fr-FR")} FCFA (jamais plus cher que le prix officiel)`);
    const local = this.localPhone(input.phone);
    if (!/^[79]\d{7}$/.test(local)) throw new ApiError(400, "Numéro Mobile Money togolais invalide (8 chiffres, ex. 90 12 34 56)");
    if (!["moov", "togocel", "mixx"].includes(input.network)) throw new ApiError(400, "Réseau inconnu");
    this.db.resales.insert({ id: newId("rsl"), orderId: o.id, sellerId: user.id, eventId: e.id, ticketTypeName: o.ticketTypeName, qty: o.qty, price, phone: local, network: input.network, status: "listed", buyerId: null, newOrderId: null, createdAt: this.iso(), soldAt: null });
    return this.myTickets(user.id);
  }

  cancelResale(userId: string, resaleId: string) {
    const user = this.requireUser(userId);
    const r = this.db.resales.get(resaleId);
    if (!r || r.sellerId !== user.id) throw new ApiError(404, "Revente introuvable");
    if (r.status !== "listed") throw new ApiError(400, "Ce billet est déjà vendu");
    if (this.resaleLocked(r.id)) throw new ApiError(400, "Un acheteur est en train de payer : réessayez dans 30 minutes");
    this.db.resales.update(r.id, { status: "cancelled" });
    return this.myTickets(user.id);
  }

  private resaleLocked(resaleId: string) {
    const since = this.now().getTime() - 30 * 60_000;
    return this.db.intents.some((i) => i.action.kind === "resale" && i.action.resaleId === resaleId && (i.status === "created" || i.status === "pending") && new Date(i.createdAt).getTime() > since);
  }

  /** Billets en revente pour un événement (prix officiel au plus). */
  eventResales(idOrSlug: string, userId: string | null) {
    const e = this.findEvent(idOrSlug);
    if (!this.isLive(e)) return [];
    const eventId = e.id;
    return this.db.resales
      .filter((r) => r.eventId === eventId && r.status === "listed" && !this.resaleLocked(r.id))
      .sort((a, b) => a.price - b.price)
      .map((r) => ({ id: r.id, ticketTypeName: r.ticketTypeName, qty: r.qty, price: r.price, mine: r.sellerId === userId }));
  }

  /** Acheter un billet revendu : l'ancien QR est invalidé, l'acheteur reçoit un billet neuf, le vendeur est payé. */
  buyResale(userId: string, resaleId: string, input: { method: PayMethod }, settle?: PaymentIntent | null): Order {
    const user = this.requireUser(userId);
    const r = this.db.resales.get(resaleId);
    if (!r) throw new ApiError(404, "Billet introuvable");
    if (r.status !== "listed") throw new ApiError(400, "Ce billet vient d'être vendu");
    if (!settle && r.sellerId === user.id) throw new ApiError(400, "C'est votre propre billet");
    const e = this.db.events.get(r.eventId);
    if (!e || e.cancelledAt || (!settle && !this.isUpcoming(e))) throw new ApiError(400, "Cet événement n'est plus en vente");
    const old = this.db.orders.get(r.orderId);
    if (!old || old.status !== "paid" || old.scannedCount > 0) {
      this.db.resales.update(r.id, { status: "cancelled" });
      throw new ApiError(400, "Ce billet n'est plus disponible");
    }
    if (this.needsCheckout(r.price, settle)) {
      if (this.resaleLocked(r.id)) throw new ApiError(400, "Quelqu'un est en train d'acheter ce billet. Réessayez dans quelques minutes.");
      return this.openIntent(user.id, { kind: "resale", resaleId: r.id }, r.price, e.id, `Revente · ${r.qty} × ${r.ticketTypeName} · ${e.title}`) as unknown as Order;
    }
    this.db.orders.update(old.id, { status: "resold" });
    const order = this.db.orders.insert({
      id: newId("ord"),
      eventId: e.id,
      userId: user.id,
      ticketTypeId: old.ticketTypeId,
      ticketTypeName: old.ticketTypeName,
      qty: old.qty,
      unitPrice: Math.round(r.price / old.qty),
      fee: 0,
      total: r.price,
      method: "online",
      status: "paid",
      code: randomCode(10),
      secret: randomCode(24),
      scannedCount: 0,
      createdAt: this.iso(),
    });
    this.db.resales.update(r.id, { status: "sold", buyerId: user.id, newOrderId: order.id, soldAt: this.iso() });
    const fee = Math.round(r.price * PRICING.resaleCommission);
    this.recordPayment({ userId: user.id, kind: "ticket", refId: order.id, eventId: e.id, amount: r.price, platformFee: fee, method: "online", intentId: settle?.id ?? null, organizerShare: 0, organizerId: null });
    if (settle) this.db.payouts.insert({ id: newId("rvt"), userId: r.sellerId, eventId: e.id, intentIds: [settle.id], amount: r.price - fee, phone: r.phone, network: r.network, status: "queued", kind: "resale", orderId: old.id, gatewayId: null, attempts: 0, error: null, createdAt: this.iso(), updatedAt: this.iso() });
    this.notify(r.sellerId, "Votre billet est revendu", `${(r.price - fee).toLocaleString("fr-FR")} FCFA partent sur votre Mobile Money ${r.phone}. L'ancien QR n'est plus valable.`, "/billets");
    this.reminders.add(e, { userId: user.id, subId: null }, "ticket");
    return order;
  }

  myTickets(userId: string) {
    const user = this.requireUser(userId);
    return this.db.orders
      .filter((o) => o.userId === user.id && (o.status === "paid" || o.status === "reserved"))
      // Anciens billets : on leur donne un secret de QR dynamique.
      .map((o) => (o.secret ? o : this.db.orders.update(o.id, { secret: randomCode(24) })))
      .map((o) => {
        const e = this.db.events.get(o.eventId);
        const rs = this.db.resales.find((r) => r.orderId === o.id && r.status === "listed");
        return { ...o, event: e ? this.toCard(e) : null, resale: rs ? { id: rs.id, price: rs.price } : null };
      })
      .sort((a, b) => (a.event?.startsAt ?? "").localeCompare(b.event?.startsAt ?? ""));
  }

  getTicket(userId: string, orderId: string) {
    const user = this.requireUser(userId);
    const o = this.db.orders.get(orderId);
    if (!o || (o.userId !== user.id && user.role !== "admin")) throw new ApiError(404, "Billet introuvable");
    const e = this.db.events.get(o.eventId);
    const rs = this.db.resales.find((r) => r.orderId === o.id && r.status === "listed");
    return { ...o, event: e ? this.toCard(e) : null, holder: user.name || user.email, resale: rs ? { id: rs.id, price: rs.price } : null };
  }

  scanTicket(userId: string, rawCode: string, eventId?: string) {
    const user = this.requireUser(userId);
    const parsed = parseQr(rawCode);
    const code = parsed.code;
    const o = this.db.orders.find((x) => x.code === code);
    if (!o) return { ok: false as const, reason: "Billet inconnu" };
    const e = this.db.events.get(o.eventId);
    if (!e || !this.team.access(e, user).scan) return { ok: false as const, reason: "Ce billet n'est pas pour vos événements" };
    if (eventId && e.id !== eventId) return { ok: false as const, reason: `Billet pour un autre événement : ${e.title}` };
    if (o.status !== "paid" && o.status !== "reserved") return { ok: false as const, reason: o.status === ("resold" as string) ? "Billet revendu : l'ancien QR n'est plus valable" : "Billet non valable" };
    // QR dynamique : signature et fraîcheur (une capture d'écran expire en une minute).
    let warning: string | null = null;
    if (parsed.kind === "dynamic") {
      const check = o.secret ? checkDynamicQr(parsed, o.secret, this.now().getTime()) : "forged";
      if (check === "forged") return { ok: false as const, reason: "Faux QR code" };
      if (check === "expired") return { ok: false as const, reason: "QR expiré : c'est une capture d'écran. Demandez le téléphone du détenteur." };
    } else if (o.secret) {
      warning = "Code saisi à la main : vérifiez la pièce d'identité du détenteur";
    }
    if (o.scannedCount >= o.qty) return { ok: false as const, reason: "Billet déjà utilisé", order: o };
    const next = this.db.orders.update(o.id, { scannedCount: o.scannedCount + 1 });
    const holder = this.db.users.get(o.userId);
    return { ok: true as const, order: { ...next, secret: undefined }, holder: holder?.name || holder?.email || "", amountDue: next.status === "reserved" ? next.total : 0, remaining: next.qty - next.scannedCount, eventTitle: e.title, warning };
  }

  /**
   * Scanner hors connexion : liste des billets de l'événement à garder sur le téléphone du contrôleur.
   * Réservé aux personnes qui ont le droit de scanner cet événement.
   */
  scanManifest(userId: string, eventId: string) {
    const user = this.requireUser(userId);
    const e = this.db.events.get(eventId);
    if (!e) throw new ApiError(404, "Événement introuvable");
    if (!this.team.access(e, user).scan) throw new ApiError(403, "Vous ne pouvez pas scanner cet événement");
    const tickets = this.db.orders
      .filter((o) => o.eventId === e.id && (o.status === "paid" || o.status === "reserved"))
      .map((o) => {
        const secret = o.secret ?? this.db.orders.update(o.id, { secret: randomCode(24) }).secret!;
        const holder = this.db.users.get(o.userId);
        return { code: o.code, secret, qty: o.qty, scannedCount: o.scannedCount, amountDue: o.status === "reserved" ? o.total : 0, ticketTypeName: o.ticketTypeName, holder: holder?.name || holder?.email || "" };
      });
    return { eventId: e.id, eventTitle: e.title, generatedAt: this.iso(), tickets };
  }

  /** Envoie les entrées validées hors connexion. Les doublons (même billet passé deux fois) sont signalés. */
  scanSync(userId: string, eventId: string, scans: { code: string; at?: string }[]) {
    const user = this.requireUser(userId);
    const e = this.db.events.get(eventId);
    if (!e) throw new ApiError(404, "Événement introuvable");
    if (!this.team.access(e, user).scan) throw new ApiError(403, "Vous ne pouvez pas scanner cet événement");
    let accepted = 0;
    const conflicts: { code: string; reason: string }[] = [];
    for (const sc of (Array.isArray(scans) ? scans : []).slice(0, 5000)) {
      const code = String(sc?.code ?? "").toUpperCase();
      const o = this.db.orders.find((x) => x.code === code && x.eventId === e.id);
      if (!o || (o.status !== "paid" && o.status !== "reserved")) {
        conflicts.push({ code, reason: "Billet non valable" });
        continue;
      }
      if (o.scannedCount >= o.qty) {
        conflicts.push({ code, reason: "Déjà utilisé (passé deux fois, peut-être à une autre porte)" });
        continue;
      }
      this.db.orders.update(o.id, { scannedCount: o.scannedCount + 1 });
      accepted++;
    }
    return { accepted, conflicts };
  }

  // =====================================================================
  // Votes
  // =====================================================================
  contestView(contestId: string, userId: string | null): ContestView {
    const c = this.db.contests.get(contestId);
    if (!c) throw new ApiError(404, "Concours introuvable");
    const user = userId ? (this.db.users.get(userId) ?? null) : null;
    const e = this.gateEvent(c.eventId, user);
    const manage = !!e && this.canManage(e, user);
    const now = this.now();
    const isOpen = new Date(c.opensAt) <= now && new Date(c.closesAt) > now;
    const closed = new Date(c.closesAt) <= now;
    const totals = c.candidates.map((x) => x.freeVotes + x.paidVotes);
    const maxVotes = Math.max(1, ...totals);
    const w = c.juryWeight / 100;
    const scored = c.candidates.map((x) => {
      const votes = x.freeVotes + x.paidVotes;
      const score = w > 0 ? Math.round(((1 - w) * (votes / maxVotes) * 100 + w * (x.juryScore ?? 0)) * 10) / 10 : votes;
      return { x, votes, score };
    });
    const order = [...scored].sort((a, b) => b.score - a.score || a.x.number - b.x.number);
    const rankOf = new Map(order.map((s, i) => [s.x.id, i + 1]));
    const reveal = manage || closed || c.results === "live";
    const candidates: CandidateView[] = scored.map(({ x, votes, score }) => {
      const rank = rankOf.get(x.id)!;
      const show = reveal || (c.results === "top3" && rank <= 3);
      return { ...x, freeVotes: show ? x.freeVotes : 0, paidVotes: show ? x.paidVotes : 0, votes: show ? votes : null, rank: show ? rank : null, score: show ? score : null };
    });
    candidates.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || a.number - b.number);
    let freeVoteAvailable = false;
    if (user && c.mode !== "paid" && isOpen) {
      const today = now.toISOString().slice(0, 10);
      freeVoteAvailable = !this.db.votes.some((v) => v.contestId === c.id && v.userId === user.id && v.kind === "free" && v.createdAt.slice(0, 10) === today);
    }
    return {
      ...c,
      candidates,
      totalVotes: reveal ? totals.reduce((s, n) => s + n, 0) : null,
      isOpen,
      freeVoteAvailable,
      eventTitle: e?.title ?? "",
      isOrganizer: manage,
    };
  }

  contestForEvent(idOrSlug: string, userId: string | null) {
    const e = this.findEvent(idOrSlug);
    if (!e.contestId) throw new ApiError(404, "Pas de vote pour cet événement");
    return this.contestView(e.contestId, userId);
  }

  vote(userId: string, contestId: string, input: { candidateId: string; pack: "free" | "1" | "10" | "50"; method?: PayMethod }, settle?: PaymentIntent | null) {
    const user = this.requireUser(userId);
    const c = this.db.contests.get(contestId);
    if (!c) throw new ApiError(404, "Concours introuvable");
    // Un paiement déjà encaissé (settle) est toujours honoré ; sinon l'événement doit être en ligne.
    if (!settle) this.gateEvent(c.eventId, user, true);
    const now = this.now();
    if (!settle && new Date(c.opensAt) > now) throw new ApiError(400, "Le vote n'est pas encore ouvert");
    if (!settle && new Date(c.closesAt) <= now) throw new ApiError(400, "Le vote est clôturé");
    const cand = c.candidates.find((x) => x.id === input.candidateId);
    if (!cand) throw new ApiError(404, "Candidat introuvable");
    let count = 1;
    let amount = 0;
    let kind: "free" | "paid" = "free";
    if (input.pack === "free") {
      if (c.mode === "paid") throw new ApiError(400, "Ce concours n'a que des votes payants");
      const today = now.toISOString().slice(0, 10);
      if (this.db.votes.some((v) => v.contestId === c.id && v.userId === user.id && v.kind === "free" && v.createdAt.slice(0, 10) === today))
        throw new ApiError(400, "Vous avez déjà utilisé votre vote gratuit aujourd'hui");
    } else {
      if (c.mode === "free") throw new ApiError(400, "Ce concours n'a que des votes gratuits");
      this.requirePayments("Votes payants");
      if (!this.opts.checkout && (!input.method || input.method === "cash")) throw new ApiError(400, "Choisissez un moyen de paiement");
      const p = votePackPrice(c.votePrice, input.pack);
      count = p.votes;
      amount = p.price;
      kind = "paid";
      if (this.needsCheckout(amount, settle)) {
        const ev = this.db.events.get(c.eventId);
        if (ev) this.assertCanSell(ev);
        return this.openIntent(user.id, { kind: "vote", contestId: c.id, candidateId: cand.id, pack: input.pack }, amount, c.eventId, `${count} vote${count > 1 ? "s" : ""} pour ${cand.name}${ev ? ` · ${ev.title}` : ""}`) as never;
      }
    }
    const rec = this.db.votes.insert({ id: newId("vot"), contestId: c.id, candidateId: cand.id, userId: user.id, count, amount, kind, method: kind === "paid" ? (settle ? "online" : input.method!) : null, createdAt: this.iso() });
    this.db.contests.update(c.id, (cc) => ({
      ...cc,
      candidates: cc.candidates.map((x) => (x.id === cand.id ? { ...x, freeVotes: x.freeVotes + (kind === "free" ? count : 0), paidVotes: x.paidVotes + (kind === "paid" ? count : 0) } : x)),
    }));
    if (amount > 0) this.pay(user.id, "vote", rec.id, c.eventId, amount, Math.round(amount * PRICING.voteCommission), input.method ?? "online", settle, settle ? (this.db.events.get(c.eventId)?.organizerId ?? null) : null);
    return { vote: rec, contest: this.contestView(c.id, user.id) };
  }

  setJuryScores(userId: string, contestId: string, scores: Record<string, number>) {
    const user = this.requireUser(userId);
    const c = this.db.contests.get(contestId);
    if (!c) throw new ApiError(404, "Concours introuvable");
    const e = this.db.events.get(c.eventId);
    if (!e || !this.canManage(e, user)) throw new ApiError(403, "Réservé à l'organisateur");
    this.db.contests.update(c.id, (cc) => ({ ...cc, candidates: cc.candidates.map((x) => (x.id in scores ? { ...x, juryScore: Math.min(100, Math.max(0, scores[x.id])) } : x)) }));
    return this.contestView(c.id, user.id);
  }

  addCandidate(userId: string, contestId: string, input: { name: string; bio?: string; photo?: string | null }) {
    const user = this.requireUser(userId);
    const c = this.db.contests.get(contestId);
    if (!c) throw new ApiError(404, "Concours introuvable");
    const e = this.db.events.get(c.eventId);
    if (!e || !this.canManage(e, user)) throw new ApiError(403, "Réservé à l'organisateur");
    if (!input.name?.trim()) throw new ApiError(400, "Nom du candidat requis");
    const number = Math.max(0, ...c.candidates.map((x) => x.number)) + 1;
    this.db.contests.update(c.id, (cc) => ({ ...cc, candidates: [...cc.candidates, { id: newId("cdt"), number, name: input.name.trim(), bio: input.bio?.trim() ?? "", photo: input.photo ?? null, freeVotes: 0, paidVotes: 0, juryScore: null }] }));
    return this.contestView(c.id, user.id);
  }

  certificate(contestId: string) {
    const c = this.db.contests.get(contestId);
    if (!c) throw new ApiError(404, "Concours introuvable");
    const votes = this.db.votes.filter((v) => v.contestId === c.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const voters = new Set(votes.map((v) => v.userId));
    const free = votes.filter((v) => v.kind === "free").reduce((s, v) => s + v.count, 0);
    const paid = votes.filter((v) => v.kind === "paid").reduce((s, v) => s + v.count, 0);
    const seeded = c.candidates.reduce((s, x) => s + x.freeVotes + x.paidVotes, 0) - free - paid;
    const closed = new Date(c.closesAt) <= this.now();
    return {
      contestId: c.id,
      title: c.title,
      eventTitle: this.db.events.get(c.eventId)?.title ?? "",
      generatedAt: this.iso(),
      closesAt: c.closesAt,
      closed,
      totalVotes: free + paid + Math.max(0, seeded),
      recordedVotes: free + paid,
      freeVotes: free,
      paidVotes: paid,
      uniqueVoters: voters.size,
      transactions: votes.length,
      fingerprint: fingerprint(votes.map((v) => `${v.id}|${v.candidateId}|${v.count}|${v.createdAt}`).join(";") + `#${c.id}`),
      rules: [
        "Un compte par adresse e-mail vérifiée par code.",
        c.mode !== "paid" ? "Un vote gratuit par compte et par jour." : "Votes uniquement payants, enregistrés avec leur transaction.",
        "Aucun vote accepté après la clôture.",
        c.juryWeight > 0 ? `Résultat final : ${100 - c.juryWeight} % public, ${c.juryWeight} % jury.` : "Résultat final : 100 % vote du public.",
      ],
    };
  }

  // =====================================================================
  // Cagnottes
  // =====================================================================
  getCagnotte(cagnotteId: string, userId: string | null, code?: string | null) {
    const cg = this.db.cagnottes.get(cagnotteId);
    if (!cg) throw new ApiError(404, "Cagnotte introuvable");
    const user = userId ? (this.db.users.get(userId) ?? null) : null;
    const e = this.gateEvent(cg.eventId, user);
    if (e && !this.canView(e, user, code)) throw new ApiError(403, "Cagnotte réservée aux invités", { needCode: true, eventId: e.id });
    const manage = !!e && this.canManage(e, user);
    const contributions = this.db.contributions
      .filter((x) => x.cagnotteId === cg.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((x) => ({ id: x.id, name: x.anonymous && !manage ? "Anonyme" : x.name, amount: x.anonymous && !manage ? null : x.amount, message: x.message, createdAt: x.createdAt, anonymous: x.anonymous }));
    return { ...cg, eventTitle: e?.title ?? "", eventId: e?.id ?? null, eventSlug: e?.slug ?? null, theme: e?.theme ?? "or", category: e?.category ?? "autre", contributions, isOrganizer: manage };
  }

  contribute(userId: string, cagnotteId: string, input: { amount: number; message?: string; anonymous?: boolean; method: PayMethod; name?: string; code?: string | null }, settle?: PaymentIntent | null) {
    const user = this.requireUser(userId);
    const cg = this.db.cagnottes.get(cagnotteId);
    if (!cg) throw new ApiError(404, "Cagnotte introuvable");
    const e = settle ? (this.db.events.get(cg.eventId) ?? null) : this.gateEvent(cg.eventId, user, true);
    if (!settle && e && !this.canView(e, user, input.code)) throw new ApiError(403, "Cagnotte réservée aux invités");
    this.requirePayments("Contributions");
    const amount = Math.round(input.amount);
    if (!(amount >= 500)) throw new ApiError(400, "Contribution minimale : 500 FCFA");
    if (input.method === "cash" && !this.opts.checkout) throw new ApiError(400, "Choisissez Mobile Money ou carte");
    if (this.needsCheckout(amount, settle) && e) this.assertCanSell(e);
    if (this.needsCheckout(amount, settle))
      return this.openIntent(user.id, { kind: "contribution", cagnotteId: cg.id, amount, message: input.message, anonymous: input.anonymous, name: input.name, code: input.code ?? null }, amount, cg.eventId, `Contribution à « ${cg.title} »`) as never;
    const c = this.db.contributions.insert({
      id: newId("ctb"),
      cagnotteId: cg.id,
      userId: user.id,
      name: input.name?.trim() || user.name || "Un proche",
      amount,
      message: (input.message ?? "").trim().slice(0, 280),
      anonymous: !!input.anonymous,
      method: settle ? "online" : input.method,
      createdAt: this.iso(),
    });
    const isNewContributor = !this.db.contributions.some((x) => x.cagnotteId === cg.id && x.userId === user.id && x.id !== c.id);
    this.db.cagnottes.update(cg.id, { collected: cg.collected + amount, contributors: cg.contributors + (isNewContributor ? 1 : 0) });
    this.pay(user.id, "contribution", c.id, cg.eventId, amount, Math.round(amount * PRICING.cagnotteCommission), input.method, settle, settle ? (e?.organizerId ?? null) : null);
    return this.getCagnotte(cg.id, user.id, input.code);
  }

  // =====================================================================
  // Photos et Pass ToBe
  // =====================================================================
  listPhotos(idOrSlug: string, userId: string | null, code?: string | null) {
    const user = userId ? (this.db.users.get(userId) ?? null) : null;
    const e = this.gateEvent(this.findEvent(idOrSlug).id, user)!;
    if (!this.canView(e, user, code)) throw new ApiError(403, "Galerie réservée aux invités");
    const hidden = this.db.users.filter((u) => u.neverShow && userFaces(u).length > 0).map((u) => userFaces(u));
    return this.db.photos
      .filter((p) => p.eventId === e.id)
      .filter((p) => !hidden.some((mine) => facesMatch(mine, p.faces)))
      .map((p) => ({ id: p.id, eventId: p.eventId, url: p.url, width: p.width, height: p.height, createdAt: p.createdAt, faceCount: p.faces.length }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  addPhotos(userId: string, idOrSlug: string, photos: { url: string; logoUrl?: string | null; cleanUrl?: string | null; hdUrl?: string | null; width: number; height: number; faces: number[][]; faceMeta?: FaceMeta[] | null }[]) {
    const user = this.requireUser(userId);
    const e = this.findEvent(idOrSlug);
    if (!this.team.access(e, user).photos) throw new ApiError(403, "Seuls l'organisateur et ses photographes peuvent déposer des photos");
    const added: Photo[] = photos.map((p) =>
      this.db.photos.insert({ id: newId("pho"), eventId: e.id, url: p.url, logoUrl: p.logoUrl ?? null, cleanUrl: p.cleanUrl ?? null, hdUrl: p.hdUrl ?? null, width: p.width, height: p.height, ...cleanFaces(p.faces, p.faceMeta), uploadedBy: user.id, createdAt: this.iso() }),
    );
    if (!e.options.gallery) this.db.events.update(e.id, { options: { ...e.options, gallery: true } });
    // Pass ToBe : on prévient automatiquement chaque personne reconnue.
    const notified: string[] = [];
    for (const u of this.db.users.filter((u) => u.passEnabled && userFaces(u).length > 0 && !u.neverShow)) {
      if (!this.canView(e, u)) continue;
      const mine = userFaces(u);
      const n = added.filter((p) => facesMatch(mine, p.faces)).length;
      if (n > 0) {
        const total = this.eventMatch(u, e.id).mine.size;
        this.notify(u.id, `Vous êtes sur ${total} photo${total > 1 ? "s" : ""} de ${e.title}`, `Retrouvez-les dans Mes photos : ${PRICING.photoFreeCount} offertes, toutes dès ${PRICING.photoPrices.plus} F.`, `/photos?event=${e.id}`);
        notified.push(u.id);
      }
    }
    return { added: added.length, notified: notified.length };
  }

  removePhoto(userId: string, photoId: string) {
    const user = this.requireUser(userId);
    const p = this.db.photos.get(photoId);
    if (!p) throw new ApiError(404, "Photo introuvable");
    const e = this.db.events.get(p.eventId);
    const isMe = facesMatch(userFaces(user), p.faces);
    if (!(e && this.team.access(e, user).photos) && !this.team.can(user, "photos.moderate") && !isMe) throw new ApiError(403, "Vous ne pouvez retirer que vos propres photos");
    this.db.photos.remove(p.id);
    return { ok: true };
  }

  /**
   * Inscription du visage. L'application envoie plusieurs captures (face, gauche, droite) :
   * on vérifie qu'elles montrent bien la même personne, puis on garde toutes les empreintes.
   */
  setFace(userId: string, input: number[] | number[][], consent?: unknown) {
    const user = this.requireUser(userId);
    if (consent !== true && consent !== FACE_CONSENT_VERSION) throw new ApiError(400, "Cochez la case d'accord pour activer la reconnaissance de votre visage");
    const samples = (Array.isArray(input?.[0]) ? (input as number[][]) : [input as number[]]).slice(0, 5);
    if (!samples.length || samples.some((d) => !isDescriptor(d))) throw new ApiError(400, "Visage non reconnu, réessayez avec plus de lumière");
    // Chaque capture (profils, tête baissée) est comparée à celle de face : même personne du début à la fin.
    for (let i = 1; i < samples.length; i++)
      if (faceDistance(samples[0], samples[i]) > FACE_CONSISTENCY_MAX)
        throw new ApiError(400, "Les captures ne semblent pas montrer la même personne. Recommencez, seul face à la caméra.");
    const u = this.db.users.update(user.id, { faceDescriptor: meanDescriptor(samples), faceDescriptors: samples, passEnabled: true, neverShow: false, faceConsentAt: this.iso(), faceConsentVersion: FACE_CONSENT_VERSION, faceUsedAt: this.iso() });
    return { user: this.publicUser(u), groups: this.myPhotos(u.id) };
  }

  setPass(userId: string, patch: { passEnabled?: boolean; neverShow?: boolean }) {
    const user = this.requireUser(userId);
    const u = this.db.users.update(user.id, { passEnabled: patch.passEnabled ?? user.passEnabled, neverShow: patch.neverShow ?? user.neverShow });
    return this.publicUser(u);
  }

  clearFace(userId: string) {
    const user = this.requireUser(userId);
    return this.publicUser(this.db.users.update(user.id, { faceDescriptor: null, faceDescriptors: null, passEnabled: false, faceConsentAt: null, faceUsedAt: null }));
  }

  /**
   * Durées de conservation (loi togolaise n° 2019-014 sur les données personnelles) :
   * - empreinte du visage d'un compte : effacée après 12 mois sans utilisation ;
   * - empreintes calculées sur les photos d'un événement : effacées 6 mois après l'événement
   *   (les photos restent visibles, la recherche par visage s'arrête).
   */
  purgeFaceData() {
    const now = this.now().getTime();
    let accounts = 0;
    let photos = 0;
    for (const u of this.db.users.filter((x) => !!x.faceDescriptor || !!x.faceDescriptors?.length)) {
      const last = new Date(u.faceUsedAt ?? u.faceConsentAt ?? u.createdAt).getTime();
      if (now - last > FACE_ACCOUNT_RETENTION_MS) {
        this.db.users.update(u.id, { faceDescriptor: null, faceDescriptors: null, passEnabled: false, faceUsedAt: null });
        this.notify(u.id, "Empreinte du visage effacée", "Vous n'avez pas utilisé le Pass ToBe depuis 12 mois : nous avons effacé l'empreinte de votre visage. Réactivez-le quand vous voulez.", "/photos");
        accounts++;
      }
    }
    const old = new Set(this.db.events.filter((e) => now - new Date(e.endsAt ?? e.startsAt).getTime() > FACE_PHOTO_RETENTION_MS).map((e) => e.id));
    for (const p of this.db.photos.filter((x) => old.has(x.eventId) && x.faces.length > 0)) {
      this.db.photos.update(p.id, { faces: [] });
      photos++;
    }
    // Visages des proches (pack Full HD) : effacés avec ceux des photos.
    for (const pass of this.db.photoPasses.filter((x) => old.has(x.eventId) && x.guests.some((g) => g.descriptors.length > 0)))
      this.db.photoPasses.update(pass.id, { guests: pass.guests.map((g) => ({ ...g, descriptors: [], status: g.status === "active" ? "revoked" : g.status })) });
    return { accounts, photos };
  }

  myPhotos(userId: string) {
    const user = this.requireUser(userId);
    const mine = userFaces(user);
    if (!mine.length) return [];
    // Empreinte utilisée : le compteur des 12 mois repart (une fois par jour au plus).
    if (!user.faceUsedAt || this.now().getTime() - new Date(user.faceUsedAt).getTime() > 86400_000) this.db.users.update(user.id, { faceUsedAt: this.iso() });
    return this.decorate(this.matchPhotos(mine, user), user);
  }

  /** Recherche ponctuelle par selfie, sans enregistrer le visage. */
  matchSelfie(userId: string | null, input: number[] | number[][], eventId?: string) {
    const user = userId ? (this.db.users.get(userId) ?? null) : null;
    const samples = (Array.isArray(input?.[0]) ? (input as number[][]) : [input as number[]]).slice(0, 5);
    if (!samples.length || samples.some((d) => !isDescriptor(d))) throw new ApiError(400, "Visage non reconnu");
    const groups = this.matchPhotos(samples, user, eventId);
    // Connecté : ces photos pourront être débloquées pendant 24 h sans enregistrer le visage.
    if (user) this.db.users.update(user.id, { selfieMatches: { ids: groups.flatMap((g) => g.photos.map((p) => p.id)).slice(0, 500), at: this.iso() }, selfieSamples: samples });
    return user ? this.decorate(groups, this.db.users.get(user.id)!) : groups;
  }

  /** Réponses « C'est moi / Pas moi » de l'utilisateur pour un événement. */
  private claimSets(userId: string | null, eventPhotos: Set<string>) {
    const confirmed = new Set<string>();
    const rejected = new Set<string>();
    if (userId)
      for (const c of this.db.photoClaims.filter((x) => x.userId === userId && eventPhotos.has(x.photoId))) (c.ok ? confirmed : rejected).add(`${c.photoId}:${c.face}`);
    return { confirmed, rejected };
  }

  /** « Retrouve-moi » sur un événement : visage, look de la soirée, tenue (voir faceMatch.ts). */
  private eventMatch(user: User | null, eventId: string, samples?: number[][]) {
    const photos = this.db.photos.filter((p) => p.eventId === eventId);
    const s = samples ?? (user ? userFaces(user) : []);
    const { confirmed, rejected } = this.claimSets(user?.id ?? null, new Set(photos.map((p) => p.id)));
    if (!s.length && !confirmed.size) return { mine: new Map(), suggestions: [] } as EventMatch;
    return matchEventFaces({ samples: s, photos, confirmed, rejected });
  }

  private matchPhotos(mine: number[][], user: User | null, eventId?: string) {
    type Item = Pick<Photo, "id" | "eventId" | "url" | "width" | "height" | "uploadedBy" | "createdAt"> & { distance: number; via?: MatchVia; guest?: string };
    const groups: { event: EventCard; photos: Item[]; suggestions: { photoId: string; face: number; url: string; width: number; height: number; box: FaceMeta["box"] | null; outfit: number | null }[] }[] = [];
    const eventIds = new Set(this.db.photos.all().map((p) => p.eventId));
    for (const id of eventIds) {
      if (eventId && id !== eventId) continue;
      const e = this.db.events.get(id);
      if (!e || !this.canView(e, user)) continue;
      const m = this.eventMatch(user, id, mine);
      if (!m.mine.size && !m.suggestions.length) continue;
      const photos: Item[] = [];
      for (const [pid, r] of m.mine) {
        const p = this.db.photos.get(pid)!;
        photos.push({ id: p.id, eventId: p.eventId, url: p.url, width: p.width, height: p.height, uploadedBy: p.uploadedBy, createdAt: p.createdAt, distance: r.distance, via: r.via });
      }
      photos.sort((a, b) => a.distance - b.distance);
      const suggestions = user
        ? m.suggestions.map((sg) => {
            const p = this.db.photos.get(sg.photoId)!;
            return { photoId: p.id, face: sg.face, url: p.url, width: p.width, height: p.height, box: sg.box, outfit: sg.outfit };
          })
        : [];
      groups.push({ event: this.toCard(e), photos, suggestions });
    }
    return groups.filter((g) => g.photos.length || g.suggestions.length).sort((a, b) => b.event.startsAt.localeCompare(a.event.startsAt));
  }

  /**
   * « C'est moi » / « Pas moi » sur une suggestion. Confirmer ajoute la photo, et le Pass apprend :
   * ce visage (tête baissée, profil, autre lumière) rejoint les empreintes de la personne.
   */
  claimPhoto(userId: string, photoId: string, face: number, ok: boolean) {
    const user = this.requireUser(userId);
    const p = this.db.photos.get(photoId);
    if (!p || !p.faces[face]) throw new ApiError(404, "Photo introuvable");
    const e = this.db.events.get(p.eventId);
    if (!e || !this.canView(e, user)) throw new ApiError(404, "Photo introuvable");
    if (ok) {
      const m = this.eventMatch(user, e.id, this.searchSamples(user));
      if (!m.suggestions.some((s) => s.photoId === p.id && s.face === face)) throw new ApiError(400, "Cette photo ne vous est pas proposée");
    }
    for (const c of this.db.photoClaims.filter((x) => x.userId === user.id && x.photoId === p.id && x.face === face)) this.db.photoClaims.remove(c.id);
    this.db.photoClaims.insert({ id: newId("clm"), userId: user.id, photoId: p.id, face, ok: !!ok, createdAt: this.iso() });
    if (ok && user.faceDescriptors?.length) {
      const learned = p.faces[face];
      const mean = meanDescriptor(user.faceDescriptors);
      // On n'apprend que si ce visage reste cohérent avec la personne.
      if (faceDistance(mean, learned) < 0.7) {
        const kept = [...user.faceDescriptors.slice(0, 4), ...user.faceDescriptors.slice(4).slice(-6), learned];
        this.db.users.update(user.id, { faceDescriptors: kept, faceDescriptor: meanDescriptor(kept) });
      }
    }
    return { ok: true };
  }

  /** Empreintes à utiliser pour chercher : le Pass, ou la dernière recherche par selfie. */
  private searchSamples(user: User) {
    return userFaces(user).length ? userFaces(user) : (user.selfieSamples ?? []);
  }

  // =====================================================================
  // Formules photos par événement
  // =====================================================================
  private static TIER_RANK: Record<PhotoTier, number> = { free: 0, plus: 1, clean: 2, hd: 3 };

  private photoPass(userId: string, eventId: string) {
    return this.db.photoPasses.find((p) => p.userId === userId && p.eventId === eventId);
  }

  /** Formule de l'utilisateur pour un événement (l'ancien Pass Premium vaut « sans logo »). */
  photoTier(user: User, eventId: string): PhotoTier {
    const t = this.photoPass(user.id, eventId)?.tier ?? "free";
    const premium = !!user.premiumUntil && new Date(user.premiumUntil) > this.now();
    return premium && ToBeService.TIER_RANK[t] < 2 ? "clean" : t;
  }

  /** Les photos où l'utilisateur apparaît (son visage, sa dernière recherche par selfie, ou un proche ajouté). */
  private photoIsMine(user: User, p: Photo): string | true | false {
    if (this.eventMatch(user, p.eventId).mine.has(p.id)) return true;
    const s = user.selfieMatches;
    if (s && this.now().getTime() - new Date(s.at).getTime() < 86400_000 && s.ids.includes(p.id)) return true;
    const pass = this.photoPass(user.id, p.eventId);
    if (pass?.tier === "hd") for (const g of pass.guests) if (g.status === "active" && g.descriptors.length && this.eventMatch(null, p.eventId, g.descriptors).mine.has(p.id)) return g.name;
    return false;
  }

  /** Ajoute à chaque événement la formule, les photos des proches (Full HD) et ce qui est débloqué. */
  private decorate(groups: ReturnType<ToBeService["matchPhotos"]>, user: User) {
    // Photos des proches ajoutés (formule Full HD).
    for (const pass of this.db.photoPasses.filter((p) => p.userId === user.id && p.tier === "hd" && p.guests.some((g) => g.status === "active"))) {
      const e = this.db.events.get(pass.eventId);
      if (!e) continue;
      let g = groups.find((x) => x.event.id === e.id);
      const guestHits = pass.guests.filter((gu) => gu.status === "active" && gu.descriptors.length).map((gu) => ({ name: gu.name, mine: this.eventMatch(null, e.id, gu.descriptors).mine }));
      for (const ph of this.db.photos.filter((x) => x.eventId === e.id)) {
        if (g?.photos.some((x) => x.id === ph.id)) continue;
        const who = guestHits.find((gu) => gu.mine.has(ph.id));
        if (!who) continue;
        if (!g) {
          g = { event: this.toCard(e), photos: [], suggestions: [] };
          groups.push(g);
        }
        g.photos.push({ id: ph.id, eventId: ph.eventId, url: ph.url, width: ph.width, height: ph.height, uploadedBy: ph.uploadedBy, createdAt: ph.createdAt, distance: 0, guest: who.name });
      }
    }
    return groups
      .sort((a, b) => b.event.startsAt.localeCompare(a.event.startsAt))
      .map((g) => {
        const tier = this.photoTier(user, g.event.id);
        const pass = this.photoPass(user.id, g.event.id);
        const picks = pass?.picks ?? [];
        return {
          ...g,
          tier,
          paid: pass?.paid ?? 0,
          freeLeft: Math.max(0, PRICING.photoFreeCount - picks.length),
          guests: (pass?.guests ?? []).filter((x) => x.status !== "revoked").map((x) => ({ id: x.id, name: x.name, kind: x.kind, status: x.status, code: x.status === "pending" ? x.code : null })),
          photos: g.photos.map((p) => ({ ...p, unlocked: tier !== "free" || picks.includes(p.id) })),
        };
      });
  }

  /** Téléchargement : la version permise par la formule (3 photos offertes avec logo, puis payant). */
  downloadPhoto(userId: string, photoId: string) {
    const user = this.requireUser(userId);
    const p = this.db.photos.get(photoId);
    if (!p) throw new ApiError(404, "Photo introuvable");
    const e = this.db.events.get(p.eventId);
    const staff = !!e && this.team.access(e, user).photos;
    if (!staff && !this.photoIsMine(user, p)) throw new ApiError(403, "Vous n'apparaissez pas sur cette photo");
    // Anciennes photos (une seule version) : comme avant.
    if (!p.logoUrl) return { url: p.url, tier: "legacy" as const };
    if (staff) return { url: p.hdUrl ?? p.cleanUrl ?? p.logoUrl, tier: "hd" as PhotoTier };
    const tier = this.photoTier(user, p.eventId);
    if (tier === "free") {
      let pass = this.photoPass(user.id, p.eventId);
      if (!pass?.picks.includes(p.id)) {
        if ((pass?.picks.length ?? 0) >= PRICING.photoFreeCount)
          throw new ApiError(402, `Vos ${PRICING.photoFreeCount} photos offertes sont utilisées. Débloquez toutes vos photos de cet événement dès ${PRICING.photoPrices.plus} F.`);
        pass = pass
          ? this.db.photoPasses.update(pass.id, { picks: [...pass.picks, p.id], updatedAt: this.iso() })
          : this.db.photoPasses.insert({ id: newId("pps"), userId: user.id, eventId: p.eventId, tier: "free", paid: 0, picks: [p.id], guests: [], createdAt: this.iso(), updatedAt: this.iso() });
      }
      return { url: p.logoUrl, tier, freeLeft: PRICING.photoFreeCount - pass.picks.length };
    }
    const url = tier === "plus" ? p.logoUrl : tier === "clean" ? (p.cleanUrl ?? p.logoUrl) : (p.hdUrl ?? p.cleanUrl ?? p.logoUrl);
    return { url, tier };
  }

  /** Acheter (ou monter de) formule photo pour un événement : on ne paie que la différence. 70 % pour l'organisateur. */
  buyPhotoPass(userId: string, idOrSlug: string, tier: PhotoTier, method: PayMethod, settle?: PaymentIntent | null) {
    const user = this.requireUser(userId);
    const e = this.findEvent(idOrSlug);
    if (!["plus", "clean", "hd"].includes(tier)) throw new ApiError(400, "Formule inconnue");
    if (!settle) this.requirePayments("Formules photos");
    const pass = this.photoPass(user.id, e.id);
    const current = pass?.tier ?? "free";
    if (!settle && ToBeService.TIER_RANK[current] >= ToBeService.TIER_RANK[tier]) throw new ApiError(400, "Vous avez déjà cette formule (ou mieux) pour cet événement");
    const price = Math.max(0, PRICING.photoPrices[tier] - (pass?.paid ?? 0));
    if (price <= 0 && !settle) throw new ApiError(400, "Rien à payer");
    if (this.needsCheckout(price, settle)) {
      const label = { plus: "Toutes mes photos", clean: "Toutes mes photos sans logo", hd: "Pack Full HD + 3 visages" }[tier as "plus" | "clean" | "hd"];
      return this.openIntent(user.id, { kind: "photos", eventId: e.id, tier }, price, e.id, `${label} · ${e.title}`) as never;
    }
    const amount = settle ? settle.amount : price;
    const saved = pass
      ? this.db.photoPasses.update(pass.id, (p) => ({ ...p, tier: ToBeService.TIER_RANK[tier] > ToBeService.TIER_RANK[p.tier] ? tier : p.tier, paid: p.paid + amount, updatedAt: this.iso() }))
      : this.db.photoPasses.insert({ id: newId("pps"), userId: user.id, eventId: e.id, tier, paid: amount, picks: [], guests: [], createdAt: this.iso(), updatedAt: this.iso() });
    if (amount > 0) this.pay(user.id, "photos", saved.id, e.id, amount, Math.round(amount * PRICING.photoCommission), method, settle, settle ? e.organizerId : null);
    return { tier: saved.tier, paid: saved.paid };
  }

  // ---------- Formule Full HD : 3 visages de proches, avec leur accord ----------

  private hdPass(userId: string, eventId: string) {
    const pass = this.photoPass(userId, eventId);
    if (pass?.tier !== "hd") throw new ApiError(400, `L'ajout de visages fait partie du pack Full HD (${PRICING.photoPrices.hd} F)`);
    return pass;
  }

  /**
   * Adulte : on crée un lien ; la personne donne elle-même son accord et son visage.
   * Enfant : le parent capture le visage et atteste avoir l'autorité parentale.
   */
  addPhotoGuest(userId: string, idOrSlug: string, input: { name: string; kind: "adult" | "child"; descriptors?: number[][]; attest?: boolean }) {
    const user = this.requireUser(userId);
    const e = this.findEvent(idOrSlug);
    const pass = this.hdPass(user.id, e.id);
    if (pass.guests.filter((g) => g.status !== "revoked").length >= PRICING.photoGuestsMax) throw new ApiError(400, `${PRICING.photoGuestsMax} visages au maximum`);
    const name = String(input.name ?? "").trim().slice(0, 40);
    if (name.length < 2) throw new ApiError(400, "Indiquez le prénom de la personne");
    const kind = input.kind === "child" ? "child" : "adult";
    let descriptors: number[][] = [];
    if (kind === "child") {
      if (input.attest !== true) throw new ApiError(400, "Confirmez que vous êtes le parent ou le tuteur légal de l'enfant");
      descriptors = this.checkSamples(input.descriptors);
    }
    const guest: PhotoGuest = { id: newId("vis"), name, kind, code: randomCode(8), status: kind === "child" ? "active" : "pending", descriptors, consentAt: kind === "child" ? this.iso() : null, createdAt: this.iso() };
    this.db.photoPasses.update(pass.id, { guests: [...pass.guests, guest], updatedAt: this.iso() });
    return { id: guest.id, code: guest.code, status: guest.status };
  }

  private checkSamples(input: unknown) {
    const samples = (Array.isArray((input as number[][])?.[0]) ? (input as number[][]) : [input as number[]]).slice(0, 5);
    if (!samples.length || samples.some((d) => !isDescriptor(d))) throw new ApiError(400, "Visage non reconnu, réessayez avec plus de lumière");
    for (let i = 1; i < samples.length; i++)
      if (faceDistance(samples[0], samples[i]) > FACE_CONSISTENCY_MAX) throw new ApiError(400, "Les captures ne semblent pas montrer la même personne. Recommencez.");
    return samples;
  }

  private guestByCode(code: string) {
    const c = String(code ?? "").toUpperCase();
    for (const pass of this.db.photoPasses.all()) {
      const g = pass.guests.find((x) => x.code === c);
      if (g) return { pass, guest: g };
    }
    throw new ApiError(404, "Lien introuvable ou expiré");
  }

  /** Page d'accord vue par la personne invitée. */
  photoGuestInvite(code: string) {
    const { pass, guest } = this.guestByCode(code);
    const owner = this.db.users.get(pass.userId);
    const e = this.db.events.get(pass.eventId);
    return { name: guest.name, status: guest.status, owner: owner?.name || "Un participant", eventTitle: e?.title ?? "l'événement", eventDate: e?.startsAt ?? null };
  }

  /** La personne invitée accepte : son visage sert seulement à retrouver ses photos de cet événement pour la personne qui l'a invitée. */
  acceptPhotoGuest(code: string, descriptors: unknown, consent: unknown) {
    const { pass, guest } = this.guestByCode(code);
    if (guest.status === "revoked") throw new ApiError(400, "Ce lien a été annulé");
    if (consent !== true) throw new ApiError(400, "Cochez la case d'accord pour continuer");
    const samples = this.checkSamples(descriptors);
    this.db.photoPasses.update(pass.id, { guests: pass.guests.map((g) => (g.id === guest.id ? { ...g, status: "active", descriptors: samples, consentAt: this.iso() } : g)), updatedAt: this.iso() });
    this.notify(pass.userId, `${guest.name} a accepté`, `Ses photos de l'événement apparaissent maintenant dans Mes photos.`, `/photos?event=${pass.eventId}`);
    return { ok: true };
  }

  /** Refuser ou retirer son accord : le visage est effacé tout de suite. */
  declinePhotoGuest(code: string) {
    const { pass, guest } = this.guestByCode(code);
    this.db.photoPasses.update(pass.id, { guests: pass.guests.map((g) => (g.id === guest.id ? { ...g, status: "revoked", descriptors: [] } : g)), updatedAt: this.iso() });
    if (guest.status !== "revoked") this.notify(pass.userId, `${guest.name} a refusé`, "Son visage n'est pas utilisé. Vous pouvez inviter quelqu'un d'autre.", `/photos?event=${pass.eventId}`);
    return { ok: true };
  }

  removePhotoGuest(userId: string, idOrSlug: string, guestId: string) {
    const user = this.requireUser(userId);
    const e = this.findEvent(idOrSlug);
    const pass = this.photoPass(user.id, e.id);
    if (!pass || !pass.guests.some((g) => g.id === guestId)) throw new ApiError(404, "Visage introuvable");
    this.db.photoPasses.update(pass.id, { guests: pass.guests.map((g) => (g.id === guestId ? { ...g, status: "revoked", descriptors: [] } : g)), updatedAt: this.iso() });
    return { ok: true };
  }

  // =====================================================================
  // Notifications
  // =====================================================================
  /** Notification dans l'application, et aussi sur le téléphone (push) si la personne les a activées. */
  notify(userId: string, title: string, body: string, link: string, push?: PushPayload): Notification {
    const n = this.db.notifications.insert({ id: newId("ntf"), userId, title, body, link, read: false, createdAt: this.iso() });
    this.reminders.pushToUser(userId, push ?? { title, body, url: link, tag: n.id });
    return n;
  }

  notifications(userId: string) {
    const user = this.requireUser(userId);
    return this.db.notifications.filter((n) => n.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50);
  }

  readNotifications(userId: string) {
    const user = this.requireUser(userId);
    for (const n of this.db.notifications.filter((n) => n.userId === user.id && !n.read)) this.db.notifications.update(n.id, { read: true });
    return { ok: true };
  }

  // =====================================================================
  // Monétisation organisateur et participant
  // =====================================================================
  buyBoost(userId: string, idOrSlug: string, plan: BoostPlan, method: PayMethod, settle?: PaymentIntent | null) {
    const user = this.requireUser(userId);
    const e = this.findEvent(idOrSlug);
    if (!settle && !this.canManage(e, user)) throw new ApiError(403, "Réservé à l'organisateur");
    this.requirePayments("Boost");
    const p = PRICING.boosts[plan];
    if (!p) throw new ApiError(400, "Formule inconnue");
    if (method === "cash" && !this.opts.checkout) throw new ApiError(400, "Choisissez Mobile Money ou carte");
    if (this.needsCheckout(p.price, settle)) return this.openIntent(user.id, { kind: "boost", eventId: e.id, plan }, p.price, e.id, `Boost « ${p.label} » · ${e.title}`) as never;
    const base = this.isBoosted(e) ? new Date(e.boostedUntil!) : this.now();
    const until = new Date(base.getTime() + p.hours * 3600_000).toISOString();
    this.db.events.update(e.id, { boostedUntil: until });
    this.pay(user.id, "boost", e.id, e.id, p.price, p.price, method, settle);
    return { boostedUntil: until };
  }

  subscribe(userId: string, plan: "premium" | "pro", method: PayMethod, settle?: PaymentIntent | null) {
    const user = this.requireUser(userId);
    this.requirePayments("Abonnements");
    if (method === "cash" && !this.opts.checkout) throw new ApiError(400, "Choisissez Mobile Money ou carte");
    const price = plan === "premium" ? PRICING.premiumMonthly : PRICING.proMonthly;
    if (this.needsCheckout(price, settle)) return this.openIntent(user.id, { kind: "subscription", plan }, price, null, plan === "premium" ? "Pass ToBe Premium · 1 mois" : "ToBe Organisateur Pro · 1 mois") as never;
    if (plan === "premium") {
      const base = user.premiumUntil && new Date(user.premiumUntil) > this.now() ? new Date(user.premiumUntil) : this.now();
      const until = new Date(base.getTime() + 30 * DAY).toISOString();
      this.db.users.update(user.id, { premiumUntil: until });
      this.pay(user.id, "premium", user.id, null, PRICING.premiumMonthly, PRICING.premiumMonthly, method, settle);
    } else {
      this.db.users.update(user.id, { pro: true });
      this.pay(user.id, "pro", user.id, null, PRICING.proMonthly, PRICING.proMonthly, method, settle);
    }
    return this.me(user.id);
  }

  organizerDashboard(userId: string) {
    const user = this.requireUser(userId);
    const memberOf = new Set(this.db.members.filter((m) => m.userId === user.id).map((m) => m.eventId));
    const assigned = new Set(this.db.tobeRequests.filter((r) => r.assignedTo === user.id && !!r.eventId).map((r) => r.eventId!));
    const events = this.db.events.filter((e) => e.organizerId === user.id || memberOf.has(e.id) || assigned.has(e.id)).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
    const rows = events.map((e) => {
      const acc = this.team.access(e, user);
      const orders = this.db.orders.filter((o) => o.eventId === e.id && (o.status === "paid" || o.status === "reserved"));
      const sold = orders.reduce((s, o) => s + o.qty, 0);
      // Recette nette organisateur : commission ToBe déduite des billets payés en ligne.
      const ticketRevenue = orders.reduce((s, o) => s + (o.method === "online" ? Math.round(o.unitPrice * o.qty * (1 - PRICING.ticketCommission)) : o.unitPrice * o.qty), 0);
      const scanned = orders.reduce((s, o) => s + o.scannedCount, 0);
      const contest = e.contestId ? this.db.contests.get(e.contestId) : undefined;
      const votes = contest ? contest.candidates.reduce((s, c) => s + c.freeVotes + c.paidVotes, 0) : 0;
      const votePayments = this.db.payments.filter((p) => p.kind === "vote" && p.eventId === e.id);
      const voteRevenue = votePayments.reduce((s, p) => s + p.amount - p.platformFee, 0);
      const cg = e.cagnotteId ? this.db.cagnottes.get(e.cagnotteId) : undefined;
      const cagnotteNet = this.db.payments.filter((p) => p.kind === "contribution" && p.eventId === e.id).reduce((s, p) => s + p.amount - p.platformFee, 0);
      const days = new Map<string, number>();
      for (const o of orders) days.set(o.createdAt.slice(0, 10), (days.get(o.createdAt.slice(0, 10)) ?? 0) + o.qty);
      return {
        event: this.toCard(e),
        upcoming: this.isUpcoming(e),
        views: e.views,
        sold,
        capacity: e.ticketTypes.reduce((s, t) => s + t.quota, 0),
        ticketRevenue,
        scanned,
        votes,
        voteRevenue,
        cagnotte: cg ? { collected: cg.collected, goal: cg.goal, net: cagnotteNet } : null,
        photos: this.db.photos.filter((p) => p.eventId === e.id).length,
        salesByDay: [...days.entries()].sort().map(([day, qty]) => ({ day, qty })),
        tobeRequest: e.tobeRequestId ? this.db.tobeRequests.get(e.tobeRequestId)?.status ?? null : null,
        contestId: e.contestId,
        cagnotteId: e.cagnotteId,
        accessCode: acc.edit ? e.accessCode : null,
        myRole: acc.role,
        access: acc,
      };
    })
    // Les membres sans accès aux chiffres (contrôleur, photographe) ne voient pas les montants.
    .map((r) => (r.access.stats ? r : { ...r, ticketRevenue: 0, voteRevenue: 0, cagnotte: null, salesByDay: [] }));
    const totals = rows.filter((r) => r.myRole === "owner").reduce(
      (t, r) => ({ sold: t.sold + r.sold, revenue: t.revenue + r.ticketRevenue + r.voteRevenue + (r.cagnotte?.net ?? 0), views: t.views + r.views, votes: t.votes + r.votes }),
      { sold: 0, revenue: 0, views: 0, votes: 0 },
    );
    return { events: rows, totals, pro: user.pro };
  }

  // =====================================================================
  // Prestataires et demandes à l'agence ToBe
  // =====================================================================
  listProviders(filters: { category?: string; q?: string } = {}): Provider[] {
    let list = this.db.providers.filter((p) => p.status === "approved");
    if (filters.category && filters.category !== "all") list = list.filter((p) => p.category === filters.category);
    if (filters.q) {
      const q = slugify(filters.q);
      list = list.filter((p) => slugify(`${p.name} ${p.bio} ${p.city}`).includes(q));
    }
    return list.sort((a, b) => Number(b.certified) - Number(a.certified) || b.rating - a.rating || a.name.localeCompare(b.name));
  }

  /** Un professionnel demande à figurer dans l'annuaire ; l'équipe ToBe valide. */
  applyProvider(userId: string, input: { name: string; category: Provider["category"]; city?: string; bio: string; phone: string; priceFrom?: number }) {
    const user = this.requireUser(userId);
    if (!input.name?.trim() || input.name.trim().length < 2) throw new ApiError(400, "Nom de l'activité requis");
    if (!input.bio?.trim() || input.bio.trim().length < 20) throw new ApiError(400, "Décrivez votre activité en quelques phrases (20 caractères minimum)");
    const cats: Provider["category"][] = ["mc", "deco", "son", "photo", "traiteur", "securite", "costume", "logistique"];
    if (!cats.includes(input.category)) throw new ApiError(400, "Catégorie inconnue");
    let phone: string;
    try {
      phone = normalizePhone(input.phone);
    } catch {
      throw new ApiError(400, "Numéro de téléphone invalide");
    }
    const existing = this.db.providers.find((p) => p.ownerId === user.id);
    const data = {
      name: input.name.trim().slice(0, 80),
      category: input.category,
      city: input.city?.trim() || "Lomé",
      bio: input.bio.trim().slice(0, 600),
      phone,
      email: user.email,
      priceFrom: Math.max(0, Math.round(input.priceFrom ?? 0)),
    };
    const p = existing
      ? this.db.providers.update(existing.id, { ...data, status: existing.status === "approved" ? "approved" : "pending" })
      : this.db.providers.insert({ id: newId("prv"), ownerId: user.id, status: "pending", rating: 0, reviews: 0, certified: false, theme: "nuit", ...data });
    if (!existing) for (const a of this.db.users.filter((u) => this.team.can(u, "providers.moderate") && u.id !== user.id)) this.notify(a.id, "Nouveau prestataire à valider", p.name, "/tobe");
    return p;
  }

  /** Erreur survenue dans l'application d'un visiteur : on garde les 60 dernières. */
  reportClientError(userId: string | null, input: { message?: string; stack?: string; path?: string; ua?: string }) {
    const message = String(input.message ?? "").slice(0, 300);
    if (!message) return { ok: true };
    const doc = this.db.settings.get("client-errors") ?? { id: "client-errors", value: { items: [] as unknown[] } };
    const items = (doc.value.items as ClientError[]) ?? [];
    const path = String(input.path ?? "").slice(0, 200);
    const same = items.find((x) => x.message === message && x.path === path);
    if (same) {
      same.count++;
      same.lastAt = new Date().toISOString();
      if (userId) same.userId = userId;
    } else {
      items.unshift({ message, path, stack: String(input.stack ?? "").slice(0, 2000), ua: String(input.ua ?? "").slice(0, 250), userId, count: 1, firstAt: new Date().toISOString(), lastAt: new Date().toISOString() });
    }
    items.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
    this.db.settings.insert({ id: "client-errors", value: { items: items.slice(0, 60) } });
    return { ok: true };
  }

  clientErrors(userId: string) {
    this.requireAdmin(userId, "team.manage");
    return ((this.db.settings.get("client-errors")?.value.items as ClientError[]) ?? []).slice(0, 60);
  }

  clearClientErrors(userId: string) {
    this.requireAdmin(userId, "team.manage");
    this.db.settings.insert({ id: "client-errors", value: { items: [] } });
    return { ok: true };
  }

  myProvider(userId: string) {
    const user = this.requireUser(userId);
    return this.db.providers.find((p) => p.ownerId === user.id) ?? null;
  }

  setProviderStatus(userId: string, id: string, patch: { status?: Provider["status"]; certified?: boolean }) {
    this.requireAdmin(userId, "providers.moderate");
    const p = this.db.providers.get(id);
    if (!p) throw new ApiError(404, "Prestataire introuvable");
    const next = this.db.providers.update(id, { status: patch.status ?? p.status, certified: patch.certified ?? p.certified });
    if (p.ownerId && patch.status && patch.status !== p.status) {
      this.notify(p.ownerId, patch.status === "approved" ? "Votre fiche prestataire est en ligne" : "Votre fiche prestataire n'a pas été retenue", next.name, "/prestataires");
    }
    return next;
  }

  requestQuote(userId: string, providerId: string, input: { message: string; date?: string | null }) {
    const user = this.requireUser(userId);
    const p = this.db.providers.get(providerId);
    if (!p || p.status !== "approved") throw new ApiError(404, "Prestataire introuvable");
    if (!input.message?.trim()) throw new ApiError(400, "Décrivez votre besoin");
    if (p.ownerId) this.notify(p.ownerId, "Nouvelle demande de devis", `${user.name || user.email} : ${input.message.trim().slice(0, 80)}`, "/profil");
    return this.db.quotes.insert({ id: newId("quo"), providerId: p.id, userId: user.id, message: input.message.trim(), date: input.date ?? null, createdAt: this.iso() });
  }

  requestTobe(userId: string, input: { eventId?: string | null; level: TobeRequest["level"]; services: string[]; budget?: string; note?: string; phone?: string; eventTitle?: string }) {
    const user = this.requireUser(userId);
    const e = input.eventId ? this.findEvent(input.eventId) : null;
    if (e && !this.canManage(e, user)) throw new ApiError(403, "Réservé à l'organisateur");
    if (!input.phone && !user.phone) throw new ApiError(400, "Indiquez un numéro pour que l'équipe ToBe vous rappelle");
    if (input.phone && !user.phone) {
      try {
        this.db.users.update(user.id, { phone: normalizePhone(input.phone) });
      } catch {
        /* vérifié plus bas */
      }
    }
    const req = this.db.tobeRequests.insert({
      id: newId("tbr"),
      eventId: e?.id ?? null,
      userId: user.id,
      level: input.level,
      services: input.services ?? [],
      budget: input.budget?.trim() ?? "",
      note: input.note?.trim() ?? "",
      phone: (() => {
        try {
          return input.phone ? normalizePhone(input.phone) : (user.phone ?? "");
        } catch {
          throw new ApiError(400, "Numéro de téléphone invalide");
        }
      })(),
      email: user.email,
      name: user.name,
      eventTitle: e?.title ?? input.eventTitle?.trim() ?? "",
      status: "nouveau",
      createdAt: this.iso(),
    });
    if (e) this.db.events.update(e.id, { tobeRequestId: req.id });
    for (const a of this.db.users.filter((u) => this.team.can(u, "requests.all") && u.id !== user.id)) {
      this.notify(a.id, "Nouvelle demande d'organisation", `${user.name || user.email} — ${req.eventTitle || "projet"}`, "/tobe");
    }
    return req;
  }

  // =====================================================================
  // Espace ToBe (agence)
  // =====================================================================
  private requireAdmin(userId: string, perm?: Parameters<Team["require"]>[1]) {
    return this.team.require(userId, perm);
  }

  adminOverview(userId: string) {
    const me = this.requireAdmin(userId);
    const role = this.team.teamRole(me)!;
    const seeAll = this.team.can(me, "requests.all") || role === "support";
    const mine = this.team.can(me, "requests.mine");
    const requests = this.db.tobeRequests
      .filter((r) => seeAll || (mine && (!r.assignedTo || r.assignedTo === me.id)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => {
        const e = r.eventId ? this.db.events.get(r.eventId) : null;
        const a = r.assignedTo ? this.db.users.get(r.assignedTo) : null;
        return { ...r, event: e ? this.toCard(e) : null, assignee: a ? { id: a.id, name: a.name || a.email } : null };
      });
    const projectManagers = this.db.users.filter((u) => this.team.can(u, "requests.mine")).map((u) => ({ id: u.id, name: u.name || u.email, role: this.team.teamRole(u) }));
    const revenue: Record<string, { amount: number; platform: number; count: number }> = {};
    for (const p of this.db.payments.all()) {
      revenue[p.kind] ??= { amount: 0, platform: 0, count: 0 };
      revenue[p.kind].amount += p.amount;
      revenue[p.kind].platform += p.platformFee;
      revenue[p.kind].count += 1;
    }
    const providers = this.db.providers.all().sort((a, b) => (a.status === "pending" ? -1 : 1) - (b.status === "pending" ? -1 : 1) || a.name.localeCompare(b.name));
    return {
      me: { id: me.id, role, label: TEAM_ROLES[role].label, perms: TEAM_ROLES[role].perms },
      projectManagers,
      requests,
      providers: this.team.can(me, "providers.moderate") || this.team.can(me, "stats.view") ? providers : [],
      revenue,
      platformTotal: Object.values(revenue).reduce((s, r) => s + r.platform, 0),
      counts: {
        users: this.db.users.size,
        events: this.db.events.size,
        tickets: this.db.orders.filter((o) => (o.status === "paid" || o.status === "reserved")).reduce((s, o) => s + o.qty, 0),
        photos: this.db.photos.size,
        passUsers: this.db.users.filter((u) => u.passEnabled).length,
        providers: this.db.providers.filter((p) => p.status === "approved").length,
        quotes: this.db.quotes.size,
      },
    };
  }

  updateTobeRequest(userId: string, id: string, status: TobeRequest["status"]) {
    const me = this.requireAdmin(userId);
    const r = this.db.tobeRequests.get(id);
    if (!r) throw new ApiError(404, "Demande introuvable");
    if (!this.team.can(me, "requests.all") && !(this.team.can(me, "requests.mine") && r.assignedTo === me.id)) throw new ApiError(403, "Prenez d'abord ce dossier en charge");
    return this.db.tobeRequests.update(id, { status });
  }
}
