import { FACE_MATCH_THRESHOLD, faceDistance, meanDescriptor } from "./rules.js";

/**
 * « Retrouve-moi » : recherche d'une personne dans les photos d'UN événement, en 3 étapes.
 *
 * 1. Visage : les visages proches de l'empreinte de la personne (seuil habituel).
 * 2. Le look de la soirée : les visages trouvés deviennent des repères. Une photo où la tête est baissée,
 *    tournée ou mal éclairée ressemble souvent davantage au même visage pris le même soir (même coiffure,
 *    même maquillage, même lumière) qu'au selfie de référence. On cherche donc aussi près de ces repères.
 * 3. La tenue : sous chaque visage, ToBe garde la signature des couleurs du haut du corps. Un visage incertain
 *    dont la tenue est celle de la personne ce soir-là devient une suggestion « Peut-être vous ».
 *
 * Les suggestions ne sont jamais données sans confirmation : la personne répond « C'est moi » ou « Pas moi ».
 */

export const EVENING_THRESHOLD = 0.44;
export const SUGGEST_FACE = 0.58;
export const SUGGEST_WITH_OUTFIT = 0.68;
export const OUTFIT_MIN = 0.72;

export interface FaceMeta {
  /** Position du visage dans la photo (proportions 0 à 1). */
  box: [number, number, number, number];
  /** Signature des couleurs de la tenue (histogramme normalisé), ou vide si hors cadre. */
  outfit: number[];
}

export interface EventPhotoFaces {
  id: string;
  faces: number[][];
  faceMeta?: FaceMeta[] | null;
}

export type MatchVia = "visage" | "soirée" | "confirmé";

export interface EventMatch {
  mine: Map<string, { distance: number; via: MatchVia }>;
  suggestions: { photoId: string; face: number; distance: number; outfit: number | null; box: FaceMeta["box"] | null }[];
}

/** Distance entre une personne (plusieurs empreintes) et un visage : moitié meilleure empreinte, moitié moyenne. */
export function personDistance(samples: number[][], face: number[]): number {
  if (!samples.length) return Infinity;
  let best = Infinity;
  for (const s of samples) best = Math.min(best, faceDistance(s, face));
  if (samples.length === 1) return best;
  return 0.5 * best + 0.5 * faceDistance(meanDescriptor(samples), face);
}

/** Ressemblance de deux tenues (intersection d'histogrammes) : 1 = mêmes couleurs, 0 = rien en commun. */
export function outfitSimilarity(a: number[], b: number[]): number {
  if (!a?.length || a.length !== b?.length) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.min(a[i], b[i]);
  return s;
}

export function matchEventFaces(input: { samples: number[][]; photos: EventPhotoFaces[]; confirmed?: Set<string>; rejected?: Set<string> }): EventMatch {
  const { samples, photos } = input;
  const confirmed = input.confirmed ?? new Set<string>();
  const rejected = input.rejected ?? new Set<string>();
  const mine = new Map<string, { distance: number; via: MatchVia }>();
  const taken = new Set<string>();
  const anchors: number[][] = [];
  const outfits: number[][] = [];
  const key = (p: string, i: number) => `${p}:${i}`;
  const take = (p: EventPhotoFaces, i: number, distance: number, via: MatchVia) => {
    taken.add(key(p.id, i));
    anchors.push(p.faces[i]);
    const o = p.faceMeta?.[i]?.outfit;
    if (o?.length) outfits.push(o);
    const cur = mine.get(p.id);
    if (!cur || distance < cur.distance) mine.set(p.id, { distance: Math.round(distance * 1000) / 1000, via: cur?.via === "visage" ? "visage" : via });
  };

  // 1. Visage (et photos confirmées par la personne).
  const dist = new Map<string, number>();
  for (const p of photos)
    p.faces.forEach((f, i) => {
      const k = key(p.id, i);
      if (rejected.has(k)) return;
      const d = personDistance(samples, f);
      dist.set(k, d);
      if (confirmed.has(k)) take(p, i, d, "confirmé");
      else if (d < FACE_MATCH_THRESHOLD) take(p, i, d, "visage");
    });

  // 2. Le look de la soirée : on s'appuie sur les visages déjà trouvés (deux tours).
  for (let round = 0; round < 2 && anchors.length; round++) {
    const snapshot = anchors.slice();
    let added = 0;
    for (const p of photos)
      p.faces.forEach((f, i) => {
        const k = key(p.id, i);
        if (taken.has(k) || rejected.has(k) || !dist.has(k)) return;
        let d = Infinity;
        for (const a of snapshot) d = Math.min(d, faceDistance(a, f));
        if (d < EVENING_THRESHOLD) {
          take(p, i, Math.min(d, dist.get(k)!), "soirée");
          added++;
        } else dist.set(k, Math.min(dist.get(k)!, d));
      });
    if (!added) break;
  }

  // 3. Suggestions : visage assez proche, ou un peu moins proche mais avec la même tenue.
  const suggestions: EventMatch["suggestions"] = [];
  for (const p of photos) {
    if (mine.has(p.id)) continue;
    p.faces.forEach((_, i) => {
      const k = key(p.id, i);
      if (taken.has(k) || rejected.has(k) || !dist.has(k)) return;
      const d = dist.get(k)!;
      const meta = p.faceMeta?.[i];
      let outfit: number | null = null;
      if (meta?.outfit?.length && outfits.length) outfit = Math.max(...outfits.map((o) => outfitSimilarity(o, meta.outfit)));
      if (d < SUGGEST_FACE || (d < SUGGEST_WITH_OUTFIT && (outfit ?? 0) >= OUTFIT_MIN))
        suggestions.push({ photoId: p.id, face: i, distance: Math.round(d * 1000) / 1000, outfit: outfit === null ? null : Math.round(outfit * 100) / 100, box: meta?.box ?? null });
    });
  }
  // Une suggestion par photo (la plus probable), les meilleures d'abord.
  const byPhoto = new Map<string, EventMatch["suggestions"][number]>();
  for (const s of suggestions) {
    const cur = byPhoto.get(s.photoId);
    if (!cur || s.distance - (s.outfit ?? 0) * 0.1 < cur.distance - (cur.outfit ?? 0) * 0.1) byPhoto.set(s.photoId, s);
  }
  return { mine, suggestions: [...byPhoto.values()].sort((a, b) => a.distance - (a.outfit ?? 0) * 0.1 - (b.distance - (b.outfit ?? 0) * 0.1)).slice(0, 30) };
}
