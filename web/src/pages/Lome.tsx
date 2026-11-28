import { CATEGORY_LABELS, type EventCard } from "@tobe/core";
import { CalendarPlus, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { RowCard, SkeletonRows } from "../components/events";
import { ErrorState, Section } from "../components/ui";
import { api } from "../lib/api";
import { usePageMeta } from "../lib/seo";
import { useLoad } from "../lib/useLoad";

// « Événements à Lomé » : l'agenda de la ville rangé par période.
// Se remplit seul avec les événements publics publiés ; aucune saisie à faire.

const DAY = 86_400_000;

function periodes(events: EventCard[]) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const debut = d.getTime();
  const dow = d.getDay();
  const vendredi = dow === 6 ? debut - DAY : dow === 0 ? debut - 2 * DAY : debut + ((5 - dow + 7) % 7) * DAY;
  const enCours = (e: EventCard, from: number, to: number) => {
    const t = new Date(e.startsAt).getTime();
    const end = e.endsAt ? new Date(e.endsAt).getTime() : t + 8 * 3600_000;
    return t < to && end >= from;
  };
  const vus = new Set<string>();
  const prendre = (f: (e: EventCard) => boolean) => events.filter((e) => !vus.has(e.id) && f(e)).map((e) => (vus.add(e.id), e));
  return [
    ["Ce week-end à Lomé", prendre((e) => enCours(e, Math.max(vendredi, debut), vendredi + 3 * DAY)), "weekend"],
    ["Cette semaine", prendre((e) => enCours(e, debut, debut + 7 * DAY)), "week"],
    ["Ce mois-ci", prendre((e) => enCours(e, debut, debut + 31 * DAY)), "month"],
    ["Plus tard", prendre(() => true), "all"],
  ] as Array<[string, EventCard[], string]>;
}

export function Lome() {
  usePageMeta({
    title: "Événements à Lomé : que faire cette semaine ?",
    description: "Tous les événements à Lomé : concerts, soirées, conférences, festivals et concours, ce week-end, cette semaine et ce mois-ci. Mis à jour chaque jour.",
  });
  const { data, error, loading, reload } = useLoad(() => api<EventCard[]>("GET", "/events", undefined, { when: "all" }), []);
  const blocs = useMemo(() => periodes(data ?? []), [data]);
  const categories = useMemo(() => [...new Set((data ?? []).map((e) => e.category))], [data]);

  return (
    <div className="pt-safe pb-24">
      <header className="px-5 pt-5 lg:px-0">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand">L'agenda de la ville</p>
        <h1 className="mt-2 font-display text-[30px] font-black leading-tight lg:text-[42px]">Événements à Lomé</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
          Concerts, soirées, conférences, festivals, concours : tout ce qui se passe à Lomé, mis à jour chaque jour par les organisateurs. Réservez en Mobile Money et retrouvez vos photos après l'événement.
        </p>
        {categories.length > 1 && (
          <div className="no-scrollbar -mx-5 mt-4 flex gap-2 overflow-x-auto px-5 lg:mx-0 lg:flex-wrap lg:px-0">
            {categories.map((c) => (
              <Link key={c} to={`/explorer?category=${c}`} className="flex h-9 shrink-0 items-center rounded-full border border-line bg-card px-3.5 text-sm font-medium">
                {CATEGORY_LABELS[c]}
              </Link>
            ))}
          </div>
        )}
      </header>

      {loading && !data ? (
        <div className="mt-6"><SkeletonRows n={5} /></div>
      ) : error ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : !data?.length ? (
        <p className="mx-5 mt-8 rounded-2xl border border-line bg-card p-5 text-sm text-muted lg:mx-0">Aucun événement public à venir pour le moment. Revenez bientôt !</p>
      ) : (
        blocs
          .filter(([, list]) => list.length)
          .map(([titre, list, when]) => (
            <Section
              key={titre}
              title={titre}
              className="lg:[&>div]:px-0"
              action={when !== "all" ? <Link to={`/explorer?when=${when}`} className="flex items-center text-sm font-semibold text-brand">Filtrer <ChevronRight className="size-4" /></Link> : undefined}
            >
              <div className="grid gap-3 px-5 lg:grid-cols-2 lg:px-0">
                {list.map((e) => <RowCard key={e.id} e={e} />)}
              </div>
            </Section>
          ))
      )}

      <Link to="/creer" className="mx-5 mt-8 flex items-center gap-3 rounded-[20px] border border-line bg-card p-4 lg:mx-0">
        <CalendarPlus className="size-6 shrink-0 text-brand" />
        <span className="text-sm"><b>Vous organisez un événement à Lomé ?</b> <span className="text-muted">Publiez-le gratuitement en 2 minutes.</span></span>
        <ChevronRight className="ml-auto size-4 shrink-0 text-brand" />
      </Link>
    </div>
  );
}
