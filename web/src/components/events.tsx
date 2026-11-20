import type { EventCard } from "@tobe/core";
import { Calendar, Crown, HandCoins, MapPin, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { compact, formatFcfa, shortDate, dayNum, monthShort } from "../lib/format";
import { cx } from "./ui";
import { Poster, TierBadge } from "./visual";

export const eventPath = (e: { slug: string }) => `/evenement/${e.slug}`;

function Price({ e }: { e: EventCard }) {
  if (e.access === "invite") return <span>Sur invitation</span>;
  if (e.access === "none") return e.entryInfo ? <span className="truncate">{e.entryInfo.length > 28 ? "Infos d'entrée" : e.entryInfo}</span> : null;
  if (e.priceFrom <= 0) return <span className="text-emerald">Gratuit</span>;
  return <span>Dès {formatFcfa(e.priceFrom)}</span>;
}

export function HeroCard({ e }: { e: EventCard }) {
  return (
    <Link to={eventPath(e)} className="block w-[82%] shrink-0 snap-center">
      <Poster cover={e.cover} theme={e.theme} category={e.category} title={e.title} showTitle className="aspect-[4/5] rounded-[26px] shadow-[0_20px_60px_-25px_rgba(0,0,0,0.9)]">
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
        <div className="absolute left-4 right-4 top-4 flex items-center justify-between">
          <TierBadge tier={e.impact.tier} />
          {e.boosted && <span className="rounded-full bg-black/40 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/75 backdrop-blur">Sponsorisé</span>}
        </div>
        <div className="absolute inset-x-4 bottom-4 text-white">
          <div className="text-[13px] font-bold text-[#cfc9ff]">{shortDate(e.startsAt)}</div>
          <div className="mt-1 font-display text-[22px] font-bold leading-tight">{e.title}</div>
          <div className="mt-1.5 flex items-center gap-1.5 text-[13px] text-white/75">
            <MapPin className="size-3.5" />
            <span className="truncate">{e.venue}</span>
          </div>
          <div className="mt-3 flex items-center justify-between">
            {e.access === "none" && !e.entryInfo ? <span /> : (
              <span className="rounded-full bg-white/15 px-3 py-1.5 text-[13px] font-semibold backdrop-blur">
                <Price e={e} />
              </span>
            )}
            {e.attendees > 0 && (
              <span className="flex items-center gap-1 text-xs text-white/75">
                <Users className="size-3.5" />
                {compact(e.attendees)} inscrits
              </span>
            )}
          </div>
        </div>
      </Poster>
    </Link>
  );
}

export function TileCard({ e, wide }: { e: EventCard; wide?: boolean }) {
  return (
    <Link to={eventPath(e)} className={cx("group block shrink-0", wide ? "w-full" : "w-[62%]")}>
      <Poster cover={e.cover} theme={e.theme} category={e.category} title={e.title} className="aspect-[16/11] rounded-[20px] transition duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_24px_40px_-24px_rgba(11,11,18,0.6)]">
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute left-3 top-3">
          <TierBadge tier={e.impact.tier} />
        </div>
        <div className="absolute bottom-3 left-3 grid size-12 place-items-center rounded-2xl bg-white text-center leading-none text-[#16141c] shadow-lg">
          <div>
            <div className="font-display text-lg font-extrabold">{dayNum(e.startsAt)}</div>
            <div className="text-[10px] font-bold text-coral">{monthShort(e.startsAt)}</div>
          </div>
        </div>
      </Poster>
      <div className="mt-2.5 px-0.5">
        <div className="line-clamp-1 font-display text-[16px] font-bold">{e.title}</div>
        <div className="mt-0.5 line-clamp-1 text-[13px] text-muted">
          {e.venue}
          {(e.access !== "none" || e.entryInfo) && (
            <>
              {" · "}
              <Price e={e} />
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

export function RowCard({ e }: { e: EventCard }) {
  return (
    <Link to={eventPath(e)} className="flex items-center gap-3.5 rounded-[20px] border border-line bg-card p-2.5 transition active:scale-[0.99]">
      <Poster cover={e.cover} theme={e.theme} category={e.category} className="size-[84px] shrink-0 rounded-[15px]" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <TierBadge tier={e.impact.tier} className="h-5 px-2 text-[10px]" />
          {e.hasVotes && <Crown className="size-4 text-brand" aria-label="Votes" />}
          {e.hasCagnotte && <HandCoins className="size-4 text-brand" aria-label="Cagnotte" />}
        </div>
        <div className="mt-1 line-clamp-1 font-display text-[15px] font-bold">{e.title}</div>
        <div className="mt-0.5 flex items-center gap-1 text-[12.5px] text-muted">
          <Calendar className="size-3.5 shrink-0" />
          <span className="truncate">{shortDate(e.startsAt)}</span>
        </div>
        <div className="mt-0.5 line-clamp-1 text-[12.5px] font-semibold">
          <Price e={e} />
        </div>
      </div>
    </Link>
  );
}

export function SkeletonRows({ n = 4 }: { n?: number }) {
  return (
    <div className="space-y-3 px-5">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="flex gap-3.5 rounded-[20px] border border-line bg-card p-2.5">
          <div className="skeleton size-[84px] rounded-[15px]" />
          <div className="flex-1 space-y-2 py-2">
            <div className="skeleton h-4 w-1/3 rounded" />
            <div className="skeleton h-4 w-3/4 rounded" />
            <div className="skeleton h-3 w-1/2 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
