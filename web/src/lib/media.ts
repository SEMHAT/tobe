import { get, set, del } from "idb-keyval";

/** Réduit une image avant envoi (connexions mobiles) et renvoie aussi ses dimensions. */
export async function resizeImage(file: Blob, maxSide = 1600, quality = 0.85): Promise<{ blob: Blob; width: number; height: number; canvas: HTMLCanvasElement }> {
  const bmp = await createImageBitmap(file).catch(async () => {
    const img = await loadImage(URL.createObjectURL(file));
    return img as unknown as ImageBitmap;
  });
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * scale);
  const height = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, width, height);
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Image illisible"))), "image/jpeg", quality));
  return { blob, width, height, canvas };
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("Image illisible"));
    img.src = src;
  });
}

// ---- Mode démo : les images sont gardées dans le navigateur (IndexedDB) ----
const cache = new Map<string, string>();

export async function putMedia(blob: Blob): Promise<string> {
  const key = `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  await set(key, blob);
  cache.set(`idb:${key}`, URL.createObjectURL(blob));
  return `idb:${key}`;
}

export async function resolveMedia(url: string): Promise<string> {
  if (!url.startsWith("idb:")) return url;
  const hit = cache.get(url);
  if (hit) return hit;
  const blob = await get<Blob>(url.slice(4));
  if (!blob) return "";
  const obj = URL.createObjectURL(blob);
  cache.set(url, obj);
  return obj;
}

export async function deleteMedia(url: string) {
  if (url.startsWith("idb:")) await del(url.slice(4));
}

export function dataUrlFromCanvas(canvas: HTMLCanvasElement, size = 360): string {
  const scale = Math.min(1, size / Math.max(canvas.width, canvas.height));
  const c = document.createElement("canvas");
  c.width = Math.round(canvas.width * scale);
  c.height = Math.round(canvas.height * scale);
  c.getContext("2d")!.drawImage(canvas, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.8);
}
