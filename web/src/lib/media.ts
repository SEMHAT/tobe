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

function toJpeg(c: HTMLCanvasElement, q: number): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Image illisible"))), "image/jpeg", q));
}

function scaled(src: CanvasImageSource & { width: number; height: number }, maxSide: number) {
  const s = Math.min(1, maxSide / Math.max(src.width, src.height));
  const c = document.createElement("canvas");
  c.width = Math.round(src.width * s);
  c.height = Math.round(src.height * s);
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/** Petit logo ToBe en bas à droite. */
function cornerLogo(c: HTMLCanvasElement) {
  const ctx = c.getContext("2d")!;
  const s = Math.max(13, Math.round(c.width / 42));
  ctx.font = `800 ${s}px Sora, Inter, system-ui, sans-serif`;
  const text = "ToBe · tobe.eledji.com";
  const w = ctx.measureText(text).width;
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.roundRect?.(c.width - w - s * 1.8, c.height - s * 2.4, w + s * 1.2, s * 1.7, s * 0.5);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, c.width - w - s * 1.2, c.height - s * 1.1);
}

/** Filigrane d'aperçu : « ToBe » en diagonale sur toute l'image (impossible à recadrer). */
function previewWatermark(c: HTMLCanvasElement) {
  const ctx = c.getContext("2d")!;
  const s = Math.round(c.width / 7);
  ctx.save();
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate(-Math.PI / 7);
  ctx.font = `800 ${s}px Sora, Inter, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = Math.max(1, s / 40);
  for (let y = -c.height; y <= c.height; y += s * 1.6)
    for (let x = -c.width; x <= c.width; x += s * 3.2) {
      ctx.fillText("ToBe", x + ((y / (s * 1.6)) % 2 ? s * 1.6 : 0), y);
      ctx.strokeText("ToBe", x + ((y / (s * 1.6)) % 2 ? s * 1.6 : 0), y);
    }
  ctx.restore();
  cornerLogo(c);
}

/**
 * Les 4 versions d'une photo d'événement :
 * aperçu public (filigrané), avec logo (1280), sans logo (1280), Full HD sans logo (1920).
 */
export async function photoVariants(file: Blob) {
  const bmp = await createImageBitmap(file).catch(async () => (await loadImage(URL.createObjectURL(file))) as unknown as ImageBitmap);
  const hdC = scaled(bmp, 1920);
  const cleanC = scaled(hdC, 1280);
  const logoC = scaled(hdC, 1280);
  cornerLogo(logoC);
  const prevC = scaled(hdC, 720);
  previewWatermark(prevC);
  const [hd, clean, logo, preview] = await Promise.all([toJpeg(hdC, 0.9), toJpeg(cleanC, 0.86), toJpeg(logoC, 0.86), toJpeg(prevC, 0.72)]);
  return { hd, clean, logo, preview, width: hdC.width, height: hdC.height, canvas: hdC };
}
