import type { IncomingMessage, ServerResponse } from "node:http";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { put } from "@vercel/blob";
import { profilEledji, readPrivateFile, runApiWithPayments, savePrivateFile, sessionUser, type PgPool } from "./_lib/store.js";

if (typeof WebSocket !== "undefined") neonConfig.webSocketConstructor = WebSocket;

const pool = new Pool({ connectionString: process.env.ELEDJI_DATABASE_URL ?? process.env.ELEDJI_DATABASE_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.POSTGRES_URL }) as unknown as PgPool;

type Req = IncomingMessage & { body?: unknown; query?: Record<string, string | string[]> };

async function rawBody(req: Req): Promise<Buffer> {
  if (Buffer.isBuffer(req.body)) return req.body;
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export default async function handler(req: Req, res: ServerResponse) {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const sub = (url.searchParams.get("p") ?? url.pathname.replace(/^\/api\/?/, "")).replace(/^\/+|\/+$/g, "");
    url.searchParams.delete("p");
    const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "") || null;

    if (sub === "uploads" && req.method === "POST") {
      const userId = await sessionUser(pool, token);
      if (!userId) return send(res, 401, { error: "Connectez-vous pour envoyer une image" });
      const type = String(req.headers["content-type"] ?? "").split(";")[0];
      const ext = TYPES[type];
      if (!ext) return send(res, 400, { error: "Format non accepté (JPEG, PNG, WebP)" });
      const buf = await rawBody(req);
      if (!buf.length) return send(res, 400, { error: "Image manquante" });
      if (buf.length > 4_000_000) return send(res, 413, { error: "Image trop lourde (4 Mo maximum)" });
      const blob = await put(`uploads/${userId}/${Date.now().toString(36)}.${ext}`, buf, { access: "public", contentType: type, addRandomSuffix: true });
      return send(res, 200, { url: blob.url });
    }

    // Documents privés (pièce d'identité, preuves) : stockés en base, lisibles par leur auteur et l'équipe ToBe seulement.
    if (sub === "private-files" && req.method === "POST") {
      const userId = await sessionUser(pool, token);
      if (!userId) return send(res, 401, { error: "Connectez-vous pour envoyer un document" });
      const type = String(req.headers["content-type"] ?? "").split(";")[0];
      if (!TYPES[type]) return send(res, 400, { error: "Format non accepté (photo JPEG, PNG ou WebP)" });
      const buf = await rawBody(req);
      if (!buf.length) return send(res, 400, { error: "Document manquant" });
      if (buf.length > 3_000_000) return send(res, 413, { error: "Document trop lourd (3 Mo maximum)" });
      return send(res, 200, { id: await savePrivateFile(pool, userId, type, buf) });
    }
    if (sub.startsWith("private-files/") && req.method === "GET") {
      const r = await readPrivateFile(pool, process.env, sub.slice("private-files/".length), token);
      if (r.status !== 200) return send(res, r.status, { error: r.status === 401 ? "Connexion requise" : r.status === 404 ? "Document introuvable" : "Accès réservé à l'équipe ToBe" });
      res.statusCode = 200;
      res.setHeader("content-type", r.mime);
      res.setHeader("cache-control", "private, no-store");
      res.setHeader("x-content-type-options", "nosniff");
      return void res.end(r.data);
    }

    // Webhook SasPay : on garde le corps brut (signature), avant que Vercel ne le transforme.
    let rawText: string | null = null;
    if (sub === "saspay/webhook" && req.method === "POST") {
      const chunks: Buffer[] = [];
      try {
        for await (const c of req) chunks.push(c as Buffer);
      } catch {
        /* corps déjà lu */
      }
      rawText = Buffer.concat(chunks).toString("utf8");
    }
    let body: unknown = rawText !== null ? (rawText ? JSON.parse(rawText) : {}) : req.body;
    if (req.method !== "GET" && (body === undefined || Buffer.isBuffer(body) || typeof body === "string")) {
      const raw = typeof body === "string" ? body : (await rawBody(req)).toString("utf8");
      body = raw ? JSON.parse(raw) : {};
    }
    const query: Record<string, string> = {};
    url.searchParams.forEach((v, k) => (query[k] = v));
    const eledji = sub === "auth/eledji" && req.method === "POST" ? await profilEledji(pool, req.headers.cookie) : undefined;
    const header = (n: string) => {
      const v = req.headers[n];
      return Array.isArray(v) ? v[0] : (v ?? null);
    };
    const r = await runApiWithPayments(
      pool,
      process.env,
      { method: req.method ?? "GET", path: `/${sub}`, query, body, token, eledji: eledji ?? undefined },
      rawText !== null ? { body: rawText, signature: header("x-webhook-signature"), timestamp: header("x-webhook-timestamp") } : undefined,
    );
    return send(res, r.status, r.body);
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: "Erreur interne, réessayez dans un instant" });
  }
}
