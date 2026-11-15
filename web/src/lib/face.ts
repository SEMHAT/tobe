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
  if (!res.length) return { faces: 0, box: null, score: 0, yaw: 0, brightness: 0, sharpness: 0 };
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
  const stats = faceStats(video, b);
  return { faces: 1 + others, box: { x: b.x / vw, y: b.y / vh, w: b.width / vw, h: b.height / vh }, score: main.detection.score, yaw, ...stats };
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
