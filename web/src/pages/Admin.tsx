import type { EventCard, Provider, TobeRequest } from "@tobe/core";
import { BadgeCheck, Gift, ShieldCheck, UserPlus, Users, Mail, Phone, Plus, Sparkles, Store, Trophy } from "lucide-react";
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
      <div className="mt-4 lg:grid lg:grid-cols-[1fr_340px] lg:gap-8">
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
