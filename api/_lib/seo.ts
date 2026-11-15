// Référencement de tobe.eledji.com : balises par page, données structurées, sitemap.
// Fonctions pures (sans base ni réseau) : testées dans seo.test.ts.

export const SITE = "https://tobe.eledji.com";
export const DEFAULT_IMAGE = `${SITE}/og.png`;
export const BRAND = "ToBe Lomé";

/** Le strict nécessaire d'un événement pour le référencement (sous-ensemble de TobeEvent). */
export interface SeoEvent {
  id: string;
  slug: string;
  title: string;
  category: string;
  startsAt: string;
  endsAt: string | null;
  venue: string;
  city: string;
  description: string;
  cover: string | null;
  visibility: "public" | "unlisted" | "private";
  access: "free" | "paid" | "invite";
  ticketTypes: { price: number }[];
  organizerName: string;
}

export interface SeoContest {
  id: string;
  eventId: string;
  title: string;
  closesAt: string;
  candidates: { name: string }[];
}

export interface SeoCagnotte {
  id: string;
  eventId: string;
  title: string;
  description: string;
}

export interface PageMeta {
  status: number;
  title: string;
  description: string;
  canonical: string | null;
  image: string;
  robots: string | null;
  jsonLd: object[];
  /** HTML lisible placé dans #root : remplacé par l'application dès que React démarre. */
  body: string;
}

export const esc = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export const clip = (s: string, n: number) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
};

const absolute = (u: string | null) => (!u ? DEFAULT_IMAGE : /^https?:\/\//.test(u) ? u : `${SITE}${u.startsWith("/") ? "" : "/"}${u}`);

export const dateFr = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lome" }).format(new Date(iso));

const priceFrom = (e: SeoEvent) => (e.access === "paid" && e.ticketTypes.length ? Math.min(...e.ticketTypes.map((t) => t.price)) : 0);

const CATEGORIES: Record<string, string> = {
  concert: "Concert",
  soiree: "Soirée",
  corporate: "Événement professionnel",
  culture: "Culture",
  mariage: "Mariage",
  concours: "Concours",
  sport: "Sport",
  religieux: "Événement religieux",
  funerailles: "Funérailles",
  anniversaire: "Anniversaire",
  autre: "Événement",
};

// ---------------------------------------------------------------------------
// Pages fixes
// ---------------------------------------------------------------------------

const navLinks = `<nav><a href="/">Accueil</a> · <a href="/explorer">Agenda des événements à Lomé</a> · <a href="/prestataires">Prestataires événementiels</a> · <a href="/photos">Pass ToBe</a> · <a href="https://eledji.com">Un service ELEDJI</a></nav>`;

function eventList(events: SeoEvent[]) {
  if (!events.length) return "<p>Aucun événement public à venir pour le moment. Les organisateurs publient leurs événements sur ToBe en 2 minutes.</p>";
  return `<ul>${events
    .map((e) => `<li><a href="/evenement/${encodeURIComponent(e.slug)}">${esc(e.title)}</a> — ${esc(e.venue)}, ${esc(e.city)}, ${esc(dateFr(e.startsAt))}</li>`)
    .join("")}</ul>`;
}

export function explorerMeta(upcoming: SeoEvent[]): PageMeta {
  return {
    status: 200,
    title: "Agenda des événements à Lomé : concerts, soirées, festivals | ToBe Lomé",
    description:
      "Que faire à Lomé ? L'agenda des événements mis à jour chaque jour : concerts, soirées, conférences, concours et festivals. Réservez vos places sur ToBe.",
    canonical: `${SITE}/explorer`,
    image: DEFAULT_IMAGE,
    robots: null,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: "Événements à venir à Lomé",
        itemListElement: upcoming.slice(0, 50).map((e, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/evenement/${e.slug}`, name: e.title })),
      },
    ],
    body: `<main><h1>Agenda des événements à Lomé</h1><p>Concerts, soirées, conférences, concours, festivals : tous les événements publics de Lomé, avec réservation des places en ligne.</p>${eventList(upcoming)}${navLinks}</main>`,
  };
}

export function providersMeta(): PageMeta {
  return {
    status: 200,
    title: "Prestataires événementiels à Lomé : DJ, photo, déco, traiteur | ToBe Lomé",
    description:
      "Trouvez les prestataires de votre événement à Lomé : maîtres de cérémonie, sono, photographes, décorateurs, traiteurs, sécurité. Demandez un devis sur ToBe.",
    canonical: `${SITE}/prestataires`,
    image: DEFAULT_IMAGE,
    robots: null,
    jsonLd: [],
    body: `<main><h1>Prestataires événementiels à Lomé</h1><p>Maîtres de cérémonie, sonorisation, photographes, décoration, traiteurs, sécurité, costumes et logistique : comparez les prestataires certifiés ToBe et demandez un devis.</p>${navLinks}</main>`,
  };
}

// ---------------------------------------------------------------------------
// Événement, vote, cagnotte
// ---------------------------------------------------------------------------

export function eventJsonLd(e: SeoEvent) {
  const url = `${SITE}/evenement/${e.slug}`;
  const price = priceFrom(e);
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.title,
    description: clip(e.description, 500),
    startDate: e.startsAt,
    ...(e.endsAt ? { endDate: e.endsAt } : {}),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: e.venue,
      address: { "@type": "PostalAddress", streetAddress: e.venue, addressLocality: e.city || "Lomé", addressCountry: "TG" },
    },
    image: [absolute(e.cover)],
    url,
    ...(e.access !== "invite"
      ? { offers: { "@type": "Offer", url: `${url}/billets`, price, priceCurrency: "XOF", availability: "https://schema.org/InStock" } }
      : {}),
    organizer: { "@type": "Organization", name: e.organizerName },
  };
}

export function eventMeta(e: SeoEvent): PageMeta {
  const url = `${SITE}/evenement/${e.slug}`;
  // Un événement privé ne révèle ni son titre ni son contenu.
  if (e.visibility === "private") {
    return {
      status: 200,
      title: `Événement privé | ${BRAND}`,
      description: "Cet événement est réservé aux invités. Entrez le code d'accès reçu avec votre invitation.",
      canonical: null,
      image: DEFAULT_IMAGE,
      robots: "noindex, nofollow",
      jsonLd: [],
      body: "",
    };
  }
  const price = priceFrom(e);
  const when = dateFr(e.startsAt);
  const priceText = e.access === "invite" ? "Sur invitation." : price === 0 ? "Entrée gratuite." : `Places dès ${price.toLocaleString("fr-FR")} FCFA.`;
  return {
    status: 200,
    title: clip(`${e.title} · ${e.venue}, ${e.city || "Lomé"} | ${BRAND}`, 70),
    description: clip(`${e.title} — ${when} à ${e.venue}, ${e.city || "Lomé"}. ${priceText} ${e.description}`, 158),
    canonical: url,
    image: absolute(e.cover),
    // Non listé : accessible par lien, mais jamais dans Google.
    robots: e.visibility === "unlisted" ? "noindex" : null,
    jsonLd: e.visibility === "public" ? [eventJsonLd(e)] : [],
    body: `<main><article><h1>${esc(e.title)}</h1><p>${esc(CATEGORIES[e.category] ?? "Événement")} · ${esc(when)} · ${esc(e.venue)}, ${esc(e.city || "Lomé")}</p><p>${esc(priceText)} Organisé par ${esc(e.organizerName)}.</p><p>${esc(clip(e.description, 1200))}</p>${e.access !== "invite" ? `<p><a href="/evenement/${encodeURIComponent(e.slug)}/billets">Réserver ma place</a></p>` : ""}</article>${navLinks}</main>`,
  };
}

export function contestMeta(c: SeoContest, e: SeoEvent | null): PageMeta {
  const hidden = !e || e.visibility !== "public";
  return {
    status: 200,
    title: clip(`Vote : ${c.title}${e ? ` · ${e.title}` : ""} | ${BRAND}`, 70),
    description: clip(`Votez pour votre candidat : ${c.title}${e ? `, ${e.title}` : ""}. ${c.candidates.length} candidats. Résultats et certificat de transparence sur ToBe.`, 158),
    canonical: `${SITE}/vote/${c.id}`,
    image: absolute(e?.cover ?? null),
    robots: hidden ? "noindex, nofollow" : null,
    jsonLd: [],
    body: hidden
      ? ""
      : `<main><h1>Vote : ${esc(c.title)}</h1><p>${esc(e!.title)} — ${c.candidates.length} candidats.</p><ul>${c.candidates.map((x) => `<li>${esc(x.name)}</li>`).join("")}</ul><p><a href="/evenement/${encodeURIComponent(e!.slug)}">Voir l'événement</a></p>${navLinks}</main>`,
  };
}

export function cagnotteMeta(g: SeoCagnotte, e: SeoEvent | null): PageMeta {
  const hidden = !e || e.visibility !== "public";
  return {
    status: 200,
    title: clip(`Cagnotte : ${g.title} | ${BRAND}`, 70),
    description: clip(`${g.title}${e ? ` — ${e.title}` : ""}. ${g.description} Contribuez en Mobile Money ou par carte depuis l'étranger.`, 158),
    canonical: `${SITE}/cagnotte/${g.id}`,
    image: absolute(e?.cover ?? null),
    robots: hidden ? "noindex, nofollow" : null,
    jsonLd: [],
    body: hidden ? "" : `<main><h1>${esc(g.title)}</h1><p>${esc(clip(g.description, 600))}</p>${e ? `<p><a href="/evenement/${encodeURIComponent(e.slug)}">${esc(e.title)}</a></p>` : ""}${navLinks}</main>`,
  };
}

export function notFoundMeta(): PageMeta {
  return {
    status: 404,
    title: `Page introuvable | ${BRAND}`,
    description: "Ce lien ne mène nulle part. L'événement a peut-être été retiré.",
    canonical: null,
    image: DEFAULT_IMAGE,
    robots: "noindex",
    jsonLd: [],
    body: "",
  };
}

// ---------------------------------------------------------------------------
// Injection dans le gabarit de l'application
// ---------------------------------------------------------------------------

/** Remplace les balises génériques du gabarit (index.html) par celles de la page. */
export function render(template: string, m: PageMeta): string {
  const head = [
    `<title>${esc(m.title)}</title>`,
    `<meta name="description" content="${esc(m.description)}" />`,
    m.canonical ? `<link rel="canonical" href="${esc(m.canonical)}" />` : "",
    m.robots ? `<meta name="robots" content="${esc(m.robots)}" />` : "",
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${BRAND}" />`,
    `<meta property="og:locale" content="fr_FR" />`,
    `<meta property="og:title" content="${esc(m.title)}" />`,
    `<meta property="og:description" content="${esc(m.description)}" />`,
    `<meta property="og:image" content="${esc(m.image)}" />`,
    m.canonical ? `<meta property="og:url" content="${esc(m.canonical)}" />` : "",
    `<meta name="twitter:card" content="summary_large_image" />`,
    ...m.jsonLd.map((j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, "\\u003c")}</script>`),
  ]
    .filter(Boolean)
    .join("\n    ");

  return template
    .replace(/<title>[\s\S]*?<\/title>\s*/i, "")
    .replace(/<meta\s+name="description"[^>]*>\s*/gi, "")
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, "")
    .replace(/<meta\s+name="robots"[^>]*>\s*/gi, "")
    .replace(/<meta\s+property="og:[^"]*"[^>]*>\s*/gi, "")
    .replace(/<meta\s+name="twitter:[^"]*"[^>]*>\s*/gi, "")
    .replace(/<script type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>\s*/gi, "")
    .replace(/<\/head>/i, `  ${head}\n  </head>`)
    .replace(/<div id="root">[\s\S]*?<\/div>\s*<!--\/root-->/i, `<div id="root">${m.body}</div><!--/root-->`);
}

// ---------------------------------------------------------------------------
// Sitemap
// ---------------------------------------------------------------------------

export function sitemap(entries: { loc: string; lastmod?: string | Date | null }[]): string {
  const seen = new Set<string>();
  const rows = entries
    .filter((e) => (seen.has(e.loc) ? false : (seen.add(e.loc), true)))
    .map((e) => `  <url><loc>${esc(e.loc)}</loc>${e.lastmod ? `<lastmod>${new Date(e.lastmod).toISOString()}</lastmod>` : ""}</url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join("\n")}\n</urlset>\n`;
}

export function isUpcoming(e: SeoEvent, now = new Date()) {
  const end = e.endsAt ? new Date(e.endsAt) : new Date(new Date(e.startsAt).getTime() + 8 * 3600_000);
  return end >= now;
}
