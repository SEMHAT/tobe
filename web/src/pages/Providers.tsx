import type { Provider } from "@tobe/core";
import { BadgeCheck, MapPin, Search, Star, Store } from "lucide-react";
import { useState } from "react";
import { Button, Chip, Empty, ErrorState, Field, PageLoader, Sheet, TopBar, inputCls } from "../components/ui";
import { Avatar } from "../components/visual";
import { api } from "../lib/api";
import { formatFcfa } from "../lib/format";
import { useSession } from "../lib/session";
import { useLoad } from "../lib/useLoad";

const CATS: [string, string][] = [
  ["all", "Tous"],
  ["mc", "MC"],
  ["deco", "Décoration"],
  ["son", "Son & lumière"],
  ["photo", "Photo & vidéo"],
  ["traiteur", "Traiteurs"],
  ["securite", "Sécurité"],
  ["costume", "Costumes"],
  ["logistique", "Logistique"],
];
const CAT_LABEL = Object.fromEntries(CATS);

export function Providers() {
  const [category, setCategory] = useState("all");
  const [q, setQ] = useState("");
  const { data, error, loading } = useLoad(() => api<Provider[]>("GET", "/providers", undefined, { category, q }), [category, q]);
  const [pick, setPick] = useState<Provider | null>(null);
  return (
    <div className="pb-8">
      <TopBar title="Prestataires" />
      <div className="px-5 pt-3">
        <p className="text-sm text-muted">Des professionnels sélectionnés. Le badge « Certifié ToBe » signale ceux formés par ToBe Academy.</p>
        <div className="relative mt-4">
          <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-faint" />
          <input className={`${inputCls} pl-12`} placeholder="Rechercher un prestataire" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-5">
        {CATS.map(([v, l]) => (
          <Chip key={v} active={category === v} onClick={() => setCategory(v)}>
            {l}
          </Chip>
        ))}
      </div>
      {loading && <PageLoader />}
      {error && <ErrorState message={error.message} />}
      {data && data.length === 0 && <Empty icon={<Store className="size-7" />} title="Aucun prestataire" text="Essayez une autre catégorie." />}
      <div className="space-y-3 px-5 pt-4">
        {data?.map((p) => (
          <button key={p.id} onClick={() => setPick(p)} className="flex w-full gap-3.5 rounded-[20px] border border-line bg-card p-3.5 text-left">
            <Avatar name={p.name} size={56} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 font-display font-bold">
                <span className="truncate">{p.name}</span> {p.certified && <BadgeCheck className="size-4 shrink-0 text-gold" />}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                <span>{CAT_LABEL[p.category]}</span>·
                <span className="flex items-center gap-0.5">
                  <MapPin className="size-3" /> {p.city}
                </span>
              </div>
              <p className="mt-1.5 line-clamp-2 text-sm text-ink/80">{p.bio}</p>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="flex items-center gap-1 font-semibold">
                  <Star className="size-4 fill-gold text-gold" /> {p.rating.toFixed(1)} <span className="font-normal text-muted">({p.reviews})</span>
                </span>
                <span className="text-muted">dès {formatFcfa(p.priceFrom)}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
      <QuoteSheet p={pick} onClose={() => setPick(null)} />
    </div>
  );
}

function QuoteSheet({ p, onClose }: { p: Provider | null; onClose: () => void }) {
  const { requireAuth, toast } = useSession();
  const [message, setMessage] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open={!!p} onClose={onClose} title={p?.name}>
      {p && (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!(await requireAuth("Connectez-vous pour demander un devis."))) return;
            setBusy(true);
            try {
              await api("POST", `/providers/${p.id}/quote`, { message, date: date || null });
              toast("Demande de devis envoyée");
              setMessage("");
              onClose();
            } catch (err) {
              toast((err as Error).message, "error");
            }
            setBusy(false);
          }}
        >
          <p className="text-sm text-muted">{p.bio}</p>
          <Field label="Date de l'événement">
            <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Votre besoin">
            <textarea className={`${inputCls} min-h-28`} placeholder="Type d'événement, nombre d'invités, lieu, budget…" value={message} onChange={(e) => setMessage(e.target.value)} />
          </Field>
          <Button full type="submit" loading={busy} disabled={message.trim().length < 5}>
            Demander un devis
          </Button>
        </form>
      )}
    </Sheet>
  );
}
