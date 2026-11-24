import { useSyncExternalStore } from "react";

/**
 * Langues de ToBe. Le français est la référence ; une clé absente retombe sur le français.
 * Éwé et kabiyè : traductions à faire relire par des locuteurs natifs avant d'être annoncées
 * (modifier simplement ce fichier).
 */
export type Lang = "fr" | "en" | "ee" | "kbp";

export const LANGS: { id: Lang; label: string; review?: boolean }[] = [
  { id: "fr", label: "Français" },
  { id: "en", label: "English" },
  { id: "ee", label: "Eʋegbe", review: true },
  { id: "kbp", label: "Kabɩyɛ", review: true },
];

const fr = {
  "nav.home": "Accueil",
  "nav.explore": "Explorer",
  "nav.photos": "Mes photos",
  "nav.profile": "Profil",
  "nav.providers": "Prestataires",
  "nav.organizer": "Organisateur",
  "nav.create": "Créer un événement",
  "ev.from": "À partir de",
  "ev.invitation": "Invitation",
  "ev.entry": "Entrée",
  "ev.free": "Gratuite",
  "ev.getTicket": "Prendre mon billet",
  "ev.confirm": "Confirmer ma présence",
  "ev.reserve": "Réserver ma place",
  "ev.myTicket": "Voir mon billet",
  "ev.myTickets": "Mes {n} billets",
  "tk.title": "Mes billets",
  "tk.next": "À venir",
  "tk.past": "Passés",
  "tk.mine": "Mon billet",
  "tk.liveQr": "QR vivant : il change toutes les 30 s. Les captures d'écran ne sont pas acceptées.",
  "co.pay": "Payer {amount}",
  "lang.review": "Traduction en cours de relecture : aidez-nous à l'améliorer.",
};
type Key = keyof typeof fr;

const DICT: Record<Lang, Partial<Record<Key, string>>> = {
  fr,
  en: {
    "nav.home": "Home",
    "nav.explore": "Explore",
    "nav.photos": "My photos",
    "nav.profile": "Profile",
    "nav.providers": "Vendors",
    "nav.organizer": "Organizer",
    "nav.create": "Create an event",
    "ev.from": "From",
    "ev.invitation": "Invitation",
    "ev.entry": "Entry",
    "ev.free": "Free",
    "ev.getTicket": "Get my ticket",
    "ev.confirm": "Confirm attendance",
    "ev.reserve": "Book my spot",
    "ev.myTicket": "See my ticket",
    "ev.myTickets": "My {n} tickets",
    "tk.title": "My tickets",
    "tk.next": "Upcoming",
    "tk.past": "Past",
    "tk.mine": "My ticket",
    "tk.liveQr": "Live QR: it changes every 30 s. Screenshots are not accepted.",
    "co.pay": "Pay {amount}",
    "lang.review": "Translation under review: help us improve it.",
  },
  // Brouillon éwé : à faire relire.
  ee: {
    "nav.home": "Aƒeme",
    "nav.explore": "Di nu",
    "nav.photos": "Nye foto wo",
    "nav.profile": "Nye akɔnta",
    "nav.organizer": "Ɖoɖowɔla",
    "ev.from": "Tso",
    "ev.free": "Femaxee",
    "ev.getTicket": "Xɔ nye tikiti",
    "ev.reserve": "Lé nye teƒe ɖi",
    "ev.myTicket": "Kpɔ nye tikiti",
    "ev.myTickets": "Nye tikiti {n} wo",
    "tk.title": "Nye tikiti wo",
    "tk.next": "Siwo gbɔna",
    "tk.past": "Siwo va yi",
    "tk.mine": "Nye tikiti",
    "co.pay": "Xe {amount}",
    "lang.review": "Gɔmeɖeɖe sia le dzadzraɖo me : kpe ɖe mía ŋu.",
  },
  // Kabiyè : à remplir par un locuteur natif (le français s'affiche en attendant).
  kbp: {},
};

const KEY = "tobe-lang";
const listeners = new Set<() => void>();

function detect(): Lang {
  try {
    const saved = localStorage.getItem(KEY) as Lang | null;
    if (saved && saved in DICT) return saved;
  } catch {
    /* stockage indisponible */
  }
  // Français par défaut : la langue ne change que si le visiteur la choisit.
  return "fr";
}

let current: Lang = detect();
if (typeof document !== "undefined") document.documentElement.lang = current;

export function setLang(l: Lang) {
  current = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = l;
  listeners.forEach((f) => f());
}

export function useLang() {
  return useSyncExternalStore(
    (f) => (listeners.add(f), () => listeners.delete(f)),
    () => current,
    () => "fr" as Lang,
  );
}

/** t("ev.myTickets", { n: 2 }) */
export function useT() {
  const lang = useLang();
  return (key: Key, vars?: Record<string, string | number>) => {
    let s = DICT[lang][key] ?? fr[key];
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
    return s;
  };
}
