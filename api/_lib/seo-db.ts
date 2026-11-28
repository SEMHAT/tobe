// Lectures en base pour le référencement (aucune écriture). Le pool est injecté : testable avec PGlite.
import { SITE, agencyMeta, cagnotteMeta, contestMeta, eventMeta, explorerMeta, homeMeta, infoMeta, isListed, isUpcoming, notFoundMeta, providersMeta, sitemap, type PageMeta, type SeoCagnotte, type SeoContest, type SeoEvent } from "./seo.js";
import { ensureSchema, type PgPool } from "./store.js";

export function seoQueries(pool: PgPool) {
  async function q<T>(text: string, params: unknown[] = []): Promise<{ data: T; updated_at: string | Date }[]> {
    await ensureSchema(pool);
    const c = await pool.connect();
    try {
      const { rows } = await c.query(text, params);
      return rows;
    } finally {
      c.release();
    }
  }

  const one = async <T>(collection: string, idOrSlug: string, bySlug = false) => {
    const rows = bySlug
      ? await q<T>("SELECT data, updated_at FROM docs WHERE collection = $1 AND (id = $2 OR data->>'slug' = $2) LIMIT 1", [collection, idOrSlug])
      : await q<T>("SELECT data, updated_at FROM docs WHERE collection = $1 AND id = $2 LIMIT 1", [collection, idOrSlug]);
    return rows[0]?.data ?? null;
  };

  async function pageFor(p: string): Promise<PageMeta> {
    let parts: string[];
    try {
      parts = p.split("/").filter(Boolean).map(decodeURIComponent);
    } catch {
      return notFoundMeta();
    }
    const upcoming = async () => {
      const rows = await q<SeoEvent>("SELECT data, updated_at FROM docs WHERE collection = 'events' AND data->>'visibility' = 'public'");
      return rows.map((r) => r.data).filter((e) => isListed(e) && !e.cancelledAt && isUpcoming(e)).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    };
    if (parts.length === 0) return homeMeta(await upcoming());
    if (parts.length === 1 && parts[0] === "explorer") return explorerMeta(await upcoming());
    if (parts.length === 1 && (parts[0] === "observatoire" || parts[0] === "securite" || parts[0] === "confidentialite")) return infoMeta(parts[0]);
    if (parts.length === 1 && parts[0] === "prestataires") return providersMeta();
    if (parts.length === 1 && parts[0] === "organiser") return agencyMeta();
    if (parts.length === 2 && parts[0] === "evenement") {
      const e = await one<SeoEvent>("events", parts[1], true);
      return e ? eventMeta(e) : notFoundMeta();
    }
    if (parts.length === 2 && parts[0] === "vote") {
      const c = await one<SeoContest>("contests", parts[1]);
      if (!c) return notFoundMeta();
      return contestMeta(c, await one<SeoEvent>("events", c.eventId));
    }
    if (parts.length === 2 && parts[0] === "cagnotte") {
      const g = await one<SeoCagnotte>("cagnottes", parts[1]);
      if (!g) return notFoundMeta();
      return cagnotteMeta(g, await one<SeoEvent>("events", g.eventId));
    }
    return notFoundMeta();
  }

  async function sitemapXml(): Promise<string> {
    const events = (await q<SeoEvent>("SELECT data, updated_at FROM docs WHERE collection = 'events' AND data->>'visibility' = 'public'")).filter((r) => isListed(r.data));
    const publicIds = new Set(events.map((r) => r.data.id));
    const contests = await q<SeoContest>("SELECT data, updated_at FROM docs WHERE collection = 'contests'");
    const cagnottes = await q<SeoCagnotte>("SELECT data, updated_at FROM docs WHERE collection = 'cagnottes'");
    const latest = events.length ? new Date(Math.max(...events.map((r) => new Date(r.updated_at).getTime()))).toISOString() : null;
    return sitemap([
      { loc: `${SITE}/`, lastmod: latest },
      { loc: `${SITE}/explorer`, lastmod: latest },
      { loc: `${SITE}/prestataires` },
      { loc: `${SITE}/organiser` },
      { loc: `${SITE}/observatoire`, lastmod: latest },
      { loc: `${SITE}/securite` },
      { loc: `${SITE}/confidentialite` },
      ...events.map((r) => ({ loc: `${SITE}/evenement/${encodeURIComponent(r.data.slug)}`, lastmod: r.updated_at })),
      ...contests.filter((r) => publicIds.has(r.data.eventId)).map((r) => ({ loc: `${SITE}/vote/${encodeURIComponent(r.data.id)}`, lastmod: r.updated_at })),
      ...cagnottes.filter((r) => publicIds.has(r.data.eventId)).map((r) => ({ loc: `${SITE}/cagnotte/${encodeURIComponent(r.data.id)}`, lastmod: r.updated_at })),
    ]);
  }

  return { pageFor, sitemapXml };
}
