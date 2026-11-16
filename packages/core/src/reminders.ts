import { ApiError } from "./errors.js";
import { newId } from "./rules.js";
import type { ToBeService } from "./service.js";
import type { PushSub, Reminder, ReminderStage, TobeEvent } from "./types.js";

// =====================================================================
// Rappels d'événements et notifications push (comme celles de WhatsApp).
// Un rappel est créé quand on clique « Me rappeler » sur un événement ou quand on prend un billet.
// Il envoie 4 notifications : 2 jours avant, la veille, le jour J et 30 minutes avant.
// =====================================================================

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
  image?: string | null;
  /** Boutons dans la notification (Android). */
  actions?: { action: string; title: string; url: string }[];
}

/** Envoi réel d'une notification (web-push côté serveur). « gone » : l'abonnement n'existe plus. */
export type PushSender = (sub: PushSub, payload: PushPayload) => Promise<"ok" | "gone" | "error">;

const H = 3600_000;

interface StageDef {
  key: ReminderStage;
  /** Moment d'envoi. */
  at: (start: Date) => Date;
  /** Au-delà de ce retard, le rappel n'a plus de sens : on ne l'envoie pas. */
  lateMax: number;
}

export const REMINDER_STAGES: StageDef[] = [
  { key: "j2", at: (s) => new Date(s.getTime() - 48 * H), lateMax: 12 * H },
  { key: "veille", at: (s) => new Date(s.getTime() - 24 * H), lateMax: 8 * H },
  {
    key: "jourj",
    // Le matin même à 8 h (heure de Lomé = UTC), ou 3 h avant pour un événement très matinal.
    at: (s) => {
      const morning = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate(), 8, 0, 0));
      return morning.getTime() <= s.getTime() - 2 * H ? morning : new Date(s.getTime() - 3 * H);
    },
    lateMax: 4 * H,
  },
  { key: "bientot", at: (s) => new Date(s.getTime() - 30 * 60_000), lateMax: 25 * 60_000 },
];

const hourFr = (d: Date) => `${String(d.getUTCHours()).padStart(2, "0")}h${String(d.getUTCMinutes()).padStart(2, "0")}`;
const dayFr = (d: Date) => d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

export function reminderMessage(e: TobeEvent, stage: ReminderStage, hasTicket: boolean): PushPayload {
  const start = new Date(e.startsAt);
  const where = e.venue ? ` · ${e.venue}` : "";
  const url = hasTicket ? "/billets" : `/evenement/${e.slug}`;
  const ticketLine = hasTicket ? " Votre billet est dans l'application." : "";
  const base = { url, tag: `rappel-${e.id}`, image: e.cover };
  const actions = hasTicket
    ? [
        { action: "billet", title: "Mon billet", url: "/billets" },
        { action: "voir", title: "L'événement", url: `/evenement/${e.slug}` },
      ]
    : [{ action: "voir", title: "Voir l'événement", url: `/evenement/${e.slug}` }];
  switch (stage) {
    case "j2":
      return { ...base, actions, title: `Dans 2 jours : ${e.title}`, body: `${dayFr(start)} à ${hourFr(start)}${where}. Ne le ratez pas !${ticketLine}` };
    case "veille":
      return { ...base, actions, title: `C'est demain : ${e.title}`, body: `Rendez-vous à ${hourFr(start)}${where}. Préparez-vous !${ticketLine}` };
    case "jourj":
      return { ...base, actions, title: `C'est aujourd'hui ! ${e.title}`, body: `On vous attend à ${hourFr(start)}${where}.${ticketLine}` };
    case "bientot":
      return {
        ...base,
        actions,
        title: `Ça commence dans 30 minutes`,
        body: `${e.title}${where}.${hasTicket ? " Gardez votre QR code à portée de main." : " Il est encore temps d'y aller !"}`,
      };
  }
}

/** Empreinte stable d'une adresse d'abonnement push (identifiant du document). */
export function subIdOf(endpoint: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < endpoint.length; i++) {
    const c = endpoint.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619) >>> 0;
    b = Math.imul(b ^ c, 2246822519) >>> 0;
  }
  return `sub_${a.toString(36)}${b.toString(36)}${endpoint.length.toString(36)}`;
}

export class Reminders {
  constructor(private s: ToBeService) {}

  private get db() {
    return this.s.db;
  }

  // ---------- Abonnements push ----------
  subscribe(userId: string | null, input: { endpoint?: string; keys?: { p256dh?: string; auth?: string }; ua?: string }) {
    const endpoint = String(input?.endpoint ?? "");
    if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !input.keys?.p256dh || !input.keys?.auth) throw new ApiError(400, "Abonnement aux notifications invalide");
    const id = subIdOf(endpoint);
    const existing = this.db.pushSubs.get(id);
    const sub: PushSub = {
      id,
      userId: userId ?? existing?.userId ?? null,
      endpoint,
      keys: { p256dh: String(input.keys.p256dh), auth: String(input.keys.auth) },
      ua: String(input.ua ?? "").slice(0, 160),
      createdAt: existing?.createdAt ?? this.s.iso(),
      failures: 0,
    };
    if (existing) this.db.pushSubs.update(id, sub);
    else this.db.pushSubs.insert(sub);
    // Les rappels pris sans compte suivent la personne quand elle se connecte.
    if (userId) for (const r of this.db.reminders.filter((r) => r.subId === id && !r.userId)) this.db.reminders.update(r.id, { userId });
    return { subId: id };
  }

  unsubscribe(input: { endpoint?: string }) {
    const id = subIdOf(String(input?.endpoint ?? ""));
    if (this.db.pushSubs.get(id)) this.db.pushSubs.remove(id);
    return { ok: true };
  }

  /** Envoie une notification sur tous les téléphones d'un utilisateur. */
  pushToUser(userId: string, payload: PushPayload) {
    for (const sub of this.db.pushSubs.filter((x) => x.userId === userId)) this.s.sendPush(sub, payload);
  }

  test(userId: string) {
    const u = this.s.requireUser(userId);
    const subs = this.db.pushSubs.filter((x) => x.userId === u.id);
    if (!subs.length) throw new ApiError(400, "Activez d'abord les notifications sur ce téléphone");
    for (const sub of subs) this.s.sendPush(sub, { title: "ToBe est bien connecté 🎉", body: "Vous recevrez vos rappels d'événements ici, comme vos messages.", url: "/notifications", tag: "test" });
    return { sent: subs.length };
  }

  // ---------- Rappels ----------
  private alreadyDue(e: TobeEvent): ReminderStage[] {
    const start = new Date(e.startsAt);
    const now = this.s.now().getTime();
    return REMINDER_STAGES.filter((st) => st.at(start).getTime() <= now).map((st) => st.key);
  }

  /** Crée le rappel (sans renvoyer immédiatement les étapes déjà passées). */
  add(e: TobeEvent, owner: { userId: string | null; subId: string | null }, source: Reminder["source"]) {
    const existing = this.db.reminders.find((r) => r.eventId === e.id && ((!!owner.userId && r.userId === owner.userId) || (!owner.userId && !!owner.subId && r.subId === owner.subId)));
    if (existing) {
      if (source === "ticket" && existing.source !== "ticket") return this.db.reminders.update(existing.id, { source });
      return existing;
    }
    return this.db.reminders.insert({ id: newId("rmd"), eventId: e.id, userId: owner.userId, subId: owner.subId, source, sent: this.alreadyDue(e), createdAt: this.s.iso() });
  }

  follow(userId: string | null, idOrSlug: string, input: { endpoint?: string }) {
    const e = this.s.findEventPublic(idOrSlug);
    if (new Date(e.startsAt).getTime() < this.s.now().getTime()) throw new ApiError(400, "Cet événement a déjà commencé");
    const subId = input?.endpoint ? subIdOf(String(input.endpoint)) : null;
    if (!userId && !(subId && this.db.pushSubs.get(subId))) throw new ApiError(400, "Activez les notifications pour recevoir le rappel");
    const r = this.add(e, { userId, subId }, "follow");
    return { following: true, reminder: r, schedule: this.schedule(e) };
  }

  unfollow(userId: string | null, idOrSlug: string, input: { endpoint?: string }) {
    const e = this.s.findEventPublic(idOrSlug);
    const subId = input?.endpoint ? subIdOf(String(input.endpoint)) : null;
    for (const r of this.db.reminders.filter((r) => r.eventId === e.id && r.source === "follow" && ((!!userId && r.userId === userId) || (!!subId && r.subId === subId)))) this.db.reminders.remove(r.id);
    return { following: false };
  }

  status(userId: string | null, idOrSlug: string, endpoint?: string) {
    const e = this.s.findEventPublic(idOrSlug);
    const subId = endpoint ? subIdOf(endpoint) : null;
    const r = this.db.reminders.find((r) => r.eventId === e.id && ((!!userId && r.userId === userId) || (!!subId && r.subId === subId)));
    return { following: !!r, source: r?.source ?? null, schedule: this.schedule(e) };
  }

  /** L'événement change de date : chaque rappel repart sur le nouveau calendrier. */
  reschedule(e: TobeEvent) {
    const due = this.alreadyDue(e);
    for (const r of this.db.reminders.filter((r) => r.eventId === e.id)) this.db.reminders.update(r.id, { sent: due });
  }

  /** Les moments où partiront les rappels (affichés à l'utilisateur). */
  schedule(e: TobeEvent) {
    const start = new Date(e.startsAt);
    const now = this.s.now().getTime();
    return REMINDER_STAGES.map((st) => ({ stage: st.key, at: st.at(start).toISOString(), past: st.at(start).getTime() <= now }));
  }

  /**
   * Envoie les rappels arrivés à échéance. Appelé toutes les 5 minutes par une tâche planifiée.
   * Sans effet si on l'appelle deux fois : chaque étape n'est envoyée qu'une fois.
   */
  processDue() {
    const now = this.s.now().getTime();
    let sent = 0;
    let checked = 0;
    for (const r of this.db.reminders.all()) {
      const e = this.db.events.get(r.eventId);
      if (!e) {
        this.db.reminders.remove(r.id);
        continue;
      }
      const start = new Date(e.startsAt);
      if (start.getTime() + 6 * H < now) {
        this.db.reminders.remove(r.id); // événement passé : on fait le ménage
        continue;
      }
      checked++;
      const due = REMINDER_STAGES.filter((st) => !r.sent.includes(st.key) && st.at(start).getTime() <= now);
      if (!due.length) continue;
      // On n'envoie que la dernière étape due, et seulement si elle n'est pas trop en retard.
      const last = due[due.length - 1];
      const late = now - last.at(start).getTime();
      this.db.reminders.update(r.id, { sent: [...r.sent, ...due.map((d) => d.key)] });
      if (late > last.lateMax || now >= start.getTime()) continue;
      const hasTicket = !!r.userId && this.db.orders.some((o) => o.eventId === e.id && o.userId === r.userId && (o.status === "paid" || o.status === "reserved"));
      const msg = reminderMessage(e, last.key, hasTicket);
      if (r.userId) this.s.notify(r.userId, msg.title, msg.body, msg.url, msg);
      else if (r.subId) {
        const sub = this.db.pushSubs.get(r.subId);
        if (sub) this.s.sendPush(sub, msg);
      }
      sent++;
    }
    return { checked, sent };
  }
}
