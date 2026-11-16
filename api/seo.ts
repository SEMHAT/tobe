// Fonction Vercel du référencement : sert le HTML de l'application avec les bonnes balises
// pour /explorer, /prestataires, /evenement/:id, /vote/:id, /cagnotte/:id, et /sitemap.xml.
// Aucune écriture en base (les vues des robots ne sont pas comptées).
import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { render } from "./_lib/seo.js";
import { seoQueries } from "./_lib/seo-db.js";
import type { PgPool } from "./_lib/store.js";

if (typeof WebSocket !== "undefined") neonConfig.webSocketConstructor = WebSocket;

const pool = new Pool({ connectionString: process.env.ELEDJI_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.POSTGRES_URL }) as unknown as PgPool;

let template: string | null = null;
async function getTemplate(host: string | undefined): Promise<string> {
  if (template) return template;
  for (const p of [path.join(process.cwd(), "dist", "index.html"), path.join(process.cwd(), "web", "dist", "index.html")]) {
    try {
      template = fs.readFileSync(p, "utf8");
      return template;
    } catch {
      /* fichier absent : on essaie le suivant */
    }
  }
  const r = await fetch(`https://${host ?? "tobe.eledji.com"}/index.html`);
  template = await r.text();
  return template;
}

const { pageFor, sitemapXml } = seoQueries(pool);

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (url.searchParams.get("kind") === "sitemap") {
    try {
      const xml = await sitemapXml();
      res.statusCode = 200;
      res.setHeader("content-type", "application/xml; charset=utf-8");
      res.setHeader("cache-control", "public, s-maxage=3600, stale-while-revalidate=86400");
      return res.end(xml);
    } catch (e) {
      console.error(e);
      res.statusCode = 503;
      res.setHeader("retry-after", "600");
      return res.end("Sitemap momentanément indisponible");
    }
  }

  const p = url.searchParams.get("p") ?? "/";
  let html: string;
  try {
    html = await getTemplate(req.headers.host);
  } catch (e) {
    console.error(e);
    res.statusCode = 503;
    res.setHeader("retry-after", "60");
    return res.end("Service momentanément indisponible");
  }

  res.setHeader("content-type", "text/html; charset=utf-8");
  try {
    const meta = await pageFor(p);
    res.statusCode = meta.status;
    if (meta.robots) res.setHeader("x-robots-tag", meta.robots);
    res.setHeader("cache-control", meta.status === 200 ? "public, s-maxage=300, stale-while-revalidate=3600" : "public, s-maxage=60");
    return res.end(render(html, meta));
  } catch (e) {
    // En cas de souci de base, l'application reste utilisable : gabarit d'origine, sans mise en cache.
    console.error(e);
    res.statusCode = 200;
    res.setHeader("cache-control", "no-store");
    return res.end(html);
  }
}
