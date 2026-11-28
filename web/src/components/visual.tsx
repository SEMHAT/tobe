import type { Category, ImpactTier, Theme } from "@tobe/core";
import {
  Briefcase,
  Cake,
  Church,
  Crown,
  Flame,
  Flower2,
  Heart,
  Mic2,
  Music2,
  Palette,
  Sparkles,
  Trophy,
  Volleyball,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { absoluteMedia } from "../lib/api";
import { resolveMedia } from "../lib/media";
import { cx } from "./ui";

export const THEMES: Record<Theme, { bg: string; glow: string; label: string }> = {
  roi: { bg: "linear-gradient(150deg,#07003a 0%,#1800ad 55%,#4f3dff 100%)", glow: "#8f86ff", label: "Bleu roi" },
  or: { bg: "linear-gradient(150deg,#3a2408 0%,#9a5a0c 45%,#1800ad 100%)", glow: "#ffcf6b", label: "Or" },
  corail: { bg: "linear-gradient(150deg,#2a0b14 0%,#9c1f3a 45%,#ff5a4e 100%)", glow: "#ff9a6b", label: "Corail" },
  nuit: { bg: "linear-gradient(150deg,#070b1f 0%,#1b2a6b 50%,#3b82f6 100%)", glow: "#7cc4ff", label: "Nuit" },
  vert: { bg: "linear-gradient(150deg,#06190f 0%,#0f6b45 50%,#22c58b 100%)", glow: "#b6f7c9", label: "Vert" },
  violet: { bg: "linear-gradient(150deg,#14061f 0%,#5b1d8f 50%,#c26bff 100%)", glow: "#f0b8ff", label: "Violet" },
  sobre: { bg: "linear-gradient(150deg,#0b0b0e 0%,#2a2a33 55%,#5c5866 100%)", glow: "#d9d4e0", label: "Sobre" },
};

const CAT_ICON: Record<Category, typeof Music2> = {
  concert: Music2,
  soiree: Flame,
  corporate: Briefcase,
  culture: Palette,
  mariage: Heart,
  concours: Crown,
  sport: Volleyball,
  religieux: Church,
  funerailles: Flower2,
  anniversaire: Cake,
  autre: Sparkles,
};

export function CategoryIcon({ category, className }: { category: Category; className?: string }) {
  const I = CAT_ICON[category] ?? Sparkles;
  return <I className={className} />;
}

/** Affiche une image (gère les images gardées dans le navigateur en mode démo). */
export function Img({ src, alt = "", className }: { src: string; alt?: string; className?: string }) {
  const [url, setUrl] = useState(src.startsWith("idb:") ? "" : absoluteMedia(src));
  useEffect(() => {
    let live = true;
    if (src.startsWith("idb:")) resolveMedia(src).then((u) => live && setUrl(u));
    else setUrl(absoluteMedia(src));
    return () => {
      live = false;
    };
  }, [src]);
  if (!url) return <div className={cx("skeleton", className)} />;
  return <img src={url} alt={alt} loading="lazy" className={className} draggable={false} />;
}

/** Visuel d'un événement : l'affiche envoyée, sinon une affiche générée aux couleurs du thème. */
export function Poster({
  cover,
  theme,
  category,
  title,
  className,
  children,
  showTitle,
}: {
  cover: string | null;
  theme: Theme;
  category: Category;
  title?: string;
  className?: string;
  children?: ReactNode;
  showTitle?: boolean;
}) {
  const t = THEMES[theme] ?? THEMES.or;
  return (
    <div className={cx(!/\b(absolute|fixed)\b/.test(className ?? "") && "relative", "overflow-hidden", className)} style={{ background: t.bg }}>
      {cover ? (
        <Img src={cover} alt={title} className="absolute inset-0 size-full object-cover" />
      ) : (
        <>
          <svg className="absolute inset-0 size-full opacity-60" viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice" aria-hidden>
            <defs>
              <radialGradient id={`g-${theme}`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={t.glow} stopOpacity="0.9" />
                <stop offset="100%" stopColor={t.glow} stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx="320" cy="60" r="190" fill={`url(#g-${theme})`} />
            <circle cx="40" cy="430" r="150" fill={`url(#g-${theme})`} opacity="0.5" />
            {Array.from({ length: 9 }).map((_, i) => (
              <path key={i} d={`M${-50 + i * 55} 520 L${150 + i * 35} -20`} stroke="white" strokeOpacity={0.06} strokeWidth="18" />
            ))}
          </svg>
          <CategoryIcon category={category} className="absolute -bottom-6 -right-6 size-40 rotate-[-12deg] text-white/12" />
          {showTitle && title && (
            <div className="absolute inset-x-5 top-[38%] font-display text-[26px] font-extrabold uppercase leading-[0.95] text-white/95 drop-shadow-lg">{title}</div>
          )}
        </>
      )}
      {children}
    </div>
  );
}

const TIER_STYLE: Record<ImpactTier, string> = {
  phare: "brand-gradient text-white",
  majeur: "bg-[#0b0b12] text-white ring-1 ring-white/30",
  ville: "bg-white text-[#0b0b12]",
  local: "bg-black/45 text-white border border-white/20",
};
const TIER_TEXT: Record<ImpactTier, string> = { phare: "Phare", majeur: "Majeur", ville: "Ville", local: "Local" };

export function TierBadge({ tier, className }: { tier: ImpactTier; className?: string }) {
  return (
    <span className={cx("inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[11px] font-bold uppercase tracking-wide backdrop-blur", TIER_STYLE[tier], className)}>
      {tier === "phare" && <Sparkles className="size-3" />}
      {TIER_TEXT[tier]}
    </span>
  );
}

const AV_GRADIENTS = [
  "linear-gradient(135deg,#1800ad,#e8891c)",
  "linear-gradient(135deg,#ff5a4e,#b8235a)",
  "linear-gradient(135deg,#8b5cf6,#4c1d95)",
  "linear-gradient(135deg,#22c58b,#0f6b45)",
  "linear-gradient(135deg,#3b82f6,#1e3a8a)",
];

export function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ name, src, size = 44, className, ring }: { name: string; src?: string | null; size?: number; className?: string; ring?: boolean }) {
  const idx = [...name].reduce((s, c) => s + c.charCodeAt(0), 0) % AV_GRADIENTS.length;
  return (
    <div
      className={cx("relative grid shrink-0 place-items-center overflow-hidden rounded-full font-display font-bold text-white", ring && "ring-2 ring-brand ring-offset-2 ring-offset-[var(--bg)]", className)}
      style={{ width: size, height: size, background: AV_GRADIENTS[idx], fontSize: size * 0.36 }}
    >
      {src ? <Img src={src} alt={name} className="absolute inset-0 size-full object-cover" /> : initials(name)}
    </div>
  );
}

export function QR({ value, size = 220, className }: { value: string; size?: number; className?: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    import("qrcode").then(({ default: QRCode }) => QRCode.toDataURL(value, { margin: 1, width: size * 2, errorCorrectionLevel: "M", color: { dark: "#0e0e12", light: "#ffffff" } })).then(setUrl);
  }, [value, size]);
  return url ? <img src={url} width={size} height={size} alt={`QR code ${value}`} className={className} /> : <div className={cx("skeleton rounded-xl", className)} style={{ width: size, height: size }} />;
}

/** Logo officiel ToBe (version blanche en mode sombre). */
export function Logo({ className, height = 28 }: { className?: string; height?: number }) {
  return (
    <span className={cx("inline-flex items-center", className)} aria-label="ToBe">
      <img src="/logo.png" alt="ToBe" style={{ height }} className="w-auto select-none dark:hidden" draggable={false} />
      <img src="/logo-white.png" alt="ToBe" style={{ height }} className="hidden w-auto select-none dark:block" draggable={false} />
    </span>
  );
}

export function TrophyMark({ rank }: { rank: number }) {
  const colors = ["text-brand", "text-[#cfd3dc]", "text-[#d08a52]"];
  if (rank > 3) return <span className="w-6 text-center font-display text-sm font-bold text-muted">{rank}</span>;
  return <Trophy className={cx("size-5", colors[rank - 1])} />;
}

export function MicMark() {
  return <Mic2 className="size-4" />;
}
