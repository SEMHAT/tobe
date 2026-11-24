/**
 * Couche paiement autour de l'API : les appels à SasPay (réseau, lents) se font ici, hors des
 * transactions de la base ; chaque résultat est ensuite enregistré par une route interne.
 *
 * - achat (billet, vote, cagnotte, boost, abonnement) → ouverture de la page de paiement SasPay ;
 * - retour du client, webhook SasPay, tâche planifiée → vérification et livraison ;
 * - après chaque paiement confirmé → reversement automatique de la part de l'organisateur.
 */
import type { ApiResult } from "./api.js";
import { GatewayError, verifySasPayWebhook, type Gateway } from "./saspay.js";
import type { PaymentIntent, PayoutNetwork } from "./types.js";

export interface FlowRequest {
  method: string;
  path: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
  token?: string | null;
  verified?: Record<string, unknown>;
}

/** Exécute une requête de l'API dans sa propre transaction. */
export type Runner = (req: FlowRequest) => Promise<ApiResult>;

export interface FlowOptions {
  gateway: Gateway | null;
  /** Adresse publique du site, pour le retour après paiement (https://tobe.eledji.com). */
  publicUrl: string;
  webhookSecret?: string | null;
  /** Corps brut et en-têtes (vérification de la signature des webhooks). */
  raw?: { body: string; signature?: string | null; timestamp?: string | null };
  log?: (...a: unknown[]) => void;
}

const clean = (p: string) => "/" + p.split("?")[0].split("/").filter(Boolean).join("/");

export async function runWithPayments(run: Runner, opts: FlowOptions, req: FlowRequest): Promise<ApiResult> {
  const gw = opts.gateway;
  const path = clean(req.path);
  const method = req.method.toUpperCase();
  const internal = (m: string, p: string, body?: unknown) => run({ method: m, path: p, body, token: null, verified: { internal: true } });
  const log = opts.log ?? ((...a: unknown[]) => console.error("[paiement]", ...a));

  if (!gw) return run(req);

  // Webhook SasPay : simple signal. On ne croit jamais son contenu : chaque paiement en cours est
  // revérifié directement auprès de l'API SasPay, donc un faux webhook ne peut rien valider.
  if (method === "POST" && path === "/saspay/webhook") {
    const signed = opts.webhookSecret && opts.raw ? await verifySasPayWebhook(opts.raw.body, { signature: opts.raw.signature, timestamp: opts.raw.timestamp }, opts.webhookSecret).catch(() => false) : null;
    const r = await reconcile(internal, gw, log);
    await processPayouts(internal, gw, log);
    return { status: 200, body: { ok: true, signed, ...r } };
  }

  // Tâche planifiée (toutes les 5 minutes) : filet de sécurité si un webhook s'est perdu.
  if (method === "POST" && path === "/cron/payments") {
    const r = await reconcile(internal, gw, log);
    const p = await processPayouts(internal, gw, log);
    return { status: 200, body: { ok: true, ...r, ...p } };
  }

  // Retour du client après la page de paiement.
  const verify = method === "POST" && /^\/payments\/[^/]+\/verify$/.test(path);
  if (verify) {
    const id = path.split("/")[2];
    const cur = await internal("GET", `/internal/intents/${id}`);
    if (cur.status !== 200) return cur;
    const intent = (cur.body as { intent: PaymentIntent }).intent;
    if (intent.status === "pending" && intent.gatewaySessionId) {
      const settled = await checkOne(internal, gw, intent.id, intent.gatewaySessionId, log);
      if (settled) await processPayouts(internal, gw, log);
    }
    return run(req);
  }

  const res = await run(req);
  const co = (res.body as { checkout?: { intentId: string } } | null)?.checkout;
  if (res.status !== 200 || !co?.intentId) return res;

  // Achat payant : on ouvre la page de paiement SasPay.
  const info = await internal("GET", `/internal/intents/${co.intentId}`);
  if (info.status !== 200) return info;
  const { intent, customer } = info.body as { intent: PaymentIntent; customer: { email: string; name: string; phone: string | null } };
  try {
    const session = await gw.createCheckout({
      amount: intent.amount,
      description: intent.description,
      customerEmail: customer.email,
      customerName: customer.name,
      customerPhone: customer.phone,
      returnUrl: `${opts.publicUrl.replace(/\/+$/, "")}/paiement/${intent.id}`,
      metadata: { tobe_payment: intent.id, kind: intent.action.kind },
    });
    return internal("POST", `/internal/intents/${intent.id}/attach`, { sessionId: session.id, url: session.url });
  } catch (e) {
    log("ouverture du paiement", e);
    await internal("POST", `/internal/intents/${intent.id}/fail`, { status: "failed", error: (e as Error).message });
    return { status: 502, body: { error: "Le paiement Mobile Money est momentanément indisponible. Réessayez dans un instant." } };
  }
}

/** Revérifie un paiement auprès de SasPay ; s'il est payé, on livre. Renvoie true si livré maintenant. */
async function checkOne(internal: (m: string, p: string, b?: unknown) => Promise<ApiResult>, gw: Gateway, id: string, sessionId: string, log: (...a: unknown[]) => void) {
  try {
    const st = await gw.checkoutStatus(sessionId);
    if (st.status === "paid") {
      const r = await internal("POST", `/internal/intents/${id}/settle`, { transactionId: st.transactionId });
      if (r.status !== 200) log("livraison", id, r.body);
      return r.status === 200;
    }
    if (st.status === "failed" || st.status === "expired") await internal("POST", `/internal/intents/${id}/fail`, { status: st.status, error: null });
  } catch (e) {
    log("vérification", id, e);
  }
  return false;
}

async function reconcile(internal: (m: string, p: string, b?: unknown) => Promise<ApiResult>, gw: Gateway, log: (...a: unknown[]) => void) {
  const r = await internal("GET", "/internal/intents/pending");
  const list = (r.body as { id: string; sessionId: string }[]) ?? [];
  let settled = 0;
  for (const it of list.slice(0, 40)) if (await checkOne(internal, gw, it.id, it.sessionId, log)) settled++;
  return { checked: list.length, settled };
}

/** Envoie les reversements prêts et confirme ceux déjà partis. */
export async function processPayouts(internal: (m: string, p: string, b?: unknown) => Promise<ApiResult>, gw: Gateway, log: (...a: unknown[]) => void = console.error) {
  let sent = 0;
  const sending = ((await internal("GET", "/internal/payouts/sending")).body as { id: string; gatewayId: string }[]) ?? [];
  for (const p of sending.slice(0, 20)) {
    try {
      const st = await gw.payoutStatus(p.gatewayId);
      if (st !== "pending") await internal("POST", `/internal/payouts/${p.id}/record`, { status: st, gatewayId: p.gatewayId, error: st === "failed" ? "Refusé par l'opérateur" : null });
    } catch (e) {
      log("suivi reversement", p.id, e);
    }
  }
  const due = ((await internal("GET", "/internal/payouts/due")).body as { id: string; amount: number; phone: string; network: PayoutNetwork; name: string; email: string; attempts: number }[]) ?? [];
  for (const p of due.slice(0, 20)) {
    const lock = await internal("POST", `/internal/payouts/${p.id}/lock`);
    if (lock.status !== 200 || !lock.body) continue;
    try {
      const r = await gw.payout({ amount: p.amount, phone: p.phone, network: p.network, name: p.name, email: p.email, description: "Vos gains ToBe", idempotencyKey: `${p.id}-${p.attempts + 1}` });
      await internal("POST", `/internal/payouts/${p.id}/record`, { status: "sending", gatewayId: r.id });
      sent++;
    } catch (e) {
      const g = e instanceof GatewayError ? e : null;
      // IP du serveur non autorisée chez SasPay : le reversement se fera depuis le tableau de bord.
      const manual = g?.code === "ip_not_whitelisted" || g?.code === "api_key_scope_forbidden";
      const msg = manual ? (g?.code === "ip_not_whitelisted" ? "Reversement automatique bloqué : IP du serveur à autoriser chez SasPay" : "Clé API sans droit de décaissement") : ((e as Error).message ?? "Échec");
      log("reversement", p.id, e);
      await internal("POST", `/internal/payouts/${p.id}/record`, { status: manual ? "manual" : "failed", error: msg });
    }
  }
  return { payoutsSent: sent };
}
