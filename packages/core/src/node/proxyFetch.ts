/**
 * Relais à IP fixe (Fixie, QuotaGuard…) : SasPay n'accepte les reversements par API que depuis
 * une IP déclarée, et Vercel n'en a pas de fixe. Seules ces requêtes passent par le relais.
 */
import { ProxyAgent, fetch as undiciFetch } from "undici";

export function proxiedFetch(proxyUrl: string): typeof fetch {
  const agent = new ProxyAgent(proxyUrl);
  return ((input: string | URL | Request, init?: RequestInit) => undiciFetch(input as string, { ...(init as object), dispatcher: agent } as never)) as unknown as typeof fetch;
}
