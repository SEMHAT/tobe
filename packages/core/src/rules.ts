import type { Category, ImpactTier, Reach, TobeEvent } from "./types.js";

// ---------- Tarifs (FCFA) — un seul endroit pour les changer ----------
export const PRICING = {
  // L'acheteur paie le prix affiché (+ frais Mobile Money de l'agrégateur) ; ToBe prélève sa
  // commission sur la recette et reverse le reste à l'organisateur.
  ticketFeeRate: 0, // plus de frais de service ajoutés à l'acheteur
  ticketFeeRatePro: 0,
  ticketCommission: 0.15, // part ToBe sur chaque billet vendu
  voteCommission: 0.1, // part ToBe sur les votes payants
  cagnotteCommission: 0.04,
  /** Reversement automatique dès que la part due à l'organisateur atteint ce montant (FCFA). */
  payoutMin: 1000,
  /** Montant minimum pour un retrait demandé à la main. */
  withdrawMin: 500,
  /** Revente officielle : ToBe garde 5 % (le vendeur reçoit le reste). */
  resaleCommission: 0.05,
  /** Formules photos par événement (FCFA) et part de ToBe (le reste va à l'organisateur). */
  photoPrices: { free: 0, plus: 250, clean: 500, hd: 1000 } as Record<"free" | "plus" | "clean" | "hd", number>,
  photoFreeCount: 3,
  photoGuestsMax: 3,
  photoCommission: 0.3,
  premiumMonthly: 1000, // Pass ToBe Premium
  proMonthly: 15000, // abonnement Organisateur Pro
  boosts: {
    jour: { label: "24 heures en tête", hours: 24, price: 2000 },
    weekend: { label: "3 jours en tête", hours: 72, price: 5000 },
    une: { label: "Une semaine « À la une »", hours: 168, price: 25000 },
  },
  votePacks: [
    { id: "1", votes: 1, factor: 1 },
    { id: "10", votes: 10, factor: 9 },
    { id: "50", votes: 50, factor: 40 },
  ],
} as const;

export type BoostPlan = keyof typeof PRICING.boosts;

export function ticketFee(unitPrice: number, pro = false): number {
  if (unitPrice <= 0) return 0;
  const rate = pro ? PRICING.ticketFeeRatePro : PRICING.ticketFeeRate;
  return Math.round((unitPrice * rate) / 25) * 25; // arrondi aux 25 FCFA
}

export function votePackPrice(votePrice: number, packId: string): { votes: number; price: number } {
  const pack = PRICING.votePacks.find((p) => p.id === packId);
  if (!pack) throw new Error("Pack de votes inconnu");
  return { votes: pack.votes, price: votePrice * pack.factor };
}

// ---------- Classement par impact ----------
const REACH_POINTS: Record<Reach, number> = { quartier: 0, ville: 12, national: 25, international: 35 };
const CATEGORY_BONUS: Partial<Record<Category, number>> = { corporate: 5, culture: 5, concours: 5, concert: 3 };

export function attendancePoints(n: number): number {
  if (n < 50) return 4;
  if (n < 200) return 14;
  if (n < 500) return 24;
  if (n < 2000) return 36;
  return 48;
}

export interface Impact {
  score: number;
  tier: ImpactTier;
}

/** Score sur 100 : taille attendue + portée + type + engagement réel (vues, billets). */
export function computeImpact(
  e: Pick<TobeEvent, "expectedAttendance" | "reach" | "category" | "views" | "ticketTypes">,
): Impact {
  const sold = e.ticketTypes.reduce((s, t) => s + t.sold, 0);
  const engagement = Math.min(17, Math.round(Math.log10(1 + e.views + sold * 5) * 5));
  const score = Math.min(
    100,
    attendancePoints(e.expectedAttendance) + REACH_POINTS[e.reach] + (CATEGORY_BONUS[e.category] ?? 0) + engagement,
  );
  const tier: ImpactTier = score >= 72 ? "phare" : score >= 50 ? "majeur" : score >= 28 ? "ville" : "local";
  return { score, tier };
}

// ---------- Reconnaissance faciale ----------
/** Distance euclidienne entre deux descripteurs de visage (128 valeurs). */
export function faceDistance(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}

/** En dessous de ce seuil, deux visages sont considérés comme la même personne. */
export const FACE_MATCH_THRESHOLD = 0.5;

export function bestFaceDistance(descriptor: number[], faces: number[][]): number {
  let best = Infinity;
  for (const f of faces) best = Math.min(best, faceDistance(descriptor, f));
  return best;
}

/** Écart maximal entre deux captures d'une même personne lors de l'inscription. */
export const FACE_CONSISTENCY_MAX = 0.62;

export function isDescriptor(d: unknown): d is number[] {
  return Array.isArray(d) && d.length === 128 && d.every((x) => typeof x === "number" && Number.isFinite(x));
}

export function meanDescriptor(samples: number[][]): number[] {
  const out = new Array<number>(128).fill(0);
  for (const s of samples) for (let i = 0; i < 128; i++) out[i] += s[i] / samples.length;
  return out.map((x) => Math.round(x * 1e5) / 1e5);
}

/** Empreintes enregistrées d'un utilisateur (anciennes inscriptions : une seule). */
export function userFaces(u: { faceDescriptor: number[] | null; faceDescriptors?: number[][] | null }): number[][] {
  if (u.faceDescriptors?.length) return u.faceDescriptors;
  return u.faceDescriptor ? [u.faceDescriptor] : [];
}

/**
 * Distance entre une personne (plusieurs empreintes) et les visages d'une photo.
 * On combine la meilleure capture et la moyenne : plus robuste aux angles et à la lumière,
 * sans multiplier les faux positifs.
 */
export function facesDistance(mine: number[][], faces: number[][]): number {
  if (!mine.length || !faces.length) return Infinity;
  if (mine.length === 1) return bestFaceDistance(mine[0], faces);
  const mean = meanDescriptor(mine);
  let best = Infinity;
  for (const f of faces) {
    let m = Infinity;
    for (const d of mine) m = Math.min(m, faceDistance(d, f));
    best = Math.min(best, 0.5 * m + 0.5 * faceDistance(mean, f));
  }
  return best;
}

export function facesMatch(mine: number[][], faces: number[][]): boolean {
  return facesDistance(mine, faces) < FACE_MATCH_THRESHOLD;
}

// ---------- Utilitaires ----------
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  let d = digits.startsWith("+") ? digits.slice(1) : digits;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 8) d = "228" + d; // numéro togolais sans indicatif
  if (!/^\d{10,15}$/.test(d)) throw new Error("Numéro de téléphone invalide");
  return "+" + d;
}

export function normalizeEmail(raw: string): string {
  const e = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) || e.length > 200) throw new Error("Adresse e-mail invalide");
  return e;
}

export function formatPhone(p: string): string {
  if (p.startsWith("+228") && p.length === 12) return `+228 ${p.slice(4, 6)} ${p.slice(6, 8)} ${p.slice(8, 10)} ${p.slice(10, 12)}`;
  return p;
}

export function formatFcfa(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(Math.round(n)).replace(/ | /g, " ") + " FCFA";
}

export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function randomCode(len = 8): string {
  const bytes = new Uint8Array(len);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHA[b % ALPHA.length];
  return out;
}

export function newId(prefix: string): string {
  return `${prefix}_${randomCode(12).toLowerCase()}`;
}

export function randomToken(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Empreinte courte et stable (FNV-1a) pour le certificat de transparence des votes. */
export function fingerprint(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    h1 ^= s.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= s.charCodeAt(s.length - 1 - i);
    h2 = Math.imul(h2, 0x01000193) >>> 0;
  }
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).toUpperCase();
}

export const CATEGORY_LABELS: Record<Category, string> = {
  concert: "Concerts",
  soiree: "Soirées",
  corporate: "Corporate",
  culture: "Culture",
  mariage: "Mariages",
  concours: "Concours",
  sport: "Sport",
  religieux: "Religieux",
  funerailles: "Funérailles",
  anniversaire: "Anniversaires",
  autre: "Autres",
};

export const TIER_LABELS: Record<ImpactTier, string> = {
  local: "Local",
  ville: "Ville",
  majeur: "Majeur",
  phare: "Phare",
};

export const PAY_METHOD_LABELS = {
  mixx: "Mixx by Yas",
  moov: "Moov Money",
  card: "Carte bancaire",
  cash: "Sur place",
  online: "Mobile Money",
} as const;

export const TOBE_SERVICES = [
  "Maître de cérémonie",
  "Décoration",
  "Son & lumière",
  "Photo & vidéo",
  "Communication digitale",
  "Traiteur",
  "Sécurité & logistique",
  "Costumes & tenues",
] as const;
