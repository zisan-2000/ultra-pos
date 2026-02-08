// app/dashboard/reports/components/LowStockReport.tsx

"use client";

import { useCallback, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { REPORT_ROW_LIMIT } from "@/lib/reporting-config";
import { getStockToneClasses } from "@/lib/stock-level";
import { handlePermissionError } from "@/lib/permission-toast";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";

type StockRow = { id?: string; name: string; stockQty: number };

type Props = {
  shopId: string;
  threshold?: number;
  onThresholdChange?: (value: number) => void;
};

export default function LowStockReport({
  shopId,
  threshold: thresholdProp,
  onThresholdChange,
}: Props) {
  const online = useOnlineStatus();
  const [thresholdState, setThresholdState] = useState(20);
  const threshold =
    typeof thresholdProp === "number" ? thresholdProp : thresholdState;
  const setThreshold = (value: number) => {
    if (onThresholdChange) {
      onThresholdChange(value);
    } else {
      setThresholdState(value);
    }
  };

  const buildCacheKey = useCallback(
    () => `reports:low-stock:${shopId}:${threshold}:${REPORT_ROW_LIMIT}`,
    [shopId, threshold]
  );

  const readCached = useCallback(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = safeLocalStorageGet(buildCacheKey());
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as StockRow[]) : null;
    } catch (err) {
      handlePermissionError(err);
      console.warn("Low stock cache read failed", err);
      return null;
    }
  }, [buildCacheKey]);

  const fetchLowStock = useCallback(async () => {
    if (!online) {
      return readCached() ?? [];
    }
    const params = new URLSearchParams({
      shopId,
      limit: `${REPORT_ROW_LIMIT}`,
      threshold: `${threshold}`,
    });
    const res = await fetch(`/api/reports/low-stock?${params.toString()}`);
    if (res.status === 304) {
      return readCached() ?? [];
    }
    if (!res.ok) {
      const cached = readCached();
      if (cached) return cached;
      throw new Error("Low stock fetch failed");
    }
    const text = await res.text();
    if (!text) {
      return readCached() ?? [];
    }
    const json = JSON.parse(text);
    const rows = Array.isArray(json?.data) ? json.data : [];
    if (typeof window !== "undefined") {
      try {
        safeLocalStorageSet(buildCacheKey(), JSON.stringify(rows));
      } catch (err) {
        handlePermissionError(err);
        console.warn("Low stock cache write failed", err);
      }
    }
    return rows;
  }, [online, shopId, threshold, buildCacheKey, readCached]);

  const queryKey = useMemo(
    () => ["reports", "low-stock", shopId, threshold, REPORT_ROW_LIMIT],
    [shopId, threshold]
  );

  const lowStockQuery = useQuery({
    queryKey,
    queryFn: fetchLowStock,
    enabled: online,
    initialData: () => readCached() ?? [],
    placeholderData: keepPreviousData,
  });

  const items: StockRow[] = lowStockQuery.data ?? [];
  const loading = lowStockQuery.isFetching && online;
  const hasFetched = lowStockQuery.isFetchedAfterMount;
  const showEmpty = items.length === 0 && (!online || hasFetched) && !loading;

  const renderStatus = (qty: number) => (qty <= 5 ? "জরুরি" : "কম");

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-warning-soft/50 via-card to-card" />
        <div className="relative space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-warning/15 text-warning text-lg">
                📦
              </span>
              <div>
                <h2 className="text-lg font-bold text-foreground">কম স্টক</h2>
                <p className="text-xs text-muted-foreground">
                  জরুরি পণ্যের তালিকা ও বর্তমান পরিমাণ
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1 text-right">
              <span className="inline-flex h-7 items-center rounded-full border border-border bg-card/80 px-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                Limit {REPORT_ROW_LIMIT}
              </span>
              <span className="inline-flex h-7 items-center rounded-full border border-border bg-card/80 px-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                Filter {threshold}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            {[5, 10, 15, 20].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setThreshold(value)}
                className={`h-7 rounded-full border px-3 transition-colors ${
                  threshold === value
                    ? "bg-primary-soft text-primary border-primary/30"
                    : "border-border bg-card/80 text-muted-foreground hover:text-foreground"
                }`}
              >
                {value} এর নিচে
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border overflow-x-auto hidden md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-3 text-left text-foreground">পণ্য</th>
              <th className="p-3 text-right text-foreground">স্টক পরিমাণ</th>
              <th className="p-3 text-right text-foreground">স্ট্যাটাস</th>
            </tr>
          </thead>

          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="p-3 text-center text-muted-foreground" colSpan={3}>
                  {showEmpty ? "কম স্টকের পণ্য নেই" : "লোড হচ্ছে..."}
                </td>
              </tr>
            ) : (
              items.map((p, i) => {
                const qty = Number(p.stockQty || 0);
                const stockClasses = getStockToneClasses(qty);
                return (
                  <tr key={p.id ?? p.name ?? i} className="border-t hover:bg-muted">
                    <td className="p-3 text-foreground">{p.name}</td>
                    <td className="p-3 text-right text-foreground">{qty}</td>
                    <td className={`p-3 text-right font-semibold ${stockClasses.text}`}>
                      {renderStatus(qty)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {items.length === 0 ? (
          <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            {showEmpty ? "কম স্টকের পণ্য নেই" : "লোড হচ্ছে..."}
          </p>
        ) : (
          <>
            {items.map((p, i) => {
              const qty = Number(p.stockQty || 0);
              const stockClasses = getStockToneClasses(qty);
              return (
                <div
                  key={p.id ?? p.name ?? i}
                  className="relative overflow-hidden bg-card border border-border/70 rounded-2xl p-4 shadow-[0_10px_20px_rgba(15,23,42,0.06)]"
                >
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-warning-soft/35 via-transparent to-transparent" />
                  <div className="relative flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-warning/15 text-warning text-lg">
                        📦
                      </span>
                      <div>
                        <p className="text-xs text-muted-foreground">#{i + 1}</p>
                        <h3 className="text-base font-semibold text-foreground mt-1">
                          {p.name}
                        </h3>
                      </div>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${stockClasses.pill}`}
                    >
                      {renderStatus(qty)}
                    </span>
                  </div>
                  <div className="relative mt-3 flex items-center justify-between text-sm text-muted-foreground">
                    <span>স্টক পরিমাণ</span>
                    <span className="font-semibold text-foreground">{qty}</span>
                  </div>
                </div>
              );
            })}
            {loading && (
              <p className="text-xs text-muted-foreground text-center">
                আপডেট হচ্ছে...
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
