"use client";

import { useEffect } from "react";

const OFFLINE_WARM_ROUTES = [
  "/sales/new",
  "/dashboard",
  "/dashboard/sales",
  "/dashboard/sales/new",
  "/dashboard/products",
  "/dashboard/expenses",
  "/dashboard/cash",
  "/dashboard/due",
  "/owner/dashboard",
  "/admin/dashboard",
  "/agent/dashboard",
  "/super-admin/dashboard",
];

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

    const warmOfflineRoutes = async () => {
      if (!navigator.onLine) return;
      try {
        const ready = await navigator.serviceWorker.ready;
        ready.active?.postMessage({
          type: "WARM_NAV_ROUTES",
          routes: OFFLINE_WARM_ROUTES,
        });
      } catch {
        // Ignore warmup failures.
      }
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
        void warmOfflineRoutes();

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

    const onOnline = () => {
      void warmOfflineRoutes();
    };

    window.addEventListener("online", onOnline);
    register();
    return () => {
      window.removeEventListener("online", onOnline);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange
      );
    };
  }, []);

  return null;
}
