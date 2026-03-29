"use client";

import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";

const READY_KEY = "offline:route-readiness:v1";

type RouteReadinessMap = Record<string, number>;

export function normalizeOfflineRoutePath(href: string) {
  try {
    const url =
      typeof window !== "undefined"
        ? new URL(href, window.location.origin)
        : new URL(href, "http://localhost");
    const path = url.pathname || "/";
    return path.endsWith("/") && path !== "/" ? path.slice(0, -1) : path;
  } catch {
    const path = href.split("?")[0]?.split("#")[0] || href || "/";
    return path.endsWith("/") && path !== "/" ? path.slice(0, -1) : path;
  }
}

function readRouteReadinessMap(): RouteReadinessMap {
  const raw = safeLocalStorageGet(READY_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as RouteReadinessMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeRouteReadinessMap(next: RouteReadinessMap) {
  safeLocalStorageSet(READY_KEY, JSON.stringify(next));
}

export function markOfflineRouteReady(href: string, at: number = Date.now()) {
  const path = normalizeOfflineRoutePath(href);
  if (!path) return;
  const current = readRouteReadinessMap();
  current[path] = at;
  writeRouteReadinessMap(current);
}

export function markOfflineRoutesReady(routes: string[], at: number = Date.now()) {
  if (!Array.isArray(routes) || routes.length === 0) return;
  const current = readRouteReadinessMap();
  for (const route of routes) {
    const path = normalizeOfflineRoutePath(route);
    if (!path) continue;
    current[path] = at;
  }
  writeRouteReadinessMap(current);
}

export function isOfflineRouteReady(href: string) {
  const path = normalizeOfflineRoutePath(href);
  const current = readRouteReadinessMap();
  return Boolean(current[path]);
}

export function getOfflineRouteFallbackHref(href: string) {
  if (isOfflineRouteReady(href)) return href;
  const path = normalizeOfflineRoutePath(href);
  return `/offline?missingRoute=${encodeURIComponent(path)}`;
}

