/* ------------------------------------------------------------------ *
 * Office Mobile Service Worker                                        *
 * Strategy: network-first with shell-cache fallback                  *
 * Cache name: officemobile-v3                                        *
 * ------------------------------------------------------------------ */

const CACHE_NAME = "officemobile-v3";

/* ------------------------------------------------------------------ *
 * INSTALL — activate immediately (no pre-caching in dev)             *
 * ------------------------------------------------------------------ */
self.addEventListener("install", (event) => {
  // Skip waiting so the new SW activates immediately
  self.skipWaiting();
});

/* ------------------------------------------------------------------ *
 * ACTIVATE — remove stale caches from previous versions              *
 * ------------------------------------------------------------------ */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      // Take control of all open clients without a reload
      .then(() => self.clients.claim())
  );
});

/* ------------------------------------------------------------------ *
 * FETCH — network-first, fall back to cache                          *
 *                                                                    *
 * HTML navigation requests deliberately bypass the cache so users    *
 * never see a stale pre-hydration shell from a previous deploy. If   *
 * the network fails entirely we still return the cached root as an   *
 * offline fallback, but the cache is never allowed to preempt a      *
 * successful fresh navigation.                                       *
 * ------------------------------------------------------------------ */
self.addEventListener("fetch", (event) => {
  // Only handle GET requests; let everything else pass through
  if (event.request.method !== "GET") return;

  // Skip cross-origin requests (e.g. analytics, API calls)
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Skip Next.js internal requests (HMR, webpack, etc.)
  if (url.pathname.startsWith("/_next/")) return;

  // Navigations (HTML) — always go to the network. Only use cache as
  // an offline fallback. This prevents the flash of a previous build.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((res) => res)
        .catch(() =>
          caches.match(event.request).then(
            (cached) =>
              cached ??
              caches.match("/") ??
              new Response("Offline", {
                status: 503,
                statusText: "Service Unavailable",
              })
          )
        )
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Only cache successful responses
        if (networkResponse.ok) {
          const responseToCache = networkResponse.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      })
      .catch(() =>
        // Network failed — serve from cache (shell fallback)
        caches.match(event.request).then(
          (cachedResponse) =>
            cachedResponse ??
            new Response("Offline", { status: 503, statusText: "Service Unavailable" })
        )
      )
  );
});
