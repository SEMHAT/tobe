// IndexNow : prévient Bing (et Yandex, Seznam…) dès qu'un événement est publié, modifié ou annulé.
// La clé est publique par conception : elle prouve seulement que le site nous appartient (fichier /<clé>.txt).
import { SITE } from "./seo.js";

export const INDEXNOW_KEY = "217253c3ed3f631d99063c929aca936c";

export async function indexNow(urls: string[], fetcher: typeof fetch = fetch) {
  const list = [...new Set(urls)].filter((u) => u.startsWith(SITE)).slice(0, 100);
  if (!list.length || process.env.INDEXNOW_DISABLED === "true") return false;
  try {
    const r = await fetcher("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host: new URL(SITE).host, key: INDEXNOW_KEY, keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`, urlList: list }),
      signal: AbortSignal.timeout(2500),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** Les pages à signaler après une action réussie sur l'API (création, modification, annulation, validation). */
export function urlsAfter(method: string, path: string, body: unknown): string[] {
  if (method === "GET") return [];
  const slug = (body as { slug?: string } | null)?.slug ?? (body as { event?: { slug?: string } } | null)?.event?.slug;
  const touchesEvent = /^\/events(\/[^/]+)?(\/(cancel|proof))?$/.test(path) || /^\/admin\/events\/[^/]+\/moderation$/.test(path);
  if (!touchesEvent) return [];
  return [`${SITE}/`, `${SITE}/evenements-a-lome`, `${SITE}/explorer`, ...(slug ? [`${SITE}/evenement/${encodeURIComponent(slug)}`] : [])];
}
