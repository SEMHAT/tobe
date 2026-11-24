import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import express, { type Request } from "express";
import { createSasPay, handleApi, preVerify, runWithPayments, seedDb, sendLoginCode, ToBeService, type Db } from "@tobe/core";
import { ensureVapid, webPushSender } from "@tobe/core/src/node/webpush";
import { proxiedFetch } from "@tobe/core/src/node/proxyFetch";
import { config } from "./config";

export function createApp(db: Db, opts: Partial<typeof config> = {}) {
  const cfg = { ...config, ...opts };
  if (cfg.seed) seedDb(db);
  const vapid = ensureVapid(db, process.env);
  const svc = new ToBeService(db, { push: { publicKey: vapid.publicKey, send: webPushSender(vapid) }, exposeOtp: cfg.exposeOtp, adminEmails: cfg.adminEmails, demo: cfg.demo, paymentsEnabled: cfg.paymentsEnabled, checkout: !!process.env.SASPAY_SECRET_KEY, googleClientId: cfg.googleClientId, sendCode: (email, code) => sendLoginCode(email, code, process.env) });

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", true);
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || cfg.corsOrigins.includes("*") || cfg.corsOrigins.includes(origin) || /^capacitor:\/\/|^https?:\/\/localhost/.test(origin)),
    }),
  );
  // Webhook SasPay : corps brut conservé pour la signature.
  app.use(express.json({ limit: "4mb", verify: (req, _res, buf) => void ((req as Request & { rawBody?: string }).rawBody = buf.toString("utf8")) }));
  const gateway = process.env.SASPAY_SECRET_KEY ? createSasPay({ secretKey: process.env.SASPAY_SECRET_KEY, baseUrl: process.env.SASPAY_BASE_URL || undefined, payoutFetcher: process.env.SASPAY_PROXY_URL ? proxiedFetch(process.env.SASPAY_PROXY_URL) : undefined }) : null;

  // Limite simple contre les abus sur l'envoi de codes : 5 demandes par adresse et par heure.
  const otpHits = new Map<string, number[]>();
  app.use("/api/auth/otp", (req, res, next) => {
    const key = `${req.ip}|${String(req.body?.email ?? "")}`;
    const now = Date.now();
    const hits = (otpHits.get(key) ?? []).filter((t) => now - t < 3600_000);
    if (hits.length >= 5) return void res.status(429).json({ error: "Trop de demandes, réessayez dans une heure" });
    otpHits.set(key, [...hits, now]);
    next();
  });

  // Envoi d'images (affiches, photos d'événements, candidats).
  fs.mkdirSync(cfg.uploadDir, { recursive: true });
  const token = (req: Request) => req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  // L'application envoie l'image brute (déjà redimensionnée), type image/jpeg, png ou webp.
  app.post("/api/uploads", express.raw({ type: ["image/jpeg", "image/png", "image/webp"], limit: `${cfg.maxUploadMb}mb` }), (req, res) => {
    if (!svc.userFromToken(token(req))) return void res.status(401).json({ error: "Connectez-vous pour envoyer une image" });
    const ext = ({ "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" } as Record<string, string>)[String(req.headers["content-type"])];
    if (!ext || !Buffer.isBuffer(req.body) || !req.body.length) return void res.status(400).json({ error: "Image manquante ou format non accepté (JPEG, PNG, WebP)" });
    const name = `${Date.now().toString(36)}-${crypto.randomBytes(6).toString("hex")}${ext}`;
    fs.writeFileSync(path.join(cfg.uploadDir, name), req.body);
    res.json({ url: `/uploads/${name}` });
  });
  app.use("/uploads", express.static(cfg.uploadDir, { maxAge: "30d", immutable: true }));

  // Toute l'API passe par la même table de routes que le mode démo.
  app.use("/api", async (req, res) => {
    const pre = await preVerify({ method: req.method, path: req.path, body: req.body }, { GOOGLE_CLIENT_ID: cfg.googleClientId });
    if (pre.error) return void res.status(pre.error.status).json(pre.error.body);
    const r = await runWithPayments(
      async (q) => handleApi(svc, { method: q.method, path: q.path, query: (q.query ?? {}) as Record<string, string>, body: q.body, token: q.token ?? null, verified: { ...pre.verified, internal: q.verified?.internal === true } }),
      { gateway, publicUrl: process.env.PUBLIC_URL || `http://localhost:${cfg.port}`, webhookSecret: process.env.SASPAY_WEBHOOK_SECRET || null, raw: { body: (req as Request & { rawBody?: string }).rawBody ?? "", signature: req.get("x-webhook-signature"), timestamp: req.get("x-webhook-timestamp") } },
      { method: req.method, path: req.path, query: req.query as Record<string, string>, body: req.body, token: token(req) },
    );
    const pending = svc.pending.splice(0);
    void Promise.all(pending).then(() => {
      for (const id of svc.goneSubs.splice(0)) if (db.pushSubs.get(id)) db.pushSubs.remove(id);
    });
    Promise.all(pending).finally(() => res.status(r.status).json(r.body));
  });

  // Le frontend compilé (si présent), avec retour sur index.html pour les routes de l'application.
  if (fs.existsSync(path.join(cfg.webDir, "index.html"))) {
    app.use(express.static(cfg.webDir, { index: false, maxAge: "1h" }));
    app.get(/^(?!\/api|\/uploads).*/, (_req, res) => res.sendFile(path.join(cfg.webDir, "index.html")));
  }

  app.use((err: Error & { code?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err.code === "LIMIT_FILE_SIZE" || (err as { type?: string }).type === "entity.too.large") return void res.status(413).json({ error: `Image trop lourde (maximum ${cfg.maxUploadMb} Mo)` });
    console.error(err);
    res.status(500).json({ error: "Erreur interne" });
  });

  return { app, svc };
}
