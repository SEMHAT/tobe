import { test } from "node:test";
import assert from "node:assert/strict";
import { cagnotteMeta, contestMeta, eventMeta, explorerMeta, homeMeta, infoMeta, isUpcoming, notFoundMeta, render, sitemap, type SeoEvent } from "./seo.js";
import { urlsAfter } from "./indexnow.js";

const TEMPLATE = `<!doctype html><html lang="fr"><head>
<title>Générique</title>
<meta name="description" content="générique" />
<meta property="og:title" content="g" />
<meta property="og:url" content="https://tobe.eledji.com/" />
<meta name="twitter:card" content="summary_large_image" />
<script type="application/ld+json">{"@type":"WebSite"}</script>
<script type="module" src="/assets/index-abc.js"></script>
</head><body><div id="root"><main><h1>Accueil</h1><div>x</div></main></div><!--/root--></body></html>`;

const ev = (o: Partial<SeoEvent> = {}): SeoEvent => ({
  id: "e1",
  slug: "concert-de-noel",
  title: "Concert de Noël <live>",
  category: "concert",
  startsAt: "2026-12-24T20:00:00.000Z",
  endsAt: null,
  venue: "Palais des Congrès",
  city: "Lomé",
  description: "Une soirée exceptionnelle.",
  cover: "https://blob.example/affiche.jpg",
  visibility: "public",
  access: "paid",
  ticketTypes: [{ price: 5000 }, { price: 2000 }],
  organizerName: "Asso Lomé",
  ...o,
});

test("événement public : titre, canonique, JSON-LD Event, contenu lisible, une seule balise de chaque", () => {
  const html = render(TEMPLATE, eventMeta(ev()));
  assert.equal((html.match(/<title>/g) ?? []).length, 1);
  assert.equal((html.match(/name="description"/g) ?? []).length, 1);
  assert.equal((html.match(/og:url/g) ?? []).length, 1);
  assert.match(html, /<link rel="canonical" href="https:\/\/tobe.eledji.com\/evenement\/concert-de-noel" \/>/);
  assert.match(html, /"@type":"Event"/);
  assert.match(html, /"price":2000/);
  assert.match(html, /"priceCurrency":"XOF"/);
  assert.doesNotMatch(html, /"@type":"WebSite"/);
  assert.match(html, /<h1>Concert de Noël &lt;live&gt;<\/h1>/);
  assert.doesNotMatch(html, /<live>/);
  assert.match(html, /<script type="module" src="\/assets\/index-abc.js"><\/script>/, "le script de l'application est conservé");
  assert.match(html, /<div id="root"><main><article>/);
  assert.doesNotMatch(html, /<h1>Accueil<\/h1>/);
  assert.doesNotMatch(html, /name="robots"/);
});

test("événement non listé : noindex, sans JSON-LD", () => {
  const m = eventMeta(ev({ visibility: "unlisted" }));
  assert.equal(m.robots, "noindex");
  assert.equal(m.jsonLd.length, 0);
});

test("événement privé : rien n'est révélé", () => {
  const m = eventMeta(ev({ visibility: "private", title: "Mariage secret" }));
  const html = render(TEMPLATE, m);
  assert.doesNotMatch(html, /Mariage secret/);
  assert.match(html, /noindex, nofollow/);
});

test("JSON-LD sans < brut (pas d'injection de script)", () => {
  const html = render(TEMPLATE, eventMeta(ev({ description: "</script><script>alert(1)</script>" })));
  assert.doesNotMatch(html, /<\/script><script>alert/);
});

test("gratuit et sur invitation", () => {
  assert.match(eventMeta(ev({ access: "free", ticketTypes: [] })).description, /Entrée gratuite/);
  const inv = eventMeta(ev({ access: "invite" }));
  assert.equal("offers" in (inv.jsonLd[0] as object), false);
});

test("vote et cagnotte d'un événement non public : noindex", () => {
  const c = { id: "c1", eventId: "e1", title: "Miss", closesAt: "2026-12-30", candidates: [{ name: "A" }] };
  assert.equal(contestMeta(c, ev()).robots, null);
  assert.equal(contestMeta(c, ev({ visibility: "unlisted" })).robots, "noindex, nofollow");
  const g = { id: "g1", eventId: "e1", title: "Soutien", description: "Aidez-nous" };
  assert.equal(cagnotteMeta(g, null).robots, "noindex, nofollow");
});

test("404 et agenda", () => {
  assert.equal(notFoundMeta().status, 404);
  const html = render(TEMPLATE, explorerMeta([ev()]));
  assert.match(html, /href="\/evenement\/concert-de-noel"/);
  assert.match(html, /"@type":"ItemList"/);
});

test("sitemap : XML valide, doublons retirés, caractères échappés", () => {
  const xml = sitemap([{ loc: "https://tobe.eledji.com/" }, { loc: "https://tobe.eledji.com/" }, { loc: "https://tobe.eledji.com/vote/a&b", lastmod: "2026-11-01T00:00:00Z" }]);
  assert.equal((xml.match(/<url>/g) ?? []).length, 2);
  assert.match(xml, /a&amp;b/);
  assert.match(xml, /<lastmod>2026-11-01T00:00:00.000Z<\/lastmod>/);
});

test("isUpcoming : un événement dure 8 h par défaut", () => {
  const e = ev({ startsAt: "2026-11-15T00:00:00Z" });
  assert.equal(isUpcoming(e, new Date("2026-11-15T07:00:00Z")), true);
  assert.equal(isUpcoming(e, new Date("2026-11-15T09:00:00Z")), false);
});

test("base Postgres : pages et sitemap reflètent la visibilité des événements", { timeout: 120_000 }, async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { runApi } = await import("./store.js");
  const { seoQueries } = await import("./seo-db.js");
  const db = new PGlite();
  let queue = Promise.resolve();
  const pool = {
    connect: () =>
      new Promise<any>((resolve) => {
        queue = queue.then(
          () => new Promise<void>((release) => resolve({ query: async (text: string, params?: unknown[]) => ({ rows: (await db.query(text, params)).rows as any[] }), release: () => release() })),
        );
      }),
  };
  const call = (method: string, p: string, body?: unknown, token: string | null = null) => runApi(pool, { EXPOSE_OTP: "true" }, { method, path: p, body: body ?? {}, query: {}, token });
  try {
    const otp = (await call("POST", "/auth/otp", { email: "orga@exemple.tg" })).body as { devCode: string };
    const { token } = (await call("POST", "/auth/verify", { email: "orga@exemple.tg", code: otp.devCode, name: "Orga" })).body as { token: string };
    const base = { category: "concert", startsAt: new Date(Date.now() + 5 * 864e5).toISOString(), venue: "Salle Fazao", description: "Une belle soirée", access: "free", expectedAttendance: 200, reach: "ville", options: { votes: false, cagnotte: false, gallery: false, live: false } };
    const pub = (await call("POST", "/events", { ...base, title: "Festival Public", visibility: "public" }, token)).body as { slug: string };
    const unl = (await call("POST", "/events", { ...base, title: "Soirée Non Listée", visibility: "unlisted" }, token)).body as { slug: string };
    const prv = (await call("POST", "/events", { ...base, title: "Mariage Privé", visibility: "private" }, token)).body as { slug: string; id: string };

    const { pageFor, sitemapXml } = seoQueries(pool);
    const p1 = await pageFor(`/evenement/${pub.slug}`);
    assert.equal(p1.status, 200);
    assert.equal(p1.robots, null);
    assert.match(p1.title, /Festival Public/);
    assert.equal((await pageFor(`/evenement/${unl.slug}`)).robots, "noindex");
    const p3 = await pageFor(`/evenement/${prv.slug}`);
    assert.doesNotMatch(p3.title + p3.body, /Mariage Privé/);
    assert.equal((await pageFor("/evenement/nexiste-pas")).status, 404);
    assert.equal((await pageFor("/evenement/%E0%A4%A")).status, 404);
    assert.match((await pageFor("/explorer")).body, /Festival Public/);
    assert.doesNotMatch((await pageFor("/explorer")).body, /Non Listée|Mariage/);

    const xml = await sitemapXml();
    assert.match(xml, new RegExp(`/evenement/${pub.slug}<`));
    assert.doesNotMatch(xml, new RegExp(unl.slug));
    assert.doesNotMatch(xml, new RegExp(prv.slug));
    assert.match(xml, /<lastmod>\d{4}-\d\d-\d\dT/);

    // le robot ne compte pas de vue
    const dash = (await call("GET", "/organizer", undefined, token)).body as { events: { views: number }[] };
    assert.ok(dash.events.every((e) => e.views === 0));
  } finally {
    await db.close();
  }
});

test("annulé, en vérification, sans billetterie, complet", () => {
  const c = eventMeta(ev({ cancelledAt: "2026-12-01T00:00:00Z", cancelReason: "Pluie" }));
  assert.match(c.title, /^Annulé · /);
  assert.equal((c.jsonLd[0] as { eventStatus: string }).eventStatus, "https://schema.org/EventCancelled");
  assert.ok(!c.body.includes("/billets"), "plus de lien de réservation");
  const r = eventMeta(ev({ moderation: "review" }));
  assert.equal(r.robots, "noindex");
  assert.equal(r.jsonLd.length, 0);
  const n = eventMeta(ev({ access: "none", entryInfo: "Billets au guichet du stade" }));
  assert.match(n.description, /guichet/);
  assert.equal((n.jsonLd[0] as { offers?: unknown }).offers, undefined, "pas de prix inventé");
  const full = eventMeta(ev({ ticketTypes: [{ price: 5000, quota: 10, sold: 10 }] }));
  assert.equal((full.jsonLd[0] as { offers: { availability: string } }).offers.availability, "https://schema.org/SoldOut");
});

test("accueil et pages d'information : liens vers les événements, une seule balise", () => {
  const h = render(TEMPLATE, homeMeta([ev()]));
  assert.equal((h.match(/<title>/g) ?? []).length, 1);
  assert.match(h, /href="\/evenement\/concert-de-noel"/);
  assert.match(h, /"@type":"Organization"/);
  const o = infoMeta("observatoire");
  assert.equal(o.canonical, "https://tobe.eledji.com/observatoire");
});

test("IndexNow : seulement après une action sur un événement", () => {
  assert.deepEqual(urlsAfter("GET", "/events/x", { slug: "a" }), []);
  assert.deepEqual(urlsAfter("POST", "/me/face", {}), []);
  assert.ok(urlsAfter("POST", "/events", { slug: "fete" }).includes("https://tobe.eledji.com/evenement/fete"));
  assert.ok(urlsAfter("POST", "/admin/events/e1/moderation", {}).includes("https://tobe.eledji.com/explorer"));
});
