// app/service-worker.js
// Basic offline support + precaching key assets for the POS app.

const CACHE_PREFIX = "pos-cache-";
const CACHE_NAME = `${CACHE_PREFIX}v2`;

const PRECACHE_URLS = [
  "/",
  "/dashboard",
  "/dashboard/sales",
  "/dashboard/products",
  "/dashboard/reports",
  "/dashboard/expenses",
  "/dashboard/due",
  "/dashboard/cash",
  "/dashboard/shops",
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

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
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
              (key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME
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

  // Navigation requests: prefer network, fallback to offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      networkFirstNavigation(request)
    );
    return;
  }

  // Next.js static assets (CSS/JS/chunks/etc.)
  if (url.pathname.includes("/_next/")) {
    event.respondWith(cacheFirstStatic(request, url));
    return;
  }

  // Cache-first for same-origin static assets and Next.js build output.
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/icons/") ||
      url.pathname.startsWith("/screenshots/") ||
      STATIC_EXTENSIONS.some((ext) => url.pathname.endsWith(ext)))
  ) {
    event.respondWith(cacheFirstStatic(request, url));
    return;
  }
});

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  const url = new URL(request.url);

  try {
    const networkResponse = await fetch(request);
    cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch (error) {
    if (url.pathname.startsWith("/dashboard/")) {
      const dashboardCache = await cache.match("/dashboard");
      if (dashboardCache) return dashboardCache;
    }

    const cached = await cache.match(request);
    if (cached) return cached;

    return cache.match("/offline");
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  if (cachedResponse) return cachedResponse;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // If network fails and nothing cached, propagate the failure.
    return cachedResponse || Response.error();
  }
}

async function cacheFirstStatic(request, url) {
  const cache = await caches.open(CACHE_NAME);
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
