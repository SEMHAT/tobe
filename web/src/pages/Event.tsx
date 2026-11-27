import { PRICING } from "@tobe/core";
import type { EventView } from "@tobe/core";
import { Ban,
  BadgeCheck,
  CalendarPlus,
  Camera,
  ChevronRight,
  Clock,
  Crown,
  HandCoins,
  Lock,
  MapPin,
  Radio,
  Settings2,
  Share2,
  Pencil,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Flag,
  Bell,
  BellRing,
  Check,
  Ticket,
  Users,
  DoorOpen,
  ExternalLink,
} from "lucide-react";
import { useEffect, useState } from "react";
import { askNotifications } from "../components/AppPrompts";
import { currentEndpoint, pushState } from "../lib/push";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { EventMap } from "../components/Map";
import { Button, Card, ErrorState, IconButton, PageLoader, Progress, Sheet, TopBar, cx, inputCls } from "../components/ui";
import { Avatar, Img, Poster, TierBadge } from "../components/visual";
import { api } from "../lib/api";
import { CATEGORY_LABELS, compact, countdown, formatFcfa, longDate, shareUrl, time, whatsappLink } from "../lib/format";
import { useT } from "../lib/i18n";
import { useSession } from "../lib/session";
import { useLoad } from "../lib/useLoad";
import { usePageMeta } from "../lib/seo";

type Tab = "infos" | "programme" | "votes" | "cagnotte" | "photos";

export function EventPage() {
  const { id = "" } = useParams();
  const [sp] = useSearchParams();
  const [code, setCode] = useState(sp.get("code") ?? sessionStorage.getItem(`code:${id}`) ?? "");
  const { me } = useSession();
  const { data: e, error, loading, reload } = useLoad(async () => {
    const ev = await api<EventView>("GET", `/events/${id}`, undefined, { code });
    if (code) sessionStorage.setItem(`code:${ev.id}`, code);
    return ev;
  }, [id, code, me?.user.id]);
  usePageMeta(e ? { title: e.title, description: `${e.venue}, ${e.city}. ${e.description}`, noindex: e.visibility !== "public" } : null);
  const [tab, setTab] = useState<Tab>("infos");

  if (loading && !e) return <PageLoader />;
  if (error?.data?.needCode) return <PrivateGate title={String(error.data.title ?? "Événement privé")} onCode={(c) => (sessionStorage.setItem(`code:${id}`, c), setCode(c))} wrong={!!code} />;
  if (error || !e)
    return (
      <>
        <TopBar title="Événement" />
        <ErrorState message={error?.message ?? "Introuvable"} onRetry={reload} />
      </>
    );

  const tabs: { id: Tab; label: string }[] = [
    { id: "infos", label: "Infos" },
    ...(e.program.length ? [{ id: "programme" as Tab, label: "Programme" }] : []),
    ...(e.contestId ? [{ id: "votes" as Tab, label: "Votes" }] : []),
    ...(e.cagnotteId ? [{ id: "cagnotte" as Tab, label: "Cagnotte" }] : []),
    ...(e.options.gallery || e.photoCount ? [{ id: "photos" as Tab, label: "Photos" }] : []),
  ];
  const minPrice = e.access === "paid" ? Math.min(...e.ticketTypes.map((t) => t.price)) : 0;
  const ended = new Date(e.endsAt ?? new Date(new Date(e.startsAt).getTime() + 8 * 3600_000)) < new Date();

  const share = async () => {
    const url = shareUrl(`/evenement/${e.slug}`) + (e.visibility === "private" && e.accessCode ? `?code=${e.accessCode}` : "");
    const text = `${e.title} — ${longDate(e.startsAt)} à ${time(e.startsAt)}, ${e.venue}. ${e.access === "none" ? "Infos" : "Infos et billets"} sur ToBe :`;
    if (navigator.share) {
      try {
        await navigator.share({ title: e.title, text, url });
        return;
      } catch {
        /* annulé */
      }
    }
    window.open(whatsappLink(`${text} ${url}`), "_blank");
  };

  return (
    <div className="pb-28 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-12 lg:pb-10">
      <div className="relative lg:sticky lg:top-24 lg:self-start lg:overflow-hidden lg:rounded-[32px]">
        <Poster cover={e.cover} theme={e.theme} category={e.category} title={e.title} showTitle={!e.cover} className="aspect-[4/4.4] w-full">
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-black/10 to-black/40" />
        </Poster>
        <div className="absolute inset-x-0 top-0">
          <TopBar
            transparent
            right={
              <>
                {e.isOrganizer && (
                  <Link to={`/organisateur/${e.id}/modifier`} aria-label="Modifier" className="grid size-10 place-items-center rounded-full bg-black/35 text-white backdrop-blur-md">
                    <Pencil className="size-5" />
                  </Link>
                )}
                {e.isOrganizer && (
                  <Link to={`/organisateur/${e.id}`} aria-label="Gérer" className="grid size-10 place-items-center rounded-full bg-black/35 text-white backdrop-blur-md">
                    <Settings2 className="size-5" />
                  </Link>
                )}
                <IconButton label="Ajouter au calendrier" onClick={() => downloadIcs(e)}>
                  <CalendarPlus className="size-5" />
                </IconButton>
                <IconButton label="Partager" onClick={share}>
                  <Share2 className="size-5" />
                </IconButton>
              </>
            }
          />
        </div>
      </div>

      <div className="lg:min-w-0">
      <div className="relative -mt-16 px-5 lg:mt-0 lg:px-0">
        <div className="flex flex-wrap items-center gap-2">
          <TierBadge tier={e.impact.tier} />
          <span className="rounded-full bg-card px-2.5 py-1 text-xs font-semibold text-muted">{CATEGORY_LABELS[e.category]}</span>
          {e.visibility === "private" && (
            <span className="flex items-center gap-1 rounded-full bg-card px-2.5 py-1 text-xs font-semibold text-muted">
              <Lock className="size-3" /> Privé
            </span>
          )}
          {e.visibility === "unlisted" && <span className="rounded-full bg-card px-2.5 py-1 text-xs font-semibold text-muted">Sur lien</span>}
        </div>
        <h1 className="mt-3 text-[28px] font-extrabold leading-[1.1]">{e.title}</h1>

        <div className="mt-5 space-y-3.5">
          <InfoRow icon={<Clock className="size-5" />} title={longDate(e.startsAt)} sub={`${time(e.startsAt)}${e.endsAt ? ` – ${time(e.endsAt)}` : ""}${ended ? " · terminé" : ""}`} />
          <InfoRow icon={<MapPin className="size-5" />} title={e.venue} sub={e.city} />
          <InfoRow icon={<Users className="size-5" />} title={e.attendees ? `${compact(e.attendees)} participant${e.attendees > 1 ? "s" : ""}` : "Soyez parmi les premiers"} sub={`${compact(e.expectedAttendance)} attendus`} />
        </div>

        {!ended && !e.cancelReason && e.access !== "none" && <RemindCard e={e} />}

        {e.moderation && (
          <div className="mt-5 flex gap-2.5 rounded-2xl bg-[#fff4dc] p-3.5 text-sm text-[#7a4a00] dark:bg-[#3a2a08] dark:text-[#ffd98a]">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              <b>{e.moderation === "suspended" ? "Événement retiré par ToBe." : "En vérification par l'équipe ToBe :"}</b> {e.moderation === "suspended" ? "Il n'est plus visible et les ventes sont arrêtées." : "il est masqué du public et les ventes sont fermées le temps de la vérification."}
              {e.moderationReason && <span className="mt-1 block text-xs opacity-80">{e.moderationReason}</span>}
            </span>
          </div>
        )}

        <div className="mt-5 flex items-center gap-3 rounded-2xl border border-line bg-card p-3">
          <Avatar name={e.organizerName} size={42} />
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted">Organisé par</div>
            <div className="flex items-center gap-1 truncate font-semibold">{e.organizerName}</div>
            {e.organizerVerified && (
              <div className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-brand">
                <BadgeCheck className="size-3.5" /> Organisateur vérifié par ToBe
              </div>
            )}
          </div>
        </div>

        {!e.moderation &&
          (e.eventVerified ? (
            <Link to="/securite" className="mt-3 flex items-start gap-2.5 rounded-2xl border border-emerald/40 bg-emerald/5 p-3.5 text-sm">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald" />
              <span>
                <b className="text-emerald">Événement vérifié par ToBe.</b> L'organisateur et l'événement ont été contrôlés.{e.access === "paid" ? " Payez uniquement sur ToBe : votre billet est garanti." : ""}
              </span>
            </Link>
          ) : (
            <Link to="/securite" className="mt-3 flex items-start gap-2.5 rounded-2xl border border-line bg-card-2 p-3.5 text-sm">
              <ShieldQuestion className="mt-0.5 size-5 shrink-0 text-muted" />
              <span className="text-muted">
                <b className="text-ink">Pas encore vérifié par ToBe.</b> {e.access === "paid" ? "La billetterie s'ouvre après vérification. " : ""}N'envoyez jamais d'argent directement à quelqu'un pour cet événement. <span className="font-semibold text-brand">Payer en toute sécurité</span>
              </span>
            </Link>
          ))}

        {e.liveUrl && (
          <a href={e.liveUrl} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-3 rounded-2xl border border-coral/40 bg-coral/10 p-3.5 font-semibold text-coral">
            <Radio className="size-5" /> Regarder le direct vidéo <ChevronRight className="ml-auto size-5" />
          </a>
        )}
        {!e.liveUrl && e.options.live && (
          <div className="mt-3 flex items-center gap-3 rounded-2xl border border-line bg-card p-3.5 text-sm text-muted">
            <Radio className="size-5 text-coral" /> Direct vidéo prévu : le lien apparaîtra ici le jour J.
          </div>
        )}
      </div>

      <div className="sticky top-0 z-20 mt-6 border-b border-line bg-app/90 backdrop-blur-xl lg:top-16">
        <div className="no-scrollbar flex gap-6 overflow-x-auto px-5 lg:px-0">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={cx("relative h-12 shrink-0 text-[15px] font-semibold", tab === t.id ? "text-ink" : "text-faint")}>
              {t.label}
              {tab === t.id && <span className="absolute inset-x-0 bottom-0 h-[3px] rounded-full bg-brand" />}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 pt-5 lg:px-0">
        {e.cancelReason && (
          <div className="mb-5 flex gap-3 rounded-2xl border border-coral/30 bg-coral/10 p-4 text-sm">
            <Ban className="size-5 shrink-0 text-coral" />
            <div>
              <div className="font-semibold">Événement annulé</div>
              <div className="text-muted">« {e.cancelReason} » · Les billets achetés en ligne sont remboursés automatiquement sur le Mobile Money des acheteurs.</div>
            </div>
          </div>
        )}
        {tab === "infos" && (
          <div className="space-y-5">
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink/85">{e.description || "L'organisateur n'a pas encore ajouté de description."}</p>
            {e.access === "paid" && (
              <div className="space-y-2">
                {e.ticketTypes.map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-2xl border border-line bg-card px-4 py-3">
                    <div>
                      <div className="font-semibold">{t.name}</div>
                      {t.quota > 0 && <div className="text-xs text-muted">{Math.max(0, t.quota - t.sold)} places restantes</div>}
                    </div>
                    <div className="font-display font-bold text-brand">{formatFcfa(t.price)}</div>
                  </div>
                ))}
              </div>
            )}
            {e.access === "none" && (e.entryInfo || e.entryUrl) && (
              <div className="rounded-2xl border border-line bg-card p-4">
                <div className="flex items-center gap-2 font-display font-bold">
                  <DoorOpen className="size-5 text-brand" /> Entrée
                </div>
                {e.entryInfo && <p className="mt-1.5 whitespace-pre-line text-[15px] text-ink/85">{e.entryInfo}</p>}
                {e.entryUrl && (
                  <a href={e.entryUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex h-11 items-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-white">
                    <ExternalLink className="size-4" /> Voir le lien de l'organisateur
                  </a>
                )}
              </div>
            )}
            {e.lat !== null && e.lng !== null && <EventMap points={[{ id: e.id, lat: e.lat, lng: e.lng, title: e.title, sub: e.venue, link: "" }]} height={190} zoom={15} interactive={false} />}
            <TobeUpsell />
            {!e.isOrganizer && <ReportEvent e={e} />}
          </div>
        )}
        {tab === "programme" && (
          <ol className="relative space-y-5 border-l border-line pl-6">
            {e.program.map((p, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[31px] top-1 size-3.5 rounded-full border-[3px] border-[var(--bg)] bg-brand" />
                <div className="font-display text-sm font-bold text-brand">{p.time}</div>
                <div className="mt-0.5 font-semibold">{p.label}</div>
              </li>
            ))}
          </ol>
        )}
        {tab === "votes" && e.contestId && <VotesTab contestId={e.contestId} />}
        {tab === "cagnotte" && e.cagnotteId && <CagnotteTab id={e.cagnotteId} code={code} />}
        {tab === "photos" && <PhotosTab e={e} code={code} />}
      </div>

      <div className="absolute inset-x-0 bottom-0 z-30 border-t border-line bg-app/95 px-5 pb-[max(env(safe-area-inset-bottom),14px)] pt-3 backdrop-blur-xl lg:static lg:mt-8 lg:rounded-3xl lg:border lg:bg-card-2 lg:p-5">
        <BottomAction e={e} minPrice={minPrice} ended={ended} />
      </div>
      </div>
    </div>
  );
}

function BottomAction({ e, minPrice, ended }: { e: EventView; minPrice: number; ended: boolean }) {
  const nav = useNavigate();
  const t = useT();
  if (e.cancelReason)
    return (
      <Button full size="lg" variant="dark" icon={<Ticket className="size-5 text-brand" />} onClick={() => nav("/billets")}>
        Événement annulé · voir mes remboursements
      </Button>
    );
  if (!ended && e.access === "paid" && e.salesBlocked && e.myTickets === 0)
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-card-2 p-3 text-sm">
        <ShieldAlert className="size-5 shrink-0 text-muted" />
        <span className="text-muted">{e.salesBlocked}</span>
      </div>
    );
  if (e.myTickets > 0)
    return (
      <Button full size="lg" variant="dark" icon={<Ticket className="size-5 text-brand" />} onClick={() => nav("/billets")}>
        {e.myTickets > 1 ? t("ev.myTickets", { n: e.myTickets }) : t("ev.myTicket")}
      </Button>
    );
  if (ended)
    return (
      <Button full size="lg" variant="dark" icon={<Camera className="size-5 text-brand" />} onClick={() => nav(`/photos?event=${e.id}`)}>
        Retrouver mes photos
      </Button>
    );
  if (e.access === "none") return <NoTicketAction e={e} />;
  return (
    <div className="flex items-center gap-4">
      <div className="shrink-0">
        <div className="text-xs text-muted">{e.access === "paid" ? t("ev.from") : e.access === "invite" ? t("ev.invitation") : t("ev.entry")}</div>
        <div className="font-display text-lg font-bold">{e.access === "paid" ? formatFcfa(minPrice) : t("ev.free")}</div>
      </div>
      <Button full size="lg" icon={<Ticket className="size-5" />} onClick={() => nav(`/evenement/${e.slug}/billets`)}>
        {e.access === "paid" ? t("ev.getTicket") : e.access === "invite" ? t("ev.confirm") : t("ev.reserve")}
      </Button>
    </div>
  );
}

/** Événement sans billetterie ToBe : lien de l'organisateur, sinon simple rappel. */
function NoTicketAction({ e }: { e: EventView }) {
  const r = useReminder(e);
  if (e.entryUrl)
    return (
      <div className="flex items-center gap-3">
        <Button size="lg" variant="outline" loading={r.busy} onClick={r.toggle} icon={r.following ? <BellRing className="size-5" /> : <Bell className="size-5" />} className="shrink-0" aria-label={r.following ? "Rappels activés" : "Me rappeler"}>
          <span className="hidden sm:inline">{r.following ? "Rappels activés" : "Me rappeler"}</span>
        </Button>
        <a href={e.entryUrl} target="_blank" rel="noopener noreferrer" className="flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-brand font-semibold text-white">
          <ExternalLink className="size-5" /> Infos d'entrée
        </a>
      </div>
    );
  return (
    <div className="flex items-center gap-4">
      <div className="min-w-0 shrink">
        <div className="text-xs text-muted">Entrée</div>
        <div className="line-clamp-1 font-display font-bold">{e.entryInfo ? "Voir les infos" : "Gérée par l'organisateur"}</div>
      </div>
      <Button full size="lg" variant={r.following ? "outline" : "gold"} loading={r.busy} onClick={r.toggle} icon={r.following ? <BellRing className="size-5" /> : <Bell className="size-5" />}>
        {r.following ? "Rappels activés" : "Me rappeler"}
      </Button>
    </div>
  );
}

// ---------- Rappels : 2 jours avant, la veille, le jour J, 30 minutes avant ----------
const STAGE_LABELS: Record<string, string> = { j2: "2 jours avant", veille: "La veille", jourj: "Le jour J", bientot: "30 min avant" };

function useReminder(e: EventView) {
  const { me, toast } = useSession();
  const [following, setFollowing] = useState(e.following || e.myTickets > 0);
  const [schedule, setSchedule] = useState<{ stage: string; at: string; past: boolean }[]>([]);
  const [busy, setBusy] = useState(false);
  const [pushOn, setPushOn] = useState(pushState() === "granted");
  useEffect(() => {
    let alive = true;
    (async () => {
      const endpoint = await currentEndpoint().catch(() => null);
      const r = await api<{ following: boolean; schedule: typeof schedule }>("GET", `/events/${e.id}/remind`, undefined, { endpoint: endpoint ?? undefined }).catch(() => null);
      if (!alive || !r) return;
      setSchedule(r.schedule);
      if (r.following) setFollowing(true);
    })();
    const h = () => setPushOn(pushState() === "granted");
    window.addEventListener("tobe-push-changed", h);
    return () => {
      alive = false;
      window.removeEventListener("tobe-push-changed", h);
    };
  }, [e.id, me?.user.id]);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (following && e.myTickets === 0 && pushOn) {
        await api("POST", `/events/${e.id}/unremind`, { endpoint: await currentEndpoint() });
        setFollowing(false);
        toast("Rappels désactivés pour cet événement");
      } else {
        // Les notifications d'abord : c'est par là que partent les rappels.
        const ok = pushState() === "granted" || (await askNotifications(`On vous prévient 2 jours avant « ${e.title} », la veille, le jour J et 30 minutes avant.`));
        setPushOn(pushState() === "granted");
        const endpoint = await currentEndpoint();
        if (!ok && !me) {
          setBusy(false);
          return;
        }
        const r = await api<{ schedule: typeof schedule }>("POST", `/events/${e.id}/remind`, { endpoint });
        setSchedule(r.schedule);
        setFollowing(true);
        toast(ok ? "C'est noté : on vous rappelle l'événement" : "Rappel enregistré dans vos notifications ToBe");
      }
    } catch (err) {
      toast((err as Error).message, "error");
    }
    setBusy(false);
  };
  return { following, schedule, busy, toggle, pushOn };
}

function RemindCard({ e }: { e: EventView }) {
  const r = useReminder(e);
  const ticket = e.myTickets > 0;
  return (
    <div className={cx("mt-5 rounded-2xl border p-4 transition", r.following ? "border-brand/30 bg-brand-soft/60 dark:bg-brand/15" : "border-line bg-card")}>
      <div className="flex items-center gap-3">
        <span className={cx("grid size-11 shrink-0 place-items-center rounded-2xl", r.following ? "brand-gradient text-white" : "bg-card-2 text-brand")}>
          {r.following ? <BellRing className="size-5" /> : <Bell className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{r.following ? (ticket ? "Rappels de votre billet activés" : "Rappels activés") : "Ne ratez pas cet événement"}</div>
          <div className="text-sm text-muted">{r.following ? (r.pushOn ? "Sur ce téléphone, comme vos messages." : "Dans vos notifications ToBe. Activez-les sur ce téléphone pour être alerté.") : "On vous prévient 2 jours avant, la veille, le jour J et 30 minutes avant."}</div>
        </div>
        {!(ticket && r.pushOn) && (
          <Button size="sm" variant={r.following && r.pushOn ? "outline" : "gold"} loading={r.busy} onClick={r.toggle} className="shrink-0">
            {r.following ? (r.pushOn ? "Retirer" : "Activer") : "Me rappeler"}
          </Button>
        )}
      </div>
      {r.following && r.schedule.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {r.schedule.map((s) => (
            <span key={s.stage} className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", s.past ? "bg-card-2 text-faint line-through" : "bg-white text-brand dark:bg-white/10 dark:text-white")}>
              {!s.past && <Check className="size-3" />} {STAGE_LABELS[s.stage]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function InfoRow({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-3.5">
      <span className="grid size-11 place-items-center rounded-2xl bg-card text-brand">{icon}</span>
      <div>
        <div className="font-semibold">{title}</div>
        <div className="text-sm text-muted">{sub}</div>
      </div>
    </div>
  );
}

function TobeUpsell() {
  return (
    <Link to="/creer" className="flex items-center gap-3 rounded-2xl border border-dashed border-brand/40 p-4 transition hover:bg-brand-soft">
      <span className="grid size-10 place-items-center rounded-xl bg-brand/15 text-brand">
        <Crown className="size-5" />
      </span>
      <span className="flex-1 text-sm">
        <span className="font-semibold">Un événement à organiser ?</span>
        <span className="block text-muted">Publiez-le en 2 minutes ou confiez-le à l'agence ToBe.</span>
      </span>
      <ChevronRight className="size-5 text-faint" />
    </Link>
  );
}

function VotesTab({ contestId }: { contestId: string }) {
  const { data } = useLoad(() => api("GET", `/contests/${contestId}`), [contestId]);
  if (!data) return <div className="skeleton h-40 rounded-2xl" />;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="text-muted">{data.isOpen ? `Clôture dans ${countdown(data.closesAt)}` : "Vote clôturé"}</span>
        {data.totalVotes !== null && <span className="font-semibold text-brand">{compact(data.totalVotes)} votes</span>}
      </div>
      <div className="space-y-2">
        {data.candidates.slice(0, 5).map((c: any) => (
          <Link key={c.id} to={`/vote/${contestId}/candidat/${c.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-card p-2.5">
            <span className="w-5 text-center font-display font-bold text-muted">{c.rank ?? "–"}</span>
            <Avatar name={c.name} src={c.photo} size={40} />
            <span className="flex-1 truncate font-semibold">{c.name}</span>
            <span className="font-semibold text-brand">{c.votes !== null ? compact(c.votes) : "?"}</span>
          </Link>
        ))}
      </div>
      <Link to={`/vote/${contestId}`}>
        <Button full className="mt-4" icon={<Crown className="size-5" />}>
          Voir tous les candidats et voter
        </Button>
      </Link>
    </div>
  );
}

function CagnotteTab({ id, code }: { id: string; code: string }) {
  const { data } = useLoad(() => api("GET", `/cagnottes/${id}`, undefined, { code }), [id, code]);
  if (!data) return <div className="skeleton h-40 rounded-2xl" />;
  const pct = data.goal ? (data.collected / data.goal) * 100 : 0;
  return (
    <Card className="p-4">
      <div className="text-sm font-semibold text-muted">{data.title}</div>
      <div className="mt-1 font-display text-2xl font-bold">{formatFcfa(data.collected)}</div>
      {data.goal > 0 && (
        <>
          <Progress value={pct} className="mt-3" />
          <div className="mt-2 flex justify-between text-xs text-muted">
            <span>{Math.round(pct)} % de {formatFcfa(data.goal)}</span>
            <span>{data.contributors} contributeurs</span>
          </div>
        </>
      )}
      <Link to={`/cagnotte/${id}`}>
        <Button full className="mt-4" icon={<HandCoins className="size-5" />}>
          Voir la cagnotte
        </Button>
      </Link>
    </Card>
  );
}

function PhotosTab({ e, code }: { e: EventView; code: string }) {
  const { data } = useLoad(() => api<{ id: string; url: string }[]>("GET", `/events/${e.id}/photos`, undefined, { code }), [e.id, code]);
  return (
    <div>
      <Link to={`/photos?event=${e.id}`} className="mb-4 flex items-center gap-3 rounded-2xl border border-brand/40 bg-brand/10 p-3.5">
        <Camera className="size-5 text-brand" />
        <span className="flex-1 text-sm font-semibold">
          Me retrouver sur ces photos avec mon visage
          <span className="block text-xs font-normal text-muted">
            {PRICING.photoFreeCount} photos offertes · toutes dès {formatFcfa(PRICING.photoPrices.plus)}
          </span>
        </span>
        <ChevronRight className="size-5 text-brand" />
      </Link>
      {!data && <div className="skeleton h-40 rounded-2xl" />}
      {data && data.length === 0 && <p className="py-8 text-center text-sm text-muted">La galerie sera publiée par l'organisateur après l'événement.</p>}
      {data && data.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5 lg:grid-cols-4">
          {data.map((p) => (
            <Img key={p.id} src={p.url} className="aspect-square w-full rounded-lg object-cover" />
          ))}
        </div>
      )}
    </div>
  );
}

function PrivateGate({ title, onCode, wrong }: { title: string; onCode: (c: string) => void; wrong: boolean }) {
  const [c, setC] = useState("");
  const { me, requireAuth } = useSession();
  return (
    <div className="min-h-full">
      <TopBar title="" />
      <div className="px-6 pt-10 text-center">
        <div className="mx-auto grid size-20 place-items-center rounded-[28px] bg-brand-soft text-brand">
          <Lock className="size-9" />
        </div>
        <h1 className="mt-6 text-2xl font-extrabold">{title}</h1>
        <p className="mt-2 text-muted">Cet événement est privé. Entrez le code reçu avec votre invitation.</p>
        <form
          className="mt-6 space-y-3"
          onSubmit={(ev) => {
            ev.preventDefault();
            onCode(c.trim().toUpperCase());
          }}
        >
          <input autoFocus className={`${inputCls} text-center font-display text-xl uppercase tracking-[0.3em]`} placeholder="CODE" value={c} onChange={(ev) => setC(ev.target.value)} />
          {wrong && <p className="text-sm text-coral">Code incorrect.</p>}
          <Button full type="submit" disabled={c.trim().length < 3}>
            Accéder à l'événement
          </Button>
        </form>
        {!me && (
          <button className="mt-5 text-sm text-muted" onClick={() => requireAuth("Connectez-vous : si votre e-mail figure sur la liste des invités, l'accès est automatique.")}>
            Je suis sur la liste des invités
          </button>
        )}
      </div>
    </div>
  );
}

function downloadIcs(e: EventView) {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const start = new Date(e.startsAt);
  const end = e.endsAt ? new Date(e.endsAt) : new Date(start.getTime() + 4 * 3600_000);
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ToBe//FR",
    "BEGIN:VEVENT",
    `UID:${e.id}@tobe`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${e.title}`,
    `LOCATION:${e.venue}, ${e.city}`,
    `URL:${shareUrl(`/evenement/${e.slug}`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  a.download = `${e.slug}.ics`;
  a.click();
}

const REPORT_REASONS: { id: "faux" | "arnaque" | "doublon" | "autre"; label: string }[] = [
  { id: "arnaque", label: "Arnaque : on me demande de l'argent" },
  { id: "faux", label: "Faux événement / n'existe pas" },
  { id: "doublon", label: "Copie d'un événement d'un autre organisateur" },
  { id: "autre", label: "Autre problème" },
];

/** Signaler l'événement à l'équipe ToBe. */
function ReportEvent({ e }: { e: EventView }) {
  const { me, requireAuth, toast } = useSession();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REPORT_REASONS)[number]["id"]>("arnaque");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      await api("POST", `/events/${e.id}/report`, { reason, details });
      toast("Merci, l'équipe ToBe va vérifier cet événement");
      setOpen(false);
    } catch (err) {
      toast((err as Error).message, "error");
    }
    setBusy(false);
  };
  return (
    <>
      <button onClick={async () => { if (me || (await requireAuth("Connectez-vous pour signaler cet événement"))) setOpen(true); }} className="mx-auto flex items-center gap-1.5 py-2 text-xs font-semibold text-muted hover:text-coral">
        <Flag className="size-3.5" /> Signaler cet événement
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Signaler cet événement">
        <div className="space-y-2">
          {REPORT_REASONS.map((r) => (
            <button key={r.id} onClick={() => setReason(r.id)} className={cx("w-full rounded-2xl border p-3.5 text-left text-sm font-medium", reason === r.id ? "border-coral bg-coral/10" : "border-line")}>
              {r.label}
            </button>
          ))}
          <textarea className={`${inputCls} min-h-20`} placeholder="Détails (facultatif) : ce qui vous paraît suspect" value={details} onChange={(ev) => setDetails(ev.target.value)} maxLength={1000} />
          <Button full loading={busy} onClick={send}>
            Envoyer le signalement
          </Button>
        </div>
      </Sheet>
    </>
  );
}
