/**
 * Connecteur SasPay (https://docs.saspay.me) : page de paiement hébergée, vérification,
 * reversements Mobile Money et signature des webhooks. Utilisé côté serveur uniquement.
 */
import type { PayoutNetwork } from "./types.js";

export interface CheckoutInput {
  amount: number;
  description: string;
  customerEmail: string;
  customerName: string;
  customerPhone?: string | null;
  returnUrl: string;
  metadata: Record<string, string>;
}

export interface Gateway {
  readonly mode: "sandbox" | "live";
  createCheckout(input: CheckoutInput): Promise<{ id: string; url: string }>;
  /** paid · pending · failed · expired */
  checkoutStatus(id: string): Promise<{ status: "paid" | "pending" | "failed" | "expired"; transactionId: string | null }>;
  payout(input: { amount: number; phone: string; network: PayoutNetwork; description: string; idempotencyKey: string; name?: string | null; email?: string | null }): Promise<{ id: string }>;
  payoutStatus(id: string): Promise<"pending" | "sent" | "failed">;
}

export class GatewayError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly status: number,
  ) {
    super(message);
  }
}

const COUNTRY = "TG";
const CURRENCY = "XOF";

/** Numéro togolais au format international (+228XXXXXXXX). */
export function togoMsisdn(phone: string): string {
  const d = phone.replace(/\D/g, "");
  const local = d.startsWith("228") && d.length === 11 ? d.slice(3) : d.slice(-8);
  if (local.length !== 8) throw new GatewayError("Numéro Mobile Money invalide (8 chiffres attendus)", "invalid_phone", 400);
  return local;
}

export function createSasPay(opts: { secretKey: string; fetcher?: typeof fetch; baseUrl?: string; /** Relais à IP fixe pour les reversements (IP déclarée chez SasPay). */ payoutFetcher?: typeof fetch }): Gateway {
  const sandbox = opts.secretKey.startsWith("sk_test_");
  const base = opts.baseUrl ?? (sandbox ? "https://sandbox-api.saspay.me/api/v1" : "https://api.saspay.me/api/v1");
  const f = opts.fetcher ?? fetch;
  let networks: { code: string; name: string; country: string }[] | null = null;
  let togoId: string | null = null;

  async function call<T>(method: string, path: string, body?: unknown, idem?: string, via?: typeof fetch): Promise<T> {
    const res = await (via ?? f)(`${base}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${opts.secretKey}`,
        accept: "application/json",
        ...(body ? { "content-type": "application/json" } : {}),
        ...(idem ? { "idempotency-key": idem } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    let json: { success?: boolean; data?: unknown; error?: { message?: string; code?: string } & Record<string, unknown> } & Record<string, unknown> = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      /* réponse non JSON */
    }
    if (!res.ok || json.success === false) {
      const err = json.error ?? {};
      const msg = err.message ?? (typeof err === "object" ? Object.entries(err).map(([k, v]) => `${k} : ${Array.isArray(v) ? v.join(", ") : String(v)}`).join(" · ") : "") ?? "";
      throw new GatewayError(msg || `SasPay a répondu ${res.status}`, err.code ?? null, res.status);
    }
    return ("data" in json ? json.data : json) as T;
  }

  /** Code réseau SasPay du Togo (moov_tg…) trouvé par son nom : rien n'est codé en dur. */
  async function networkCode(n: PayoutNetwork): Promise<string> {
    if (!togoId) {
      const countries = await call<{ id: string; iso_code: string }[]>("GET", "/countries/");
      togoId = countries.find((c) => c.iso_code === COUNTRY)?.id ?? null;
    }
    if (!networks) {
      const out: { code: string; name: string; country: string }[] = [];
      let path: string | null = "/networks/";
      for (let i = 0; path && i < 20; i++) {
        const page: { results?: { code: string; name: string; country: string; is_active?: boolean }[]; next?: string | null } | { code: string; name: string; country: string }[] = await call("GET", path);
        const rows = Array.isArray(page) ? page : (page.results ?? []);
        out.push(...rows.filter((r) => (r as { is_active?: boolean }).is_active !== false));
        const next: string | null = Array.isArray(page) ? null : (page.next ?? null);
        path = next ? next.replace(/^https?:\/\/[^/]+\/api\/v1/, "") : null;
      }
      networks = out;
    }
    const tg = networks.filter((x) => x.country === togoId || /_tg$/i.test(x.code));
    const want = { moov: /moov|flooz/i, togocel: /togocel|t-?money/i, mixx: /mixx|yas/i }[n];
    const hit = tg.find((x) => want.test(x.name) || want.test(x.code));
    if (!hit) throw new GatewayError(`Réseau ${n} indisponible chez SasPay pour le Togo`, "network_unavailable", 422);
    return hit.code;
  }

  return {
    mode: sandbox ? "sandbox" : "live",

    async createCheckout(i) {
      const s = await call<{ id: string; checkout_url: string }>("POST", "/checkout-sessions/", {
        amount: i.amount.toFixed(2),
        currency: CURRENCY,
        country: COUNTRY,
        description: i.description.slice(0, 200),
        customer_email: i.customerEmail,
        customer_name: i.customerName.slice(0, 100) || "Client ToBe",
        customer_phone: i.customerPhone ?? "",
        return_url: i.returnUrl,
        metadata: i.metadata,
        expires_at: new Date(Date.now() + 2 * 3600_000).toISOString(),
      });
      return { id: s.id, url: s.checkout_url };
    },

    async checkoutStatus(id) {
      const s = await call<{ status: string; transaction_id?: string | null; transaction_status?: string | null }>("GET", `/checkout-sessions/${encodeURIComponent(id)}/status/`);
      const st = String(s.status ?? "").toUpperCase();
      const tx = String(s.transaction_status ?? "").toUpperCase();
      const status = st === "PAID" || tx === "SUCCESS" ? "paid" : st === "EXPIRED" ? "expired" : st === "CANCELLED" || st === "FAILED" ? "failed" : "pending";
      return { status, transactionId: s.transaction_id ?? null };
    },

    async payout(p) {
      const method = await networkCode(p.network);
      const [first, ...rest] = (p.name ?? "Organisateur ToBe").trim().split(/\s+/);
      const r = await call<{ id: string }>(
        "POST",
        "/payouts/initialize/",
        {
          amount: p.amount.toFixed(2),
          currency: CURRENCY,
          country: COUNTRY,
          description: p.description.slice(0, 200),
          method,
          recipient: { msisdn: togoMsisdn(p.phone) },
          customer: { first_name: first || "Organisateur", last_name: rest.join(" ") || "ToBe", phone: `+228${togoMsisdn(p.phone)}`, ...(p.email ? { email: p.email } : {}) },
          metadata: { source: "tobe" },
        },
        p.idempotencyKey,
        opts.payoutFetcher,
      );
      return { id: r.id };
    },

    async payoutStatus(id) {
      const r = await call<{ status: string }>("GET", `/payouts/${encodeURIComponent(id)}/verify/`);
      const st = String(r.status ?? "").toUpperCase();
      return st === "SUCCESS" ? "sent" : st === "FAILED" || st === "CANCELLED" ? "failed" : "pending";
    },
  };
}

/** Vérifie un webhook SasPay : HMAC-SHA256 hex de `${timestamp}.${corps brut}`, horodatage à moins de 5 minutes. */
export async function verifySasPayWebhook(rawBody: string, headers: { signature?: string | null; timestamp?: string | null }, secret: string, nowMs = Date.now()): Promise<boolean> {
  const ts = Number(headers.timestamp);
  if (!headers.signature || !Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > 300) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${headers.timestamp}.${rawBody}`)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  const got = headers.signature.trim().toLowerCase();
  if (got.length !== hex.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}
