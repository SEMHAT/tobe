import { ApiError } from "./errors.js";
import { newId, randomToken } from "./rules.js";
import type { ToBeService } from "./service.js";
import type { EventMember, EventRole, Invite, TeamRole, TobeEvent, User } from "./types.js";

// =====================================================================
// Rôles : l'équipe d'un événement (invitée par l'organisateur) et l'équipe de l'agence ToBe.
// =====================================================================

export type Perm =
  | "team.manage" // inviter et gérer l'équipe ToBe
  | "events.all" // agir sur tous les événements (modifier, supprimer)
  | "requests.all" // voir et répartir toutes les demandes « Confier à ToBe »
  | "requests.mine" // traiter les demandes qui lui sont confiées
  | "providers.moderate" // valider les prestataires
  | "photos.moderate" // retirer une photo signalée
  | "club.manage" // lots et récompenses du ToBe Club
  | "stats.view"; // chiffres de la plateforme

export const TEAM_ROLES: Record<TeamRole, { label: string; description: string; rank: number; perms: Perm[] }> = {
  super_admin: {
    label: "Super administrateur",
    description: "Tous les droits, y compris nommer d'autres administrateurs.",
    rank: 5,
    perms: ["team.manage", "events.all", "requests.all", "requests.mine", "providers.moderate", "photos.moderate", "club.manage", "stats.view"],
  },
  admin: {
    label: "Administrateur",
    description: "Gère la plateforme et l'équipe, sauf les autres administrateurs.",
    rank: 4,
    perms: ["team.manage", "events.all", "requests.all", "requests.mine", "providers.moderate", "photos.moderate", "club.manage", "stats.view"],
  },
  chef_projet: {
    label: "Chef de projet",
    description: "Prend en charge les événements confiés à ToBe : suivi client, devis, organisation.",
    rank: 3,
    perms: ["requests.mine", "stats.view"],
  },
  moderateur: {
    label: "Modérateur",
    description: "Valide les prestataires et retire les contenus inappropriés.",
    rank: 2,
    perms: ["providers.moderate", "photos.moderate", "stats.view"],
  },
  marketing: {
    label: "Marketing",
    description: "Anime le ToBe Club : lots, récompenses et remises de lots.",
    rank: 2,
    perms: ["club.manage", "stats.view"],
  },
  support: {
    label: "Support",
    description: "Consulte les chiffres et les demandes pour aider les utilisateurs.",
    rank: 1,
    perms: ["stats.view"],
  },
};

export const EVENT_ROLES: Record<EventRole, { label: string; description: string }> = {
  co_organisateur: { label: "Co-organisateur", description: "Modifie l'événement, contrôle les entrées, ajoute les photos et suit les chiffres." },
  controleur: { label: "Contrôleur d'entrée", description: "Scanne les billets à l'entrée avec son téléphone." },
  photographe: { label: "Photographe", description: "Dépose les photos de l'événement ; ToBe prévient les personnes reconnues." },
};

export interface EventAccess {
  role: "owner" | "staff" | EventRole | null;
  edit: boolean;
  scan: boolean;
  photos: boolean;
  stats: boolean;
  members: boolean;
  delete: boolean;
}

const NONE: EventAccess = { role: null, edit: false, scan: false, photos: false, stats: false, members: false, delete: false };
const INVITE_DAYS = 14;

export class Team {
  constructor(private s: ToBeService) {}

  private get db() {
    return this.s.db;
  }

  // ---------- Équipe ToBe ----------
  /** Rôle dans l'équipe ToBe (les anciens comptes « admin » restent administrateurs). */
  teamRole(u: User | null | undefined): TeamRole | null {
    if (!u) return null;
    if (this.s.adminEmails.includes(u.email)) return "super_admin";
    if (u.teamRole) return u.teamRole;
    return u.role === "admin" ? "admin" : null;
  }

  can(u: User | null | undefined, perm: Perm): boolean {
    const r = this.teamRole(u);
    return !!r && TEAM_ROLES[r].perms.includes(perm);
  }

  require(userId: string | null | undefined, perm?: Perm): User {
    const u = this.s.requireUser(userId);
    const r = this.teamRole(u);
    if (!r) throw new ApiError(403, "Espace réservé à l'équipe ToBe");
    if (perm && !TEAM_ROLES[r].perms.includes(perm)) throw new ApiError(403, "Votre rôle ne donne pas accès à cette action");
    return u;
  }

  /** Peut-on attribuer ce rôle ? Seul un super administrateur nomme des administrateurs. */
  private canAssign(me: User, role: TeamRole) {
    const mine = this.teamRole(me);
    if (!mine || !TEAM_ROLES[mine].perms.includes("team.manage")) return false;
    return mine === "super_admin" || TEAM_ROLES[role].rank < TEAM_ROLES[mine].rank;
  }

  members() {
    return this.db.users
      .filter((u) => !!this.teamRole(u))
      .map((u) => {
        const r = this.teamRole(u)!;
        return { id: u.id, name: u.name, email: u.email, phone: u.phone, avatar: u.avatar ?? null, role: r, roleLabel: TEAM_ROLES[r].label, fixed: this.s.adminEmails.includes(u.email) };
      })
      .sort((a, b) => TEAM_ROLES[b.role].rank - TEAM_ROLES[a.role].rank || a.name.localeCompare(b.name));
  }

  teamView(userId: string) {
    const me = this.require(userId);
    const myRole = this.teamRole(me)!;
    const manage = TEAM_ROLES[myRole].perms.includes("team.manage");
    return {
      me: { role: myRole, label: TEAM_ROLES[myRole].label, perms: TEAM_ROLES[myRole].perms },
      roles: (Object.keys(TEAM_ROLES) as TeamRole[]).map((r) => ({ id: r, ...TEAM_ROLES[r], assignable: this.canAssign(me, r) })),
      members: this.members(),
      invites: manage ? this.db.invites.filter((i) => i.kind === "team" && !i.usedBy && !i.revoked && i.expiresAt > this.s.iso()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [],
    };
  }

  inviteTeam(userId: string, input: { role: TeamRole; label?: string }) {
    const me = this.require(userId, "team.manage");
    if (!TEAM_ROLES[input.role]) throw new ApiError(400, "Rôle inconnu");
    if (!this.canAssign(me, input.role)) throw new ApiError(403, "Seul un super administrateur peut nommer ce rôle");
    return this.createInvite(me, "team", input.role, null, input.label);
  }

  setTeamRole(userId: string, memberId: string, role: TeamRole | null) {
    const me = this.require(userId, "team.manage");
    const target = this.db.users.get(memberId);
    if (!target) throw new ApiError(404, "Membre introuvable");
    if (target.id === me.id) throw new ApiError(400, "Vous ne pouvez pas changer votre propre rôle");
    if (this.s.adminEmails.includes(target.email)) throw new ApiError(403, "Ce super administrateur est fixé dans la configuration du serveur");
    const current = this.teamRole(target);
    if (current && !this.canAssign(me, current)) throw new ApiError(403, "Vous ne pouvez pas modifier ce membre");
    if (role && !this.canAssign(me, role)) throw new ApiError(403, "Seul un super administrateur peut nommer ce rôle");
    const next = this.db.users.update(target.id, { teamRole: role, role: role ? "admin" : "user" });
    this.s.notify(target.id, role ? `Votre rôle ToBe : ${TEAM_ROLES[role].label}` : "Vous ne faites plus partie de l'équipe ToBe", role ? TEAM_ROLES[role].description : "Merci pour votre contribution.", role ? "/tobe" : "/");
    return { id: next.id, role };
  }

  // ---------- Équipe d'un événement ----------
  access(e: TobeEvent, user: User | null): EventAccess {
    if (!user) return NONE;
    if (user.id === e.organizerId) return { role: "owner", edit: true, scan: true, photos: true, stats: true, members: true, delete: true };
    if (this.can(user, "events.all")) return { role: "staff", edit: true, scan: true, photos: true, stats: true, members: true, delete: true };
    // Chef de projet ToBe chargé de l'événement : il l'organise avec le client.
    const req = e.tobeRequestId ? this.db.tobeRequests.get(e.tobeRequestId) : undefined;
    if (req?.assignedTo === user.id && this.can(user, "requests.mine")) return { role: "staff", edit: true, scan: true, photos: true, stats: true, members: true, delete: false };
    const m = this.db.members.find((x) => x.eventId === e.id && x.userId === user.id);
    if (!m) return NONE;
    if (m.role === "co_organisateur") return { role: m.role, edit: true, scan: true, photos: true, stats: true, members: false, delete: false };
    if (m.role === "controleur") return { ...NONE, role: m.role, scan: true };
    return { ...NONE, role: m.role, photos: true };
  }

  eventTeam(userId: string, idOrSlug: string) {
    const user = this.s.requireUser(userId);
    const e = this.findEvent(idOrSlug);
    const a = this.access(e, user);
    if (!a.role) throw new ApiError(403, "Réservé à l'équipe de l'événement");
    const owner = this.db.users.get(e.organizerId);
    return {
      roles: (Object.keys(EVENT_ROLES) as EventRole[]).map((r) => ({ id: r, ...EVENT_ROLES[r] })),
      canManage: a.members,
      owner: owner ? { id: owner.id, name: owner.name || owner.email } : null,
      members: this.db.members
        .filter((m) => m.eventId === e.id)
        .map((m) => {
          const u = this.db.users.get(m.userId);
          return { ...m, name: u?.name || u?.email || "Membre", avatar: u?.avatar ?? null, roleLabel: EVENT_ROLES[m.role].label };
        }),
      invites: a.members ? this.db.invites.filter((i) => i.kind === "event" && i.eventId === e.id && !i.usedBy && !i.revoked && i.expiresAt > this.s.iso()) : [],
    };
  }

  inviteEvent(userId: string, idOrSlug: string, input: { role: EventRole; label?: string }) {
    const user = this.s.requireUser(userId);
    const e = this.findEvent(idOrSlug);
    if (!this.access(e, user).members) throw new ApiError(403, "Seul l'organisateur peut inviter son équipe");
    if (!EVENT_ROLES[input.role]) throw new ApiError(400, "Rôle inconnu");
    if (this.db.invites.filter((i) => i.eventId === e.id && !i.usedBy && !i.revoked).length >= 50) throw new ApiError(400, "Trop d'invitations en attente : annulez-en quelques-unes");
    return this.createInvite(user, "event", input.role, e.id, input.label);
  }

  removeMember(userId: string, memberId: string) {
    const user = this.s.requireUser(userId);
    const m = this.db.members.get(memberId);
    if (!m) throw new ApiError(404, "Membre introuvable");
    const e = this.findEvent(m.eventId);
    // On peut retirer quelqu'un si on gère l'équipe, ou se retirer soi-même.
    if (m.userId !== user.id && !this.access(e, user).members) throw new ApiError(403, "Seul l'organisateur peut retirer un membre");
    this.db.members.remove(m.id);
    if (m.userId !== user.id) this.s.notify(m.userId, `Accès retiré : ${e.title}`, `Vous n'êtes plus ${EVENT_ROLES[m.role].label.toLowerCase()} de cet événement.`, "/");
    return { ok: true };
  }

  /** Événements où l'on a un rôle sans en être l'organisateur. */
  myEventRoles(userId: string) {
    return this.db.members
      .filter((m) => m.userId === userId)
      .map((m) => ({ member: m, event: this.db.events.get(m.eventId) }))
      .filter((x): x is { member: EventMember; event: TobeEvent } => !!x.event)
      .map(({ member, event }) => ({ role: member.role, roleLabel: EVENT_ROLES[member.role].label, event: this.s.toCard(event) }))
      .sort((a, b) => a.event.startsAt.localeCompare(b.event.startsAt));
  }

  // ---------- Invitations ----------
  private createInvite(by: User, kind: Invite["kind"], role: Invite["role"], eventId: string | null, label?: string) {
    const now = this.s.now();
    const inv = this.db.invites.insert({
      id: randomToken().slice(0, 24),
      kind,
      role,
      eventId,
      label: String(label ?? "").trim().slice(0, 60),
      createdBy: by.id,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + INVITE_DAYS * 86_400_000).toISOString(),
      usedBy: null,
      usedAt: null,
      revoked: false,
    });
    return { invite: inv, ...this.describe(inv) };
  }

  private describe(inv: Invite) {
    const e = inv.eventId ? this.db.events.get(inv.eventId) : undefined;
    const by = this.db.users.get(inv.createdBy);
    const roleLabel = inv.kind === "team" ? TEAM_ROLES[inv.role as TeamRole].label : EVENT_ROLES[inv.role as EventRole].label;
    const roleDescription = inv.kind === "team" ? TEAM_ROLES[inv.role as TeamRole].description : EVENT_ROLES[inv.role as EventRole].description;
    const path = `/invitation/${inv.id}`;
    const who = by?.name || "L'équipe ToBe";
    const message =
      inv.kind === "team"
        ? `Bonjour${inv.label ? ` ${inv.label}` : ""} ! ${who} vous invite à rejoindre l'équipe ToBe en tant que ${roleLabel.toLowerCase()}. Acceptez ici : `
        : `Bonjour${inv.label ? ` ${inv.label}` : ""} ! ${who} vous invite comme ${roleLabel.toLowerCase()} pour « ${e?.title ?? "un événement"} » sur ToBe. Acceptez ici : `;
    return { path, message, roleLabel, roleDescription, inviter: who, event: e ? this.s.toCard(e) : null };
  }

  getInvite(token: string) {
    const inv = this.db.invites.get(token);
    if (!inv || inv.revoked) throw new ApiError(404, "Invitation introuvable ou annulée");
    const d = this.describe(inv);
    return {
      kind: inv.kind,
      role: inv.role,
      label: inv.label,
      expired: inv.expiresAt < this.s.iso(),
      used: !!inv.usedBy,
      roleLabel: d.roleLabel,
      roleDescription: d.roleDescription,
      inviter: d.inviter,
      event: d.event,
    };
  }

  acceptInvite(userId: string, token: string) {
    const user = this.s.requireUser(userId);
    const inv = this.db.invites.get(token);
    if (!inv || inv.revoked) throw new ApiError(404, "Invitation introuvable ou annulée");
    if (inv.usedBy && inv.usedBy !== user.id) throw new ApiError(400, "Cette invitation a déjà été utilisée par quelqu'un d'autre");
    if (inv.expiresAt < this.s.iso()) throw new ApiError(400, "Invitation expirée : demandez-en une nouvelle");
    const by = this.db.users.get(inv.createdBy);
    if (inv.kind === "team") {
      const role = inv.role as TeamRole;
      const current = this.teamRole(user);
      // On ne rétrograde jamais quelqu'un avec une invitation.
      if (!current || TEAM_ROLES[role].rank > TEAM_ROLES[current].rank) this.db.users.update(user.id, { teamRole: role, role: "admin" });
      if (by) this.s.notify(by.id, `${user.name || user.email} a rejoint l'équipe ToBe`, `Rôle : ${TEAM_ROLES[role].label}`, "/tobe");
      this.db.invites.update(inv.id, { usedBy: user.id, usedAt: this.s.iso() });
      return { kind: "team" as const, redirect: "/tobe" };
    }
    const e = this.findEvent(inv.eventId!);
    const role = inv.role as EventRole;
    if (user.id === e.organizerId) throw new ApiError(400, "Vous êtes déjà l'organisateur de cet événement");
    const existing = this.db.members.find((m) => m.eventId === e.id && m.userId === user.id);
    if (existing) this.db.members.update(existing.id, { role });
    else this.db.members.insert({ id: newId("mbr"), eventId: e.id, userId: user.id, role, addedBy: inv.createdBy, createdAt: this.s.iso() });
    this.db.invites.update(inv.id, { usedBy: user.id, usedAt: this.s.iso() });
    if (by) this.s.notify(by.id, `${user.name || user.email} a rejoint votre équipe`, `${EVENT_ROLES[role].label} · ${e.title}`, `/organisateur/${e.id}`);
    const redirect = role === "controleur" ? `/scanner?event=${e.id}` : `/organisateur/${e.id}`;
    return { kind: "event" as const, redirect, eventId: e.id };
  }

  revokeInvite(userId: string, token: string) {
    const user = this.s.requireUser(userId);
    const inv = this.db.invites.get(token);
    if (!inv) throw new ApiError(404, "Invitation introuvable");
    const allowed = inv.kind === "team" ? this.can(user, "team.manage") : this.access(this.findEvent(inv.eventId!), user).members;
    if (!allowed && inv.createdBy !== user.id) throw new ApiError(403, "Vous ne pouvez pas annuler cette invitation");
    this.db.invites.update(inv.id, { revoked: true });
    return { ok: true };
  }

  // ---------- Demandes « Confier à ToBe » ----------
  assignRequest(userId: string, requestId: string, assigneeId: string | null) {
    const me = this.require(userId);
    const r = this.db.tobeRequests.get(requestId);
    if (!r) throw new ApiError(404, "Demande introuvable");
    const self = assigneeId === me.id;
    if (!this.can(me, "requests.all") && !(self && this.can(me, "requests.mine") && !r.assignedTo)) throw new ApiError(403, "Seul un administrateur répartit les dossiers");
    if (assigneeId) {
      const a = this.db.users.get(assigneeId);
      if (!a || !this.can(a, "requests.mine")) throw new ApiError(400, "Cette personne ne peut pas suivre de dossier");
      if (!self) this.s.notify(a.id, "Nouveau dossier pour vous", `${r.eventTitle || "Événement"} · ${r.name}`, "/tobe");
    }
    return this.db.tobeRequests.update(r.id, { assignedTo: assigneeId });
  }

  private findEvent(idOrSlug: string): TobeEvent {
    const e = this.db.events.get(idOrSlug) ?? this.db.events.find((x) => x.slug === idOrSlug);
    if (!e) throw new ApiError(404, "Événement introuvable");
    return e;
  }
}
