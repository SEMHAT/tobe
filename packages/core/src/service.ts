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
} from "./types.js";

import { ApiError } from "./errors.js";
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
      paymentsEnabled: options.paymentsEnabled ?? false,
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
    return { paymentsEnabled: this.opts.paymentsEnabled, auth: "email" as const, demo: this.opts.demo, googleClientId: this.opts.googleClientId || null, vapidPublicKey: this.opts.push?.publicKey ?? null };
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
    let list = this.db.events.filter((e) => e.visibility === "public" && (filters.past ? !this.isUpcoming(e) : this.isUpcoming(e)));
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
        if (!e || e.visibility !== "public") return null;
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
    this.db.events.insert(event);

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
    if (input.boost && this.opts.paymentsEnabled) this.buyBoost(user.id, id, input.boost.plan, input.boost.method);
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

  deleteEvent(userId: string, idOrSlug: string) {
    const user = this.requireUser(userId);
    const e = this.findEvent(idOrSlug);
    if (!this.team.access(e, user).delete) throw new ApiError(403, "Seul l'organisateur peut supprimer cet événement");
    if (this.attendees(e) > 0) throw new ApiError(400, "Des billets ont été vendus : contactez ToBe pour annuler et rembourser");
    this.db.events.remove(e.id);
    return { ok: true };
  }

  // =====================================================================
  // Paiements (passerelle simulée — voir server/src/payments.ts pour brancher un vrai fournisseur)
  // =====================================================================
  private requirePayments(what: string) {
    if (!this.opts.paymentsEnabled) throw new ApiError(400, `${what} : le paiement en ligne arrive bientôt sur ToBe.`);
  }

  private pay(userId: string, kind: Parameters<ToBeService["recordPayment"]>[0]["kind"], refId: string, eventId: string | null, amount: number, platformFee: number, method: PayMethod) {
    if (amount < 0) throw new ApiError(400, "Montant invalide");
    return this.recordPayment({ userId, kind, refId, eventId, amount, platformFee, method });
  }

  private recordPayment(p: { userId: string; kind: "ticket" | "vote" | "contribution" | "boost" | "premium" | "pro"; refId: string; eventId: string | null; amount: number; platformFee: number; method: PayMethod }) {
    return this.db.payments.insert({ id: newId("pay"), createdAt: this.iso(), ...p });
  }

  // =====================================================================
  // Billetterie
  // =====================================================================
  buyTickets(userId: string, idOrSlug: string, input: { ticketTypeId: string; qty: number; method: PayMethod; code?: string | null }): Order {
    const user = this.requireUser(userId);
    const e = this.findEvent(idOrSlug);
    if (!this.canView(e, user, input.code)) throw new ApiError(403, "Accès réservé aux invités");
    if (!this.isUpcoming(e)) throw new ApiError(400, "Cet événement est terminé");
    if (e.access === "none") throw new ApiError(400, "Pas de billetterie ToBe pour cet événement : voyez les infos d'entrée de l'organisateur");
    const tt = e.ticketTypes.find((t) => t.id === input.ticketTypeId);
    if (!tt) throw new ApiError(400, "Type de billet introuvable");
    const qty = Math.round(input.qty);
    if (qty < 1 || qty > 10) throw new ApiError(400, "Entre 1 et 10 billets par commande");
    if (tt.quota && tt.sold + qty > tt.quota) throw new ApiError(400, `Plus que ${Math.max(0, tt.quota - tt.sold)} place(s) disponible(s)`);
    const online = this.opts.paymentsEnabled && tt.price > 0;
    if (online && input.method === "cash") throw new ApiError(400, "Choisissez un paiement Mobile Money ou carte");
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
      scannedCount: 0,
      createdAt: this.iso(),
    };
    this.db.orders.insert(order);
    this.db.events.update(e.id, (ev) => ({ ...ev, ticketTypes: ev.ticketTypes.map((t) => (t.id === tt.id ? { ...t, sold: t.sold + qty } : t)) }));
    if (online && total > 0) this.pay(user.id, "ticket", order.id, e.id, total, fee, input.method);
    // Billet pris : rappels automatiques 2 jours avant, la veille, le jour J et 30 minutes avant.
    this.reminders.add(e, { userId: user.id, subId: null }, "ticket");
    return order;
  }

  myTickets(userId: string) {
    const user = this.requireUser(userId);
    return this.db.orders
      .filter((o) => o.userId === user.id && (o.status === "paid" || o.status === "reserved"))
      .map((o) => {
        const e = this.db.events.get(o.eventId);
        return { ...o, event: e ? this.toCard(e) : null };
      })
      .sort((a, b) => (a.event?.startsAt ?? "").localeCompare(b.event?.startsAt ?? ""));
  }

  getTicket(userId: string, orderId: string) {
    const user = this.requireUser(userId);
    const o = this.db.orders.get(orderId);
    if (!o || (o.userId !== user.id && user.role !== "admin")) throw new ApiError(404, "Billet introuvable");
    const e = this.db.events.get(o.eventId);
    return { ...o, event: e ? this.toCard(e) : null, holder: user.name || user.email };
  }

  scanTicket(userId: string, rawCode: string, eventId?: string) {
    const user = this.requireUser(userId);
    const code = rawCode.trim().toUpperCase().replace(/^TOBE:/, "");
    const o = this.db.orders.find((x) => x.code === code);
    if (!o) return { ok: false as const, reason: "Billet inconnu" };
    const e = this.db.events.get(o.eventId);
    if (!e || !this.team.access(e, user).scan) return { ok: false as const, reason: "Ce billet n'est pas pour vos événements" };
    if (eventId && e.id !== eventId) return { ok: false as const, reason: `Billet pour un autre événement : ${e.title}` };
    if (o.scannedCount >= o.qty) return { ok: false as const, reason: "Billet déjà utilisé", order: o };
    const next = this.db.orders.update(o.id, { scannedCount: o.scannedCount + 1 });
    const holder = this.db.users.get(o.userId);
    return { ok: true as const, order: next, holder: holder?.name || holder?.email || "", amountDue: next.status === "reserved" ? next.total : 0, remaining: next.qty - next.scannedCount, eventTitle: e.title };
  }

  // =====================================================================
  // Votes
  // =====================================================================
  contestView(contestId: string, userId: string | null): ContestView {
    const c = this.db.contests.get(contestId);
    if (!c) throw new ApiError(404, "Concours introuvable");
    const e = this.db.events.get(c.eventId);
    const user = userId ? (this.db.users.get(userId) ?? null) : null;
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

  vote(userId: string, contestId: string, input: { candidateId: string; pack: "free" | "1" | "10" | "50"; method?: PayMethod }) {
    const user = this.requireUser(userId);
    const c = this.db.contests.get(contestId);
    if (!c) throw new ApiError(404, "Concours introuvable");
    const now = this.now();
    if (new Date(c.opensAt) > now) throw new ApiError(400, "Le vote n'est pas encore ouvert");
    if (new Date(c.closesAt) <= now) throw new ApiError(400, "Le vote est clôturé");
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
      if (!input.method || input.method === "cash") throw new ApiError(400, "Choisissez un moyen de paiement");
      const p = votePackPrice(c.votePrice, input.pack);
      count = p.votes;
      amount = p.price;
      kind = "paid";
    }
    const rec = this.db.votes.insert({ id: newId("vot"), contestId: c.id, candidateId: cand.id, userId: user.id, count, amount, kind, method: kind === "paid" ? input.method! : null, createdAt: this.iso() });
    this.db.contests.update(c.id, (cc) => ({
      ...cc,
      candidates: cc.candidates.map((x) => (x.id === cand.id ? { ...x, freeVotes: x.freeVotes + (kind === "free" ? count : 0), paidVotes: x.paidVotes + (kind === "paid" ? count : 0) } : x)),
    }));
    if (amount > 0) this.pay(user.id, "vote", rec.id, c.eventId, amount, Math.round(amount * PRICING.voteCommission), input.method!);
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
    const e = this.db.events.get(cg.eventId);
    const user = userId ? (this.db.users.get(userId) ?? null) : null;
    if (e && !this.canView(e, user, code)) throw new ApiError(403, "Cagnotte réservée aux invités", { needCode: true, eventId: e.id });
    const manage = !!e && this.canManage(e, user);
    const contributions = this.db.contributions
      .filter((x) => x.cagnotteId === cg.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((x) => ({ id: x.id, name: x.anonymous && !manage ? "Anonyme" : x.name, amount: x.anonymous && !manage ? null : x.amount, message: x.message, createdAt: x.createdAt, anonymous: x.anonymous }));
    return { ...cg, eventTitle: e?.title ?? "", eventId: e?.id ?? null, eventSlug: e?.slug ?? null, theme: e?.theme ?? "or", category: e?.category ?? "autre", contributions, isOrganizer: manage };
  }

  contribute(userId: string, cagnotteId: string, input: { amount: number; message?: string; anonymous?: boolean; method: PayMethod; name?: string; code?: string | null }) {
    const user = this.requireUser(userId);
    const cg = this.db.cagnottes.get(cagnotteId);
    if (!cg) throw new ApiError(404, "Cagnotte introuvable");
    const e = this.db.events.get(cg.eventId);
    if (e && !this.canView(e, user, input.code)) throw new ApiError(403, "Cagnotte réservée aux invités");
    this.requirePayments("Contributions");
    const amount = Math.round(input.amount);
    if (!(amount >= 500)) throw new ApiError(400, "Contribution minimale : 500 FCFA");
    if (input.method === "cash") throw new ApiError(400, "Choisissez Mobile Money ou carte");
    const c = this.db.contributions.insert({
      id: newId("ctb"),
      cagnotteId: cg.id,
      userId: user.id,
      name: input.name?.trim() || user.name || "Un proche",
      amount,
      message: (input.message ?? "").trim().slice(0, 280),
      anonymous: !!input.anonymous,
      method: input.method,
      createdAt: this.iso(),
    });
    const isNewContributor = !this.db.contributions.some((x) => x.cagnotteId === cg.id && x.userId === user.id && x.id !== c.id);
    this.db.cagnottes.update(cg.id, { collected: cg.collected + amount, contributors: cg.contributors + (isNewContributor ? 1 : 0) });
    this.pay(user.id, "contribution", c.id, cg.eventId, amount, Math.round(amount * PRICING.cagnotteCommission), input.method);
    return this.getCagnotte(cg.id, user.id, input.code);
  }

  // =====================================================================
  // Photos et Pass ToBe
  // =====================================================================
  listPhotos(idOrSlug: string, userId: string | null, code?: string | null) {
    const e = this.findEvent(idOrSlug);
    const user = userId ? (this.db.users.get(userId) ?? null) : null;
    if (!this.canView(e, user, code)) throw new ApiError(403, "Galerie réservée aux invités");
    const hidden = this.db.users.filter((u) => u.neverShow && userFaces(u).length > 0).map((u) => userFaces(u));
    return this.db.photos
      .filter((p) => p.eventId === e.id)
      .filter((p) => !hidden.some((mine) => facesMatch(mine, p.faces)))
      .map(({ faces, ...p }) => ({ ...p, faceCount: faces.length }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  addPhotos(userId: string, idOrSlug: string, photos: { url: string; width: number; height: number; faces: number[][] }[]) {
    const user = this.requireUser(userId);
    const e = this.findEvent(idOrSlug);
    if (!this.team.access(e, user).photos) throw new ApiError(403, "Seuls l'organisateur et ses photographes peuvent déposer des photos");
    const added: Photo[] = photos.map((p) =>
      this.db.photos.insert({ id: newId("pho"), eventId: e.id, url: p.url, width: p.width, height: p.height, faces: (p.faces ?? []).filter((f) => Array.isArray(f) && f.length === 128), uploadedBy: user.id, createdAt: this.iso() }),
    );
    if (!e.options.gallery) this.db.events.update(e.id, { options: { ...e.options, gallery: true } });
    // Pass ToBe : on prévient automatiquement chaque personne reconnue.
    const notified: string[] = [];
    for (const u of this.db.users.filter((u) => u.passEnabled && userFaces(u).length > 0 && !u.neverShow)) {
      if (!this.canView(e, u)) continue;
      const mine = userFaces(u);
      const n = added.filter((p) => facesMatch(mine, p.faces)).length;
      if (n > 0) {
        const total = this.db.photos.filter((p) => p.eventId === e.id && facesMatch(mine, p.faces)).length;
        this.notify(u.id, `Vous êtes sur ${total} photo${total > 1 ? "s" : ""} de ${e.title}`, "Retrouvez-les dans Mes photos et téléchargez-les en HD.", `/photos?event=${e.id}`);
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
  setFace(userId: string, input: number[] | number[][]) {
    const user = this.requireUser(userId);
    const samples = (Array.isArray(input?.[0]) ? (input as number[][]) : [input as number[]]).slice(0, 5);
    if (!samples.length || samples.some((d) => !isDescriptor(d))) throw new ApiError(400, "Visage non reconnu, réessayez avec plus de lumière");
    for (let i = 0; i < samples.length; i++)
      for (let j = i + 1; j < samples.length; j++)
        if (faceDistance(samples[i], samples[j]) > FACE_CONSISTENCY_MAX)
          throw new ApiError(400, "Les captures ne semblent pas montrer la même personne. Recommencez, seul face à la caméra.");
    const u = this.db.users.update(user.id, { faceDescriptor: meanDescriptor(samples), faceDescriptors: samples, passEnabled: true, neverShow: false });
    return { user: this.publicUser(u), groups: this.myPhotos(u.id) };
  }

  setPass(userId: string, patch: { passEnabled?: boolean; neverShow?: boolean }) {
    const user = this.requireUser(userId);
    const u = this.db.users.update(user.id, { passEnabled: patch.passEnabled ?? user.passEnabled, neverShow: patch.neverShow ?? user.neverShow });
    return this.publicUser(u);
  }

  clearFace(userId: string) {
    const user = this.requireUser(userId);
    return this.publicUser(this.db.users.update(user.id, { faceDescriptor: null, faceDescriptors: null, passEnabled: false }));
  }

  myPhotos(userId: string) {
    const user = this.requireUser(userId);
    const mine = userFaces(user);
    if (!mine.length) return [];
    return this.matchPhotos(mine, user);
  }

  /** Recherche ponctuelle par selfie, sans enregistrer le visage. */
  matchSelfie(userId: string | null, input: number[] | number[][], eventId?: string) {
    const user = userId ? (this.db.users.get(userId) ?? null) : null;
    const samples = (Array.isArray(input?.[0]) ? (input as number[][]) : [input as number[]]).slice(0, 5);
    if (!samples.length || samples.some((d) => !isDescriptor(d))) throw new ApiError(400, "Visage non reconnu");
    return this.matchPhotos(samples, user, eventId);
  }

  private matchPhotos(mine: number[][], user: User | null, eventId?: string) {
    const groups = new Map<string, { event: EventCard; photos: (Omit<Photo, "faces"> & { distance: number })[] }>();
    for (const p of this.db.photos.all()) {
      if (eventId && p.eventId !== eventId) continue;
      const d = facesDistance(mine, p.faces);
      if (d >= FACE_MATCH_THRESHOLD) continue;
      const e = this.db.events.get(p.eventId);
      if (!e || !this.canView(e, user)) continue;
      if (!groups.has(e.id)) groups.set(e.id, { event: this.toCard(e), photos: [] });
      const { faces, ...rest } = p;
      groups.get(e.id)!.photos.push({ ...rest, distance: Math.round(d * 1000) / 1000 });
    }
    return [...groups.values()].sort((a, b) => b.event.startsAt.localeCompare(a.event.startsAt));
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
  buyBoost(userId: string, idOrSlug: string, plan: BoostPlan, method: PayMethod) {
    const user = this.requireUser(userId);
    const e = this.findEvent(idOrSlug);
    if (!this.canManage(e, user)) throw new ApiError(403, "Réservé à l'organisateur");
    this.requirePayments("Boost");
    const p = PRICING.boosts[plan];
    if (!p) throw new ApiError(400, "Formule inconnue");
    if (method === "cash") throw new ApiError(400, "Choisissez Mobile Money ou carte");
    const base = this.isBoosted(e) ? new Date(e.boostedUntil!) : this.now();
    const until = new Date(base.getTime() + p.hours * 3600_000).toISOString();
    this.db.events.update(e.id, { boostedUntil: until });
    this.pay(user.id, "boost", e.id, e.id, p.price, p.price, method);
    return { boostedUntil: until };
  }

  subscribe(userId: string, plan: "premium" | "pro", method: PayMethod) {
    const user = this.requireUser(userId);
    this.requirePayments("Abonnements");
    if (method === "cash") throw new ApiError(400, "Choisissez Mobile Money ou carte");
    if (plan === "premium") {
      const base = user.premiumUntil && new Date(user.premiumUntil) > this.now() ? new Date(user.premiumUntil) : this.now();
      const until = new Date(base.getTime() + 30 * DAY).toISOString();
      this.db.users.update(user.id, { premiumUntil: until });
      this.pay(user.id, "premium", user.id, null, PRICING.premiumMonthly, PRICING.premiumMonthly, method);
    } else {
      this.db.users.update(user.id, { pro: true });
      this.pay(user.id, "pro", user.id, null, PRICING.proMonthly, PRICING.proMonthly, method);
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
      const ticketRevenue = orders.reduce((s, o) => s + o.unitPrice * o.qty, 0);
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
