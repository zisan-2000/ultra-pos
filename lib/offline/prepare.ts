"use client";

import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";
import { runSyncEngine } from "@/lib/sync/sync-engine";

const LAST_PREPARED_PREFIX = "offline:prepared";

function buildRoutes(shopId?: string | null) {
  const suffix = shopId ? `?shopId=${shopId}` : "";
  return [
    "/dashboard",
    `/dashboard/sales${suffix}`,
    `/dashboard/sales/new${suffix}`,
    `/dashboard/products${suffix}`,
    `/dashboard/products/new${suffix}`,
    `/dashboard/expenses${suffix}`,
    `/dashboard/expenses/new${suffix}`,
    `/dashboard/cash${suffix}`,
    `/dashboard/cash/new${suffix}`,
    `/dashboard/due${suffix}`,
    "/offline",
    "/offline/conflicts",
  ];
}

function getPreparedKey(shopId?: string | null) {
  return `${LAST_PREPARED_PREFIX}:${shopId || "default"}`;
}

export function getLastOfflinePreparedAt(shopId?: string | null) {
  const raw = safeLocalStorageGet(getPreparedKey(shopId));
  const parsed = Number(raw ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function prepareOfflineForShop(
  shopId?: string | null,
  options?: { runSync?: boolean }
) {
  if (typeof window === "undefined") return;
  if (!navigator.onLine) return;

  if (options?.runSync !== false) {
    await runSyncEngine();
  }

  const routes = buildRoutes(shopId);

  try {
    const registration = await navigator.serviceWorker?.ready;
    registration?.active?.postMessage({
      type: "WARM_NAV_ROUTES",
      routes,
    });
  } catch {
    // Ignore warm failures.
  }

  await Promise.allSettled(
    routes.map((route) =>
      fetch(route, {
        credentials: "include",
        headers: { "x-offline-warm": "1" },
      })
    )
  );

  safeLocalStorageSet(getPreparedKey(shopId), `${Date.now()}`);
}
