"use client";

import { useEffect } from "react";

// Registers the service worker from the client to avoid making the layout a client component.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/service-worker");
    }
  }, []);

  return null;
}
