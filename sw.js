/* Sufra · service worker : ouverture instantanée et notifications.
   L'appli est gardée sur le téléphone et s'ouvre tout de suite ; en parallèle, la dernière
   version est téléchargée. Si elle a changé, l'appli propose « Mettre à jour ». */
const CACHE = "sufra-v1";
const SHELL = new URL("./", self.registration.scope).href;

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([SHELL, "manifest.webmanifest", "icon-192.png", "apple-touch-icon.png"])).catch(() => {}));
});
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

const stamp = (r) => r ? (r.headers.get("etag") || "") + (r.headers.get("last-modified") || "") : "";
async function fresh(e, key, notify) {
  const c = await caches.open(CACHE), old = await c.match(key);
  const net = fetch(key, { cache: "no-store" }).then(async (res) => {
    if (res.ok) {
      const before = stamp(old), after = stamp(res);
      await c.put(key, res.clone());
      if (notify && old && before && after && before !== after) {
        await new Promise((r) => setTimeout(r, 1500));
        for (const w of await self.clients.matchAll({ type: "window" })) w.postMessage({ type: "updated" });
      }
    }
    return res;
  });
  e.waitUntil(net.catch(() => {}));
  if (old) return old;
  return net;
}
self.addEventListener("fetch", (e) => {
  const req = e.request; if (req.method !== "GET") return;
  const u = new URL(req.url); if (u.origin !== location.origin || u.pathname.endsWith("sw.js")) return;
  if (req.mode === "navigate") return e.respondWith(fresh(e, SHELL, true).catch(() => fetch(req)));
  if (/\.(png|webmanifest|pdf)$/.test(u.pathname)) e.respondWith(fresh(e, req.url, false).catch(() => fetch(req)));
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Sufra", {
    body: d.body || "",
    icon: "icon-192.png",
    badge: "icon-192.png",
    tag: d.tag || undefined,
    data: { url: d.url || "?v=home" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "?v=home";
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.startsWith(self.registration.scope)) {
        w.postMessage({ type: "open", url });
        return w.focus();
      }
    }
    return self.clients.openWindow(new URL(url, self.registration.scope).href);
  })());
});
