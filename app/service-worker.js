// app/service-worker.js
// Enhanced offline support + intelligent caching for POS app.
// Strategies: Precache, cache-first for static assets, stale-while-revalidate for APIs.
// _next assets are bypassed to avoid stale layout/js/css mismatches.

const CACHE_PREFIX = "pos-cache-";
// Bump this when deploying so clients drop old Next.js bundles & action IDs.
const CACHE_NAME = `${CACHE_PREFIX}v7`;
const API_CACHE_NAME = `${CACHE_PREFIX}api-v7`;
const STATIC_CACHE_NAME = `${CACHE_PREFIX}static-v7`;

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

const API_CACHE_MAX_AGE = 5 * 60 * 1000; // 5 minutes

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll(PRECACHE_URLS);
      }),
      caches.open(STATIC_CACHE_NAME),
      caches.open(API_CACHE_NAME),
    ])
  );
});

self.addEventListener("message", (event) => {
  if (event?.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
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
                ![CACHE_NAME, API_CACHE_NAME, STATIC_CACHE_NAME].includes(key)
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

  // Navigation requests: go to network; if offline, fall back to offline page.
  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  // API calls: Stale-While-Revalidate for better perceived performance
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(staleWhileRevalidate(request, API_CACHE_NAME));
    return;
  }

  // Never intercept Next.js build assets. Their paths are not always hashed
  // (e.g., app/layout.js, app/layout.css), so SW caching can serve stale code/CSS.
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

async function handleNavigation(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    const offline = await cache.match("/offline");
    if (offline) return offline;
    throw error;
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

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const url = new URL(request.url);
  const cacheKey = new Request(url.origin + url.pathname, {
    method: "GET",
    headers: request.headers,
    credentials: request.credentials,
    mode: "same-origin",
  });

  try {
    // Try network first
    const networkResponse = await fetchWithTimeout(request, 5000);
    if (networkResponse && networkResponse.ok) {
      // Update cache with fresh response
      const responseToCache = networkResponse.clone();
      responseToCache.headers.set("x-cache-time", Date.now().toString());
      cache.put(cacheKey, responseToCache);
    }
    return networkResponse;
  } catch (error) {
    // Fall back to cache on network error
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      return cachedResponse;
    }
    // If nothing cached and network failed, try again with longer timeout
    try {
      return await fetchWithTimeout(request, 10000);
    } catch {
      return Response.error();
    }
  }
}

// Helper: fetch with timeout
function fetchWithTimeout(request, timeout = 5000) {
  return Promise.race([
    fetch(request),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("fetch timeout")), timeout)
    ),
  ]);
}
