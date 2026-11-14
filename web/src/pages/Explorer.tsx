import type { EventCard } from "@tobe/core";
import { List, Map as MapIcon, Search, SearchX, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { eventPath, RowCard, SkeletonRows, TileCard } from "../components/events";
import { EventMap } from "../components/Map";
import { Chip, Empty, ErrorState, Segmented, inputCls } from "../components/ui";
import { CategoryIcon } from "../components/visual";
import { api } from "../lib/api";
import { CATEGORY_LABELS, shortDate } from "../lib/format";
import { useLoad } from "../lib/useLoad";

const WHEN = [
  ["all", "Toutes dates"],
  ["today", "Aujourd'hui"],
  ["weekend", "Ce week-end"],
  ["week", "7 jours"],
  ["month", "30 jours"],
] as const;
const CATS = ["all", "concert", "soiree", "corporate", "culture", "concours", "sport", "religieux", "mariage", "anniversaire", "funerailles"] as const;

export function Explorer() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const category = params.get("category") ?? "all";
  const when = params.get("when") ?? "all";
  const price = params.get("price") ?? "all";
  const sort = params.get("sort") ?? "date";
  const [view, setView] = useState<"list" | "map">("list");
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (v === "all" || v === "") p.delete(k);
    else p.set(k, v);
    setParams(p, { replace: true });
  };
  const { data, error, loading, reload } = useLoad(
    () => api<EventCard[]>("GET", "/events", undefined, { q: params.get("q") ?? "", category, when, price, sort: sort === "impact" ? "impact" : "" }),
    [params.toString()],
  );
  const points = useMemo(
    () =>
      (data ?? [])
        .filter((e) => e.lat !== null && e.lng !== null)
        .map((e) => ({ id: e.id, lat: e.lat!, lng: e.lng!, title: e.title, sub: `${shortDate(e.startsAt)} · ${e.venue}`, link: eventPath(e) })),
    [data],
  );

  return (
    <div className="pt-safe">
      <div className="sticky top-0 z-20 bg-app/90 px-5 pb-3 pt-4 backdrop-blur-xl lg:top-16 lg:px-0">
        <h1 className="text-[26px] font-extrabold lg:text-[34px]">Explorer</h1>
        <form
          className="relative mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            set("q", q.trim());
          }}
        >
          <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-faint" />
          <input className={`${inputCls} pl-12 pr-10`} placeholder="Rechercher un événement, un lieu…" value={q} onChange={(e) => setQ(e.target.value)} enterKeyHint="search" />
          {q && (
            <button type="button" aria-label="Effacer" onClick={() => (setQ(""), set("q", ""))} className="absolute right-3 top-1/2 -translate-y-1/2 text-faint">
              <X className="size-5" />
            </button>
          )}
        </form>
        <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5">
          {CATS.map((c) => (
            <Chip key={c} active={category === c} onClick={() => set("category", c)} icon={c !== "all" ? <CategoryIcon category={c} className="size-4" /> : undefined}>
              {c === "all" ? "Tout" : CATEGORY_LABELS[c]}
            </Chip>
          ))}
        </div>
        <div className="no-scrollbar -mx-5 mt-2 flex gap-2 overflow-x-auto px-5">
          {WHEN.map(([v, l]) => (
            <Chip key={v} active={when === v} onClick={() => set("when", v)}>
              {l}
            </Chip>
          ))}
          <span className="mx-1 w-px shrink-0 bg-ink/10" />
          {[
            ["free", "Gratuit"],
            ["paid", "Payant"],
          ].map(([v, l]) => (
            <Chip key={v} active={price === v} onClick={() => set("price", price === v ? "all" : v)}>
              {l}
            </Chip>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1">
            <Segmented value={sort} onChange={(v) => set("sort", v === "date" ? "all" : v)} options={[{ value: "date", label: "Par date" }, { value: "impact", label: "Par impact" }]} />
          </div>
          <button
            onClick={() => setView(view === "list" ? "map" : "list")}
            className="flex h-11 items-center gap-1.5 rounded-full border border-line bg-card px-4 text-sm font-semibold"
          >
            {view === "list" ? <MapIcon className="size-4 text-brand" /> : <List className="size-4 text-brand" />}
            {view === "list" ? "Carte" : "Liste"}
          </button>
        </div>
      </div>

      {loading && <SkeletonRows />}
      {error && <ErrorState message={error.message} onRetry={reload} />}
      {data && data.length === 0 && (
        <Empty
          icon={<SearchX className="size-7" />}
          title="Aucun événement trouvé"
          text={params.toString() ? "Essayez une autre date, une autre catégorie ou un autre mot." : "Aucun événement publié pour l'instant. Le vôtre peut être le premier."}
          action={<Link to="/creer" className="font-semibold text-brand">Créer un événement</Link>}
        />
      )}
      {data && data.length > 0 && view === "list" && (
        <div className="px-5 pb-6 lg:px-0">
          <div className="mb-3 text-sm text-muted">{data.length} événement{data.length > 1 ? "s" : ""}</div>
          <div className="space-y-3 lg:hidden">
            {data.map((e) => (
              <RowCard key={e.id} e={e} />
            ))}
          </div>
          <div className="hidden grid-cols-4 gap-6 lg:grid">
            {data.map((e) => (
              <TileCard key={e.id} e={e} wide />
            ))}
          </div>
        </div>
      )}
      {data && data.length > 0 && view === "map" && (
        <div className="px-5 pb-6 lg:px-0">
          <EventMap points={points} height={typeof window !== "undefined" && window.innerWidth >= 1024 ? 620 : 460} />
          {points.length < data.length && <p className="mt-2 text-xs text-faint">{data.length - points.length} événement(s) sans position sur la carte.</p>}
        </div>
      )}
    </div>
  );
}
