import { useEffect } from "react";

// Balises de la page côté navigateur. Les robots reçoivent déjà le bon HTML du serveur
// (api/seo.ts) ; ceci garde le titre juste pendant la navigation dans l'application
// et retire de Google les pages privées et introuvables.

const BRAND = "ToBe Lomé";

/** Robots d'indexation et d'aperçu de liens (ils ne doivent jamais voir l'écran d'accueil mobile). */
export const isCrawler = () =>
  typeof navigator !== "undefined" && /bot|crawl|spider|slurp|google-|lighthouse|facebookexternalhit|whatsapp|telegram|linkedin|embedly|preview/i.test(navigator.userAgent);

function meta(name: string): HTMLMetaElement {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.name = name;
    el.dataset.spa = "1";
    document.head.appendChild(el);
  }
  return el;
}

export interface PageMeta {
  title?: string | null;
  description?: string | null;
  noindex?: boolean;
}

export function usePageMeta(m: PageMeta | null) {
  const title = m?.title ?? null;
  const description = m?.description ?? null;
  const noindex = !!m?.noindex;
  useEffect(() => {
    if (!m) return;
    if (title) document.title = `${title} | ${BRAND}`;
    if (description) meta("description").content = description.length > 158 ? description.slice(0, 157).trimEnd() + "…" : description;
    if (noindex) meta("robots").content = "noindex, nofollow";
    return () => {
      if (noindex) document.head.querySelector('meta[name="robots"][data-spa="1"]')?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!m, title, description, noindex]);
}

const PRIVATE = /^\/(profil|billets|billet|scanner|notifications|creer|organisateur|tobe|bienvenue)(\/|$)/;

/** Pages personnelles : jamais dans Google. */
export function useRouteRobots(pathname: string) {
  usePageMeta(PRIVATE.test(pathname) ? { noindex: true } : null);
}
