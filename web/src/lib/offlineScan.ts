import { checkDynamicQr, parseQr } from "@tobe/core";
import { api } from "./api";

/** Scanner hors connexion : la liste des billets est gardée sur le téléphone, les entrées sont envoyées au retour du réseau. */
export type ManifestTicket = { code: string; secret: string; qty: number; scannedCount: number; amountDue: number; ticketTypeName: string; holder: string };
export type Manifest = { eventId: string; eventTitle: string; generatedAt: string; tickets: ManifestTicket[] };
type QueuedScan = { code: string; at: string };

const mKey = (id: string) => `tobe-scan-manifest:${id}`;
const qKey = (id: string) => `tobe-scan-queue:${id}`;

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* stockage plein : on continue en mémoire */
  }
}

export const loadManifest = (eventId: string) => read<Manifest | null>(mKey(eventId), null);
export const pendingScans = (eventId: string) => read<QueuedScan[]>(qKey(eventId), []);

/** Télécharge (ou rafraîchit) la liste des billets. Les entrées locales pas encore envoyées restent comptées. */
export async function downloadManifest(eventId: string): Promise<Manifest> {
  const m = await api<Manifest>("GET", `/events/${eventId}/scan-manifest`);
  write(mKey(eventId), m);
  return m;
}

/** Envoie les entrées en attente. Renvoie les conflits (billet passé deux fois). */
export async function syncScans(eventId: string) {
  const queue = pendingScans(eventId);
  if (!queue.length) return { accepted: 0, conflicts: [] as { code: string; reason: string }[] };
  const r = await api<{ accepted: number; conflicts: { code: string; reason: string }[] }>("POST", `/events/${eventId}/scan-sync`, { scans: queue });
  // On retire seulement ce qui a été envoyé (d'autres entrées ont pu arriver pendant l'envoi).
  const rest = pendingScans(eventId).slice(queue.length);
  write(qKey(eventId), rest);
  for (const q of queue) markScanned(eventId, q.code);
  await downloadManifest(eventId).catch(() => null);
  return r;
}

/** Une entrée validée en ligne est aussi comptée dans la liste locale (au cas où le réseau tombe ensuite). */
export function markScanned(eventId: string, code: string) {
  const m = loadManifest(eventId);
  const t = m?.tickets.find((x) => x.code === code);
  if (!m || !t) return;
  t.scannedCount = Math.min(t.qty, t.scannedCount + 1);
  write(mKey(eventId), m);
}

export type LocalScan =
  | { ok: true; holder: string; remaining: number; eventTitle: string; amountDue: number; order: { ticketTypeName: string; qty: number }; warning: string | null; offline: true }
  | { ok: false; reason: string; offline: true };

/** Vérifie un billet sans réseau, avec la même règle que le serveur. */
export function scanLocally(eventId: string, raw: string): LocalScan {
  const m = loadManifest(eventId);
  if (!m) return { ok: false, reason: "Hors connexion et liste des billets non téléchargée", offline: true };
  const p = parseQr(raw);
  const t = m.tickets.find((x) => x.code === p.code);
  if (!t) return { ok: false, reason: "Billet inconnu pour cet événement", offline: true };
  let warning: string | null = null;
  if (p.kind === "dynamic") {
    const c = checkDynamicQr(p, t.secret);
    if (c === "forged") return { ok: false, reason: "Faux QR code", offline: true };
    if (c === "expired") return { ok: false, reason: "QR expiré : c'est une capture d'écran. Demandez le téléphone du détenteur.", offline: true };
  } else warning = "Code saisi à la main : vérifiez la pièce d'identité du détenteur";
  const queue = pendingScans(eventId);
  const used = t.scannedCount + queue.filter((q) => q.code === t.code).length;
  if (used >= t.qty) return { ok: false, reason: "Billet déjà utilisé", offline: true };
  queue.push({ code: t.code, at: new Date().toISOString() });
  write(qKey(eventId), queue);
  return { ok: true, holder: t.holder, remaining: t.qty - used - 1, eventTitle: m.eventTitle, amountDue: t.amountDue, order: { ticketTypeName: t.ticketTypeName, qty: t.qty }, warning, offline: true };
}
