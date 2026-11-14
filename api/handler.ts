import type { IncomingMessage, ServerResponse } from "node:http";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { put } from "@vercel/blob";
import { runApi, sessionUser, type PgPool } from "./_lib/store";

if (typeof WebSocket !== "undefined") neonConfig.webSocketConstructor = WebSocket;

const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? process.env.POSTGRES_URL }) as unknown as PgPool;

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

    let body: unknown = req.body;
    if (req.method !== "GET" && (body === undefined || Buffer.isBuffer(body) || typeof body === "string")) {
      const raw = typeof body === "string" ? body : (await rawBody(req)).toString("utf8");
      body = raw ? JSON.parse(raw) : {};
    }
    const query: Record<string, string> = {};
    url.searchParams.forEach((v, k) => (query[k] = v));
    const r = await runApi(pool, process.env, { method: req.method ?? "GET", path: `/${sub}`, query, body, token });
    return send(res, r.status, r.body);
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: "Erreur interne, réessayez dans un instant" });
  }
}
