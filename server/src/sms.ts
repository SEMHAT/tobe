/**
 * Envoi des codes de connexion par SMS.
 * Par défaut le message est seulement écrit dans les journaux du serveur.
 * Pour la production, renseignez SMS_WEBHOOK_URL : le serveur y enverra { to, text } en POST
 * (à relier à votre fournisseur SMS : passerelle d'opérateur, Twilio, etc.).
 */
export function sendSms(to: string, text: string) {
  const url = process.env.SMS_WEBHOOK_URL;
  if (!url) {
    console.log(`[sms] ${to} : ${text}`);
    return;
  }
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(process.env.SMS_WEBHOOK_TOKEN ? { authorization: `Bearer ${process.env.SMS_WEBHOOK_TOKEN}` } : {}) },
    body: JSON.stringify({ to, text }),
  }).catch((e) => console.error("[sms] échec d'envoi", e));
}
