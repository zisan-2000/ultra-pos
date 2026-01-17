// app/dashboard/reports/components/PaymentMethodReport.tsx

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { PREFETCH_PRESETS, computePresetRange } from "@/lib/reporting-range";
import { scheduleIdle } from "@/lib/schedule-idle";
import { handlePermissionError } from "@/lib/permission-toast";

type PaymentRow = { name: string; value: number; count?: number };
type Props = { shopId: string; from?: string; to?: string };

export default function PaymentMethodReport({ shopId, from, to }: Props) {
  const online = useOnlineStatus();
  const [data, setData] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const prefetchKeyRef = useRef<string | null>(null);

  const buildCacheKey = useCallback(
    (rangeFrom?: string, rangeTo?: string) =>
      `reports:payment:${shopId}:${rangeFrom || "all"}:${rangeTo || "all"}`,
    [shopId]
  );

  const loadCached = useCallback(
    (rangeFrom?: string, rangeTo?: string) => {
      try {
        const raw = localStorage.getItem(buildCacheKey(rangeFrom, rangeTo));
        if (!raw) {
          setData([]);
          return false;
        }
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setData(parsed);
          return true;
        }
      } catch (err) {
        handlePermissionError(err);
        console.warn("Payment report cache read failed", err);
      }
      setData([]);
      return false;
    },
    [buildCacheKey]
  );

  const load = useCallback(
    async (rangeFrom?: string, rangeTo?: string) => {
      const cachedApplied = loadCached(rangeFrom, rangeTo);
      if (!online) {
        setLoading(false);
        return;
      }
      setLoading(!cachedApplied);
      try {
        const params = new URLSearchParams({ shopId });
        if (rangeFrom) params.append("from", rangeFrom);
        if (rangeTo) params.append("to", rangeTo);

        const res = await fetch(
          `/api/reports/payment-method?${params.toString()}`,
          { cache: "no-store" }
        );

        if (!res.ok) {
          loadCached(rangeFrom, rangeTo);
          return;
        }

        const text = await res.text();
        if (!text) {
          loadCached(rangeFrom, rangeTo);
          return;
        }
        const json = JSON.parse(text);
        const rows = Array.isArray(json?.data) ? json.data : [];
        setData(rows);
        try {
          localStorage.setItem(
            buildCacheKey(rangeFrom, rangeTo),
            JSON.stringify(rows)
          );
        } catch (err) {
          handlePermissionError(err);
          console.warn("Payment report cache write failed", err);
        }
      } catch (err) {
        handlePermissionError(err);
        console.error("Payment method load failed", err);
        loadCached(rangeFrom, rangeTo);
      } finally {
        setLoading(false);
      }
    },
    [online, shopId, buildCacheKey, loadCached]
  );

  useEffect(() => {
    void load(from, to);
  }, [load, from, to]);

  useEffect(() => {
    if (!online || typeof window === "undefined") return;
    if (prefetchKeyRef.current === shopId) return;
    prefetchKeyRef.current = shopId;
    const cancel = scheduleIdle(() => {
      PREFETCH_PRESETS.forEach((presetKey) => {
        const { from: rangeFrom, to: rangeTo } = computePresetRange(presetKey);
        const cacheKey = buildCacheKey(rangeFrom, rangeTo);
        if (localStorage.getItem(cacheKey)) return;
        const params = new URLSearchParams({ shopId });
        if (rangeFrom) params.append("from", rangeFrom);
        if (rangeTo) params.append("to", rangeTo);
        fetch(`/api/reports/payment-method?${params.toString()}`, {
          cache: "no-store",
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((json) => {
            const rows = Array.isArray(json?.data) ? json.data : null;
            if (!rows) return;
            try {
              localStorage.setItem(cacheKey, JSON.stringify(rows));
            } catch (err) {
              handlePermissionError(err);
              console.warn("Payment prefetch cache write failed", err);
            }
          })
          .catch(() => {
            // ignore prefetch errors
          });
      });
    });
    return () => cancel();
  }, [online, shopId, buildCacheKey]);

  const totalAmount = useMemo(
    () => data.reduce((sum, item) => sum + Number(item.value || 0), 0),
    [data]
  );

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-soft/50 via-card to-card" />
        <div className="relative space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-foreground">পেমেন্ট মাধ্যম</h2>
              <p className="text-xs text-muted-foreground">শেয়ার ও পরিমাণ</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="inline-flex h-7 items-center rounded-full border border-border bg-card/80 px-3 text-muted-foreground">
              মোট: {totalAmount.toFixed(2)} ৳
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-2 shadow-sm space-y-2">
        {loading ? (
          <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            লোড হচ্ছে...
          </p>
        ) : data.length === 0 ? (
          <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            কোনো পেমেন্ট ডেটা নেই
          </p>
        ) : (
          data.map((item, idx) => {
            const percent =
              totalAmount > 0
                ? Math.round((Number(item.value || 0) / totalAmount) * 100)
                : 0;

            return (
              <div
                key={`${item.name}-${idx}`}
                className="rounded-xl border border-border bg-card p-3 shadow-sm transition-colors hover:bg-muted/60 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-foreground">
                      {item.name || "নগদ"}
                    </p>
                    {typeof item.count === "number" && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {item.count} টি লেনদেন
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-foreground">
                      {Number(item.value || 0)} ৳
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {percent}% শেয়ার
                    </p>
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
