import type { ContestView, EventCard } from "@tobe/core";
import { Bell, ChevronRight, Crown, MapPin, ScanFace, Search, Sparkles, Store } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { HeroCard, RowCard, SkeletonRows, TileCard } from "../components/events";
import { Card, Chip, Empty, ErrorState, Section } from "../components/ui";
import { Avatar, CategoryIcon, Logo } from "../components/visual";
import { api } from "../lib/api";
import { CATEGORY_LABELS, compact, countdown } from "../lib/format";
import { useSession } from "../lib/session";
import { useLoad } from "../lib/useLoad";

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
  const { me } = useSession();
  const nav = useNavigate();
  const { data, error, loading, reload } = useLoad(() => api<HomeData>("GET", "/home"), []);
  const firstName = me?.user.name.split(" ")[0];

  return (
    <div className="pt-safe">
      <header className="flex items-center justify-between px-5 pt-4">
        <Logo className="text-[22px]" />
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 rounded-full border border-line bg-card px-3 py-1.5 text-[13px] font-semibold">
            <MapPin className="size-3.5 text-gold" /> Lomé
          </span>
          <Link to={me ? "/notifications" : "/profil"} aria-label="Notifications" className="relative grid size-10 place-items-center rounded-full border border-line bg-card">
            <Bell className="size-5" />
            {!!me?.unread && <span className="absolute right-2 top-2 size-2.5 rounded-full border-2 border-[var(--card)] bg-coral" />}
          </Link>
        </div>
      </header>

      <div className="px-5 pt-5">
        <h1 className="text-[27px] font-extrabold leading-tight">
          {firstName ? `Salut ${firstName},` : "Qu'est-ce qu'on vit"}
          <br />
          <span className="text-gold">{firstName ? "on sort où ?" : "ce week-end ?"}</span>
        </h1>
        <button onClick={() => nav("/explorer")} className="mt-4 flex h-12 w-full items-center gap-3 rounded-2xl border border-line bg-card px-4 text-left text-[15px] text-faint">
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
      {error && <ErrorState message={error.message} onRetry={reload} />}

      {data && data.total === 0 && (
        <Empty icon={<Sparkles className="size-7" />} title="Aucun événement pour l'instant" text="Soyez le premier à publier un événement à Lomé." action={<Link to="/creer" className="font-semibold text-gold">Créer un événement</Link>} />
      )}

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
        <Section title="Ce week-end à Lomé" action={<Link to="/explorer?when=weekend" className="flex items-center text-sm font-semibold text-gold">Tout voir <ChevronRight className="size-4" /></Link>}>
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
              <Link key={c.id} to={`/vote/${c.id}`} className="block w-[80%] shrink-0">
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gold">
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
                        <span className="text-sm font-semibold text-gold">{x.votes !== null ? compact(x.votes) : "—"}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </Section>
      )}

      <div className="mx-5 mt-7">
        <Link to="/photos" className="relative block overflow-hidden rounded-[22px] border border-gold/30 bg-gradient-to-br from-[#2b1f08] to-[#14110c] p-5">
          <div className="absolute -right-10 -top-10 size-40 rounded-full bg-gold/25 blur-3xl" />
          <ScanFace className="size-9 text-gold" />
          <div className="mt-3 font-display text-lg font-bold text-white">Pass ToBe : tes photos te trouvent</div>
          <p className="mt-1 text-sm text-white/65">Un selfie une seule fois, et tu es prévenu dès que tu apparais dans une galerie.</p>
          <span className="mt-3 inline-flex items-center text-sm font-semibold text-gold">
            {me?.user.passEnabled ? "Voir mes photos" : "Activer mon Pass"} <ChevronRight className="size-4" />
          </span>
        </Link>
      </div>

      {data && data.top.length > 0 && (
        <Section title="Les plus marquants" action={<Link to="/explorer" className="flex items-center text-sm font-semibold text-gold">Explorer <ChevronRight className="size-4" /></Link>}>
          <div className="space-y-3 px-5">
            {data.top.map((e) => (
              <RowCard key={e.id} e={e} />
            ))}
          </div>
        </Section>
      )}

      <div className="mx-5 mb-4 mt-8 grid grid-cols-2 gap-3">
        <Link to="/creer" className="rounded-[20px] border border-line bg-card p-4">
          <Sparkles className="size-6 text-gold" />
          <div className="mt-3 font-display font-bold">Vous organisez ?</div>
          <div className="mt-1 text-xs text-muted">Publiez en 2 minutes, ou confiez tout à ToBe.</div>
        </Link>
        <Link to="/prestataires" className="rounded-[20px] border border-line bg-card p-4">
          <Store className="size-6 text-gold" />
          <div className="mt-3 font-display font-bold">Prestataires</div>
          <div className="mt-1 text-xs text-muted">MC, déco, son, photo : les pros certifiés ToBe.</div>
        </Link>
      </div>
    </div>
  );
}
