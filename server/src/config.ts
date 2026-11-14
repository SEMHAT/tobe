import path from "node:path";

const list = (v?: string) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export const config = {
  port: Number(process.env.PORT ?? 8787),
  dataDir: path.resolve(process.env.DATA_DIR ?? "data"),
  uploadDir: path.resolve(process.env.UPLOAD_DIR ?? "uploads"),
  /** Dossier du frontend compilé (web/dist) : le serveur le sert aussi, pour un seul déploiement. */
  webDir: process.env.WEB_DIR ? path.resolve(process.env.WEB_DIR) : path.resolve(import.meta.dirname, "../../web/dist"),
  corsOrigins: list(process.env.CORS_ORIGINS ?? "http://localhost:5173,https://tobe.eledji.com"),
  adminEmails: list(process.env.ADMIN_EMAILS),
  paymentsEnabled: process.env.PAYMENTS_ENABLED === "true",
  /** En production, laisser à false : le code n'est envoyé que par e-mail. */
  exposeOtp: process.env.EXPOSE_OTP === "true" || process.env.NODE_ENV !== "production",
  demo: process.env.DEMO === "true",
  /** Données d'exemple : uniquement en développement (SEED=true). */
  seed: process.env.SEED === "true",
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 8),
};
