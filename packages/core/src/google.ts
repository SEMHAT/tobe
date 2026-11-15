/** Connexion avec Google : vérification du jeton d'identité (« credential ») côté serveur. */

/** Identifiant client OAuth de ToBe (public, projet Google Cloud ELEDJI). Remplaçable par GOOGLE_CLIENT_ID. */
export const DEFAULT_GOOGLE_CLIENT_ID = "993607843202-51g06okv6ptss0hfd8sg1to443n0t8fi.apps.googleusercontent.com";
export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
}

/**
 * Vérifie un jeton d'identité Google auprès de Google (point de contrôle tokeninfo)
 * et s'assure qu'il a bien été émis pour l'application ToBe.
 */
export async function verifyGoogleCredential(credential: string, clientId: string, fetcher: typeof fetch = fetch): Promise<GoogleProfile> {
  if (!clientId) throw new Error("Connexion Google non configurée");
  if (!credential || credential.length > 4096) throw new Error("Jeton Google invalide");
  const res = await fetcher(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  if (!res.ok) throw new Error("Jeton Google invalide ou expiré");
  const t = (await res.json()) as Record<string, string | undefined>;
  if (t.aud !== clientId) throw new Error("Jeton Google émis pour une autre application");
  if (t.iss !== "accounts.google.com" && t.iss !== "https://accounts.google.com") throw new Error("Jeton Google invalide");
  if (!t.exp || Number(t.exp) * 1000 < Date.now()) throw new Error("Jeton Google expiré, réessayez");
  if (t.email_verified !== "true" || !t.email || !t.sub) throw new Error("Adresse e-mail Google non vérifiée");
  return { sub: t.sub, email: t.email, name: (t.name ?? t.given_name ?? "").trim(), picture: t.picture ?? null };
}

/**
 * Étape asynchrone avant l'API : seules les vérifications externes (Google) se font ici.
 * Le résultat est transmis à la route comme donnée de confiance, jamais lu dans le corps de la requête.
 */
export async function preVerify(
  req: { method: string; path: string; body?: unknown },
  env: { GOOGLE_CLIENT_ID?: string },
  fetcher: typeof fetch = fetch,
): Promise<{ verified?: { google?: GoogleProfile }; error?: { status: number; body: { error: string } } }> {
  if (req.method.toUpperCase() !== "POST" || req.path.replace(/\/+$/, "") !== "/auth/google") return {};
  try {
    const credential = String((req.body as { credential?: string } | undefined)?.credential ?? "");
    return { verified: { google: await verifyGoogleCredential(credential, env.GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID, fetcher) } };
  } catch (e) {
    return { error: { status: 400, body: { error: (e as Error).message } } };
  }
}
