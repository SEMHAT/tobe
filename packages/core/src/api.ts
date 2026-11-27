import { ApiError } from "./errors.js";
import type { EledjiProfile, GoogleProfile } from "./google.js";
import type { ToBeService } from "./service.js";

/**
 * Table des routes de l'API. Le serveur Express et le mode démo du navigateur
 * utilisent exactement la même table : un seul code pour les deux.
 */
export interface RouteCtx {
  userId: string | null;
  token: string | null;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  body: any;
  /** Données vérifiées par le serveur avant l'appel (jamais lues dans la requête). */
  /** Rempli par le serveur seulement (jamais par le client). `internal` : appel de la couche paiement. */
  verified: { google?: GoogleProfile; eledji?: EledjiProfile; internal?: boolean };
}

type Handler = (svc: ToBeService, ctx: RouteCtx) => unknown;

interface Route {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  auth?: boolean;
  handler: Handler;
}

const b = (ctx: RouteCtx) => (ctx.body ?? {}) as Record<string, unknown>;
const internal = (ctx: RouteCtx) => {
  if (!ctx.verified.internal) throw new ApiError(404, "Route inconnue");
};
const need = (ctx: RouteCtx) => {
  if (!ctx.userId) throw new ApiError(401, "Connectez-vous pour continuer");
  return ctx.userId;
};

export const routes: Route[] = [
  { method: "GET", path: "/health", handler: () => ({ ok: true, service: "tobe" }) },
  { method: "GET", path: "/config", handler: (s) => s.config() },

  // Authentification
  { method: "POST", path: "/auth/otp", handler: (s, c) => s.requestOtp(String(c.body?.email ?? "")) },
  { method: "POST", path: "/auth/verify", handler: (s, c) => s.verifyOtp(String(c.body?.email ?? ""), String(c.body?.code ?? ""), c.body?.name) },
  { method: "POST", path: "/auth/google", handler: (s, c) => s.loginWithGoogle(c.verified.google) },
  // Compte unique ELEDJI : la session d'eledji.com (cookie partagé *.eledji.com), vérifiée par le serveur.
  { method: "POST", path: "/auth/eledji", handler: (s, c) => s.loginWithEledji(c.verified.eledji) },
  { method: "POST", path: "/auth/logout", handler: (s, c) => (c.token && s.logout(c.token), { ok: true }) },

  // Compte
  { method: "GET", path: "/me", handler: (s, c) => s.me(need(c)) },
  { method: "PATCH", path: "/me", handler: (s, c) => s.updateMe(need(c), c.body ?? {}) },
  { method: "DELETE", path: "/me", handler: (s, c) => s.deleteAccount(need(c)) },
  { method: "GET", path: "/me/tickets", handler: (s, c) => s.myTickets(need(c)) },
  { method: "GET", path: "/me/photos", handler: (s, c) => s.myPhotos(need(c)) },
  { method: "POST", path: "/me/face", handler: (s, c) => s.setFace(need(c), c.body?.descriptors ?? c.body?.descriptor, c.body?.consent) },
  { method: "DELETE", path: "/me/face", handler: (s, c) => s.clearFace(need(c)) },
  { method: "PATCH", path: "/me/pass", handler: (s, c) => s.setPass(need(c), c.body ?? {}) },
  { method: "GET", path: "/me/notifications", handler: (s, c) => s.notifications(need(c)) },
  { method: "POST", path: "/me/notifications/read", handler: (s, c) => s.readNotifications(need(c)) },
  { method: "POST", path: "/me/subscribe", handler: (s, c) => s.subscribe(need(c), c.body?.plan, c.body?.method) },

  // Découverte
  { method: "GET", path: "/home", handler: (s) => s.home() },
  { method: "GET", path: "/events", handler: (s, c) => s.listEvents({ ...c.query, past: c.query.past === "1" }) },
  { method: "POST", path: "/events", handler: (s, c) => s.createEvent(need(c), c.body) },
  { method: "GET", path: "/events/:id", handler: (s, c) => s.getEvent(c.params.id, c.userId, c.query.code) },
  { method: "PATCH", path: "/events/:id", handler: (s, c) => s.updateEvent(need(c), c.params.id, c.body ?? {}) },
  { method: "DELETE", path: "/events/:id", handler: (s, c) => s.deleteEvent(need(c), c.params.id) },
  { method: "POST", path: "/events/:id/tickets", handler: (s, c) => s.buyTickets(need(c), c.params.id, c.body) },
  { method: "POST", path: "/events/:id/boost", handler: (s, c) => s.buyBoost(need(c), c.params.id, c.body?.plan, c.body?.method) },
  { method: "GET", path: "/events/:id/contest", handler: (s, c) => s.contestForEvent(c.params.id, c.userId) },
  { method: "GET", path: "/events/:id/photos", handler: (s, c) => s.listPhotos(c.params.id, c.userId, c.query.code) },
  { method: "POST", path: "/events/:id/photos", handler: (s, c) => s.addPhotos(need(c), c.params.id, c.body?.photos ?? []) },

  // Billets
  { method: "GET", path: "/tickets/:id", handler: (s, c) => s.getTicket(need(c), c.params.id) },
  { method: "GET", path: "/observatoire", handler: (s) => s.observatory() },
  { method: "POST", path: "/events/:id/groups", handler: (s, c) => s.createGroup(need(c), c.params.id, c.body) },
  { method: "GET", path: "/groups/:code", handler: (s, c) => s.groupView(c.params.code, c.userId) },
  { method: "POST", path: "/groups/:code/pay", handler: (s, c) => { const g = s.groupView(c.params.code, c.userId); return s.buyTickets(need(c), g.event?.id ?? "", { ticketTypeId: g.ticketTypeId, qty: 1, method: c.body?.method ?? "online", group: g.code }); } },
  { method: "POST", path: "/tickets/:id/resale", handler: (s, c) => s.listResale(need(c), c.params.id, c.body) },
  { method: "POST", path: "/resales/:id/cancel", handler: (s, c) => s.cancelResale(need(c), c.params.id) },
  { method: "GET", path: "/events/:id/resales", handler: (s, c) => s.eventResales(c.params.id, c.userId) },
  { method: "POST", path: "/resales/:id/buy", handler: (s, c) => s.buyResale(need(c), c.params.id, { method: c.body?.method ?? "online" }) },
  { method: "POST", path: "/events/:id/cancel", handler: (s, c) => s.cancelEvent(need(c), c.params.id, String(c.body?.reason ?? "")) },
  { method: "GET", path: "/me/refunds", handler: (s, c) => s.myRefunds(need(c)) },
  { method: "POST", path: "/me/refunds/:id/account", handler: (s, c) => s.setRefundAccount(need(c), c.params.id, c.body) },
  { method: "POST", path: "/admin/users/:id/trusted", handler: (s, c) => s.setTrusted(need(c), c.params.id, !!c.body?.trusted) },
  { method: "GET", path: "/events/:id/scan-manifest", handler: (s, c) => s.scanManifest(need(c), c.params.id) },
  { method: "POST", path: "/events/:id/scan-sync", handler: (s, c) => s.scanSync(need(c), c.params.id, c.body?.scans) },
  { method: "POST", path: "/tickets/scan", handler: (s, c) => s.scanTicket(need(c), String(c.body?.code ?? ""), c.body?.eventId) },

  // Votes
  { method: "GET", path: "/contests/:id", handler: (s, c) => s.contestView(c.params.id, c.userId) },
  { method: "POST", path: "/contests/:id/vote", handler: (s, c) => s.vote(need(c), c.params.id, c.body) },
  { method: "GET", path: "/contests/:id/certificate", handler: (s, c) => s.certificate(c.params.id) },
  { method: "POST", path: "/contests/:id/candidates", handler: (s, c) => s.addCandidate(need(c), c.params.id, c.body) },
  { method: "POST", path: "/contests/:id/jury", handler: (s, c) => s.setJuryScores(need(c), c.params.id, c.body?.scores ?? {}) },

  // Cagnottes
  { method: "GET", path: "/cagnottes/:id", handler: (s, c) => s.getCagnotte(c.params.id, c.userId, c.query.code) },
  { method: "POST", path: "/cagnottes/:id/contribute", handler: (s, c) => s.contribute(need(c), c.params.id, c.body) },

  // Photos
  { method: "POST", path: "/photos/match", handler: (s, c) => s.matchSelfie(c.userId, c.body?.descriptors ?? c.body?.descriptor, c.body?.eventId) },
  { method: "DELETE", path: "/photos/:id", handler: (s, c) => s.removePhoto(need(c), c.params.id) },
  { method: "POST", path: "/photos/:id/download", handler: (s, c) => s.downloadPhoto(need(c), c.params.id) },
  { method: "POST", path: "/events/:id/photo-pass", handler: (s, c) => s.buyPhotoPass(need(c), c.params.id, c.body?.tier, c.body?.method ?? "online") },
  { method: "POST", path: "/events/:id/photo-guests", handler: (s, c) => s.addPhotoGuest(need(c), c.params.id, c.body) },
  { method: "DELETE", path: "/events/:id/photo-guests/:guestId", handler: (s, c) => s.removePhotoGuest(need(c), c.params.id, c.params.guestId) },
  { method: "GET", path: "/photo-guests/:code", handler: (s, c) => s.photoGuestInvite(c.params.code) },
  { method: "POST", path: "/photo-guests/:code/accept", handler: (s, c) => s.acceptPhotoGuest(c.params.code, c.body?.descriptors, c.body?.consent) },
  { method: "POST", path: "/photo-guests/:code/decline", handler: (s, c) => s.declinePhotoGuest(c.params.code) },

  // ToBe Club
  { method: "GET", path: "/game", handler: (s, c) => s.game.state(c.userId) },
  { method: "POST", path: "/game/checkin", handler: (s, c) => s.game.checkin(need(c)) },
  { method: "POST", path: "/game/spin", handler: (s, c) => s.game.spin(need(c)) },
  { method: "GET", path: "/game/quiz", handler: (s, c) => s.game.quiz(c.userId) },
  { method: "POST", path: "/game/quiz", handler: (s, c) => s.game.answerQuiz(need(c), c.body?.answers) },
  { method: "POST", path: "/game/missions/:id/claim", handler: (s, c) => s.game.claimMission(need(c), c.params.id) },
  { method: "POST", path: "/game/referral", handler: (s, c) => s.game.referral(need(c), c.body?.code) },
  { method: "POST", path: "/game/rewards/:id/redeem", handler: (s, c) => s.game.redeem(need(c), c.params.id) },
  { method: "POST", path: "/events/:id/boost-credit", handler: (s, c) => s.game.useBoostCredit(need(c), c.params.id) },
  { method: "GET", path: "/admin/game", handler: (s, c) => s.game.adminView(need(c)) },
  { method: "POST", path: "/admin/rewards", handler: (s, c) => s.game.addReward(need(c), c.body ?? {}) },
  { method: "PATCH", path: "/admin/rewards/:id", handler: (s, c) => s.game.updateReward(need(c), c.params.id, c.body ?? {}) },
  { method: "PATCH", path: "/admin/redemptions/:id", handler: (s, c) => s.game.setRedemptionStatus(need(c), c.params.id, c.body?.status) },

  // Organisateur, prestataires, agence
  { method: "GET", path: "/organizer", handler: (s, c) => s.organizerDashboard(need(c)) },
  { method: "GET", path: "/providers", handler: (s, c) => s.listProviders(c.query) },
  { method: "POST", path: "/providers", handler: (s, c) => s.applyProvider(need(c), c.body ?? {}) },
  { method: "POST", path: "/client-errors", handler: (s, c) => s.reportClientError(c.userId, c.body ?? {}) },
  { method: "GET", path: "/admin/client-errors", handler: (s, c) => s.clientErrors(need(c)) },
  { method: "DELETE", path: "/admin/client-errors", handler: (s, c) => s.clearClientErrors(need(c)) },
  { method: "GET", path: "/me/provider", handler: (s, c) => s.myProvider(need(c)) },
  { method: "PATCH", path: "/admin/providers/:id", handler: (s, c) => s.setProviderStatus(need(c), c.params.id, c.body ?? {}) },
  { method: "POST", path: "/providers/:id/quote", handler: (s, c) => s.requestQuote(need(c), c.params.id, c.body ?? {}) },
  { method: "POST", path: "/tobe-requests", handler: (s, c) => s.requestTobe(need(c), c.body ?? {}) },
  { method: "GET", path: "/admin", handler: (s, c) => s.adminOverview(need(c)) },
  { method: "PATCH", path: "/admin/requests/:id", handler: (s, c) => s.updateTobeRequest(need(c), c.params.id, c.body?.status) },
  { method: "PATCH", path: "/admin/requests/:id/assign", handler: (s, c) => s.team.assignRequest(need(c), c.params.id, c.body?.assignee ?? null) },

  // Notifications push et rappels
  { method: "POST", path: "/push/subscribe", handler: (s, c) => s.reminders.subscribe(c.userId, c.body ?? {}) },
  { method: "POST", path: "/push/unsubscribe", handler: (s, c) => s.reminders.unsubscribe(c.body ?? {}) },
  { method: "POST", path: "/game/installed", handler: (s, c) => s.game.markInstalled(need(c)) },
  { method: "POST", path: "/push/test", handler: (s, c) => s.reminders.test(need(c)) },
  { method: "GET", path: "/events/:id/remind", handler: (s, c) => s.reminders.status(c.userId, c.params.id, c.query.endpoint) },
  { method: "POST", path: "/events/:id/remind", handler: (s, c) => s.reminders.follow(c.userId, c.params.id, c.body ?? {}) },
  { method: "POST", path: "/events/:id/unremind", handler: (s, c) => s.reminders.unfollow(c.userId, c.params.id, c.body ?? {}) },
  // Paiement en ligne : statut pour la page de retour, gains de l'organisateur, suivi ToBe.
  { method: "GET", path: "/payments/:id", handler: (s, c) => s.paymentStatus(c.userId, c.params.id) },
  { method: "POST", path: "/payments/:id/verify", handler: (s, c) => s.paymentStatus(c.userId, c.params.id) },
  { method: "GET", path: "/me/earnings", handler: (s, c) => s.myEarnings(need(c)) },
  { method: "POST", path: "/me/payout-account", handler: (s, c) => s.setPayoutAccount(need(c), c.body as never) },
  { method: "GET", path: "/admin/payments", handler: (s, c) => s.adminPayments(need(c)) },
  { method: "POST", path: "/admin/payouts/:id/done", handler: (s, c) => s.adminPayoutAction(need(c), c.params.id, "done") },
  { method: "POST", path: "/me/payouts/withdraw", handler: (s, c) => s.withdrawNow(need(c)) },
  { method: "POST", path: "/admin/payouts/:id/send", handler: (s, c) => s.adminPayoutAction(need(c), c.params.id, "send") },
  { method: "POST", path: "/admin/payouts/:id/retry", handler: (s, c) => s.adminPayoutAction(need(c), c.params.id, "retry") },
  { method: "POST", path: "/cron/payments", handler: () => ({ ok: true }) },
  { method: "GET", path: "/cron/payments", handler: () => ({ ok: true }) },
  { method: "POST", path: "/saspay/webhook", handler: () => ({ ok: true }) },
  // Réservé à la couche paiement du serveur (appels à SasPay hors transaction).
  { method: "GET", path: "/internal/intents/pending", handler: (s, c) => (internal(c), s.pendingIntents()) },
  { method: "GET", path: "/internal/intents/:id", handler: (s, c) => (internal(c), s.intentForCheckout(c.params.id)) },
  { method: "POST", path: "/internal/intents/:id/attach", handler: (s, c) => (internal(c), s.attachCheckout(c.params.id, String(b(c).sessionId), String(b(c).url))) },
  { method: "POST", path: "/internal/intents/:id/fail", handler: (s, c) => (internal(c), s.failIntent(c.params.id, b(c).status === "expired" ? "expired" : "failed", (b(c).error as string) ?? null)) },
  { method: "POST", path: "/internal/intents/:id/settle", handler: (s, c) => (internal(c), s.settleIntent(c.params.id, (b(c).transactionId as string) ?? null)) },
  { method: "GET", path: "/internal/payouts/due", handler: (s, c) => (internal(c), s.duePayouts()) },
  { method: "GET", path: "/internal/payouts/sending", handler: (s, c) => (internal(c), s.sendingPayouts()) },
  { method: "POST", path: "/internal/payouts/:id/lock", handler: (s, c) => (internal(c), s.lockPayout(c.params.id)) },
  { method: "POST", path: "/internal/payouts/:id/record", handler: (s, c) => (internal(c), s.recordPayout(c.params.id, b(c) as never)) },
  // Garde-fous : vérification des organisateurs, signalements, modération.
  { method: "GET", path: "/me/verification", handler: (s, c) => s.myVerification(need(c)) },
  { method: "POST", path: "/me/verification", handler: (s, c) => s.requestVerification(need(c), c.body as never) },
  { method: "POST", path: "/events/:id/proof", handler: (s, c) => s.submitEventProof(need(c), c.params.id, c.body as never) },
  { method: "POST", path: "/events/:id/report", handler: (s, c) => s.reportEvent(need(c), c.params.id, c.body as never) },
  { method: "GET", path: "/admin/moderation", handler: (s, c) => s.moderationQueue(need(c)) },
  { method: "POST", path: "/admin/verifications/:id", handler: (s, c) => s.reviewVerification(need(c), c.params.id, c.body as never) },
  { method: "POST", path: "/admin/events/:id/moderation", handler: (s, c) => s.moderateEvent(need(c), c.params.id, c.body as never) },
  { method: "GET", path: "/cron/reminders", handler: (s) => ({ ...s.reminders.processDue(), privacy: s.purgeFaceData() }) },
  { method: "POST", path: "/cron/reminders", handler: (s) => ({ ...s.reminders.processDue(), privacy: s.purgeFaceData() }) },

  // Équipe ToBe
  { method: "GET", path: "/team", handler: (s, c) => s.team.teamView(need(c)) },
  { method: "POST", path: "/team/invites", handler: (s, c) => s.team.inviteTeam(need(c), c.body ?? {}) },
  { method: "PATCH", path: "/team/members/:id", handler: (s, c) => s.team.setTeamRole(need(c), c.params.id, c.body?.role ?? null) },

  // Équipe d'un événement et invitations
  { method: "GET", path: "/events/:id/team", handler: (s, c) => s.team.eventTeam(need(c), c.params.id) },
  { method: "POST", path: "/events/:id/team/invites", handler: (s, c) => s.team.inviteEvent(need(c), c.params.id, c.body ?? {}) },
  { method: "DELETE", path: "/team-members/:id", handler: (s, c) => s.team.removeMember(need(c), c.params.id) },
  { method: "GET", path: "/me/roles", handler: (s, c) => s.team.myEventRoles(need(c)) },
  { method: "GET", path: "/invites/:token", handler: (s, c) => s.team.getInvite(c.params.token) },
  { method: "POST", path: "/invites/:token/accept", handler: (s, c) => s.team.acceptInvite(need(c), c.params.token) },
  { method: "DELETE", path: "/invites/:token", handler: (s, c) => s.team.revokeInvite(need(c), c.params.token) },
];

export function matchRoute(method: string, path: string): { route: Route; params: Record<string, string> } | null {
  const parts = path.replace(/\/+$/, "").split("/").filter(Boolean);
  for (const route of routes) {
    if (route.method !== method) continue;
    const rp = route.path.split("/").filter(Boolean);
    if (rp.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < rp.length; i++) {
      if (rp[i].startsWith(":")) params[rp[i].slice(1)] = decodeURIComponent(parts[i]);
      else if (rp[i] !== parts[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { route, params };
  }
  return null;
}

export interface ApiResult {
  status: number;
  body: unknown;
}

/** Exécute une requête de l'API sur un service. Ne lève jamais : renvoie un statut HTTP. */
export function handleApi(
  svc: ToBeService,
  req: { method: string; path: string; query?: Record<string, string | undefined>; body?: unknown; token?: string | null; verified?: { google?: GoogleProfile; eledji?: EledjiProfile; internal?: boolean } },
): ApiResult {
  const m = matchRoute(req.method.toUpperCase(), req.path);
  if (!m) return { status: 404, body: { error: "Route inconnue" } };
  const user = svc.userFromToken(req.token ?? null);
  try {
    const out = m.route.handler(svc, { userId: user?.id ?? null, token: req.token ?? null, params: m.params, query: req.query ?? {}, body: req.body ?? {}, verified: req.verified ?? {} });
    // `null` est une vraie réponse (« rien ») : on ne la remplace pas par { ok: true }.
    return { status: 200, body: out === undefined ? { ok: true } : out };
  } catch (e) {
    if (e instanceof ApiError) return { status: e.status, body: { error: e.message, ...(e.data ?? {}) } };
    const msg = e instanceof Error ? e.message : "Erreur inattendue";
    if (/invalide|introuvable/i.test(msg)) return { status: 400, body: { error: msg } };
    console.error(e);
    return { status: 500, body: { error: "Erreur interne, réessayez dans un instant" } };
  }
}
