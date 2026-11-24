/**
 * QR dynamique anti-capture d'écran.
 *
 * Chaque billet a un secret connu seulement de son détenteur (et des scanners de l'événement).
 * Le QR affiché change toutes les 30 secondes : TOBE2:<code>:<fenêtre>:<signature>.
 * Une capture d'écran revendue n'est plus valable une minute plus tard.
 * Le calcul est synchrone et sans réseau (téléphone hors connexion, scanner hors connexion).
 */

export const QR_STEP_SECONDS = 30;
/** Tolérance d'horloge : fenêtre courante ± 2 (environ une minute de chaque côté). */
const DRIFT = 2;

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
  0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
]);

function sha256(data: Uint8Array): Uint8Array {
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const len = data.length;
  const total = ((len + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(total);
  buf.set(data);
  buf[len] = 0x80;
  const bits = len * 8;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 4, bits >>> 0);
  dv.setUint32(total - 8, Math.floor(bits / 0x100000000));
  const w = new Uint32Array(64);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15],
        b = w[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const t1 = (hh + S1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h[0] += a;
    h[1] += b;
    h[2] += c;
    h[3] += d;
    h[4] += e;
    h[5] += f;
    h[6] += g;
    h[7] += hh;
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) ov.setUint32(i * 4, h[i]);
  return out;
}

const enc = (s: string) => new TextEncoder().encode(s);

export function hmacSha256Hex(key: string, msg: string): string {
  let k: Uint8Array = enc(key);
  if (k.length > 64) k = sha256(k);
  const block = new Uint8Array(64);
  block.set(k);
  const ipad = block.map((b) => b ^ 0x36);
  const opad = block.map((b) => b ^ 0x5c);
  const m = enc(msg);
  const inner = new Uint8Array(64 + m.length);
  inner.set(ipad);
  inner.set(m, 64);
  const ih = sha256(inner);
  const outer = new Uint8Array(96);
  outer.set(opad);
  outer.set(ih, 64);
  return [...sha256(outer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const qrWindow = (nowMs = Date.now()) => Math.floor(nowMs / 1000 / QR_STEP_SECONDS);

/** Contenu du QR à afficher maintenant. */
export function dynamicQr(code: string, secret: string, nowMs = Date.now()): string {
  const w = qrWindow(nowMs);
  return `TOBE2:${code}:${w}:${hmacSha256Hex(secret, `${code}.${w}`).slice(0, 10).toUpperCase()}`;
}

/** Secondes avant le prochain changement du QR. */
export const qrSecondsLeft = (nowMs = Date.now()) => QR_STEP_SECONDS - (Math.floor(nowMs / 1000) % QR_STEP_SECONDS);

export type ParsedQr = { kind: "dynamic"; code: string; window: number; sig: string } | { kind: "static"; code: string };

export function parseQr(raw: string): ParsedQr {
  const t = raw.trim().toUpperCase();
  const m = /^TOBE2:([A-Z0-9]+):(\d+):([A-F0-9]{10})$/.exec(t);
  if (m) return { kind: "dynamic", code: m[1], window: Number(m[2]), sig: m[3] };
  return { kind: "static", code: t.replace(/^TOBE:/, "") };
}

/** Le QR dynamique est-il authentique et récent ? */
export function checkDynamicQr(p: Extract<ParsedQr, { kind: "dynamic" }>, secret: string, nowMs = Date.now()): "ok" | "expired" | "forged" {
  const expected = hmacSha256Hex(secret, `${p.code}.${p.window}`).slice(0, 10).toUpperCase();
  if (expected !== p.sig) return "forged";
  return Math.abs(qrWindow(nowMs) - p.window) <= DRIFT ? "ok" : "expired";
}
