"use client";

import { useEffect } from "react";

// Registers the service worker from the client to avoid making the layout a client component.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };

    const maybeActivate = (worker: ServiceWorker | null) => {
      if (!worker) return;
      if (!navigator.serviceWorker.controller) return;
      if (!navigator.onLine) return;
      worker.postMessage({ type: "SKIP_WAITING" });
    };

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register(
          "/service-worker",
          {
            scope: "/",
            updateViaCache: "none",
          }
        );
        registration.update();

        if (registration.waiting) {
          maybeActivate(registration.waiting);
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed") {
              maybeActivate(installing);
            }
          });
        });

        navigator.serviceWorker.addEventListener(
          "controllerchange",
          onControllerChange
        );
      } catch {
        // Ignore registration failures (e.g., private mode or unsupported).
      }
    };

    register();
    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange
      );
    };
  }, []);

  return null;
}
