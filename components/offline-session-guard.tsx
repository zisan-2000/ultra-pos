"use client";

import { useEffect } from "react";
import { clearOfflineData } from "@/lib/offline/cleanup";
import { setDbUser } from "@/lib/dexie/db";
import { safeLocalStorageGet, safeLocalStorageSet, safeLocalStorageRemove } from "@/lib/storage";
import {
  clearRememberedOfflineAuth,
  rememberOfflineUser,
  type OfflineAuthUser,
} from "@/lib/offline-auth";

const STORAGE_KEY = "offline:userId";

export default function OfflineSessionGuard() {
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const storedUserId = safeLocalStorageGet(STORAGE_KEY);
      setDbUser(storedUserId);

      try {
        const res = await fetch("/api/auth/session-rbac", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          session?: { userId?: string | null } | null;
          user?: OfflineAuthUser | null;
        };
        if (cancelled) return;

        const userId = data?.session?.userId ?? null;
        const sessionUser = data?.user ?? null;
        const stored = safeLocalStorageGet(STORAGE_KEY);

        if (!userId) {
          if (stored) {
            await clearOfflineData();
            safeLocalStorageRemove(STORAGE_KEY);
            setDbUser(null);
          }
          return;
        }

        if (stored && stored !== userId) {
          await clearOfflineData();
        }
        safeLocalStorageSet(STORAGE_KEY, userId);
        setDbUser(userId);
        if (sessionUser) {
          rememberOfflineUser(sessionUser);
        } else {
          clearRememberedOfflineAuth();
        }
      } catch {
        // Ignore: offline or session fetch unavailable.
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
