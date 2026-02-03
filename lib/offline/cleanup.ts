// lib/offline/cleanup.ts
"use client";

import Dexie from "dexie";
import { db, offlineDbListKey } from "@/lib/dexie/db";
import { safeLocalStorageGet, safeLocalStorageRemove } from "@/lib/storage";

const CACHE_PREFIX = "pos-cache-";
const LEGACY_DB_NAME = "PosOfflineDB";

export async function clearOfflineData() {
  try {
    const raw = safeLocalStorageGet(offlineDbListKey);
    const list = raw ? (JSON.parse(raw) as string[]) : [];
    const names = new Set<string>(
      [db.name, LEGACY_DB_NAME, ...(Array.isArray(list) ? list : [])].filter(
        Boolean
      ) as string[]
    );
    await Promise.all(Array.from(names).map((name) => Dexie.delete(name)));
    safeLocalStorageRemove(offlineDbListKey);
  } catch {
    // ignore
  }

  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX))
          .map((key) => caches.delete(key))
      );
    }
  } catch {
    // ignore
  }

  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister()));
    }
  } catch {
    // ignore
  }

  try {
    window.localStorage.clear();
    window.sessionStorage.clear();
  } catch {
    // ignore
  }
}
