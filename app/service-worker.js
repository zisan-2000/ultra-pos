// app/service-worker.js
// Enhanced offline support + intelligent caching for POS app.
// Strategies: Precache, cache-first for static assets. Avoid caching API responses
// to prevent cross-user data leakage on shared devices.
// _next assets are bypassed to avoid stale layout/js/css mismatches.

const CACHE_PREFIX = "pos-cache-";
// Bump this when deploying so clients drop old Next.js bundles & action IDs.
const CACHE_NAME = `${CACHE_PREFIX}v13`;
const STATIC_CACHE_NAME = `${CACHE_PREFIX}static-v13`;

const PRECACHE_URLS = [
  "/offline",
  "/manifest.webmanifest",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/screenshots/dashboard-mobile.png",
  "/screenshots/dashboard-desktop.png",
];

const STATIC_EXTENSIONS = [
  ".js",
  ".css",
  ".woff2",
  ".woff",
  ".ttf",
  ".eot",
  ".png",
  ".jpg",
  ".jpeg",
  ".svg",
  ".gif",
  ".ico",
  ".webp",
  ".avif",
  ".webmanifest",
];

const NAVIGATION_CACHE_EXACT = ["/", "/offline", "/login", "/dashboard"];
const NAVIGATION_CACHE_PREFIXES = [
  "/sales",
  "/dashboard/sales",
  "/dashboard/products",
  "/dashboard/expenses",
  "/dashboard/cash",
  "/dashboard/due",
  "/owner/dashboard",
  "/admin/dashboard",
  "/agent/dashboard",
  "/super-admin/dashboard",
];
const NAVIGATION_WARM_ROUTES = [
  "/dashboard",
  "/dashboard/sales",
  "/dashboard/products",
];
const NAVIGATION_FALLBACKS = {
  "/dashboard": [
    "/dashboard/sales",
    "/dashboard/products",
    "/dashboard/expenses",
    "/dashboard/cash",
    "/dashboard/due",
  ],
  "/sales/new": ["/dashboard/sales/new", "/dashboard/sales", "/dashboard"],
  "/dashboard/sales/new": ["/dashboard/sales", "/dashboard"],
};

function shouldCacheNavigation(url) {
  const path = normalizePathname(url.pathname);
  if (NAVIGATION_CACHE_EXACT.includes(path)) return true;
  return NAVIGATION_CACHE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}

function normalizePathname(pathname) {
  if (!pathname || pathname === "/") return "/";
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function getNavigationCacheKey(url) {
  return new Request(url.origin + normalizePathname(url.pathname));
}

function getNavigationFallbackPaths(path) {
  const unique = new Set(NAVIGATION_FALLBACKS[path] || []);

  if (path.startsWith("/sales/new")) {
    unique.add("/dashboard/sales/new");
    unique.add("/dashboard/sales");
    unique.add("/dashboard");
  }

  if (path.startsWith("/dashboard/sales/new")) {
    unique.add("/dashboard/sales");
    unique.add("/dashboard");
  }

  if (path.startsWith("/dashboard/")) {
    unique.add("/dashboard");
  }

  return Array.from(unique);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll(PRECACHE_URLS);
      }),
      caches.open(STATIC_CACHE_NAME),
    ])
  );
});

self.addEventListener("message", (event) => {
  if (event?.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }

  if (event?.data?.type === "WARM_NAV_ROUTES") {
    const routes = Array.isArray(event.data.routes)
      ? event.data.routes
      : NAVIGATION_WARM_ROUTES;
    event.waitUntil(warmNavigationRoutes(routes));
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag !== "pos-sync") return;
  event.waitUntil(
    self.clients
      .matchAll({ includeUncontrolled: true, type: "window" })
      .then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: "POS_SYNC" });
        });
      })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith(CACHE_PREFIX) &&
                ![CACHE_NAME, STATIC_CACHE_NAME].includes(key)
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never cache the service worker script itself.
  if (
    url.pathname === "/service-worker" ||
    url.pathname === "/service-worker.js"
  ) {
    event.respondWith(fetch(request));
    return;
  }

  // Navigation requests: network-first with cached fallback (including protected routes).
  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request, url));
    return;
  }

  // API calls: never cache to avoid serving user-specific data across sessions.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request));
    return;
  }

  // Cache Next.js static build assets.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirstStatic(request, url, STATIC_CACHE_NAME));
    return;
  }

  // Never intercept dynamic Next.js assets (images/data).
  if (url.pathname.startsWith("/_next/")) {
    return;
  }

  // Cache-first for same-origin static assets and Next.js build output.
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/icons/") ||
      url.pathname.startsWith("/screenshots/") ||
      STATIC_EXTENSIONS.some((ext) => url.pathname.endsWith(ext)))
  ) {
    event.respondWith(cacheFirstStatic(request, url, STATIC_CACHE_NAME));
    return;
  }
});

async function handleNavigation(request, url) {
  const cache = await caches.open(CACHE_NAME);
  const path = normalizePathname(url.pathname);

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok && shouldCacheNavigation(url)) {
      const navCacheKey = getNavigationCacheKey(url);
      cache.put(navCacheKey, networkResponse.clone());
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cached =
      (await cache.match(request)) ||
      (await cache.match(getNavigationCacheKey(url)));
    if (cached) return cached;

    const fallbackPaths = getNavigationFallbackPaths(path);
    for (const fallbackPath of fallbackPaths) {
      const fallbackUrl = new URL(fallbackPath, self.location.origin);
      const fallbackResponse = await cache.match(getNavigationCacheKey(fallbackUrl));
      if (fallbackResponse) return fallbackResponse;
    }

    const offline = await cache.match("/offline");
    if (offline) return offline;
    return new Response(
      "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'><title>Offline</title></head><body><h1>Offline</h1><p>Please reconnect and try again.</p></body></html>",
      {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }
    );
  }
}

async function cacheFirstStatic(request, url, cacheName) {
  const cache = await caches.open(cacheName);
  const cleanUrl = url.origin + url.pathname; // strip query params for stable keys
  const cacheKey = new Request(cleanUrl, {
    method: "GET",
    headers: request.headers,
    credentials: request.credentials,
    mode: "same-origin",
  });

  // Try both string and Request match to be safe.
  const cached =
    (await cache.match(cleanUrl)) ||
    (await cache.match(cacheKey)) ||
    (await cache.match(request));
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      // Store under stable key (no query) and original request for resilience.
      cache.put(cacheKey, networkResponse.clone());
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    return cached || Response.error();
  }
}

async function warmNavigationRoutes(routes) {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(
    routes.map(async (route) => {
      if (typeof route !== "string" || route.length === 0) return;

      const normalizedPath = normalizePathname(
        route.startsWith("/") ? route : `/${route}`
      );
      const targetUrl = new URL(normalizedPath, self.location.origin);
      const request = new Request(targetUrl.toString(), { method: "GET" });

      try {
        const response = await fetch(request);
        if (!response || !response.ok) return;

        const responsePath = normalizePathname(new URL(response.url).pathname);
        if (responsePath === "/login") return;

        cache.put(getNavigationCacheKey(targetUrl), response.clone());
        cache.put(request, response.clone());
        if (responsePath !== normalizedPath) {
          cache.put(
            getNavigationCacheKey(new URL(response.url)),
            response.clone()
          );
        }
      } catch {
        // Ignore warmup failures; navigation fallback will still handle offline.
      }
    })
  );
}

