// Service worker de ToBe : l'application s'ouvre et s'utilise hors connexion
// (événements, billets et profil déjà consultés), et reçoit les notifications push
// même quand elle est fermée, comme WhatsApp.
const VERSION = "tobe-v6";
const COQUILLE = `${VERSION}-coquille`; // index.html + scripts/styles de la version en ligne
const MEDIAS = "tobe-medias";             // affiches et photos déjà vues (gardées d'une version à l'autre)
const MAX_MEDIAS = 250;
const DELAI = 4000; // réseau lent (2G/3G) : au-delà, on ouvre la copie locale

async function garderCoquille(html) {
  const c = await caches.open(COQUILLE);
  await c.put("/index.html", new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }));
  // Les fichiers de la version (noms uniques) : l'application démarre sans réseau dès la 1re visite.
  const fichiers = [...new Set([...html.matchAll(/\/(?:assets|models)\/[^"'\s)]+/g)].map((m) => m[0]))];
  await Promise.all(fichiers.map(async (u) => { try { if (!(await c.match(u))) { const r = await fetch(u); if (r.ok) await c.put(u, r); } } catch {} }));
  // Pages chargées à la demande (billets, scanner…) : gardées aussi, sauf le module de reconnaissance faciale (lourd).
  try {
    const m = await (await fetch("/asset-manifest.json", { cache: "no-store" })).json();
    const autres = [...new Set(Object.values(m).flatMap((x) => [x.file, ...(x.css || [])]))].filter((f) => f && !/faceapi/.test(f)).map((f) => `/${f}`);
    await Promise.all(autres.map(async (u) => { try { if (!(await c.match(u))) { const r = await fetch(u); if (r.ok) await c.put(u, r); } } catch {} }));
  } catch {}
}

self.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      try {
        const r = await fetch("/app.html", { cache: "no-store" }).then((x) => (x.ok ? x : fetch("/index.html", { cache: "no-store" })));
        if (r.ok) await garderCoquille(await r.text());
      } catch {}
      await (await caches.open(COQUILLE)).addAll(["/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/logo.png", "/badge-96.png"]).catch(() => {});
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== COQUILLE && k !== MEDIAS) await caches.delete(k);
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {});
      await self.clients.claim();
    })(),
  );
});

async function limiter(nom, max) {
  const c = await caches.open(nom);
  const cles = await c.keys();
  for (const k of cles.slice(0, Math.max(0, cles.length - max))) await c.delete(k);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET") return;

  // Affiches et photos (Vercel Blob ou le site) : la copie locale d'abord.
  const media = /\.(jpe?g|png|webp|avif|gif)$/i.test(url.pathname) && (url.origin === location.origin || url.hostname.endsWith(".blob.vercel-storage.com"));
  if (media && !url.pathname.startsWith("/api")) {
    e.respondWith(
      (async () => {
        const c = await caches.open(url.origin === location.origin && !url.pathname.startsWith("/uploads") ? COQUILLE : MEDIAS);
        const hit = await c.match(req);
        if (hit) return hit;
        try {
          const r = await fetch(req);
          if (r.ok || r.type === "opaque") { await c.put(req, r.clone()).catch(() => {}); e.waitUntil(limiter(MEDIAS, MAX_MEDIAS)); }
          return r;
        } catch {
          return new Response("", { status: 504 });
        }
      })(),
    );
    return;
  }
  if (url.origin !== location.origin || url.pathname.startsWith("/api")) return;

  // Pages (application à page unique) : réseau d'abord, copie locale si le réseau manque ou traîne.
  if (req.mode === "navigate") {
    e.respondWith(
      (async () => {
        const reseau = (async () => {
          const r = (await e.preloadResponse) || (await fetch(req));
          if (r.ok && (r.headers.get("content-type") || "").includes("text/html")) {
            const html = await r.clone().text();
            // Seule la coquille de l'application est gardée (pas les pages SEO pré-rendues).
            if (html.includes('id="root"')) e.waitUntil(garderCoquille(html).catch(() => {}));
          }
          return r;
        })();
        const copie = async () => (await caches.match("/index.html")) || (await caches.match("/"));
        try {
          const premier = await Promise.race([reseau, new Promise((ok) => setTimeout(ok, DELAI, "lent"))]);
          if (premier !== "lent") return premier;
          const c = await copie();
          if (c) { e.waitUntil(reseau.catch(() => {})); return c; }
          return await reseau;
        } catch {
          return (await copie()) || new Response("<h1>ToBe</h1><p>Pas de connexion. Réessayez dans un instant.</p>", { headers: { "content-type": "text/html; charset=utf-8" } });
        }
      })(),
    );
    return;
  }

  // Scripts, styles, modèles 3D : noms uniques, la copie locale d'abord.
  e.respondWith(
    (async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok && (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/models/") || url.pathname.startsWith("/fonts/"))) {
        const copie = r.clone();
        e.waitUntil(caches.open(COQUILLE).then((c) => c.put(req, copie)));
      }
      return r;
    })(),
  );
});

self.addEventListener("message", (e) => {
  // Déconnexion : les photos privées éventuellement gardées sont effacées.
  if (e.data && e.data.type === "vider") e.waitUntil(caches.delete(MEDIAS));
});

// ---------- Notifications push ----------
self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { title: "ToBe", body: e.data ? e.data.text() : "" };
  }
  const title = d.title || "ToBe";
  const options = {
    body: d.body || "",
    icon: "/icon-192.png",
    badge: "/badge-96.png",
    image: d.image || undefined,
    tag: d.tag || undefined,
    renotify: !!d.tag,
    vibrate: [120, 60, 120],
    timestamp: Date.now(),
    data: { url: d.url || "/", actions: d.actions || [] },
    actions: (d.actions || []).slice(0, 2).map((a) => ({ action: a.action, title: a.title })),
  };
  e.waitUntil(
    self.registration.showNotification(title, options).then(() =>
      // Pastille sur l'icône de l'application (Android, iPhone, ordinateur).
      self.navigator && "setAppBadge" in self.navigator ? self.navigator.setAppBadge().catch(() => {}) : undefined,
    ),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const data = e.notification.data || {};
  const picked = (data.actions || []).find((a) => a.action === e.action);
  const target = new URL((picked && picked.url) || data.url || "/", self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin && "focus" in w) {
          w.navigate(target).catch(() => {});
          return w.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

// Le navigateur a renouvelé l'abonnement : on prévient le serveur.
self.addEventListener("pushsubscriptionchange", (e) => {
  e.waitUntil(
    self.registration.pushManager.getSubscription().then((sub) =>
      sub
        ? fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...sub.toJSON(), ua: "renouvellement" }) })
        : undefined,
    ),
  );
});
