import { BarChart3, Info } from "lucide-react";
import { useState } from "react";
import { ErrorState, PageLoader, TopBar, cx } from "../components/ui";
import { api } from "../lib/api";
import { formatFcfa } from "../lib/format";
import { useLoad } from "../lib/useLoad";

type Obs = {
  generatedAt: string;
  totals: { events: number; upcoming: number; tickets: number; organizers: number; verifiedOrganizers: number; verifiedEvents: number; cancelled: number; freeShare: number; avgPrice: number; paidToOrganizers: number; photos: number };
  byCategory: { category: string; label: string; events: number }[];
  byCity: { city: string; events: number }[];
  byWeekday: { day: string; events: number }[];
  months: { month: string; events: number; tickets: number }[];
};

const nf = (n: number) => n.toLocaleString("fr-FR");
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("fr-FR", { month: "short", timeZone: "UTC" }).replace(".", "");

/** Observatoire public des événements au Togo : chiffres agrégés, aucune donnée personnelle. */
export function Observatory() {
  const { data, error, loading } = useLoad(() => api<Obs>("GET", "/observatoire"), []);
  if (loading) return <PageLoader />;
  if (error || !data)
    return (
      <>
        <TopBar title="Observatoire" />
        <ErrorState message={error?.message ?? "Indisponible"} />
      </>
    );
  const t = data.totals;
  return (
    <div className="pb-16 lg:mx-auto lg:max-w-4xl">
      <TopBar title="Observatoire des événements" />
      <div className="space-y-6 px-5 pt-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-brand">
            <BarChart3 className="size-4" /> Données ouvertes ToBe
          </div>
          <h1 className="mt-1 font-display text-2xl font-extrabold leading-tight">La vie culturelle du Togo en chiffres</h1>
          <p className="mt-1 text-sm text-muted">Les 12 derniers mois d'événements publics sur ToBe. Chiffres agrégés, sans aucune donnée personnelle, mis à jour en continu. Libres de réutilisation en citant ToBe.</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Événements" value={nf(t.events)} sub={`${nf(t.upcoming)} à venir`} />
          <Tile label="Billets émis" value={nf(t.tickets)} sub={t.avgPrice ? `prix moyen ${formatFcfa(t.avgPrice)}` : "—"} />
          <Tile label="Organisateurs" value={nf(t.organizers)} sub={`${nf(t.verifiedOrganizers)} vérifiés`} />
          <Tile label="Versé aux organisateurs" value={formatFcfa(t.paidToOrganizers)} sub="via Mobile Money" />
          <Tile label="Gratuits ou sur invitation" value={`${t.freeShare} %`} sub="des événements" />
          <Tile label="Événements vérifiés" value={nf(t.verifiedEvents)} sub="preuves contrôlées" />
          <Tile label="Annulés" value={nf(t.cancelled)} sub="acheteurs remboursés" />
          <Tile label="Photos partagées" value={nf(t.photos)} sub="galeries d'événements" />
        </div>

        <Card title="Événements par mois">
          <Columns data={data.months.map((m) => ({ key: m.month, label: monthLabel(m.month), value: m.events, tip: `${monthLabel(m.month)} : ${nf(m.events)} événement(s), ${nf(m.tickets)} billet(s)` }))} />
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Par type d'événement">
            <Rows data={data.byCategory.map((c) => ({ key: c.category, label: c.label, value: c.events }))} />
          </Card>
          <Card title="Par ville">
            <Rows data={data.byCity.map((c) => ({ key: c.city, label: c.city, value: c.events }))} />
          </Card>
        </div>

        <Card title="Jour de la semaine">
          <Columns data={data.byWeekday.map((d) => ({ key: d.day, label: d.day, value: d.events, tip: `${d.day} : ${nf(d.events)} événement(s)` }))} />
        </Card>

        <p className="flex items-start gap-2 text-xs text-muted">
          <Info className="mt-0.5 size-4 shrink-0" /> Source : plateforme ToBe, événements publics des 12 derniers mois (hors événements privés et retirés). Mis à jour le {new Date(data.generatedAt).toLocaleString("fr-FR")}.
        </p>
      </div>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 font-display text-xl font-extrabold">{value}</div>
      <div className="text-xs text-faint">{sub}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <h2 className="mb-4 font-display font-bold">{title}</h2>
      {children}
    </section>
  );
}

/** Barres verticales, une seule couleur (une seule série) ; valeur au survol et sur la barre la plus haute. */
function Columns({ data }: { data: { key: string; label: string; value: number; tip: string }[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const top = data.reduce((a, b) => (b.value > a.value ? b : a), data[0]);
  return (
    <div>
      <div className="flex h-40 items-end gap-1.5 border-b border-line" role="list">
        {data.map((d) => (
          <div key={d.key} role="listitem" aria-label={d.tip} className="relative flex h-full flex-1 items-end" onMouseEnter={() => setHover(d.key)} onMouseLeave={() => setHover(null)} onClick={() => setHover(hover === d.key ? null : d.key)}>
            {(hover === d.key || (hover === null && d.key === top?.key && d.value > 0)) && (
              <span className="absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-[11px] font-semibold text-app">{hover === d.key ? d.tip : nf(d.value)}</span>
            )}
            <div className={cx("w-full rounded-t-[4px] bg-brand transition-opacity", hover && hover !== d.key && "opacity-40")} style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value ? 3 : 0 }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {data.map((d) => (
          <span key={d.key} className="flex-1 text-center text-[10px] text-muted">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Barres horizontales triées, valeur en texte. */
function Rows({ data }: { data: { key: string; label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <p className="text-sm text-muted">Pas encore de données.</p>;
  return (
    <ul className="space-y-2.5">
      {data.map((d) => (
        <li key={d.key} className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-3 text-sm">
          <span className="truncate text-muted">{d.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-card-2">
            <span className="block h-full rounded-full bg-brand" style={{ width: `${(d.value / max) * 100}%` }} />
          </span>
          <span className="text-right font-semibold tabular-nums">{nf(d.value)}</span>
        </li>
      ))}
    </ul>
  );
}
