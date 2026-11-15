// Copie les modèles de reconnaissance faciale dans public/models (chargés seulement sur l'écran Photos).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const src = path.join(path.dirname(require.resolve("@vladmandic/face-api/package.json")), "model");
const dst = path.resolve("public/models");
fs.mkdirSync(dst, { recursive: true });
for (const f of fs.readdirSync(src)) {
  if (/^(ssd_mobilenetv1|face_landmark_68_model|face_recognition|tiny_face_detector)/.test(f)) fs.copyFileSync(path.join(src, f), path.join(dst, f));
}
console.log("Modèles copiés dans", dst);
