import { putMedia } from "./media";

/** Mode démo : toute l'API tourne dans le navigateur (même code que le serveur), sans backend. */
export const isDemo = import.meta.env.VITE_DEMO === "true";
export const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

const TOKEN_KEY = "tobe-token";
let token: string | null = typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;

export function getToken() {
  return token;
}
export function setToken(t: string | null) {
  if (t !== token) viderCopies(); // changement de compte ou déconnexion : rien d'un autre compte ne reste
  token = t;
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public data: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

// ---------- Hors connexion ----------
// Chaque lecture réussie (événements, billets, profil, messages…) est gardée sur le téléphone.
// Sans réseau, l'application affiche la dernière version connue au lieu d'une erreur.
const COPIES = "tobe-copie:";
const MAX_COPIES = 60;
const MAX_TAILLE = 250_000;
let horsLigne = false;
export const estHorsLigne = () => horsLigne;
function signaler(etat: boolean) {
  if (horsLigne === etat) return;
  horsLigne = etat;
  try { window.dispatchEvent(new CustomEvent("tobe-hors-ligne", { detail: etat })); } catch { /* */ }
}
function garderCopie(cle: string, data: unknown) {
  try {
    const txt = JSON.stringify({ t: Date.now(), d: data });
    if (txt.length > MAX_TAILLE) return;
    localStorage.setItem(COPIES + cle, txt);
    const cles = Object.keys(localStorage).filter((k) => k.startsWith(COPIES));
    if (cles.length > MAX_COPIES) {
      cles.map((k) => [k, Number(JSON.parse(localStorage.getItem(k) ?? "{}").t ?? 0)] as const)
        .sort((a, b) => a[1] - b[1]).slice(0, cles.length - MAX_COPIES).forEach(([k]) => localStorage.removeItem(k));
    }
  } catch { /* stockage plein ou navigation privée */ }
}
function lireCopie<T>(cle: string): T | undefined {
  try {
    const v = localStorage.getItem(COPIES + cle);
    return v ? (JSON.parse(v).d as T) : undefined;
  } catch {
    return undefined;
  }
}
function viderCopies() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(COPIES)).forEach((k) => localStorage.removeItem(k));
    navigator.serviceWorker?.controller?.postMessage({ type: "vider" });
  } catch { /* */ }
}

function qs(q?: Query) {
  if (!q) return "";
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export async function api<T = any>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown, query?: Query): Promise<T> {
  if (isDemo) {
    const { demoRequest } = await import("./demo");
    const q: Record<string, string> = {};
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== "") q[k] = String(v);
    await new Promise((r) => setTimeout(r, 90));
    const r = demoRequest(method, path, q, body, token);
    if (r.status >= 400) {
      const b = r.body as { error?: string };
      if (r.status === 401 && token) setToken(null);
      throw new HttpError(r.status, b.error ?? "Erreur", b as Record<string, unknown>);
    }
    return structuredClone(r.body) as T;
  }
  const cle = `${path}${qs(query)}`;
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}${qs(query)}`, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body !== undefined && method !== "GET" ? JSON.stringify(body) : undefined,
    });
  } catch {
    // Pas de réseau : pour une lecture, la dernière version gardée sur le téléphone.
    if (method === "GET") {
      const copie = lireCopie<T>(cle);
      if (copie !== undefined) {
        signaler(true);
        return copie;
      }
    }
    throw new HttpError(0, "Pas de connexion internet. Vérifiez votre réseau et réessayez.");
  }
  signaler(false);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) setToken(null);
    throw new HttpError(res.status, data.error ?? "Erreur", data);
  }
  if (method === "GET") garderCopie(cle, data);
  return data as T;
}

/** Envoie une image (déjà redimensionnée) et renvoie son adresse. */
export async function uploadImage(blob: Blob, name = "image.jpg"): Promise<string> {
  if (isDemo) return putMedia(blob);
  void name;
  const type = ["image/jpeg", "image/png", "image/webp"].includes(blob.type) ? blob.type : "image/jpeg";
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/uploads`, { method: "POST", body: blob, headers: { "content-type": type, ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  } catch {
    throw new HttpError(0, "Pas de connexion internet. Vérifiez votre réseau et réessayez.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(res.status, data.error ?? "Échec de l'envoi");
  return data.url as string;
}

export function absoluteMedia(url: string): string {
  if (url.startsWith("/uploads/")) return `${API_URL}${url}`;
  return url;
}
