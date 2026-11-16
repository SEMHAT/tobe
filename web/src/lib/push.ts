import { api } from "./api";

// =====================================================================
// Notifications push (comme WhatsApp) et installation de l'application.
// =====================================================================

export type PushState = "unsupported" | "ios-install" | "denied" | "granted" | "default";

export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isAndroid = () => /Android/i.test(navigator.userAgent);
export const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

export function pushState(): PushState {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) return isIOS() && !isStandalone() ? "ios-install" : "unsupported";
  // Sur iPhone, les notifications ne fonctionnent qu'une fois ToBe ajouté à l'écran d'accueil.
  if (isIOS() && !isStandalone()) return "ios-install";
  if (!("PushManager" in window)) return "unsupported";
  return Notification.permission === "granted" ? "granted" : Notification.permission === "denied" ? "denied" : "default";
}

let vapid: Promise<string | null> | null = null;
function vapidKey() {
  vapid ??= api<{ vapidPublicKey?: string | null }>("GET", "/config")
    .then((c) => c.vapidPublicKey ?? null)
    .catch(() => {
      vapid = null;
      return null;
    });
  return vapid;
}

function b64ToBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  try {
    return await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
  } catch {
    return null;
  }
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushState() !== "granted") return null;
  const reg = await registration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Adresse d'abonnement de ce téléphone (sert aux rappels des visiteurs sans compte). */
export async function currentEndpoint(): Promise<string | null> {
  return (await currentSubscription())?.endpoint ?? null;
}

/** Demande l'autorisation, abonne ce téléphone et l'enregistre sur le serveur. */
export async function enablePush(): Promise<{ ok: boolean; endpoint?: string; reason?: string }> {
  const state = pushState();
  if (state === "unsupported") return { ok: false, reason: "Ce navigateur ne reçoit pas les notifications. Essayez avec Chrome." };
  if (state === "ios-install") return { ok: false, reason: "Sur iPhone, ajoutez d'abord ToBe à l'écran d'accueil." };
  if (state === "denied") return { ok: false, reason: "Notifications bloquées : autorisez-les dans les réglages du navigateur pour tobe.eledji.com." };
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: "Notifications non autorisées." };
  const key = await vapidKey();
  const reg = await registration();
  if (!key || !reg) return { ok: false, reason: "Notifications indisponibles pour le moment." };
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
  await api("POST", "/push/subscribe", { ...sub.toJSON(), ua: navigator.userAgent.slice(0, 160) });
  window.dispatchEvent(new Event("tobe-push-changed"));
  return { ok: true, endpoint: sub.endpoint };
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await api("POST", "/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
  window.dispatchEvent(new Event("tobe-push-changed"));
}

/** Après une connexion : rattache l'abonnement de ce téléphone au compte. */
export async function syncPush() {
  const sub = await currentSubscription().catch(() => null);
  if (sub) await api("POST", "/push/subscribe", { ...sub.toJSON(), ua: navigator.userAgent.slice(0, 160) }).catch(() => {});
}

// ---------- Installation (PWA) ----------
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
let deferred: BeforeInstallPromptEvent | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // on affiche notre propre fenêtre, au bon moment
    deferred = e as BeforeInstallPromptEvent;
    window.dispatchEvent(new Event("tobe-installable"));
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    try {
      localStorage.setItem("tobe-installed", "1");
    } catch {
      /* navigation privée */
    }
    window.dispatchEvent(new Event("tobe-installed"));
  });
}

export const canPromptInstall = () => !!deferred;

/** Ouvre la fenêtre d'installation du navigateur (Android, ordinateur). */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const d = deferred;
  deferred = null;
  await d.prompt();
  const { outcome } = await d.userChoice;
  return outcome === "accepted";
}

export const wasInstalled = () => {
  try {
    return isStandalone() || localStorage.getItem("tobe-installed") === "1";
  } catch {
    return isStandalone();
  }
};
