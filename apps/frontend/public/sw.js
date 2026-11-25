/*
 * dwa service worker: keeps the pages you visited available offline (network
 * first, cache as fallback). /search is cached at install so an unvisited page
 * still opens something useful offline. Map tiles and API calls always go to
 * the network.
 */
const CACHE = "dwa-v2";
const OFFLINE_FALLBACK = "/search";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.add(OFFLINE_FALLBACK))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && (req.mode === "navigate" || url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/"))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        if (req.mode !== "navigate") return Response.error();
        // Same page with other query parameters, then the search page.
        return (await caches.match(req, { ignoreSearch: true })) || (await caches.match(OFFLINE_FALLBACK)) || Response.error();
      }),
  );
});
