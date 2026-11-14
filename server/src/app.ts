import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import express, { type Request } from "express";
import multer from "multer";
import { handleApi, seedDb, ToBeService, type Db } from "@tobe/core";
import { config } from "./config";
import { sendSms } from "./sms";

export function createApp(db: Db, opts: Partial<typeof config> = {}) {
  const cfg = { ...config, ...opts };
  if (cfg.seed) seedDb(db);
  const svc = new ToBeService(db, { exposeOtp: cfg.exposeOtp, adminPhones: cfg.adminPhones, demo: cfg.demo, sendSms });

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", true);
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || cfg.corsOrigins.includes("*") || cfg.corsOrigins.includes(origin) || /^capacitor:\/\/|^https?:\/\/localhost/.test(origin)),
    }),
  );
  app.use(express.json({ limit: "4mb" }));

  // Limite simple contre les abus sur l'envoi de SMS : 5 demandes par numéro et par heure.
  const otpHits = new Map<string, number[]>();
  app.use("/api/auth/otp", (req, res, next) => {
    const key = `${req.ip}|${String(req.body?.phone ?? "")}`;
    const now = Date.now();
    const hits = (otpHits.get(key) ?? []).filter((t) => now - t < 3600_000);
    if (hits.length >= 5) return void res.status(429).json({ error: "Trop de demandes, réessayez dans une heure" });
    otpHits.set(key, [...hits, now]);
    next();
  });

  // Envoi d'images (affiches, photos d'événements, candidats).
  fs.mkdirSync(cfg.uploadDir, { recursive: true });
  const upload = multer({
    storage: multer.diskStorage({
      destination: cfg.uploadDir,
      filename: (_req, file, cb) => cb(null, `${Date.now().toString(36)}-${crypto.randomBytes(6).toString("hex")}${path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "") || ".jpg"}`),
    }),
    limits: { fileSize: cfg.maxUploadMb * 1024 * 1024 },
    fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)),
  });
  const token = (req: Request) => req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  app.post("/api/uploads", upload.single("file"), (req, res) => {
    if (!svc.userFromToken(token(req))) return void res.status(401).json({ error: "Connectez-vous pour envoyer une image" });
    if (!req.file) return void res.status(400).json({ error: "Image manquante ou format non accepté (JPEG, PNG, WebP)" });
    res.json({ url: `/uploads/${req.file.filename}` });
  });
  app.use("/uploads", express.static(cfg.uploadDir, { maxAge: "30d", immutable: true }));

  // Toute l'API passe par la même table de routes que le mode démo.
  app.use("/api", (req, res) => {
    const r = handleApi(svc, {
      method: req.method,
      path: req.path,
      query: req.query as Record<string, string>,
      body: req.body,
      token: token(req),
    });
    res.status(r.status).json(r.body);
  });

  // Le frontend compilé (si présent), avec retour sur index.html pour les routes de l'application.
  if (fs.existsSync(path.join(cfg.webDir, "index.html"))) {
    app.use(express.static(cfg.webDir, { index: false, maxAge: "1h" }));
    app.get(/^(?!\/api|\/uploads).*/, (_req, res) => res.sendFile(path.join(cfg.webDir, "index.html")));
  }

  app.use((err: Error & { code?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err.code === "LIMIT_FILE_SIZE") return void res.status(413).json({ error: `Image trop lourde (maximum ${cfg.maxUploadMb} Mo)` });
    console.error(err);
    res.status(500).json({ error: "Erreur interne" });
  });

  return { app, svc };
}
