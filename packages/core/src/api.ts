import { ApiError, type ToBeService } from "./service";

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
}

type Handler = (svc: ToBeService, ctx: RouteCtx) => unknown;

interface Route {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  auth?: boolean;
  handler: Handler;
}

const need = (ctx: RouteCtx) => {
  if (!ctx.userId) throw new ApiError(401, "Connectez-vous pour continuer");
  return ctx.userId;
};

export const routes: Route[] = [
  { method: "GET", path: "/health", handler: () => ({ ok: true, service: "tobe" }) },

  // Authentification
  { method: "POST", path: "/auth/otp", handler: (s, c) => s.requestOtp(String(c.body?.phone ?? "")) },
  { method: "POST", path: "/auth/verify", handler: (s, c) => s.verifyOtp(String(c.body?.phone ?? ""), String(c.body?.code ?? ""), c.body?.name) },
  { method: "POST", path: "/auth/logout", handler: (s, c) => (c.token && s.logout(c.token), { ok: true }) },

  // Compte
  { method: "GET", path: "/me", handler: (s, c) => s.me(need(c)) },
  { method: "PATCH", path: "/me", handler: (s, c) => s.updateMe(need(c), c.body ?? {}) },
  { method: "DELETE", path: "/me", handler: (s, c) => s.deleteAccount(need(c)) },
  { method: "GET", path: "/me/tickets", handler: (s, c) => s.myTickets(need(c)) },
  { method: "GET", path: "/me/photos", handler: (s, c) => s.myPhotos(need(c)) },
  { method: "POST", path: "/me/face", handler: (s, c) => s.setFace(need(c), c.body?.descriptor) },
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
  { method: "POST", path: "/photos/match", handler: (s, c) => s.matchSelfie(c.userId, c.body?.descriptor, c.body?.eventId) },
  { method: "DELETE", path: "/photos/:id", handler: (s, c) => s.removePhoto(need(c), c.params.id) },

  // Organisateur, prestataires, agence
  { method: "GET", path: "/organizer", handler: (s, c) => s.organizerDashboard(need(c)) },
  { method: "GET", path: "/providers", handler: (s, c) => s.listProviders(c.query) },
  { method: "POST", path: "/providers/:id/quote", handler: (s, c) => s.requestQuote(need(c), c.params.id, c.body ?? {}) },
  { method: "POST", path: "/tobe-requests", handler: (s, c) => s.requestTobe(need(c), c.body ?? {}) },
  { method: "GET", path: "/admin", handler: (s, c) => s.adminOverview(need(c)) },
  { method: "PATCH", path: "/admin/requests/:id", handler: (s, c) => s.updateTobeRequest(need(c), c.params.id, c.body?.status) },
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
  req: { method: string; path: string; query?: Record<string, string | undefined>; body?: unknown; token?: string | null },
): ApiResult {
  const m = matchRoute(req.method.toUpperCase(), req.path);
  if (!m) return { status: 404, body: { error: "Route inconnue" } };
  const user = svc.userFromToken(req.token ?? null);
  try {
    const out = m.route.handler(svc, { userId: user?.id ?? null, token: req.token ?? null, params: m.params, query: req.query ?? {}, body: req.body ?? {} });
    return { status: 200, body: out ?? { ok: true } };
  } catch (e) {
    if (e instanceof ApiError) return { status: e.status, body: { error: e.message, ...(e.data ?? {}) } };
    const msg = e instanceof Error ? e.message : "Erreur inattendue";
    if (/invalide|introuvable/i.test(msg)) return { status: 400, body: { error: msg } };
    console.error(e);
    return { status: 500, body: { error: "Erreur interne, réessayez dans un instant" } };
  }
}
