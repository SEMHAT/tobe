// Envoi des notifications push (Web Push, protocole VAPID). Côté serveur uniquement (Node.js).
import webpush from "web-push";
import type { Db } from "../db.js";
import type { PushPayload, PushSender } from "../reminders.js";

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

/**
 * Clés VAPID de la plateforme : créées une seule fois puis gardées dans la base.
 * Aucune variable d'environnement à configurer.
 */
export function ensureVapid(db: Db, env: Record<string, string | undefined> = {}): VapidKeys {
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
  const saved = db.settings.get("vapid");
  if (saved?.value?.publicKey && saved.value.privateKey) return saved.value as unknown as VapidKeys;
  const keys = webpush.generateVAPIDKeys();
  db.settings.insert({ id: "vapid", value: { ...keys } });
  return keys;
}

export function webPushSender(keys: VapidKeys, subject = "mailto:connexion@eledji.com"): PushSender {
  return async (sub, payload: PushPayload) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        JSON.stringify(payload),
        { vapidDetails: { subject, publicKey: keys.publicKey, privateKey: keys.privateKey }, TTL: 6 * 3600, urgency: "high", topic: (payload.tag ?? "tobe").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined },
      );
      return "ok";
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return "gone";
      console.error("[push]", status, (e as Error).message);
      return "error";
    }
  };
}
