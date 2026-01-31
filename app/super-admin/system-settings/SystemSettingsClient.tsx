// app/super-admin/system-settings/SystemSettingsClient.tsx

"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { useSyncStatus } from "@/lib/sync/sync-status";
import { queueAdminAction } from "@/lib/sync/queue";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";

type SupportContact = {
  supportPhone?: string | null;
  supportWhatsapp?: string | null;
};

type Props = {
  saved: boolean;
  initialSupport: SupportContact;
  onUpdate: (formData: FormData) => void | Promise<void>;
};

export default function SystemSettingsClient({
  saved,
  initialSupport,
  onUpdate,
}: Props) {
  const online = useOnlineStatus();
  const router = useRouter();
  const { pendingCount, syncing, lastSyncAt } = useSyncStatus();
  const [support, setSupport] = useState<SupportContact>(initialSupport);
  const [cacheMissing, setCacheMissing] = useState(false);
  const [queued, setQueued] = useState(false);
  const refreshInFlightRef = useRef(false);
  const lastRefreshAtRef = useRef(0);
  const REFRESH_MIN_INTERVAL_MS = 15_000;
  const serverSnapshotRef = useRef({ support: initialSupport, saved });

  const cacheKey = useMemo(() => "super-admin:system-settings", []);

  useEffect(() => {
    if (online) {
      setSupport(initialSupport);
      setCacheMissing(false);
      setQueued(false);
      try {
        safeLocalStorageSet(cacheKey, JSON.stringify(initialSupport));
      } catch {
        // ignore cache errors
      }
      return;
    }

    try {
      const raw = safeLocalStorageGet(cacheKey);
      if (!raw) {
        setCacheMissing(true);
        return;
      }
      const parsed = JSON.parse(raw) as SupportContact;
      setSupport(parsed || {});
      setCacheMissing(false);
    } catch {
      setCacheMissing(true);
    }
  }, [online, initialSupport, cacheKey]);

  useEffect(() => {
    if (
      serverSnapshotRef.current.support !== initialSupport ||
      serverSnapshotRef.current.saved !== saved
    ) {
      serverSnapshotRef.current = { support: initialSupport, saved };
      refreshInFlightRef.current = false;
    }
  }, [initialSupport, saved]);

  useEffect(() => {
    if (!online || !lastSyncAt || syncing || pendingCount > 0) return;
    if (refreshInFlightRef.current) return;
    const now = Date.now();
    if (now - lastRefreshAtRef.current < REFRESH_MIN_INTERVAL_MS) return;
    lastRefreshAtRef.current = now;
    refreshInFlightRef.current = true;
    router.refresh();
  }, [online, lastSyncAt, syncing, pendingCount, router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    if (online) return;
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const supportPhone =
      (formData.get("supportPhone") as string | null)?.trim() || null;
    const supportWhatsapp =
      (formData.get("supportWhatsapp") as string | null)?.trim() || null;

    const payload = { supportPhone, supportWhatsapp };
    setSupport(payload);
    try {
      safeLocalStorageSet(cacheKey, JSON.stringify(payload));
    } catch {
      // ignore cache errors
    }
    await queueAdminAction("system_settings_update_support", payload);
    setQueued(true);
    alert("Offline: system settings update queued.");
  };

  return (
    <div className="space-y-6 section-gap">
      {!online && (
        <div className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs font-semibold text-warning">
          Offline: showing cached system settings data.
        </div>
      )}
      {!online && cacheMissing && (
        <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          Offline: cached system settings data not available.
        </div>
      )}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <h1 className="text-2xl font-bold text-foreground">
          System Settings - Support Contact
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Update support phone and WhatsApp contact details for shops.
        </p>
        {saved ? (
          <div
            className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-md bg-success-soft border border-success/30 text-sm text-success"
            role="status"
            aria-live="polite"
          >
            Settings updated successfully.
          </div>
        ) : null}
        {queued ? (
          <div
            className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-md bg-warning-soft border border-warning/30 text-sm text-warning"
            role="status"
            aria-live="polite"
          >
            Offline update queued for sync.
          </div>
        ) : null}
      </div>

      <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
        <form action={onUpdate} onSubmit={handleSubmit} className="space-y-4 max-w-xl">
          <div className="space-y-2">
            <label htmlFor="supportPhone" className="text-sm font-medium text-foreground">
              Support phone
            </label>
            <input
              id="supportPhone"
              name="supportPhone"
              type="text"
              value={support.supportPhone ?? ""}
              onChange={(event) =>
                setSupport((prev) => ({ ...prev, supportPhone: event.target.value }))
              }
              placeholder="01700-XXXXXX"
              className="w-full border border-border rounded-lg px-4 py-2.5 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="supportWhatsapp" className="text-sm font-medium text-foreground">
              WhatsApp number
            </label>
            <input
              id="supportWhatsapp"
              name="supportWhatsapp"
              type="text"
              value={support.supportWhatsapp ?? ""}
              onChange={(event) =>
                setSupport((prev) => ({
                  ...prev,
                  supportWhatsapp: event.target.value,
                }))
              }
              placeholder="01700-YYYYYY"
              className="w-full border border-border rounded-lg px-4 py-2.5 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Changes apply to support contact shown on the shop pages.
          </p>

          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-primary-soft text-primary border border-primary/30 rounded-lg text-sm font-semibold hover:bg-primary/15 hover:border-primary/40 transition-colors"
          >
            Save
          </button>
        </form>
      </div>
    </div>
  );
}
