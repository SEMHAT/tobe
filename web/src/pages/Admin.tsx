import type { EventCard, Provider, TobeRequest } from "@tobe/core";
import { BadgeCheck, Gift, Mail, Phone, Plus, Sparkles, Store, Trophy } from "lucide-react";
import { useState } from "react";
import { Button, Empty, ErrorState, Field, PageLoader, Sheet, Stat, TopBar, cx, inputCls } from "../components/ui";
import { api } from "../lib/api";
import { ago, compact, formatFcfa, formatPhone } from "../lib/format";
import { useSession } from "../lib/session";
import { useLoad } from "../lib/useLoad";

interface Overview {
  requests: (TobeRequest & { event: EventCard | null })[];
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
      <TopBar title="Espace agence ToBe" />
      <div className="px-5 pt-4 lg:px-0">
        {payments && <><div className="rounded-[22px] brand-gradient p-5 text-white">
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
              <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto">
                {STATUSES.map(([s, l]) => (
                  <button key={s} onClick={() => setStatus(r.id, s)} className={cx("h-8 shrink-0 rounded-full border px-3 text-xs font-semibold", r.status === s ? "border-brand bg-brand text-white" : "border-line")}>
                    {l}
                  </button>
                ))}
              </div>
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
                <div className="mt-3 flex flex-wrap gap-1.5">
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
                </div>
              </div>
            ))}
          </div>
        </div>
        </div>
        <ClubAdmin />
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
