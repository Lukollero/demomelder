// KILL-SWITCH.
// Die früheren SW-Versionen lieferten hartnäckig veraltete Inhalte aus.
// Dieser Service Worker deregistriert sich selbst, leert alle Caches und lädt
// offene Seiten neu. Danach gibt es keinen Service Worker mehr, und die Seite
// lädt wieder normal (immer frisch) direkt von GitHub Pages.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: "window" });
      for (const c of clients) c.navigate(c.url);
    } catch (err) {}
  })());
});
