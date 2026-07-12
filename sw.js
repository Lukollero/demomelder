// Demomelder Service Worker — network-first, damit die Termine immer frisch sind,
// mit Cache-Fallback für Offline-Nutzung.
const CACHE = "demomelder-v2";
const SHELL = [
  "./", "./index.html", "./demos.js", "./manifest.webmanifest",
  "./icon.svg", "./icon-192.png", "./apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req.url, { cache: "no-store" });   // HTTP-Cache des Browsers umgehen: immer frisch
      const c = await caches.open(CACHE);
      c.put(req, res.clone()).catch(() => {});
      return res;
    } catch {
      const cached = await caches.match(req);
      return cached || caches.match("./index.html");
    }
  })());
});
