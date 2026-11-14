import type { Db } from "./db";
import {
  FACE_MATCH_THRESHOLD,
  PRICING,
  bestFaceDistance,
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
} from "./rules";
import type {
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
} from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: Record<string, unknown>,
  ) {
    super(message);
  }
}

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
  /** Envoi du code de connexion par e-mail. */
  sendCode?: (email: string, code: string) => Promise<void> | void;
}

// ---------- Vues renvoyées à l'interface ----------
export interface EventCard {
  id: string;
  slug: string;
  title: string;
  category: Category;
  startsAt: string;
  venue: string;
  city: string;
  lat: number | null;
  lng: number | null;
  cover: string | null;
  theme: Theme;
  access: Access;
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

export class ToBeService {
  private opts: Required<Omit<ServiceOptions, "sendCode">> & Pick<ServiceOptions, "sendCode">;
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
    };
  }

  private now(): Date {
    return this.opts.now();
  }
  private iso(): string {
    return this.now().toISOString();
  }

  // =====================================================================
  // Authentification par code envoyé par e-mail
  // =====================================================================
  config() {
    return { paymentsEnabled: this.opts.paymentsEnabled, auth: "email" as const, demo: this.opts.demo };
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
    let user = this.db.users.find((u) => u.email === email);
    const isNew = !user;
    const isAdmin = this.opts.demo || this.opts.adminEmails.includes(email);
    if (!user) {
      user = this.db.users.insert({
        id: newId("usr"),
        email,
        phone: null,
        name: name?.trim() || "",
        createdAt: this.iso(),
        role: isAdmin ? "admin" : "user",
        passEnabled: false,
        faceDescriptor: null,
        neverShow: false,
        premiumUntil: null,
        pro: false,
      });
      if (this.opts.demo) this.giveDemoEvents(user);
    } else if (isAdmin && user.role !== "admin") {
      user = this.db.users.update(user.id, { role: "admin" });
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

  private requireUser(userId: string | null | undefined): User {
    const u = userId ? this.db.users.get(userId) : undefined;
    if (!u) throw new ApiError(401, "Connectez-vous pour continuer");
    return u;
  }

  me(userId: string) {
    const u = this.requireUser(userId);
    const orders = this.db.orders.filter((o) => o.userId === u.id && (o.status === "paid" || o.status === "reserved"));
    const votes = this.db.votes.filter((v) => v.userId === u.id).reduce((s, v) => s + v.count, 0);
    const events = new Set(orders.map((o) => o.eventId));
    const photos = u.faceDescriptor && u.passEnabled ? this.myPhotos(u.id).reduce((s, g) => s + g.photos.length, 0) : 0;
    const unread = this.db.notifications.filter((n) => n.userId === u.id && !n.read).length;
    return {
      user: this.publicUser(u),
      stats: { events: events.size, tickets: orders.reduce((s, o) => s + o.qty, 0), votes, photos, organized: this.db.events.filter((e) => e.organizerId === u.id).length },
      unread,
      premium: !!u.premiumUntil && new Date(u.premiumUntil) > this.now(),
    };
  }

  publicUser(u: User) {
    const { faceDescriptor, ...rest } = u;
    return { ...rest, hasFace: !!faceDescriptor };
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
    this.db.users.update(u.id, { name: "Compte supprimé", faceDescriptor: null, passEnabled: false, phone: null, email: `supprime-${u.id}@tobe.invalid` });
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
      venue: e.venue,
      city: e.city,
      lat: e.lat,
      lng: e.lng,
      cover: e.cover,
      theme: e.theme,
      access: e.access,
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
      list = list.filter((e) => {
        const t = new Date(e.startsAt).getTime();
        return t >= from && t < to;
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

  private canManage(e: TobeEvent, user: User | null): boolean {
    return !!user && (user.id === e.organizerId || user.role === "admin");
  }

  private canView(e: TobeEvent, user: User | null, code?: string | null): boolean {
    if (e.visibility !== "private") return true;
    if (user && user.id === e.organizerId) return true; // l'équipe ToBe (admin) n'a pas d'accès automatique aux événements privés
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
    const manage = this.canManage(e, user);
    // Un invité connecté qui saisit le bon code est ajouté à la liste : il n'aura plus à le retaper.
    if (user && e.visibility === "private" && code && !e.invitees.includes(user.email) && user.id !== e.organizerId && e.accessCode && code.trim().toUpperCase() === e.accessCode.toUpperCase()) {
      this.db.events.update(e.id, { invitees: [...e.invitees, user.email] });
    }
    const fresh = this.db.events.get(e.id)!;
    const ev = manage ? fresh : this.db.events.update(e.id, { views: fresh.views + 1 });
    const { accessCode, invitees, ...rest } = ev;
    return {
      ...rest,
      ...(manage ? { accessCode, invitees } : {}),
      impact: computeImpact(ev),
      isOrganizer: manage,
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
    const ticketTypes =
      input.access === "paid"
        ? (input.ticketTypes ?? []).filter((t) => t.name.trim()).map((t) => ({ id: newId("tkt"), name: t.name.trim(), price: Math.max(0, Math.round(t.price)), quota: Math.max(0, t.quota ?? 0), sold: 0 }))
        : [{ id: newId("tkt"), name: input.access === "invite" ? "Invitation" : "Entrée libre", price: 0, quota: Math.max(0, input.ticketTypes?.[0]?.quota ?? 0), sold: 0 }];

    const event: TobeEvent = {
      id,
      slug,
      organizerId: user.id,
      organizerName: user.name || "Organisateur",
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

  updateEvent(userId: string, idOrSlug: string, patch: Partial<CreateEventInput>): EventView {
    const user = this.requireUser(userId);
    const e = this.findEvent(idOrSlug);
    if (!this.canManage(e, user)) throw new ApiError(403, "Seul l'organisateur peut modifier cet événement");
    const allowed: (keyof TobeEvent)[] = ["title", "description", "venue", "city", "cover", "theme", "visibility", "expectedAttendance", "reach", "liveUrl", "program", "options", "lat", "lng"];
    const next: Partial<TobeEvent> = {};
    for (const k of allowed) if (k in patch) (next as Record<string, unknown>)[k] = (patch as Record<string, unknown>)[k];
    if (patch.startsAt) next.startsAt = new Date(patch.startsAt).toISOString();
    if (patch.invitees) next.invitees = patch.invitees.map((p) => normalizeEmail(p));
    if (patch.visibility === "private" && !e.accessCode) next.accessCode = randomCode(6);
    this.db.events.update(e.id, next);
    return this.getEvent(e.id, user.id);
  }

  deleteEvent(userId: string, idOrSlug: string) {
    const user = this.requireUser(userId);
    const e = this.findEvent(idOrSlug);
    if (!this.canManage(e, user)) throw new ApiError(403, "Seul l'organisateur peut supprimer cet événement");
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
    if (!e || !this.canManage(e, user)) return { ok: false as const, reason: "Ce billet n'est pas pour vos événements" };
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
    const hidden = new Set(this.db.users.filter((u) => u.neverShow && !!u.faceDescriptor).map((u) => u.faceDescriptor!));
    return this.db.photos
      .filter((p) => p.eventId === e.id)
      .filter((p) => ![...hidden].some((d) => bestFaceDistance(d, p.faces) < FACE_MATCH_THRESHOLD))
      .map(({ faces, ...p }) => ({ ...p, faceCount: faces.length }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  addPhotos(userId: string, idOrSlug: string, photos: { url: string; width: number; height: number; faces: number[][] }[]) {
    const user = this.requireUser(userId);
    const e = this.findEvent(idOrSlug);
    if (!this.canManage(e, user)) throw new ApiError(403, "Seul l'organisateur peut déposer des photos");
    const added: Photo[] = photos.map((p) =>
      this.db.photos.insert({ id: newId("pho"), eventId: e.id, url: p.url, width: p.width, height: p.height, faces: (p.faces ?? []).filter((f) => Array.isArray(f) && f.length === 128), uploadedBy: user.id, createdAt: this.iso() }),
    );
    if (!e.options.gallery) this.db.events.update(e.id, { options: { ...e.options, gallery: true } });
    // Pass ToBe : on prévient automatiquement chaque personne reconnue.
    const notified: string[] = [];
    for (const u of this.db.users.filter((u) => u.passEnabled && !!u.faceDescriptor && !u.neverShow)) {
      if (!this.canView(e, u)) continue;
      const n = added.filter((p) => bestFaceDistance(u.faceDescriptor!, p.faces) < FACE_MATCH_THRESHOLD).length;
      if (n > 0) {
        const total = this.db.photos.filter((p) => p.eventId === e.id && bestFaceDistance(u.faceDescriptor!, p.faces) < FACE_MATCH_THRESHOLD).length;
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
    const isMe = !!user.faceDescriptor && bestFaceDistance(user.faceDescriptor, p.faces) < FACE_MATCH_THRESHOLD;
    if (!(e && this.canManage(e, user)) && !isMe) throw new ApiError(403, "Vous ne pouvez retirer que vos propres photos");
    this.db.photos.remove(p.id);
    return { ok: true };
  }

  setFace(userId: string, descriptor: number[]) {
    const user = this.requireUser(userId);
    if (!Array.isArray(descriptor) || descriptor.length !== 128 || descriptor.some((x) => typeof x !== "number" || !Number.isFinite(x)))
      throw new ApiError(400, "Visage non reconnu, réessayez avec plus de lumière");
    const u = this.db.users.update(user.id, { faceDescriptor: descriptor, passEnabled: true, neverShow: false });
    return { user: this.publicUser(u), groups: this.myPhotos(u.id) };
  }

  setPass(userId: string, patch: { passEnabled?: boolean; neverShow?: boolean }) {
    const user = this.requireUser(userId);
    const u = this.db.users.update(user.id, { passEnabled: patch.passEnabled ?? user.passEnabled, neverShow: patch.neverShow ?? user.neverShow });
    return this.publicUser(u);
  }

  clearFace(userId: string) {
    const user = this.requireUser(userId);
    return this.publicUser(this.db.users.update(user.id, { faceDescriptor: null, passEnabled: false }));
  }

  myPhotos(userId: string) {
    const user = this.requireUser(userId);
    if (!user.faceDescriptor) return [];
    return this.matchPhotos(user.faceDescriptor, user);
  }

  /** Recherche ponctuelle par selfie, sans enregistrer le visage. */
  matchSelfie(userId: string | null, descriptor: number[], eventId?: string) {
    const user = userId ? (this.db.users.get(userId) ?? null) : null;
    if (!Array.isArray(descriptor) || descriptor.length !== 128) throw new ApiError(400, "Visage non reconnu");
    return this.matchPhotos(descriptor, user, eventId);
  }

  private matchPhotos(descriptor: number[], user: User | null, eventId?: string) {
    const groups = new Map<string, { event: EventCard; photos: (Omit<Photo, "faces"> & { distance: number })[] }>();
    for (const p of this.db.photos.all()) {
      if (eventId && p.eventId !== eventId) continue;
      const d = bestFaceDistance(descriptor, p.faces);
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
  notify(userId: string, title: string, body: string, link: string): Notification {
    return this.db.notifications.insert({ id: newId("ntf"), userId, title, body, link, read: false, createdAt: this.iso() });
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
    const events = this.db.events.filter((e) => e.organizerId === user.id).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
    const rows = events.map((e) => {
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
        accessCode: e.accessCode,
      };
    });
    const totals = rows.reduce(
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
    if (!existing) for (const a of this.db.users.filter((u) => u.role === "admin" && u.id !== user.id)) this.notify(a.id, "Nouveau prestataire à valider", p.name, "/tobe");
    return p;
  }

  myProvider(userId: string) {
    const user = this.requireUser(userId);
    return this.db.providers.find((p) => p.ownerId === user.id) ?? null;
  }

  setProviderStatus(userId: string, id: string, patch: { status?: Provider["status"]; certified?: boolean }) {
    this.requireAdmin(userId);
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
    for (const a of this.db.users.filter((u) => u.role === "admin" && u.id !== user.id)) {
      this.notify(a.id, "Nouvelle demande d'organisation", `${user.name || user.email} — ${req.eventTitle || "projet"}`, "/tobe");
    }
    return req;
  }

  // =====================================================================
  // Espace ToBe (agence)
  // =====================================================================
  private requireAdmin(userId: string) {
    const u = this.requireUser(userId);
    if (u.role !== "admin") throw new ApiError(403, "Espace réservé à l'équipe ToBe");
    return u;
  }

  adminOverview(userId: string) {
    this.requireAdmin(userId);
    const requests = this.db.tobeRequests.all().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((r) => {
      const e = r.eventId ? this.db.events.get(r.eventId) : null;
      return { ...r, event: e ? this.toCard(e) : null };
    });
    const revenue: Record<string, { amount: number; platform: number; count: number }> = {};
    for (const p of this.db.payments.all()) {
      revenue[p.kind] ??= { amount: 0, platform: 0, count: 0 };
      revenue[p.kind].amount += p.amount;
      revenue[p.kind].platform += p.platformFee;
      revenue[p.kind].count += 1;
    }
    const providers = this.db.providers.all().sort((a, b) => (a.status === "pending" ? -1 : 1) - (b.status === "pending" ? -1 : 1) || a.name.localeCompare(b.name));
    return {
      requests,
      providers,
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
    this.requireAdmin(userId);
    if (!this.db.tobeRequests.get(id)) throw new ApiError(404, "Demande introuvable");
    return this.db.tobeRequests.update(id, { status });
  }
}
