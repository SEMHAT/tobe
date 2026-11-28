// Reconnaissance faciale dans le navigateur : les photos ne quittent pas l'appareil pour être analysées,
// seuls les descripteurs (128 nombres par visage) sont envoyés au serveur.
type FaceApi = typeof import("@vladmandic/face-api");
let ready: Promise<FaceApi> | null = null;

export function loadFaceApi(): Promise<FaceApi> {
  if (!ready) {
    ready = (async () => {
      const faceapi = await import("@vladmandic/face-api");
      const tf = faceapi.tf as unknown as { setBackend: (b: string) => Promise<boolean>; ready: () => Promise<void> };
      try {
        if (!(await tf.setBackend("webgl"))) throw new Error("webgl");
      } catch {
        await tf.setBackend("cpu");
      }
      await tf.ready();
      const base = `${import.meta.env.BASE_URL}models`;
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(base),
        faceapi.nets.faceLandmark68Net.loadFromUri(base),
        faceapi.nets.faceRecognitionNet.loadFromUri(base),
      ]);
      return faceapi;
    })();
    ready.catch(() => (ready = null));
  }
  return ready;
}

type Input = HTMLImageElement | HTMLCanvasElement | HTMLVideoElement;

/** Tous les visages d'une photo de groupe. */
export async function faceDescriptors(input: Input): Promise<number[][]> {
  const faceapi = await loadFaceApi();
  const res = await faceapi.detectAllFaces(input, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.45 })).withFaceLandmarks().withFaceDescriptors();
  return res.map((r) => Array.from(r.descriptor).map((x) => Math.round(x * 1e5) / 1e5));
}

export type FaceMeta = { box: [number, number, number, number]; outfit: number[] };
type Found = { cx: number; cy: number; w: number; h: number; score: number; descriptor: number[] };

const round5 = (d: Float32Array) => Array.from(d).map((x) => Math.round(x * 1e5) / 1e5);

function sub(src: HTMLCanvasElement, x: number, y: number, w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")!.drawImage(src, x, y, w, h, 0, 0, w, h);
  return c;
}
function turned(src: HTMLCanvasElement, deg: number) {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext("2d")!;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

/** Signature des couleurs de la tenue, sous le visage : 8 teintes + 3 niveaux de gris (noir, gris, blanc). */
function outfitSignature(ctx: CanvasRenderingContext2D, W: number, H: number, f: Found): number[] {
  const x0 = Math.max(0, Math.round(f.cx - f.w * 1.1));
  const x1 = Math.min(W, Math.round(f.cx + f.w * 1.1));
  const y0 = Math.max(0, Math.round(f.cy + f.h * 0.75));
  const y1 = Math.min(H, Math.round(f.cy + f.h * 2.8));
  if (x1 - x0 < f.w * 0.8 || y1 - y0 < f.h * 0.8) return [];
  const { data } = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
  const bins = new Array(11).fill(0);
  let n = 0;
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), v = max, s = max ? (max - min) / max : 0;
    if (s < 0.22 || v < 0.16) bins[8 + (v < 0.3 ? 0 : v < 0.7 ? 1 : 2)]++;
    else {
      let h = max === r ? (g - b) / (max - min) : max === g ? 2 + (b - r) / (max - min) : 4 + (r - g) / (max - min);
      h = ((h * 60 + 360) % 360) / 45;
      bins[Math.floor(h) % 8]++;
    }
    n++;
  }
  return n ? bins.map((x) => Math.round((x / n) * 1000) / 1000) : [];
}

/**
 * Détection « profonde » pour les photos d'événement :
 * image entière + 5 tuiles qui se chevauchent (visages petits, photos de foule)
 * + deux passes redressées à ±30° (têtes penchées). Testé : 24 visages sur 24 au lieu de 16 sur des photos
 * prises de loin, 21 sur 22 au lieu de 17 sur des têtes penchées.
 */
export async function detectFacesDeep(canvas: HTMLCanvasElement): Promise<{ faces: number[][]; meta: FaceMeta[] }> {
  const faceapi = await loadFaceApi();
  const opts = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.32 });
  const found: Found[] = [];
  const iou = (a: Found, b: Found) => {
    const ix = Math.max(0, Math.min(a.cx + a.w / 2, b.cx + b.w / 2) - Math.max(a.cx - a.w / 2, b.cx - b.w / 2));
    const iy = Math.max(0, Math.min(a.cy + a.h / 2, b.cy + b.h / 2) - Math.max(a.cy - a.h / 2, b.cy - b.h / 2));
    const i = ix * iy;
    return i / (a.w * a.h + b.w * b.h - i);
  };
  const add = (f: Found) => {
    // Faux positifs : visage minuscule ou peu sûr.
    if (f.w < 18 || f.score < 0.32) return;
    const dup = found.find((o) => iou(o, f) > 0.3);
    if (!dup) found.push(f);
    else if (f.score > dup.score) Object.assign(dup, f);
  };
  const run = async (c: HTMLCanvasElement, map: (x: number, y: number) => [number, number]) => {
    const res = await faceapi.detectAllFaces(c, opts).withFaceLandmarks().withFaceDescriptors();
    for (const r of res) {
      const b = r.detection.box;
      const [cx, cy] = map(b.x + b.width / 2, b.y + b.height / 2);
      add({ cx, cy, w: b.width, h: b.height, score: r.detection.score, descriptor: round5(r.descriptor) });
    }
  };
  const W = canvas.width, H = canvas.height;
  await run(canvas, (x, y) => [x, y]);
  // Tuiles (60 % de l'image) : les visages lointains deviennent assez grands pour le détecteur.
  const tw = Math.round(W * 0.6), th = Math.round(H * 0.6);
  for (const [fx, fy] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5]]) {
    const x = Math.round((W - tw) * fx), y = Math.round((H - th) * fy);
    await run(sub(canvas, x, y, tw, th), (a, b) => [a + x, b + y]);
  }
  // Têtes penchées : on redresse l'image, puis on ramène les positions dans la photo d'origine.
  for (const deg of [-30, 30]) {
    const rad = (-deg * Math.PI) / 180;
    await run(turned(canvas, deg), (x, y) => {
      const dx = x - W / 2, dy = y - H / 2;
      return [W / 2 + dx * Math.cos(rad) - dy * Math.sin(rad), H / 2 + dx * Math.sin(rad) + dy * Math.cos(rad)];
    });
  }
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  return {
    faces: found.map((f) => f.descriptor),
    meta: found.map((f) => ({
      box: [f.cx - f.w / 2, f.cy - f.h / 2, f.w, f.h].map((v, i) => Math.round((v / (i % 2 ? H : W)) * 1000) / 1000) as FaceMeta["box"],
      outfit: outfitSignature(ctx, W, H, f),
    })),
  };
}

/** Le visage principal d'un selfie (le plus grand). */
export async function selfieDescriptor(input: Input): Promise<number[] | null> {
  const faceapi = await loadFaceApi();
  const res = await faceapi.detectAllFaces(input, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 })).withFaceLandmarks().withFaceDescriptors();
  if (!res.length) return null;
  res.sort((a, b) => b.detection.box.area - a.detection.box.area);
  return Array.from(res[0].descriptor).map((x) => Math.round(x * 1e5) / 1e5);
}

// =====================================================================
// Inscription guidée : analyse en direct de la caméra (rapide), puis capture précise.
// =====================================================================
let liveReady: Promise<FaceApi> | null = null;
/** Détecteur léger pour le guidage en direct (≈ 200 Ko), en plus des modèles principaux. */
export function loadLiveFaceApi(): Promise<FaceApi> {
  if (!liveReady) {
    liveReady = (async () => {
      const faceapi = await loadFaceApi();
      await faceapi.nets.tinyFaceDetector.loadFromUri(`${import.meta.env.BASE_URL}models`);
      return faceapi;
    })();
    liveReady.catch(() => (liveReady = null));
  }
  return liveReady;
}

export interface FrameAnalysis {
  faces: number;
  /** Visage principal, en proportion de l'image (0 à 1). */
  box: { x: number; y: number; w: number; h: number } | null;
  score: number;
  /** Rotation gauche/droite de la tête : 0 de face, environ ±0,3 pour un léger profil. */
  yaw: number;
  /** Hauteur du nez sous les yeux (rapportée à l'écart des yeux) : diminue quand on baisse la tête. */
  pitch: number;
  /** Luminosité moyenne du visage (0 à 255). */
  brightness: number;
  /** Netteté (variance du laplacien) : faible = flou ou bougé. */
  sharpness: number;
}

const probe = typeof document !== "undefined" ? document.createElement("canvas") : null;

function faceStats(video: HTMLVideoElement, box: { x: number; y: number; width: number; height: number }) {
  if (!probe) return { brightness: 128, sharpness: 100 };
  const S = 96;
  probe.width = S;
  probe.height = S;
  const ctx = probe.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(video, box.x, box.y, box.width, box.height, 0, 0, S, S);
  const { data } = ctx.getImageData(0, 0, S, S);
  const g = new Float32Array(S * S);
  let sum = 0;
  for (let i = 0; i < S * S; i++) {
    const y = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    g[i] = y;
    sum += y;
  }
  let lapSum = 0;
  let lapSq = 0;
  let n = 0;
  for (let y = 1; y < S - 1; y++)
    for (let x = 1; x < S - 1; x++) {
      const i = y * S + x;
      const l = g[i - S] + g[i + S] + g[i - 1] + g[i + 1] - 4 * g[i];
      lapSum += l;
      lapSq += l * l;
      n++;
    }
  const mean = lapSum / n;
  return { brightness: sum / (S * S), sharpness: lapSq / n - mean * mean };
}

/** Analyse rapide d'une image de la caméra : combien de visages, position, angle, lumière, netteté. */
export async function analyzeFrame(video: HTMLVideoElement): Promise<FrameAnalysis> {
  const faceapi = await loadLiveFaceApi();
  const vw = video.videoWidth || 1;
  const vh = video.videoHeight || 1;
  const res = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.45 })).withFaceLandmarks();
  if (!res.length) return { faces: 0, box: null, score: 0, yaw: 0, pitch: 0, brightness: 0, sharpness: 0 };
  res.sort((a, b) => b.detection.box.area - a.detection.box.area);
  const main = res[0];
  // Les autres visages ne comptent que s'ils sont assez grands (pas une affiche au fond).
  const others = res.slice(1).filter((r) => r.detection.box.area > main.detection.box.area * 0.25).length;
  const b = main.detection.box;
  const pts = main.landmarks.positions;
  const avg = (from: number, to: number) => {
    let x = 0;
    let y = 0;
    for (let i = from; i <= to; i++) {
      x += pts[i].x;
      y += pts[i].y;
    }
    return { x: x / (to - from + 1), y: y / (to - from + 1) };
  };
  const eyeA = avg(36, 41);
  const eyeB = avg(42, 47);
  const nose = pts[30];
  const inter = Math.hypot(eyeB.x - eyeA.x, eyeB.y - eyeA.y) || 1;
  const yaw = (nose.x - (eyeA.x + eyeB.x) / 2) / inter;
  const pitch = (nose.y - (eyeA.y + eyeB.y) / 2) / inter;
  const stats = faceStats(video, b);
  return { faces: 1 + others, box: { x: b.x / vw, y: b.y / vh, w: b.width / vw, h: b.height / vh }, score: main.detection.score, yaw, pitch, ...stats };
}

/** Conseil à afficher, ou null si l'image est assez bonne pour une capture. */
export function frameAdvice(a: FrameAnalysis): string | null {
  if (a.faces === 0 || !a.box) return "Placez votre visage dans l'ovale";
  if (a.faces > 1) return "Une seule personne à la fois";
  if (a.box.w < 0.24) return "Approchez-vous un peu";
  if (a.box.w > 0.78) return "Reculez un peu";
  const cx = a.box.x + a.box.w / 2;
  const cy = a.box.y + a.box.h / 2;
  if (Math.abs(cx - 0.5) > 0.17 || Math.abs(cy - 0.47) > 0.2) return "Centrez votre visage dans l'ovale";
  if (a.brightness < 60) return "Pas assez de lumière : tournez-vous vers une lampe ou une fenêtre";
  if (a.brightness > 225) return "Trop de lumière : évitez le contre-jour";
  if (a.sharpness < 12) return "Ne bougez plus, l'image est floue";
  return null;
}

/** Capture précise (modèle principal) du visage le plus grand. */
export async function captureDescriptor(input: Input): Promise<number[] | null> {
  return selfieDescriptor(input);
}
