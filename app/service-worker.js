// app/service-worker.js

self.addEventListener("install", (event) => {
  console.log("Service Worker installed");

  event.waitUntil(
    caches.open("pos-cache-v1").then((cache) => {
      return cache.addAll(["/offline", "/dashboard", "/manifest.webmanifest"]);
    })
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request).catch(() => caches.match("/offline")));
});
