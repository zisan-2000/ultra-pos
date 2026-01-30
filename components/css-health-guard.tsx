"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const RECOVERY_FLAG = "pos.css.recovery.attempted";
const CHECK_DELAY_MS = 1200;

async function recoverStyles() {
  if ((window as Window & { __posCssRecovery?: boolean }).__posCssRecovery) {
    return;
  }
  (window as Window & { __posCssRecovery?: boolean }).__posCssRecovery = true;

  try {
    if (sessionStorage.getItem(RECOVERY_FLAG)) return;
    sessionStorage.setItem(RECOVERY_FLAG, "1");
  } catch {
    // If sessionStorage is unavailable, proceed without the guard.
  }

  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) await registration.unregister();
    }

    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // Best-effort cleanup; fallback to reload.
  }

  window.location.reload();
}

export default function CssHealthGuard() {
  const pathname = usePathname();

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    const timer = window.setTimeout(() => {
      const value = getComputedStyle(document.documentElement)
        .getPropertyValue("--css-loaded")
        .trim();
      if (value !== "1") {
        recoverStyles();
      }
    }, CHECK_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [pathname]);

  return null;
}
