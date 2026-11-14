/** E-mail de connexion (Resend). Sans clé, le code est seulement écrit dans les journaux. */
export async function sendLoginCode(email: string, code: string, env: { RESEND_API_KEY?: string; EMAIL_FROM?: string } = {}) {
  const key = env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email] code pour ${email} : ${code}`);
    return;
  }
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f8;font-family:Arial,Helvetica,sans-serif;color:#0b0b12">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="100%" style="max-width:440px;background:#ffffff;border-radius:20px;padding:32px" cellpadding="0" cellspacing="0">
<tr><td style="font-size:26px;font-weight:900;letter-spacing:-0.5px">To<span style="color:#1800ad">Be</span></td></tr>
<tr><td style="padding-top:20px;font-size:16px;line-height:1.5">Voici votre code de connexion :</td></tr>
<tr><td style="padding:16px 0"><div style="font-size:34px;font-weight:800;letter-spacing:10px;color:#1800ad;background:#eeedfb;border-radius:14px;padding:16px;text-align:center">${code}</div></td></tr>
<tr><td style="font-size:14px;color:#5d5966;line-height:1.5">Il expire dans 10 minutes. Si vous n'avez rien demandé, ignorez cet e-mail.</td></tr>
<tr><td style="padding-top:24px;font-size:12px;color:#8d8996">ToBe · Sois-y. Retrouve-toi. · tobe.eledji.com</td></tr>
</table></td></tr></table></body></html>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM || "ToBe <connexion@tobe.eledji.com>",
      to: [email],
      subject: `${code} est votre code ToBe`,
      html,
      text: `Votre code de connexion ToBe : ${code}\nIl expire dans 10 minutes.`,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}
