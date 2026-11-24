import { Link } from "react-router-dom";
import { PrivateThumb } from "../components/DocInput";
import type { ClientError, EventCard, Provider, TobeRequest } from "@tobe/core";
import { Bug, Banknote, ShieldAlert, BadgeCheck, Gift, ShieldCheck, UserPlus, Users, Mail, Phone, Plus, Sparkles, Store, Trophy } from "lucide-react";
import { useState } from "react";
import { InviteSheet, type InviteResult } from "../components/TeamInvite";
import { Avatar } from "../components/visual";
import { Button, Empty, ErrorState, Field, PageLoader, Sheet, Stat, TopBar, cx, inputCls } from "../components/ui";
import { api } from "../lib/api";
import { ago, compact, formatFcfa, formatPhone } from "../lib/format";
import { useSession } from "../lib/session";
import { useLoad } from "../lib/useLoad";

interface Overview {
  me: { id: string; role: string; label: string; perms: string[] };
  projectManagers: { id: string; name: string; role: string | null }[];
  requests: (TobeRequest & { event: EventCard | null; assignee: { id: string; name: string } | null })[];
  providers: Provider[];
  revenue: Record<string, { amount: number; platform: number; count: number }>;
  platformTotal: number;
  counts: { users: number; events: number; tickets: number; photos: number; passUsers: number; quotes: number; providers: number };
}

const STATUSES: [TobeRequest["status"], string][] = [
  ["nouveau", "Nouveau"],
  ["contacte", "Contacté"],
  ["devis", "Devis"],
  ["signe", "Signé"],
  ["perdu", "Perdu"],
];
const KIND: Record<string, string> = { ticket: "Billetterie", vote: "Votes", contribution: "Cagnottes", boost: "Boosts", premium: "Pass Premium", pro: "Abonnements Pro" };
const LEVEL: Record<string, string> = { complete: "Organisation complète", carte: "À la carte", devis: "Devis" };

export function TobeAdmin() {
  const { me, toast, payments } = useSession();
  const { data, error, loading, setData } = useLoad(() => api<Overview>("GET", "/admin"), [me?.user.id]);
  if (loading) return <PageLoader />;
  if (error || !data)
    return (
      <>
        <TopBar title="Espace ToBe" />
        <ErrorState message={error?.message ?? "Erreur"} />
      </>
    );
  const setStatus = async (id: string, status: TobeRequest["status"]) => {
    try {
      const r = await api<TobeRequest>("PATCH", `/admin/requests/${id}`, { status });
      setData({ ...data, requests: data.requests.map((x) => (x.id === id ? { ...x, ...r } : x)) });
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  const can = (p: string) => data.me.perms.includes(p);
  const assign = async (id: string, assignee: string | null) => {
    try {
      const r = await api<TobeRequest>("PATCH", `/admin/requests/${id}/assign`, { assignee });
      const who = data.projectManagers.find((m) => m.id === assignee);
      setData({ ...data, requests: data.requests.map((x) => (x.id === id ? { ...x, ...r, assignee: who ? { id: who.id, name: who.name } : null } : x)) });
      toast(assignee ? `Dossier confié à ${assignee === data.me.id ? "vous" : who?.name}` : "Dossier libéré");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  const setProvider = async (id: string, patch: { status?: Provider["status"]; certified?: boolean }) => {
    try {
      const p = await api<Provider>("PATCH", `/admin/providers/${id}`, patch);
      setData({ ...data, providers: data.providers.map((x) => (x.id === id ? p : x)) });
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  return (
    <div className="pb-10">
      <TopBar title="Espace agence ToBe" right={<span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-bold text-brand dark:bg-brand/20 dark:text-white">{data.me.label}</span>} />
      <div className="px-5 pt-4 lg:px-0">
        {payments && can("stats.view") && <><div className="rounded-[22px] brand-gradient p-5 text-white">
          <div className="text-sm font-semibold">Revenus de la plateforme</div>
          <div className="mt-1 font-display text-3xl font-extrabold">{formatFcfa(data.platformTotal)}</div>
        </div>
        <div className="mt-3 space-y-2">
          {Object.entries(data.revenue).map(([k, r]) => (
            <div key={k} className="flex items-center justify-between rounded-2xl border border-line bg-card px-4 py-3 text-sm">
              <span>
                <span className="font-semibold">{KIND[k] ?? k}</span> <span className="text-muted">· {r.count} paiement(s)</span>
              </span>
              <span className="font-display font-bold text-brand">{formatFcfa(r.platform)}</span>
            </div>
          ))}
        </div></>}
        <div className="mt-4 grid grid-cols-3 gap-2 lg:grid-cols-7">
          <Stat label="Comptes" value={compact(data.counts.users)} />
          <Stat label="Événements" value={compact(data.counts.events)} />
          <Stat label="Billets" value={compact(data.counts.tickets)} />
          <Stat label="Photos" value={compact(data.counts.photos)} />
          <Stat label="Pass actifs" value={compact(data.counts.passUsers)} />
          <Stat label="Devis presta." value={compact(data.counts.quotes)} />
          <Stat label="Prestataires" value={compact(data.counts.providers)} />
        </div>

        <div className="lg:grid lg:grid-cols-2 lg:gap-8">
        <div>
        <h2 className="mb-3 mt-7 flex items-center gap-2 text-lg font-bold">
          <Sparkles className="size-5 text-brand" /> Demandes « Confier à ToBe »
        </h2>
        {data.requests.length === 0 && <Empty icon={<Sparkles className="size-7" />} title="Aucune demande" text="Les demandes cochées à la création d'un événement arrivent ici." />}
        <div className="space-y-3">
          {data.requests.map((r) => (
            <div key={r.id} className="rounded-[20px] border border-line bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-display font-bold">{r.eventTitle || "Projet sans titre"}</div>
                  <div className="text-xs text-muted">
                    {LEVEL[r.level]} · {ago(r.createdAt)}
                  </div>
                </div>
                <a href={`tel:${r.phone}`} className="flex shrink-0 items-center gap-1 rounded-full bg-brand/15 px-3 py-1.5 text-xs font-bold text-brand">
                  <Phone className="size-3.5" /> Appeler
                </a>
              </div>
              <div className="mt-2 text-sm">
                {r.name || "Client"} · {formatPhone(r.phone)}
              </div>
              {r.email && (
                <a href={`mailto:${r.email}`} className="mt-0.5 flex items-center gap-1 text-sm text-muted">
                  <Mail className="size-3.5" /> {r.email}
                </a>
              )}
              {r.services.length > 0 && <div className="mt-1 text-sm text-muted">{r.services.join(", ")}</div>}
              {r.budget && <div className="mt-1 text-sm">Budget : {r.budget}</div>}
              {r.note && <p className="mt-1 text-sm italic text-muted">« {r.note} »</p>}
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-card-2 px-3 py-2 text-sm">
                <span className="text-muted">Chef de projet :</span>
                {can("requests.all") ? (
                  <select className="min-w-0 flex-1 bg-transparent font-semibold outline-none" value={r.assignedTo ?? ""} onChange={(e) => assign(r.id, e.target.value || null)}>
                    <option value="">Non attribué</option>
                    {data.projectManagers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                ) : r.assignee ? (
                  <span className="font-semibold">{r.assignee.id === data.me.id ? "Vous" : r.assignee.name}</span>
                ) : can("requests.mine") ? (
                  <button onClick={() => assign(r.id, data.me.id)} className="ml-auto h-8 rounded-full bg-brand px-3 text-xs font-bold text-white">
                    Prendre ce dossier
                  </button>
                ) : (
                  <span className="text-faint">Non attribué</span>
                )}
              </div>
              {(can("requests.all") || r.assignedTo === data.me.id) && <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto">
                {STATUSES.map(([s, l]) => (
                  <button key={s} onClick={() => setStatus(r.id, s)} className={cx("h-8 shrink-0 rounded-full border px-3 text-xs font-semibold", r.status === s ? "border-brand bg-brand text-white" : "border-line")}>
                    {l}
                  </button>
                ))}
              </div>}
            </div>
          ))}
        </div>
        </div>
        <div>
          <h2 className="mb-3 mt-7 flex items-center gap-2 text-lg font-bold">
            <Store className="size-5 text-brand" /> Prestataires
          </h2>
          {data.providers.length === 0 && <Empty icon={<Store className="size-7" />} title="Aucune inscription" text="Les demandes d'inscription à l'annuaire arrivent ici." />}
          <div className="space-y-3">
            {data.providers.map((p) => (
              <div key={p.id} className="rounded-[20px] border border-line bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 truncate font-display font-bold">
                      {p.name} {p.certified && <BadgeCheck className="size-4 text-brand" />}
                    </div>
                    <div className="text-xs text-muted">
                      {p.category} · {p.city} · {formatPhone(p.phone)} · {p.email}
                    </div>
                  </div>
                  <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-xs font-bold", p.status === "approved" ? "bg-emerald/15 text-emerald" : p.status === "pending" ? "bg-brand-soft text-brand" : "bg-ink/10 text-muted")}>
                    {p.status === "approved" ? "En ligne" : p.status === "pending" ? "À vérifier" : "Refusé"}
                  </span>
                </div>
                <p className="mt-2 line-clamp-3 text-sm text-muted">{p.bio}</p>
                {can("providers.moderate") && <div className="mt-3 flex flex-wrap gap-1.5">
                  {p.status !== "approved" && (
                    <button onClick={() => setProvider(p.id, { status: "approved" })} className="h-8 rounded-full bg-brand px-3 text-xs font-bold text-white">
                      Valider
                    </button>
                  )}
                  {p.status !== "rejected" && (
                    <button onClick={() => setProvider(p.id, { status: "rejected" })} className="h-8 rounded-full border border-line px-3 text-xs font-semibold">
                      Refuser
                    </button>
                  )}
                  <button onClick={() => setProvider(p.id, { certified: !p.certified })} className="h-8 rounded-full border border-line px-3 text-xs font-semibold">
                    {p.certified ? "Retirer le badge" : "Badge « Certifié ToBe »"}
                  </button>
                </div>}
              </div>
            ))}
          </div>
        </div>
        </div>
        {can("club.manage") && <ClubAdmin />}
        <TeamAdmin />
        {can("providers.moderate") && <ModerationAdmin />}
        {can("team.manage") && <PaymentsAdmin />}
        {can("team.manage") && <ErrorsAdmin />}
      </div>
    </div>
  );
}
interface ClubOverview {
  rewards: { id: string; title: string; description: string; cost: number; kind: string; stock: number | null; active: boolean; builtin: boolean }[];
  redemptions: { id: string; userName: string; userEmail: string; title: string; kind: string; code: string; status: "livre" | "a-remettre" | "remis"; createdAt: string; cost: number }[];
  players: number;
  pointsInCirculation: number;
  leaderboard: { rank: number; name: string; points: number }[];
}

function ClubAdmin() {
  const { toast } = useSession();
  const { data, setData, reload } = useLoad(() => api<ClubOverview>("GET", "/admin/game"), []);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", cost: "300", stock: "" });
  const [busy, setBusy] = useState(false);
  if (!data) return null;
  const pending = data.redemptions.filter((r) => r.status === "a-remettre");
  const add = async () => {
    setBusy(true);
    try {
      await api("POST", "/admin/rewards", { title: form.title, description: form.description, cost: Number(form.cost), stock: form.stock === "" ? null : Number(form.stock) });
      setOpen(false);
      setForm({ title: "", description: "", cost: "300", stock: "" });
      toast("Lot ajouté au ToBe Club");
      reload();
    } catch (e) {
      toast((e as Error).message, "error");
    }
    setBusy(false);
  };
  const toggle = async (id: string, active: boolean) => {
    try {
      await api("PATCH", `/admin/rewards/${id}`, { active });
      setData({ ...data, rewards: data.rewards.map((r) => (r.id === id ? { ...r, active } : r)) });
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  const handOver = async (id: string) => {
    try {
      await api("PATCH", `/admin/redemptions/${id}`, { status: "remis" });
      setData({ ...data, redemptions: data.redemptions.map((r) => (r.id === id ? { ...r, status: "remis" } : r)) });
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  return (
    <section className="mt-10">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Trophy className="size-5 text-[#f0a000]" /> ToBe Club
      </h2>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Joueurs" value={compact(data.players)} />
        <Stat label="Points en circulation" value={compact(data.pointsInCirculation)} />
        <Stat label="Lots à remettre" value={pending.length} />
      </div>
      <div className="mt-5 lg:grid lg:grid-cols-2 lg:gap-8">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-bold">Récompenses</h3>
            <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>
              Ajouter un lot
            </Button>
          </div>
          <div className="space-y-2">
            {data.rewards.map((r) => (
              <div key={r.id} className={cx("flex items-center gap-3 rounded-2xl border border-line bg-card p-3.5", !r.active && "opacity-50")}>
                <Gift className="size-5 shrink-0 text-brand" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{r.title}</div>
                  <div className="text-xs text-muted">
                    {r.cost} points · {r.builtin ? "livré automatiquement" : r.stock === null ? "stock illimité" : `${r.stock} en stock`}
                  </div>
                </div>
                {!r.builtin && (
                  <button onClick={() => toggle(r.id, !r.active)} className="h-8 shrink-0 rounded-full border border-line px-3 text-xs font-semibold">
                    {r.active ? "Retirer" : "Remettre"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="mb-3 mt-6 font-bold lg:mt-0">Échanges</h3>
          {data.redemptions.length === 0 && <Empty icon={<Gift className="size-7" />} title="Aucun échange" text="Les lots échangés par les joueurs apparaissent ici." />}
          <div className="space-y-2">
            {data.redemptions.slice(0, 30).map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{r.title}</div>
                  <div className="truncate text-xs text-muted">
                    {r.userName || r.userEmail} · code <b className="tracking-widest">{r.code}</b> · {ago(r.createdAt)}
                  </div>
                </div>
                {r.status === "a-remettre" ? (
                  <button onClick={() => handOver(r.id)} className="h-8 shrink-0 rounded-full bg-brand px-3 text-xs font-bold text-white">
                    Marquer remis
                  </button>
                ) : (
                  <span className="shrink-0 rounded-full bg-emerald/15 px-2.5 py-1 text-xs font-bold text-emerald">{r.status === "remis" ? "Remis" : "Livré"}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="Nouveau lot">
        <div className="space-y-4">
          <p className="text-sm text-muted">Un lot que l'équipe ToBe remet en main propre : places VIP, t-shirt, séance photo… Les joueurs le voient dans les récompenses du Club.</p>
          <Field label="Nom du lot">
            <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex. 2 places VIP pour un concert" />
          </Field>
          <Field label="Description">
            <input className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ce que gagne le joueur, comment le récupérer" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Coût en points">
              <input className={inputCls} inputMode="numeric" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value.replace(/\D/g, "") })} />
            </Field>
            <Field label="Stock" hint="Vide = illimité">
              <input className={inputCls} inputMode="numeric" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value.replace(/\D/g, "") })} />
            </Field>
          </div>
          <Button full loading={busy} disabled={form.title.trim().length < 3 || Number(form.cost) < 10} onClick={add}>
            Ajouter au Club
          </Button>
        </div>
      </Sheet>
    </section>
  );
}

// ---------- Équipe ToBe : super admin, admins, chefs de projet… ----------
interface TeamData {
  me: { role: string; label: string; perms: string[] };
  roles: { id: string; label: string; description: string; rank: number; assignable: boolean }[];
  members: { id: string; name: string; email: string; phone: string | null; avatar: string | null; role: string; roleLabel: string; fixed: boolean }[];
  invites: { id: string; role: string; label: string; createdAt: string }[];
}

function TeamAdmin() {
  const { me, toast } = useSession();
  const { data, setData, reload } = useLoad(() => api<TeamData>("GET", "/team"), [me?.user.id]);
  const [open, setOpen] = useState(false);
  if (!data) return null;
  const manage = data.me.perms.includes("team.manage");
  const roleOf = (id: string) => data.roles.find((r) => r.id === id);
  const change = async (memberId: string, role: string | null) => {
    if (!role && !confirm("Retirer cette personne de l'équipe ToBe ?")) return;
    try {
      await api("PATCH", `/team/members/${memberId}`, { role });
      if (!role) setData({ ...data, members: data.members.filter((m) => m.id !== memberId) });
      else setData({ ...data, members: data.members.map((m) => (m.id === memberId ? { ...m, role, roleLabel: roleOf(role)?.label ?? role } : m)) });
      toast(role ? "Rôle mis à jour" : "Membre retiré de l'équipe");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  const revoke = async (token: string) => {
    try {
      await api("DELETE", `/invites/${token}`);
      setData({ ...data, invites: data.invites.filter((i) => i.id !== token) });
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  return (
    <section className="mt-10">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Users className="size-5 text-brand" /> Équipe ToBe
        </h2>
        {manage && (
          <Button size="sm" icon={<UserPlus className="size-4" />} onClick={() => setOpen(true)}>
            Inviter un membre
          </Button>
        )}
      </div>
      <div className="mt-4 lg:grid lg:grid-cols-[1fr_340px] lg:items-start lg:gap-8">
        <div className="overflow-hidden rounded-2xl border border-line bg-card">
          {data.members.map((m) => {
            const editable = manage && !m.fixed && m.id !== me?.user.id && !!roleOf(m.role)?.assignable;
            return (
              <div key={m.id} className="flex items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
                <Avatar name={m.name || m.email} src={m.avatar} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {m.name || m.email} {m.id === me?.user.id && <span className="text-xs font-normal text-muted">(vous)</span>}
                  </div>
                  <div className="truncate text-xs text-muted">{m.email}</div>
                </div>
                {editable ? (
                  <select className="h-9 shrink-0 rounded-full border border-line bg-card px-3 text-xs font-semibold" value={m.role} onChange={(e) => change(m.id, e.target.value === "__remove" ? null : e.target.value)}>
                    {data.roles
                      .filter((r) => r.assignable || r.id === m.role)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                    <option value="__remove">Retirer de l'équipe</option>
                  </select>
                ) : (
                  <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-xs font-bold", m.role === "super_admin" ? "gold-gradient text-[#4a2c00]" : "bg-brand-soft text-brand dark:bg-brand/20 dark:text-white")}>{m.roleLabel}</span>
                )}
              </div>
            );
          })}
          {data.invites.map((i) => (
            <div key={i.id} className="flex items-center gap-3 border-t border-dashed border-line px-4 py-3">
              <span className="grid size-10 place-items-center rounded-full bg-card-2 text-faint">
                <UserPlus className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{i.label || "Invitation envoyée"}</span>
                <span className="block text-xs text-muted">
                  {roleOf(i.role)?.label} · en attente · {ago(i.createdAt)}
                </span>
              </span>
              <button onClick={() => revoke(i.id)} className="h-8 rounded-full border border-line px-3 text-xs font-semibold">
                Annuler
              </button>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-2 lg:mt-0">
          {data.roles.map((r) => (
            <div key={r.id} className={cx("rounded-2xl border p-3.5", r.id === data.me.role ? "border-brand/40 bg-brand-soft/60 dark:bg-brand/15" : "border-line bg-card")}>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="size-4 text-brand" /> {r.label}
                {r.id === data.me.role && <span className="text-xs font-normal text-muted">· votre rôle</span>}
              </div>
              <div className="mt-0.5 text-xs text-muted">{r.description}</div>
            </div>
          ))}
        </div>
      </div>
      <InviteSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Inviter dans l'équipe ToBe"
        roles={data.roles.map((r) => ({ id: r.id, label: r.label, description: r.description, disabled: !r.assignable }))}
        create={(role, label) => api<InviteResult>("POST", "/team/invites", { role, label })}
        onCreated={reload}
      />
    </section>
  );
}

/** Erreurs rencontrées par les visiteurs dans l'application, signalées automatiquement. */
function ErrorsAdmin() {
  const { toast } = useSession();
  const { data, setData } = useLoad(() => api<ClientError[]>("GET", "/admin/client-errors"), []);
  const [open, setOpen] = useState<number | null>(null);
  if (!data) return null;
  return (
    <section className="rounded-[24px] border border-line bg-card p-4 lg:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold">
          <Bug className="size-5 text-brand" /> Erreurs de l'application
        </h2>
        {data.length > 0 && (
          <button
            className="text-sm font-semibold text-brand"
            onClick={async () => {
              try {
                await api("DELETE", "/admin/client-errors");
                setData([]);
                toast("Liste vidée");
              } catch (e) {
                toast((e as Error).message, "error");
              }
            }}
          >
            Tout effacer
          </button>
        )}
      </div>
      {data.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Aucune erreur signalée. Tout roule.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {data.map((x, i) => (
            <li key={i} className="rounded-2xl bg-card-2 p-3 text-sm">
              <button className="w-full text-left" onClick={() => setOpen(open === i ? null : i)}>
                <div className="font-semibold">{x.message}</div>
                <div className="mt-0.5 text-xs text-muted">
                  {x.path} · {x.count} fois · {ago(x.lastAt)}
                </div>
              </button>
              {open === i && <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-all text-[11px] text-muted">{x.ua}\n\n{x.stack}</pre>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface PaymentsData {
  totals: { collected: number; commission: number; toPay: number };
  intents: { id: string; description: string; amount: number; status: string; error: string | null; createdAt: string; user: string }[];
  payouts: { id: string; organizer: string; amount: number; status: "queued" | "sending" | "sent" | "failed" | "manual"; phone: string | null; network: string | null; error: string | null; updatedAt: string; attempts: number }[];
}

const PAYOUT_LABEL: Record<PaymentsData["payouts"][number]["status"], string> = { queued: "En attente", sending: "Envoyé, en confirmation", sent: "Reçu", failed: "Échec, nouvel essai", manual: "À faire à la main" };
const INTENT_LABEL: Record<string, string> = { created: "Ouvert", pending: "En attente", paid: "Payé", failed: "Échoué", expired: "Expiré" };

/** Paiements Mobile Money reçus et reversements aux organisateurs. */
function PaymentsAdmin() {
  const { toast, paymentsMode } = useSession();
  const { data, setData } = useLoad(() => api<PaymentsData>("GET", "/admin/payments"), []);
  if (!data || paymentsMode !== "online") return null;
  const act = async (id: string, a: "done" | "retry") => {
    if (a === "done" && !confirm("Confirmez que ce montant a bien été envoyé à l'organisateur depuis le tableau de bord SasPay.")) return;
    try {
      setData(await api<PaymentsData>("POST", `/admin/payouts/${id}/${a}`));
      toast(a === "done" ? "Reversement marqué comme fait" : "Nouvel essai programmé");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  const todo = data.payouts.filter((p) => p.status === "manual" || p.status === "failed");
  return (
    <section className="rounded-[24px] border border-line bg-card p-4 lg:p-6">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold">
        <Banknote className="size-5 text-brand" /> Paiements et reversements
      </h2>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          ["Encaissé", data.totals.collected],
          ["Commission ToBe", data.totals.commission],
          ["À reverser", data.totals.toPay],
        ].map(([l, v]) => (
          <div key={l as string} className="rounded-2xl bg-card-2 p-3">
            <div className="text-xs text-muted">{l}</div>
            <div className="font-display font-bold">{formatFcfa(v as number)}</div>
          </div>
        ))}
      </div>
      {todo.length > 0 && (
        <div className="mt-4 space-y-2">
          <h3 className="text-sm font-bold">À traiter</h3>
          {todo.map((p) => (
            <div key={p.id} className="rounded-2xl border border-coral/40 bg-coral/5 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <b>{p.organizer}</b>
                <b className="font-display">{formatFcfa(p.amount)}</b>
              </div>
              <div className="text-xs text-muted">
                {p.network ?? "?"} · +228 {p.phone ?? "?"} · {PAYOUT_LABEL[p.status]}
              </div>
              {p.error && <div className="mt-1 text-xs text-coral">{p.error}</div>}
              <div className="mt-2 flex gap-2">
                <button className="rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white" onClick={() => act(p.id, "done")}>
                  Envoyé à la main
                </button>
                <button className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold" onClick={() => act(p.id, "retry")}>
                  Réessayer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <h3 className="mt-4 text-sm font-bold">Derniers paiements</h3>
      {data.intents.length === 0 ? (
        <p className="mt-1 text-sm text-muted">Aucun paiement pour l'instant.</p>
      ) : (
        <ul className="mt-1 divide-y divide-line text-sm">
          {data.intents.slice(0, 15).map((i) => (
            <li key={i.id} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate">{i.description}</span>
                <span className="text-xs text-muted">
                  {i.user} · {ago(i.createdAt)} · {INTENT_LABEL[i.status] ?? i.status}
                  {i.error ? ` · ${i.error}` : ""}
                </span>
              </span>
              <b className="font-display">{formatFcfa(i.amount)}</b>
            </li>
          ))}
        </ul>
      )}
      <h3 className="mt-4 text-sm font-bold">Reversements</h3>
      <ul className="mt-1 divide-y divide-line text-sm">
        {data.payouts.slice(0, 15).map((p) => (
          <li key={p.id} className="flex items-center gap-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate">{p.organizer}</span>
              <span className="text-xs text-muted">
                {ago(p.updatedAt)} · {PAYOUT_LABEL[p.status]}
              </span>
            </span>
            <b className="font-display">{formatFcfa(p.amount)}</b>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface ModEvent { id: string; slug: string; title: string; startsAt: string; organizerName: string; organizerVerified: boolean; moderation: "review" | "suspended" | null; reason: string | null; reports: number; paid: boolean }
interface ModData {
  verifications: { userId: string; email: string; events: number; fullName: string; phone: string; orgName: string; link: string; about: string; submittedAt: string; kind?: "person" | "structure"; idDocs?: string[]; selfie?: string | null; structureDocs?: string[]; structureNumber?: string; role?: string }[];
  toVerify: (ModEvent & { proofs: { fileId: string; label: string }[]; proofNote: string | null; proofSubmittedAt: string | null; organizerRequest: string | null })[];
  events: ModEvent[];
  reports: { id: string; reason: string; details: string; createdAt: string; by: string; event: ModEvent | null }[];
  unverifiedSelling: ModEvent[];
}

/** Garde-fous : vérifier les organisateurs, trancher sur les doublons et les signalements. */
function ModerationAdmin() {
  const { toast } = useSession();
  const { data, setData } = useLoad(() => api<ModData>("GET", "/admin/moderation"), []);
  if (!data) return null;
  const run = async (p: Promise<ModData>, ok: string) => {
    try {
      setData(await p);
      toast(ok);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  const verify = (id: string, decision: "verified" | "rejected") => {
    const reason = decision === "rejected" ? (prompt("Motif du refus (envoyé à l'organisateur)") ?? "") : "";
    if (decision === "rejected" && !reason) return;
    void run(api<ModData>("POST", `/admin/verifications/${id}`, { decision, reason }), decision === "verified" ? "Organisateur vérifié : ventes ouvertes" : "Demande refusée");
  };
  const moderate = (id: string, action: "approve" | "suspend") => {
    const reason = action === "suspend" ? (prompt("Motif (envoyé à l'organisateur)") ?? "") : "";
    if (action === "suspend" && !reason) return;
    void run(api<ModData>("POST", `/admin/events/${id}/moderation`, { action, reason }), action === "approve" ? "Événement validé" : "Événement retiré, reversements bloqués");
  };
  const wa = (phone: string) => `https://wa.me/${phone.replace(/\D/g, "").length === 8 ? "228" : ""}${phone.replace(/\D/g, "")}`;
  const total = data.verifications.length + data.toVerify.filter((e) => e.proofs.length).length + data.events.length + data.reports.length;
  const Ev = ({ e }: { e: ModEvent }) => (
    <div className="rounded-2xl border border-line p-3 text-sm">
      <Link to={`/evenement/${e.slug}`} className="font-semibold underline-offset-2 hover:underline">
        {e.title}
      </Link>
      <div className="text-xs text-muted">
        {e.organizerName} {e.organizerVerified ? "· vérifié" : "· non vérifié"} · {e.startsAt.slice(0, 10)}
        {e.reports ? ` · ${e.reports} signalement(s)` : ""}
      </div>
      {e.reason && <div className="mt-1 text-xs text-coral">{e.reason}</div>}
      <div className="mt-2 flex gap-2">
        {e.moderation !== null && (
          <button className="rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white" onClick={() => moderate(e.id, "approve")}>
            Valider
          </button>
        )}
        {e.moderation !== "suspended" && (
          <button className="rounded-full border border-coral px-3 py-1.5 text-xs font-semibold text-coral" onClick={() => moderate(e.id, "suspend")}>
            Retirer
          </button>
        )}
      </div>
    </div>
  );
  return (
    <section className="rounded-[24px] border border-line bg-card p-4 lg:p-6">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold">
        <ShieldAlert className="size-5 text-brand" /> Garde-fous {total > 0 && <span className="rounded-full bg-coral px-2 py-0.5 text-xs text-white">{total}</span>}
      </h2>
      <p className="mt-1 text-xs text-muted">Organisateurs à vérifier (documents privés), événements à vérifier avant d'ouvrir leur billetterie, doublons possibles, signalements du public.</p>

      <h3 className="mt-4 text-sm font-bold">Organisateurs à vérifier</h3>
      {data.verifications.length === 0 ? (
        <p className="text-sm text-muted">Aucune demande.</p>
      ) : (
        <div className="mt-2 space-y-2">
          {data.verifications.map((v) => (
            <div key={v.userId} className="rounded-2xl border border-line p-3 text-sm">
              <div className="font-semibold">
                {v.fullName} · {v.orgName}
              </div>
              <div className="text-xs text-muted">
                {v.email} · {v.events} événement(s) · {ago(v.submittedAt)}
              </div>
              {v.link && (
                <a href={/^https?:/.test(v.link) ? v.link : `https://${v.link}`} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-brand">
                  {v.link}
                </a>
              )}
              {v.about && <p className="mt-1 text-xs">{v.about}</p>}
              <div className="mt-1 text-xs">
                {v.kind === "structure" ? `Structure · RCCM/récépissé ${v.structureNumber ?? "?"} · ${v.role || "fonction ?"}` : "Particulier"}
              </div>
              <div className="mt-2 flex gap-2 overflow-x-auto">
                {(v.idDocs ?? []).map((d, i) => (
                  <PrivateThumb key={d} id={d} label={i ? "Pièce (verso)" : "Pièce (recto)"} />
                ))}
                {v.selfie && <PrivateThumb id={v.selfie} label="Selfie avec la pièce" />}
                {(v.structureDocs ?? []).map((d) => (
                  <PrivateThumb key={d} id={d} label="Document structure" />
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">Contrôlez : nom identique sur la pièce et le formulaire, visage du selfie, pièce en cours de validité, RCCM au nom de la structure. En cas de doute, appel vidéo WhatsApp.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <a href={wa(v.phone)} target="_blank" rel="noreferrer" className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold">
                  WhatsApp {v.phone}
                </a>
                <button className="rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white" onClick={() => verify(v.userId, "verified")}>
                  Vérifié
                </button>
                <button className="rounded-full border border-coral px-3 py-1.5 text-xs font-semibold text-coral" onClick={() => verify(v.userId, "rejected")}>
                  Refuser
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 className="mt-4 text-sm font-bold">Événements à vérifier</h3>
      {data.toVerify.length === 0 ? (
        <p className="text-sm text-muted">Aucun.</p>
      ) : (
        <div className="mt-2 space-y-2">
          {data.toVerify.map((e) => (
            <div key={e.id} className="rounded-2xl border border-line p-3 text-sm">
              <Link to={`/evenement/${e.slug}`} className="font-semibold underline-offset-2 hover:underline">
                {e.title}
              </Link>
              <div className="text-xs text-muted">
                {e.organizerName} · organisateur {e.organizerVerified ? "vérifié" : e.organizerRequest === "pending" ? "en attente de vérification" : "non vérifié"} · {e.startsAt.slice(0, 10)}
                {e.paid ? " · payant" : ""}
              </div>
              {e.proofs.length ? (
                <div className="mt-2 flex gap-2 overflow-x-auto">
                  {e.proofs.map((p) => (
                    <PrivateThumb key={p.fileId} id={p.fileId} label={p.label} />
                  ))}
                </div>
              ) : (
                <div className="mt-1 text-xs text-muted">Aucune preuve envoyée pour l'instant.</div>
              )}
              {e.proofNote && <div className="mt-1 text-xs">« {e.proofNote} »</div>}
              <div className="mt-2 flex gap-2">
                <button
                  disabled={e.paid && !e.organizerVerified}
                  title={e.paid && !e.organizerVerified ? "Vérifiez d'abord l'organisateur" : undefined}
                  className="rounded-full bg-emerald px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                  onClick={() => moderate(e.id, "approve")}
                >
                  Vérifier l'événement
                </button>
                <button className="rounded-full border border-coral px-3 py-1.5 text-xs font-semibold text-coral" onClick={() => moderate(e.id, "suspend")}>
                  Retirer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {data.events.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-bold">Doublons possibles et événements retirés</h3>
          <div className="mt-2 space-y-2">
            {data.events.map((e) => (
              <Ev key={e.id} e={e} />
            ))}
          </div>
        </>
      )}

      {data.reports.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-bold">Signalements</h3>
          <ul className="mt-1 divide-y divide-line text-sm">
            {data.reports.map((r) => (
              <li key={r.id} className="py-2">
                <b>{r.event?.title ?? "?"}</b> · {r.reason}
                <div className="text-xs text-muted">
                  par {r.by} · {ago(r.createdAt)}
                  {r.details ? ` · « ${r.details} »` : ""}
                </div>
                {r.event && !r.event.moderation && (
                  <button className="mt-1 rounded-full border border-coral px-3 py-1 text-xs font-semibold text-coral" onClick={() => moderate(r.event!.id, "suspend")}>
                    Retirer l'événement
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {data.unverifiedSelling.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-bold">Événements payants en attente (organisateur non vérifié)</h3>
          <ul className="mt-1 text-sm text-muted">
            {data.unverifiedSelling.map((e) => (
              <li key={e.id}>
                {e.title} · {e.organizerName}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
