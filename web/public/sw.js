// Service worker : l'application s'ouvre hors connexion (billets déjà chargés)
// et reçoit les notifications push même quand elle est fermée, comme WhatsApp.
const CACHE = "tobe-v4";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/index.html", "/manifest.webmanifest", "/icon-192.png"])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api")) return;
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => caches.match("/index.html")));
    return;
  }
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok && (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/models/"))) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    })),
  );
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
