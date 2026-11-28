/**
 * Connecteur PayGate Global (Togo : Flooz / Moov Money et T-Money / Mixx by Yas).
 *
 * Paiement « méthode 1 » : le serveur de ToBe demande le paiement, le client valide sur son téléphone.
 * On n'utilise pas la page hébergée de PayGate, qui met la clé API dans l'adresse (visible du client).
 * Avantage : ToBe connaît le numéro qui a payé, donc les remboursements partent tout seuls.
 *
 * Adresses publiques (SDK officiel paygate-php) :
 *   POST https://paygateglobal.com/api/v1/pay      { auth_token, phone_number, amount, description, identifier, network }
 *   POST https://paygateglobal.com/api/v2/status   { auth_token, identifier }  → status 0 payé · 2 en cours · 4 expiré · 6 annulé
 *   POST https://paygateglobal.com/api/v1/check-balance { auth_token }
 * Décaissement (documenté seulement dans le tableau de bord marchand) : /api/v1/disburse, réseau FLOOZ ou TMONEY,
 * accepté uniquement depuis les serveurs déclarés (d'où le relais à IP fixe). À confirmer avec le guide du tableau de bord.
 */
import { GatewayError, type CheckoutInput, type Gateway } from "./saspay.js";
import type { PayoutNetwork } from "./types.js";

const BASE = "https://paygateglobal.com/api";

/** Réseau PayGate : Moov → FLOOZ, Togocel / Yas (Mixx) → TMONEY. */
export const paygateNetwork = (n: PayoutNetwork) => (n === "moov" ? "FLOOZ" : "TMONEY");

/** Numéro togolais sur 8 chiffres, comme l'attend PayGate. */
export const paygatePhone = (raw: string) => {
  const d = String(raw ?? "").replace(/\D/g, "");
  return d.startsWith("228") && d.length === 11 ? d.slice(3) : d.slice(-8);
};

const PAY_ERRORS: Record<number, string> = {
  2: "Clé PayGate invalide",
  4: "Paramètres refusés par PayGate (numéro ou montant)",
  6: "Ce paiement a déjà été demandé",
};

export function createPayGate(opts: { authToken: string; fetcher?: typeof fetch; payoutFetcher?: typeof fetch; baseUrl?: string }): Gateway {
  const f = opts.fetcher ?? fetch;
  const base = (opts.baseUrl ?? BASE).replace(/\/+$/, "");
  const post = async (path: string, body: Record<string, unknown>, fetcher = f) => {
    const r = await fetcher(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ auth_token: opts.authToken, ...body }),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await r.text();
    let json: Record<string, unknown> = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      /* réponse non JSON */
    }
    if (!r.ok) throw new GatewayError(String(json.message ?? json.error ?? `PayGate ${r.status}`), r.status === 403 ? "ip_not_whitelisted" : null, r.status);
    return json;
  };

  return {
    mode: "live",
    flow: "push",

    // Rien n'est encore demandé à PayGate : le client choisit d'abord son numéro sur la page de ToBe.
    async createCheckout(input: CheckoutInput) {
      const id = input.metadata.tobe_payment;
      const sep = input.returnUrl.includes("?") ? "&" : "?";
      return { id, url: `${input.returnUrl}${sep}payer=1` };
    },

    async push(sessionId, p) {
      const r = await post("/v1/pay", {
        phone_number: paygatePhone(p.phone),
        amount: Math.round(p.amount),
        description: p.description.slice(0, 120),
        identifier: sessionId,
        network: paygateNetwork(p.network),
      });
      const st = Number(r.status);
      if (st !== 0) throw new GatewayError(PAY_ERRORS[st] ?? "Paiement refusé par PayGate", `paygate_${st}`, 400);
      return { reference: r.tx_reference != null ? String(r.tx_reference) : null };
    },

    async checkoutStatus(id: string) {
      const r = await post("/v2/status", { identifier: id });
      const st = Number(r.status);
      const tx = r.tx_reference != null ? String(r.tx_reference) : null;
      if (st === 0) return { status: "paid" as const, transactionId: String(r.payment_reference ?? tx ?? id) };
      if (st === 4) return { status: "expired" as const, transactionId: tx };
      if (st === 6) return { status: "failed" as const, transactionId: tx };
      return { status: "pending" as const, transactionId: tx };
    },

    async payout(p) {
      const r = await post(
        "/v1/disburse",
        { phone_number: paygatePhone(p.phone), amount: Math.round(p.amount), network: paygateNetwork(p.network), identifier: p.idempotencyKey, description: p.description.slice(0, 120) },
        opts.payoutFetcher ?? f,
      );
      const st = Number(r.status);
      if (Number.isFinite(st) && st !== 0) throw new GatewayError(String(r.message ?? "Décaissement refusé par PayGate"), `paygate_${st}`, 400);
      return { id: String(r.tx_reference ?? r.reference ?? p.idempotencyKey) };
    },

    async payoutStatus(id: string) {
      // Sans adresse publique de suivi des décaissements : un décaissement accepté est considéré comme envoyé.
      return id ? "sent" : "pending";
    },
  };
}
