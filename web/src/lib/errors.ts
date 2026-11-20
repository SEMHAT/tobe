import { API_URL, getToken, isDemo } from "./api";

let sent = 0;
const seen = new Set<string>();

/** Envoie une erreur de l'application au serveur (au plus 10 par visite, sans doublon). */
export function reportError(err: unknown, stack?: string) {
  try {
    const e = err instanceof Error ? err : new Error(String(err));
    const key = `${e.message}|${location.pathname}`;
    if (isDemo || seen.has(key) || sent >= 10) return;
    seen.add(key);
    sent++;
    const token = getToken();
    void fetch(`${API_URL}/api/client-errors`, {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        message: e.message.slice(0, 300),
        stack: `${e.stack ?? ""}\n${stack ?? ""}`.slice(0, 2000),
        path: location.pathname + location.search,
        ua: navigator.userAgent.slice(0, 250),
      }),
    }).catch(() => {});
  } catch {
    /* ne jamais planter en signalant une erreur */
  }
}

/** Erreurs hors React (code asynchrone, promesses oubliées). */
export function listenGlobalErrors() {
  window.addEventListener("error", (ev) => {
    if (ev.error) reportError(ev.error);
  });
  window.addEventListener("unhandledrejection", (ev) => {
    const r = ev.reason;
    // Les erreurs d'API sont déjà affichées à l'utilisateur.
    if (r && typeof r === "object" && "status" in r) return;
    reportError(r);
  });
}
