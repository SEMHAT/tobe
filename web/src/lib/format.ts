export { formatFcfa, formatPhone, CATEGORY_LABELS, TIER_LABELS, PAY_METHOD_LABELS } from "@tobe/core";

const dayFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const longFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

export function shortDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date(today).setHours(0, 0, 0, 0)) / 86_400_000);
  const t = timeFmt.format(d);
  if (diff === 0) return d.getHours() >= 18 ? `Ce soir · ${t}` : `Aujourd'hui · ${t}`;
  if (diff === 1) return `Demain · ${t}`;
  return `${cap(dayFmt.format(d))} · ${t}`;
}
/** Commencé mais pas fini (fin annoncée, ou 8 h après le début par défaut). */
export function isOngoing(e: { startsAt: string; endsAt?: string | null }, now = Date.now()) {
  const start = new Date(e.startsAt).getTime();
  const end = e.endsAt ? new Date(e.endsAt).getTime() : start + 8 * 3_600_000;
  return start <= now && end >= now;
}
/** « En cours · jusqu'au 22 nov. » ou la date habituelle. */
export function cardDate(e: { startsAt: string; endsAt?: string | null }) {
  if (!isOngoing(e)) return shortDate(e.startsAt);
  if (!e.endsAt) return "En cours";
  const end = new Date(e.endsAt);
  const sameDay = new Date(end).setHours(0, 0, 0, 0) === new Date().setHours(0, 0, 0, 0);
  return sameDay ? `En cours · jusqu'à ${timeFmt.format(end)}` : `En cours · jusqu'au ${new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(end)}`;
}
export function longDate(iso: string) {
  return cap(longFmt.format(new Date(iso)));
}
export function time(iso: string) {
  return timeFmt.format(new Date(iso));
}
export function dayNum(iso: string) {
  return new Date(iso).getDate();
}
export function monthShort(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(new Date(iso)).replace(".", "").toUpperCase();
}
export function ago(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return `il y a ${Math.round(s / 86400)} j`;
}
export function countdown(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "Clôturé";
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  if (d > 0) return `${d} j ${h} h`;
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h} h ${m} min`;
}
export function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".0", "").replace(".", ",")} M`;
  if (n >= 10_000) return `${Math.round(n / 1000)} k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(".0", "").replace(".", ",")} k`;
  return String(n);
}
export function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function shareUrl(path: string) {
  return `${location.origin}${path}`;
}
export function whatsappLink(text: string) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
