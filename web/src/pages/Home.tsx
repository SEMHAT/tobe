import type { ContestView, EventCard } from "@tobe/core";
import { ArrowRight, Bell, Brain, CalendarPlus, ChevronRight, Crown, Flame, Gift, MapPin, QrCode, ScanFace, Search, ShieldCheck, Sparkles, Store, Ticket, Trophy } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { HeroCard, RowCard, SkeletonRows, TileCard } from "../components/events";
import { Button, Card, Chip, ErrorState, Section } from "../components/ui";
import { Avatar, CategoryIcon, Logo, QR } from "../components/visual";
import { api } from "../lib/api";
import { CATEGORY_LABELS, compact, countdown } from "../lib/format";
import { useSession } from "../lib/session";
import { useLoad } from "../lib/useLoad";
import { Wheel, type GameState } from "./Club";

interface HomeData {
  featured: EventCard[];
  weekend: EventCard[];
  top: EventCard[];
  contests: ContestView[];
  counts: Record<string, number>;
  total: number;
}

const CATS = ["concert", "soiree", "corporate", "culture", "mariage", "concours", "sport", "religieux"] as const;

export function Home() {
  const { data, error, loading, reload } = useLoad(() => api<HomeData>("GET", "/home"), []);
  return (
    <>
      <div className="lg:hidden">
        <MobileHome data={data} error={error?.message} loading={loading} reload={reload} />
      </div>
      <div className="hidden lg:block">
        <DesktopHome data={data} loading={loading} />
      </div>
    </>
  );
}

// =====================================================================
// Mobile
// =====================================================================
function MobileHome({ data, error, loading, reload }: { data: HomeData | null; error?: string; loading: boolean; reload: () => void }) {
  const { me } = useSession();
  const nav = useNavigate();
  const firstName = me?.user.name.split(" ")[0];
  return (
    <div className="pt-safe">
      <header className="flex items-center justify-between px-5 pt-4">
        <Logo height={30} />
        <div className="flex items-center gap-2">
          <ClubChip />
          <Link to={me ? "/notifications" : "/profil"} aria-label="Notifications" className="relative grid size-10 place-items-center rounded-full border border-line bg-card">
            <Bell className="size-5" />
            {!!me?.unread && <span className="absolute right-2 top-2 size-2.5 rounded-full border-2 border-[var(--card)] bg-coral" />}
          </Link>
        </div>
      </header>

      <div className="px-5 pt-5">
        <h1 className="text-[28px] font-extrabold leading-tight">
          {firstName ? `Salut ${firstName},` : "Qu'est-ce qu'on vit"}
          <br />
          <span className="text-brand">{firstName ? "on sort où ?" : "à Lomé ?"}</span>
        </h1>
        <button onClick={() => nav("/explorer")} className="mt-4 flex h-12 w-full items-center gap-3 rounded-2xl border border-line bg-card-2 px-4 text-left text-[15px] text-faint">
          <Search className="size-5" /> Concert, forum, quartier…
        </button>
      </div>

      <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto px-5">
        {CATS.map((c) => (
          <Chip key={c} onClick={() => nav(`/explorer?category=${c}`)} icon={<CategoryIcon category={c} className="size-4" />}>
            {CATEGORY_LABELS[c]}
          </Chip>
        ))}
      </div>

      {loading && !data && (
        <div className="mt-6 space-y-6">
          <div className="no-scrollbar flex gap-4 overflow-hidden px-5">
            <div className="skeleton aspect-[4/5] w-[82%] shrink-0 rounded-[26px]" />
            <div className="skeleton aspect-[4/5] w-[82%] shrink-0 rounded-[26px]" />
          </div>
          <SkeletonRows n={3} />
        </div>
      )}
      {error && <ErrorState message={error} onRetry={reload} />}

      {data && data.total === 0 && <FirstEventCard />}

      {data && data.featured.length > 0 && (
        <Section title="À la une">
          <div className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2">
            {data.featured.map((e) => (
              <HeroCard key={e.id} e={e} />
            ))}
          </div>
        </Section>
      )}

      {data && data.weekend.length > 0 && (
        <Section title="Bientôt à Lomé" action={<Link to="/evenements-a-lome" className="flex items-center text-sm font-semibold text-brand">Tout l'agenda <ChevronRight className="size-4" /></Link>}>
          <div className="no-scrollbar flex gap-4 overflow-x-auto px-5">
            {data.weekend.map((e) => (
              <TileCard key={e.id} e={e} />
            ))}
          </div>
        </Section>
      )}

      {data && data.contests.length > 0 && (
        <Section title="Votes en cours">
          <div className="no-scrollbar flex gap-4 overflow-x-auto px-5">
            {data.contests.map((c) => (
              <ContestCard key={c.id} c={c} className="w-[80%] shrink-0" />
            ))}
          </div>
        </Section>
      )}

      <div className="mx-5 mt-7">
        <ClubCard />
      </div>

      <div className="mx-5 mt-4">
        <PassCard />
      </div>

      {data && data.top.length > 0 && (
        <Section title="Les plus marquants" action={<Link to="/explorer?sort=impact" className="flex items-center text-sm font-semibold text-brand">Explorer <ChevronRight className="size-4" /></Link>}>
          <div className="space-y-3 px-5">
            {data.top.map((e) => (
              <RowCard key={e.id} e={e} />
            ))}
          </div>
        </Section>
      )}

      <div className="mx-5 mb-4 mt-8 grid grid-cols-2 gap-3">
        <Link to="/creer" className="rounded-[20px] border border-line bg-card p-4">
          <Sparkles className="size-6 text-brand" />
          <div className="mt-3 font-display font-bold">Vous organisez ?</div>
          <div className="mt-1 text-xs text-muted">Publiez en 2 minutes, ou confiez tout à ToBe.</div>
        </Link>
        <Link to="/prestataires" className="rounded-[20px] border border-line bg-card p-4">
          <Store className="size-6 text-brand" />
          <div className="mt-3 font-display font-bold">Prestataires</div>
          <div className="mt-1 text-xs text-muted">MC, déco, son, photo : trouvez ou rejoignez l'annuaire.</div>
        </Link>
      </div>
      <Link to="/organiser" className="mx-5 mb-4 flex items-center justify-between gap-3 rounded-[20px] px-1 py-2 text-sm text-muted">
        <span>Un mariage, un lancement, un concert ? <span className="font-semibold text-ink">On l'organise pour vous.</span></span>
        <ChevronRight className="size-4 shrink-0 text-brand" />
      </Link>
    </div>
  );
}

function useGame() {
  const { me } = useSession();
  return useLoad(() => api<GameState>("GET", "/game"), [me?.user.id]).data;
}

function ClubChip() {
  const g = useGame();
  const p = g?.me;
  return (
    <Link to="/club" className="flex h-10 items-center gap-1.5 rounded-full gold-gradient px-3.5 text-[13px] font-bold text-[#4a2c00] shadow-[0_6px_18px_-8px_rgba(240,138,0,0.8)]">
      <Trophy className="size-4" />
      {p ? `${p.points} pts` : "Jouer"}
    </Link>
  );
}

function ClubCard() {
  const g = useGame();
  const p = g?.me;
  const todo = p ? [!p.dailyDone, !p.spinDone, !p.quizDone].filter(Boolean).length : 3;
  return (
    <Link to="/club" className="relative block overflow-hidden rounded-[26px] club-gradient p-5 text-white">
      <div className="pointer-events-none absolute -right-14 -top-14 size-44 opacity-90">
        <Wheel values={g?.wheel ?? [10, 25, 5, 50, 15, 100, 20, 30]} rotation={0} spinning={false} idle />
      </div>
      <div className="relative max-w-[62%]">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider">
          <Trophy className="size-3.5 text-[#ffd66b]" /> ToBe Club
        </div>
        <div className="mt-3 font-display text-[22px] font-extrabold leading-tight">{p ? (todo ? `${todo} jeu${todo > 1 ? "x" : ""} vous attend${todo > 1 ? "ent" : ""}` : "Tout est joué, bravo !") : "Jouez, gagnez, sortez"}</div>
        <p className="mt-1 text-sm text-white/75">{p ? (todo ? "Roue, quiz et bonus du jour : des points à prendre." : "Revenez demain pour garder votre série.") : "Roue du jour, quiz sur Lomé et missions : des points contre des récompenses."}</p>
      </div>
      <div className="relative mt-4 flex items-center gap-2">
        {p && (
          <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-sm font-bold">
            <Flame className="size-4 text-[#ffb21e]" /> {p.streak}
          </span>
        )}
        <span className="inline-flex items-center gap-1 rounded-full bg-white px-4 py-1.5 text-sm font-bold text-brand">
          {p ? "Jouer" : "Découvrir"} <ChevronRight className="size-4" />
        </span>
      </div>
    </Link>
  );
}

function DesktopClub() {
  const g = useGame();
  const p = g?.me;
  return (
    <section className="mx-auto max-w-[1240px] px-8 pt-24">
      <div className="relative grid grid-cols-[1.1fr_1fr] items-center gap-10 overflow-hidden rounded-[36px] club-gradient p-12 text-white">
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1.5 text-xs font-bold uppercase tracking-widest">
            <Trophy className="size-4 text-[#ffd66b]" /> Nouveau · ToBe Club
          </div>
          <h2 className="mt-5 text-[52px] font-black leading-[0.98]">
            Jouez chaque jour.
            <br />
            <span className="text-[#ffd66b]">Gagnez vos sorties.</span>
          </h2>
          <p className="mt-5 max-w-lg text-lg text-white/75">Une roue, un quiz sur Lomé et des missions : vos points se transforment en boosts pour vos événements, en mois Premium et en lots offerts par ToBe.</p>
          <div className="mt-7 grid max-w-lg grid-cols-3 gap-3">
            {[
              [Gift, "Bonus du jour", "jusqu'à 50 pts"],
              [Sparkles, "Roue", "jusqu'à 100 pts"],
              [Brain, "Quiz", "3 questions"],
            ].map(([Icon, t, d]) => {
              const I = Icon as typeof Gift;
              return (
                <div key={t as string} className="rounded-2xl bg-white/10 p-3.5 backdrop-blur">
                  <I className="size-5 text-[#ffd66b]" />
                  <div className="mt-2 text-sm font-bold">{t as string}</div>
                  <div className="text-xs text-white/65">{d as string}</div>
                </div>
              );
            })}
          </div>
          <Link to="/club" className="mt-8 inline-flex h-14 items-center gap-2 rounded-full bg-white px-8 text-lg font-bold text-brand transition hover:scale-[1.02]">
            {p ? `Jouer · ${p.points} points` : "Jouer maintenant"} <ArrowRight className="size-5" />
          </Link>
        </div>
        <div className="relative mx-auto w-full max-w-[400px]">
          <div className="absolute inset-[-30px] rounded-full bg-[#ffb21e]/25 blur-3xl" />
          <div className="relative">
            <Wheel values={g?.wheel ?? [10, 25, 5, 50, 15, 100, 20, 30]} rotation={0} spinning={false} idle />
          </div>
        </div>
      </div>
    </section>
  );
}

function FirstEventCard() {
  return (
    <div className="mx-5 mt-7 overflow-hidden rounded-[26px] brand-gradient p-6 text-white">
      <CalendarPlus className="size-9" />
      <div className="mt-4 font-display text-[22px] font-extrabold leading-tight">Le premier événement, c'est peut-être le vôtre</div>
      <p className="mt-2 text-sm text-white/80">ToBe vient d'ouvrir. Publiez votre concert, forum, mariage ou concours en 2 minutes : il apparaîtra ici pour tout Lomé.</p>
      <Link to="/creer" className="mt-5 inline-flex h-12 items-center gap-2 rounded-full bg-white px-5 font-bold text-brand">
        Créer un événement <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}

function PassCard() {
  const { me } = useSession();
  return (
    <Link to="/photos" className="relative block overflow-hidden rounded-[22px] bg-[#0b0b12] p-5 text-white">
      <div className="absolute -right-10 -top-10 size-40 rounded-full bg-brand-2/50 blur-3xl" />
      <ScanFace className="relative size-9 text-brand-2" />
      <div className="relative mt-3 font-display text-lg font-bold">Pass ToBe : vos photos vous trouvent</div>
      <p className="relative mt-1 text-sm text-white/65">Un selfie une seule fois, et vous êtes prévenu dès que vous apparaissez dans une galerie.</p>
      <span className="relative mt-3 inline-flex items-center text-sm font-semibold text-[#9d93ff]">
        {me?.user.passEnabled ? "Voir mes photos" : "Activer mon Pass"} <ChevronRight className="size-4" />
      </span>
    </Link>
  );
}

function ContestCard({ c, className }: { c: ContestView; className?: string }) {
  return (
    <Link to={`/vote/${c.id}`} className={className}>
      <Card className="h-full p-4 transition hover:border-ink/25">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand">
            <Crown className="size-4" /> {c.mode === "free" ? "Vote gratuit" : c.mode === "paid" ? "Vote payant" : "1 vote gratuit / jour"}
          </span>
          <span className="text-xs text-muted">Fin dans {countdown(c.closesAt)}</span>
        </div>
        <div className="mt-2 line-clamp-1 font-display text-[17px] font-bold">{c.title}</div>
        <div className="mt-3 space-y-2">
          {c.candidates.slice(0, 3).map((x, k) => (
            <div key={x.id} className="flex items-center gap-2.5">
              <span className="w-3 text-sm font-bold text-muted">{x.rank ?? k + 1}</span>
              <Avatar name={x.name} src={x.photo} size={30} />
              <span className="flex-1 truncate text-sm font-semibold">{x.name}</span>
              <span className="text-sm font-semibold text-brand">{x.votes !== null ? compact(x.votes) : "—"}</span>
            </div>
          ))}
        </div>
      </Card>
    </Link>
  );
}

// =====================================================================
// Ordinateur : vitrine + accès à tout le site
// =====================================================================
function DesktopHome({ data, loading }: { data: HomeData | null; loading: boolean }) {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const url = typeof location !== "undefined" ? location.origin : "https://tobe.eledji.com";
  const upcoming = data ? [...data.featured, ...data.top.filter((e) => !data.featured.some((f) => f.id === e.id))].slice(0, 8) : [];

  return (
    <div>
      {/* Bandeau principal */}
      <section className="relative overflow-hidden border-b border-line">
        <div className="pointer-events-none absolute -right-40 -top-40 size-[620px] rounded-full bg-brand/10 blur-3xl" />
        <div className="relative mx-auto grid max-w-[1240px] grid-cols-[1.15fr_1fr] items-center gap-14 px-8 py-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1.5 text-sm font-semibold text-muted">
              <MapPin className="size-4 text-brand" /> Lomé · Afrique de l'Ouest
            </span>
            <h1 className="mt-6 text-[76px] font-black leading-[0.95] tracking-tight">
              Sois-y.
              <br />
              <span className="text-brand">Retrouve-toi.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              Découvrez les événements de Lomé, réservez votre place, votez pour vos favoris et retrouvez vos photos grâce à votre visage. Organisateurs : publiez en 2 minutes, ou confiez tout à l'agence ToBe.
            </p>
            <form
              className="mt-8 flex max-w-xl items-center gap-2 rounded-full border border-line bg-card p-2 shadow-[0_20px_50px_-30px_rgba(11,11,18,0.35)]"
              onSubmit={(e) => {
                e.preventDefault();
                nav(`/explorer${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
              }}
            >
              <Search className="ml-3 size-5 text-faint" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Un concert, un forum, un quartier…" className="h-11 flex-1 bg-transparent text-[16px] outline-none placeholder:text-faint" />
              <Button type="submit" size="sm" className="h-11 px-6">
                Rechercher
              </Button>
            </form>
            <div className="mt-6 flex flex-wrap gap-2">
              {CATS.map((c) => (
                <Chip key={c} onClick={() => nav(`/explorer?category=${c}`)} icon={<CategoryIcon category={c} className="size-4" />}>
                  {CATEGORY_LABELS[c]}
                </Chip>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="rounded-[36px] border border-line bg-card p-8 shadow-[0_40px_90px_-50px_rgba(24,0,173,0.55)]">
              <div className="flex items-center gap-6">
                <div className="rounded-3xl border-2 border-[#0b0b12] p-3">
                  <QR value={url} size={170} className="rounded-xl" />
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand">
                    <QrCode className="size-3.5" /> Sur mobile
                  </div>
                  <div className="mt-3 font-display text-2xl font-extrabold leading-tight">ToBe dans votre poche</div>
                  <p className="mt-2 text-sm leading-relaxed text-muted">Scannez avec l'appareil photo du téléphone, puis « Ajouter à l'écran d'accueil ». Vos billets restent disponibles hors connexion.</p>
                </div>
              </div>
              <div className="mt-8 grid grid-cols-3 gap-3">
                <MiniFeature icon={<Ticket />} label="Billets QR" />
                <MiniFeature icon={<Crown />} label="Votes" />
                <MiniFeature icon={<ScanFace />} label="Pass ToBe" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Événements */}
      <section className="mx-auto max-w-[1240px] px-8 pt-16">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-[34px] font-extrabold">À venir à Lomé</h2>
            <p className="mt-1 text-muted">Classés par impact : les événements Majeur et Phare passent en premier.</p>
          </div>
          <Link to="/explorer" className="flex items-center gap-1 font-semibold text-brand hover:underline">
            Tout explorer <ArrowRight className="size-4" />
          </Link>
        </div>
        {loading && !data && (
          <div className="mt-8 grid grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton aspect-[16/12] rounded-[20px]" />
            ))}
          </div>
        )}
        {data && upcoming.length > 0 && (
          <div className="mt-8 grid grid-cols-4 gap-6">
            {upcoming.map((e) => (
              <TileCard key={e.id} e={e} wide />
            ))}
          </div>
        )}
        {data && upcoming.length === 0 && (
          <div className="mt-8 flex items-center justify-between gap-8 rounded-[32px] brand-gradient p-10 text-white">
            <div>
              <div className="font-display text-[30px] font-extrabold leading-tight">ToBe vient d'ouvrir : le premier événement peut être le vôtre.</div>
              <p className="mt-2 max-w-2xl text-white/80">Concert, forum, mariage, concours, culte… Publiez-le en 2 minutes, il apparaîtra ici et dans l'application.</p>
            </div>
            <Link to="/creer" className="flex h-14 shrink-0 items-center gap-2 rounded-full bg-white px-7 text-lg font-bold text-brand">
              Créer un événement <ArrowRight className="size-5" />
            </Link>
          </div>
        )}
        {data && data.contests.length > 0 && (
          <div className="mt-14">
            <h3 className="text-2xl font-extrabold">Votes en cours</h3>
            <div className="mt-5 grid grid-cols-3 gap-6">
              {data.contests.map((c) => (
                <ContestCard key={c.id} c={c} />
              ))}
            </div>
          </div>
        )}
      </section>

      <DesktopClub />

      {/* Ce que fait ToBe */}
      <section className="mx-auto max-w-[1240px] px-8 pt-24">
        <h2 className="max-w-3xl text-[40px] font-black leading-[1.05]">
          Tout ce qui fait vivre un événement, <span className="text-brand">au même endroit.</span>
        </h2>
        <div className="mt-10 grid grid-cols-4 gap-6">
          <Feature icon={<Ticket />} title="Billets et entrée" text="Réservation en quelques secondes, billet QR code sur le téléphone, scan à l'entrée par l'organisateur." to="/explorer" cta="Trouver un événement" />
          <Feature icon={<Crown />} title="Votes transparents" text="Concours, awards, élections du public : un compte par personne, un certificat publié à la clôture." to="/creer" cta="Lancer un vote" />
          <Feature icon={<ScanFace />} title="Pass ToBe" text="Un selfie une seule fois : vous êtes prévenu dès que vous apparaissez sur les photos d'un événement." to="/photos" cta="Activer mon Pass" />
          <Feature icon={<Sparkles />} title="Confier à ToBe" text="Animation, son et lumière, décoration, communication : l'agence prend en charge votre événement." to="/organiser" cta="Comment on organise" dark />
        </div>
      </section>

      {/* Organisateurs */}
      <section className="mx-auto max-w-[1240px] px-8 pt-24">
        <div className="grid grid-cols-[1fr_1.1fr] items-center gap-14 rounded-[36px] bg-[#0b0b12] p-12 text-white">
          <div>
            <div className="text-sm font-bold uppercase tracking-widest text-[#9d93ff]">Organisateurs</div>
            <h2 className="mt-3 text-[38px] font-black leading-[1.05]">Votre événement en ligne en 2 minutes.</h2>
            <p className="mt-4 text-white/70">Choisissez qui peut le voir, ouvrez les réservations, lancez un vote, publiez la galerie photo. Et si vous voulez souffler, cochez « Confier l'organisation à ToBe ».</p>
            <div className="mt-8 flex gap-3">
              <Link to="/creer" className="flex h-12 items-center gap-2 rounded-full bg-white px-6 font-bold text-[#0b0b12]">
                Créer un événement <ArrowRight className="size-4" />
              </Link>
              <Link to="/organisateur" className="flex h-12 items-center rounded-full border border-white/25 px-6 font-semibold">
                Espace organisateur
              </Link>
            </div>
            <p className="mt-5 text-sm text-white/60">
              Vous préférez nous confier toute l'organisation ?{" "}
              <Link to="/organiser" className="font-semibold text-white underline-offset-4 hover:underline">Voir comment on travaille →</Link>
            </p>
          </div>
          <ol className="space-y-4">
            {[
              ["1", "Décrivez l'événement", "Titre, date, lieu, affiche."],
              ["2", "Choisissez la visibilité", "Public et classé, accessible par lien, ou privé avec code d'accès."],
              ["3", "Ouvrez l'accès", "Gratuit, réservation avec paiement à l'entrée, ou sur invitation."],
              ["4", "Ajoutez les options", "Votes, galerie avec reconnaissance faciale, direct vidéo."],
            ].map(([n, t, d]) => (
              <li key={n} className="flex gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand font-display text-lg font-black">{n}</span>
                <span>
                  <span className="block font-bold">{t}</span>
                  <span className="text-sm text-white/65">{d}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Confiance */}
      <section className="mx-auto grid max-w-[1240px] grid-cols-2 gap-6 px-8 pt-16">
        <div className="flex items-start gap-4 rounded-[28px] border border-line p-7">
          <ShieldCheck className="size-8 shrink-0 text-brand" />
          <div>
            <div className="font-display text-lg font-bold">Vos photos, votre choix</div>
            <p className="mt-1 text-sm leading-relaxed text-muted">L'analyse du visage se fait sur votre appareil. Vous pouvez désactiver le Pass, supprimer vos données ou ne jamais apparaître dans les galeries.</p>
          </div>
        </div>
        <Link to="/prestataires" className="flex items-start gap-4 rounded-[28px] border border-line p-7 transition hover:border-ink/25">
          <Store className="size-8 shrink-0 text-brand" />
          <div>
            <div className="font-display text-lg font-bold">Vous êtes MC, décorateur, photographe… ?</div>
            <p className="mt-1 text-sm leading-relaxed text-muted">Rejoignez l'annuaire des prestataires ToBe et recevez des demandes de devis directement.</p>
          </div>
        </Link>
      </section>
    </div>
  );
}

function MiniFeature({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-card-2 py-4 text-sm font-semibold">
      <span className="text-brand [&>svg]:size-6">{icon}</span>
      {label}
    </div>
  );
}

function Feature({ icon, title, text, to, cta, dark }: { icon: ReactNode; title: string; text: string; to: string; cta: string; dark?: boolean }) {
  return (
    <Link to={to} className={`group flex flex-col rounded-[28px] border p-7 transition hover:-translate-y-1 ${dark ? "border-transparent brand-gradient text-white" : "border-line bg-card hover:border-ink/25"}`}>
      <span className={`grid size-12 place-items-center rounded-2xl [&>svg]:size-6 ${dark ? "bg-white/15" : "bg-brand-soft text-brand"}`}>{icon}</span>
      <div className="mt-5 font-display text-xl font-bold">{title}</div>
      <p className={`mt-2 flex-1 text-sm leading-relaxed ${dark ? "text-white/80" : "text-muted"}`}>{text}</p>
      <span className={`mt-5 inline-flex items-center gap-1 text-sm font-bold ${dark ? "" : "text-brand"}`}>
        {cta} <ArrowRight className="size-4 transition group-hover:translate-x-1" />
      </span>
    </Link>
  );
}
