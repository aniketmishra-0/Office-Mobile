/* ------------------------------------------------------------------ *
 * Office Mobile Service Worker                                       *
 *                                                                    *
 * Multi-layer caching so the installed app feels native:             *
 *                                                                    *
 *   1. App Shell precache  — /, /offline.html, manifest, icons.      *
 *      Guaranteed to exist after the SW activates.                   *
 *   2. Navigations          — network-first with an offline fallback. *
 *   3. Static assets        — stale-while-revalidate (_next/static,  *
 *      images, fonts).                                               *
 *   4. API calls            — network-only; never cached.            *
 *                                                                    *
 * Bump SHELL_CACHE whenever the precache list or sw.js itself is     *
 * edited so old shells are evicted on activate.                      *
 * ------------------------------------------------------------------ */

const SHELL_CACHE = "om-shell-v4";
const RUNTIME_CACHE = "om-runtime-v4";
const CACHE_WHITELIST = [SHELL_CACHE, RUNTIME_CACHE];

// Kept intentionally short. Anything the app needs to render an empty
// standalone window while offline belongs here.
const PRECACHE_URLS = [
  "/",
  "/offline.html",
  "/manifest.json",
  "/favicon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

/* ------------------------------------------------------------------ *
 * INSTALL                                                            *
 * ------------------------------------------------------------------ */
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Use {cache: "reload"} so the SW install never picks up a stale
      // HTTP cache entry for the shell.
      await Promise.all(
        PRECACHE_URLS.map((url) =>
          cache
            .add(new Request(url, { cache: "reload" }))
            .catch(() => undefined)
        )
      );
      await self.skipWaiting();
    })()
  );
});

/* ------------------------------------------------------------------ *
 * ACTIVATE                                                           *
 * ------------------------------------------------------------------ */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => !CACHE_WHITELIST.includes(name))
          .map((name) => caches.delete(name))
      );

      // Opt in to navigation preload where the browser supports it —
      // cuts first-paint latency on repeat navigations.
      if ("navigationPreload" in self.registration) {
        try {
          await self.registration.navigationPreload.enable();
        } catch {
          /* ignore */
        }
      }

      await self.clients.claim();
    })()
  );
});

/* ------------------------------------------------------------------ *
 * MESSAGE — allow the page to request an immediate SW swap           *
 * ------------------------------------------------------------------ */
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

/* ------------------------------------------------------------------ *
 * FETCH                                                              *
 * ------------------------------------------------------------------ */

const isNextInternal = (pathname) =>
  pathname.startsWith("/_next/static/") || pathname.startsWith("/_next/image");

const isStaticAsset = (pathname) =>
  /\.(?:js|css|woff2?|ttf|otf|eot|png|jpg|jpeg|webp|svg|gif|ico|json|map)$/i.test(
    pathname
  );

const isApiCall = (pathname) =>
  pathname.startsWith("/api/") || pathname.startsWith("/backend/");

async function networkFirstNavigation(event) {
  try {
    const preload = event.preloadResponse
      ? await event.preloadResponse
      : null;
    const response = preload || (await fetch(event.request));
    // Refresh the cached root so the offline fallback stays usable.
    if (response && response.ok) {
      const clone = response.clone();
      caches.open(SHELL_CACHE).then((c) => c.put("/", clone)).catch(() => {});
    }
    return response;
  } catch {
    const cached =
      (await caches.match(event.request)) || (await caches.match("/"));
    if (cached) return cached;
    const offline = await caches.match("/offline.html");
    if (offline) return offline;
    return new Response("Offline", {
      status: 503,
      statusText: "Service Unavailable",
    });
  }
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(event.request);
  const networkFetch = fetch(event.request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(event.request, response.clone());
      }
      return response;
    })
    .catch(() => cached);
  return cached || networkFetch;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Cross-origin — let the browser handle it (CORS, credentials, etc).
  if (url.origin !== self.location.origin) return;

  // Never cache API responses.
  if (isApiCall(url.pathname)) return;

  // Navigations — network-first with offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(event));
    return;
  }

  // Next.js hashed assets and static files — stale-while-revalidate.
  if (isNextInternal(url.pathname) || isStaticAsset(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event));
    return;
  }

  // Anything else — try network, fall back to cache.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches
            .open(RUNTIME_CACHE)
            .then((cache) => cache.put(request, clone))
            .catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
