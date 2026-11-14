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
