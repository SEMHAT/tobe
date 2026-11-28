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
  access: "free" | "paid" | "invite" | "none";
  ticketTypes: { price: number; quota?: number | null; sold?: number }[];
  organizerName: string;
  entryInfo?: string | null;
  /** En vérification ou retiré par l'équipe : jamais montré aux moteurs. */
  moderation?: "review" | "suspended" | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
}

/** Visible dans Google et Bing : public et pas en modération. */
export const isListed = (e: SeoEvent) => e.visibility === "public" && !e.moderation;

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

const soldOut = (e: SeoEvent) => e.access === "paid" && e.ticketTypes.length > 0 && e.ticketTypes.every((t) => !!t.quota && (t.sold ?? 0) >= t.quota);

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

const navLinks = `<nav><a href="/">Accueil</a> · <a href="/explorer">Agenda des événements à Lomé</a> · <a href="/prestataires">Prestataires événementiels</a> · <a href="/organiser">Organisation d'événements</a> · <a href="/photos">Retrouver mes photos</a> · <a href="/observatoire">Observatoire des événements</a> · <a href="/securite">Payer en sécurité</a> · <a href="https://eledji.com">Un service ELEDJI</a></nav>`;

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

const ORG_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE}/#site`,
      name: BRAND,
      alternateName: ["ToBe", "ToBe by ELEDJI"],
      url: `${SITE}/`,
      inLanguage: "fr",
      publisher: { "@id": `${SITE}/#org` },
    },
    {
      "@type": "Organization",
      "@id": `${SITE}/#org`,
      name: BRAND,
      alternateName: "ToBe",
      url: `${SITE}/`,
      logo: `${SITE}/icon-512.png`,
      description: "Plateforme et agence des événements de Lomé : agenda, billetterie Mobile Money, votes, cagnottes, galeries photo, et organisation complète d'événements.",
      slogan: "We bring events to life.",
      areaServed: { "@type": "Country", name: "Togo" },
      address: { "@type": "PostalAddress", addressLocality: "Lomé", addressCountry: "TG" },
      parentOrganization: { "@type": "Organization", name: "ELEDJI SARL U", alternateName: "ELEDJI", url: "https://eledji.com/entreprise" },
    },
  ],
};

/** Page d'accueil : les prochains événements en liens lisibles par Google et Bing. */
export function homeMeta(upcoming: SeoEvent[]): PageMeta {
  return {
    status: 200,
    title: "ToBe Lomé : événements à Lomé, billets Mobile Money, votes et photos",
    description: "Que faire à Lomé ? Concerts, soirées, conférences, festivals : réservez vos places en Mobile Money, votez, contribuez aux cagnottes et retrouvez vos photos grâce à votre visage.",
    canonical: `${SITE}/`,
    image: DEFAULT_IMAGE,
    robots: null,
    jsonLd: [
      ORG_LD,
      { "@context": "https://schema.org", "@type": "ItemList", name: "Prochains événements à Lomé", itemListElement: upcoming.slice(0, 30).map((e, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/evenement/${e.slug}`, name: e.title })) },
    ],
    body: `<main><h1>ToBe Lomé — les événements de Lomé</h1><p>Découvrez les concerts, soirées, conférences, concours et festivals de Lomé et du Togo. Réservez vos places en Mobile Money (Moov, Mixx), votez pour vos candidats, contribuez aux cagnottes et retrouvez vos photos d'événement grâce à votre visage.</p><h2>Prochains événements</h2>${eventList(upcoming.slice(0, 30))}<p><a href="/creer">Publier un événement gratuitement</a></p>${navLinks}</main>`,
  };
}

/** Pages d'information (contenu fixe). */
export function infoMeta(page: "observatoire" | "securite" | "confidentialite"): PageMeta {
  const pages = {
    observatoire: ["Observatoire des événements au Togo : chiffres et tendances | ToBe Lomé", "Combien d'événements à Lomé, quels jours, quels types, combien de billets ? Les chiffres ouverts de la vie culturelle au Togo, mis à jour en continu.", "Observatoire des événements au Togo", "Les chiffres de la vie culturelle de Lomé et du Togo : événements par mois, par type, par ville et par jour, billets émis, prix moyen. Données agrégées, sans aucune donnée personnelle, libres de réutilisation."],
    securite: ["Acheter ses billets en toute sécurité à Lomé | ToBe Lomé", "Organisateurs vérifiés, événements contrôlés, argent gardé jusqu'après l'événement, remboursement si annulation, QR anti-capture : comment ToBe protège vos achats.", "Payer en toute sécurité sur ToBe", "Organisateurs vérifiés par l'équipe, événements contrôlés avec preuves, argent des billets gardé jusqu'à 24 h après l'événement, remboursement automatique en cas d'annulation, QR code qui change toutes les 30 secondes."],
    confidentialite: ["Vos données et votre visage : ce que fait ToBe | ToBe Lomé", "Empreinte du visage calculée sur votre téléphone, accord obligatoire, effacement automatique, retrait des photos : la protection des données sur ToBe (loi togolaise 2019-014).", "Vos photos, votre visage, vos règles", "ToBe applique la loi togolaise n° 2019-014 sur les données personnelles : empreinte du visage avec accord, effacée après 12 mois sans usage, retrait des photos, visages des proches avec leur accord."],
  } as const;
  const [title, description, h1, text] = pages[page];
  return { status: 200, title, description, canonical: `${SITE}/${page}`, image: DEFAULT_IMAGE, robots: null, jsonLd: [], body: `<main><h1>${esc(h1)}</h1><p>${esc(text)}</p>${navLinks}</main>` };
}

/** Agence : ToBe organise l'événement du client (page /organiser). */
export const AGENCY = {
  title: "Organisation d'événements à Lomé | ToBe",
  description: "ToBe organise votre événement à Lomé : mariage, anniversaire, lancement, séminaire, concert. Concept, prestataires, décoration, communication et jour J.",
  h1: "Organisation d'événements à Lomé",
  text: "L'agence ToBe conçoit, organise et fait connaître votre événement : mariages et fêtes de famille, lancements, séminaires, conférences, galas, concerts et festivals. Un seul interlocuteur, une équipe de maîtres de cérémonie, décorateurs, techniciens, photographes et communicants, un devis écrit, une coordination complète le jour J et un bilan après l'événement.",
  services: ["Conception du concept, du programme et du budget", "Choix du lieu et coordination des prestataires", "Décoration et mise en scène", "Son, lumière et animation", "Communication, invitations et billetterie", "Photo et vidéo, avec galerie et Pass ToBe", "Coordination complète le jour J"],
} as const;

export function agencyMeta(): PageMeta {
  const url = `${SITE}/organiser`;
  return {
    status: 200,
    title: AGENCY.title,
    description: AGENCY.description,
    canonical: url,
    image: DEFAULT_IMAGE,
    robots: null,
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "Service",
        "@id": `${url}#service`,
        name: "Organisation d'événements à Lomé",
        serviceType: "Organisation d'événements",
        url,
        description: AGENCY.description,
        provider: { "@id": `${SITE}/#org` },
        areaServed: { "@type": "City", name: "Lomé" },
        hasOfferCatalog: { "@type": "OfferCatalog", name: "Services de l'agence ToBe", itemListElement: AGENCY.services.map((s) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name: s } })) },
      },
    ],
    body: `<main><h1>${esc(AGENCY.h1)}</h1><p>${esc(AGENCY.text)}</p><ul>${AGENCY.services.map((s) => `<li>${esc(s)}</li>`).join("")}</ul><p><a href="/organiser">Demander un devis</a></p>${navLinks}</main>`,
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
    eventStatus: e.cancelledAt ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: e.venue,
      address: { "@type": "PostalAddress", streetAddress: e.venue, addressLocality: e.city || "Lomé", addressCountry: "TG" },
    },
    image: [absolute(e.cover)],
    url,
    ...(e.access === "free" || e.access === "paid"
      ? {
          offers: {
            "@type": "Offer",
            url: `${url}/billets`,
            price,
            priceCurrency: "XOF",
            availability: e.cancelledAt || soldOut(e) ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
          },
        }
      : {}),
    organizer: { "@type": "Organization", name: e.organizerName, url: SITE },
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
  const priceText = e.cancelledAt
    ? `Événement annulé${e.cancelReason ? ` : ${e.cancelReason}` : ""}. Les billets achetés en ligne sont remboursés.`
    : e.access === "invite"
      ? "Sur invitation."
      : e.access === "none"
        ? clip(e.entryInfo || "Infos d'entrée auprès de l'organisateur.", 120)
        : price === 0
          ? "Entrée gratuite."
          : `Places dès ${price.toLocaleString("fr-FR")} FCFA.`;
  return {
    status: 200,
    title: clip(`${e.cancelledAt ? "Annulé · " : ""}${e.title} · ${e.venue}, ${e.city || "Lomé"} | ${BRAND}`, 70),
    description: clip(`${e.title} — ${when} à ${e.venue}, ${e.city || "Lomé"}. ${priceText} ${e.description}`, 158),
    canonical: url,
    image: absolute(e.cover),
    // Non listé : accessible par lien, mais jamais dans Google.
    robots: e.visibility === "unlisted" || e.moderation ? "noindex" : null,
    jsonLd: isListed(e) ? [eventJsonLd(e)] : [],
    body: `<main><article><h1>${esc(e.title)}</h1><p>${esc(CATEGORIES[e.category] ?? "Événement")} · ${esc(when)} · ${esc(e.venue)}, ${esc(e.city || "Lomé")}</p><p>${esc(priceText)} Organisé par ${esc(e.organizerName)}.</p><p>${esc(clip(e.description, 1200))}</p>${(e.access === "free" || e.access === "paid") && !e.cancelledAt ? `<p><a href="/evenement/${encodeURIComponent(e.slug)}/billets">Réserver ma place</a></p>` : ""}</article>${navLinks}</main>`,
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
