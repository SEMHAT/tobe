import type { EventCard, TobeRequest } from "@tobe/core";
import { Phone, Sparkles } from "lucide-react";
import { Empty, ErrorState, PageLoader, Stat, TopBar, cx } from "../components/ui";
import { api } from "../lib/api";
import { ago, compact, formatFcfa, formatPhone } from "../lib/format";
import { useSession } from "../lib/session";
import { useLoad } from "../lib/useLoad";

interface Overview {
  requests: (TobeRequest & { event: EventCard | null })[];
  revenue: Record<string, { amount: number; platform: number; count: number }>;
  platformTotal: number;
  counts: { users: number; events: number; tickets: number; photos: number; passUsers: number; quotes: number };
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
  const { me, toast } = useSession();
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
  return (
    <div className="pb-10">
      <TopBar title="Espace agence ToBe" />
      <div className="px-5 pt-4">
        <div className="rounded-[22px] gold-gradient p-5 text-[#1b1206]">
          <div className="text-sm font-semibold">Revenus de la plateforme</div>
          <div className="mt-1 font-display text-3xl font-extrabold">{formatFcfa(data.platformTotal)}</div>
        </div>
        <div className="mt-3 space-y-2">
          {Object.entries(data.revenue).map(([k, r]) => (
            <div key={k} className="flex items-center justify-between rounded-2xl border border-line bg-card px-4 py-3 text-sm">
              <span>
                <span className="font-semibold">{KIND[k] ?? k}</span> <span className="text-muted">· {r.count} paiement(s)</span>
              </span>
              <span className="font-display font-bold text-gold">{formatFcfa(r.platform)}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Stat label="Comptes" value={compact(data.counts.users)} />
          <Stat label="Événements" value={compact(data.counts.events)} />
          <Stat label="Billets" value={compact(data.counts.tickets)} />
          <Stat label="Photos" value={compact(data.counts.photos)} />
          <Stat label="Pass actifs" value={compact(data.counts.passUsers)} />
          <Stat label="Devis presta." value={compact(data.counts.quotes)} />
        </div>

        <h2 className="mb-3 mt-7 flex items-center gap-2 text-lg font-bold">
          <Sparkles className="size-5 text-gold" /> Demandes « Confier à ToBe »
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
                <a href={`tel:${r.phone}`} className="flex shrink-0 items-center gap-1 rounded-full bg-gold/15 px-3 py-1.5 text-xs font-bold text-gold">
                  <Phone className="size-3.5" /> Appeler
                </a>
              </div>
              <div className="mt-2 text-sm">
                {r.name || "Client"} · {formatPhone(r.phone)}
              </div>
              {r.services.length > 0 && <div className="mt-1 text-sm text-muted">{r.services.join(", ")}</div>}
              {r.budget && <div className="mt-1 text-sm">Budget : {r.budget}</div>}
              {r.note && <p className="mt-1 text-sm italic text-muted">« {r.note} »</p>}
              <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto">
                {STATUSES.map(([s, l]) => (
                  <button key={s} onClick={() => setStatus(r.id, s)} className={cx("h-8 shrink-0 rounded-full border px-3 text-xs font-semibold", r.status === s ? "border-gold bg-gold text-[#1b1206]" : "border-line")}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
