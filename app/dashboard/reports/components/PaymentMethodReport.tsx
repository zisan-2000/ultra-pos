// app/dashboard/reports/components/PaymentMethodReport.tsx

"use client";

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { handlePermissionError } from "@/lib/permission-toast";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";
import { ReportEmptyState } from "./ReportEmptyState";
import { RefreshingPill } from "./Shimmer";

type PaymentRow = { name: string; value: number; count?: number };
type Props = { shopId: string; from?: string; to?: string };

export default function PaymentMethodReport({ shopId, from, to }: Props) {
  const online = useOnlineStatus();

  const buildCacheKey = useCallback(
    (rangeFrom?: string, rangeTo?: string) =>
      `reports:payment:${shopId}:${rangeFrom || "all"}:${rangeTo || "all"}`,
    [shopId]
  );

  
  const readCached = useCallback(
    (rangeFrom?: string, rangeTo?: string) => {
      if (typeof window === "undefined") return null;
      try {
        const raw = safeLocalStorageGet(buildCacheKey(rangeFrom, rangeTo));
        if (!raw) {
          return null;
        }
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as PaymentRow[]) : null;
      } catch (err) {
        handlePermissionError(err);
        console.warn("Payment report cache read failed", err);
        return null;
      }
    },
    [buildCacheKey]
  );

  const fetchPayment = useCallback(
    async (rangeFrom?: string, rangeTo?: string, fresh = false) => {
      const params = new URLSearchParams({ shopId });
      if (rangeFrom) params.append("from", rangeFrom);
      if (rangeTo) params.append("to", rangeTo);
      if (fresh) params.append("fresh", "1");
      const res = await fetch(`/api/reports/payment-method?${params.toString()}`, {
        cache: "no-store",
      });

      if (res.status === 304) {
        return readCached(rangeFrom, rangeTo) ?? [];
      }
      if (!res.ok) {
        const cached = readCached(rangeFrom, rangeTo);
        if (cached) return cached;
        throw new Error("Payment report fetch failed");
      }

      const text = await res.text();
      if (!text) {
        const cached = readCached(rangeFrom, rangeTo);
        if (cached) return cached;
        return [];
      }
      const json = JSON.parse(text);
      const rows = Array.isArray(json?.data) ? json.data : [];
      if (typeof window !== "undefined") {
        try {
          safeLocalStorageSet(
            buildCacheKey(rangeFrom, rangeTo),
            JSON.stringify(rows)
          );
        } catch (err) {
          handlePermissionError(err);
          console.warn("Payment report cache write failed", err);
        }
      }
      return rows;
    },
    [shopId, buildCacheKey, readCached]
  );

  const paymentQueryKey = useMemo(
    () => ["reports", "payment", shopId, from ?? "all", to ?? "all"],
    [shopId, from, to]
  );

  const initialRows = useMemo(() => {
    if (online) return undefined;
    return readCached(from, to) ?? undefined;
  }, [online, readCached, from, to]);
  const hasInitialRows = initialRows !== undefined;

  const paymentQuery = useQuery({
    queryKey: paymentQueryKey,
    queryFn: () => fetchPayment(from, to, true),
    enabled: online,
    staleTime: 0,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: "always",
    ...(hasInitialRows ? { initialData: initialRows } : {}),
    ...(hasInitialRows ? { placeholderData: initialRows } : {}),
  });

  const rawData: PaymentRow[] = useMemo(
    () => paymentQuery.data ?? initialRows ?? [],
    [paymentQuery.data, initialRows]
  );
  const loading = paymentQuery.isFetching && online;
  const hasFetched = paymentQuery.isFetchedAfterMount;
  const data = rawData;
  const showEmpty = data.length === 0 && (!online || hasFetched) && !loading;

  const totalAmount = useMemo(
    () => data.reduce((sum, item) => sum + Number(item.value || 0), 0),
    [data]
  );
  const showTotalPlaceholder = data.length === 0 && loading;

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-soft/50 via-card to-card" />
        <div className="relative space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary text-lg">
                💳
              </span>
              <div>
                <h2 className="text-lg font-bold text-foreground">পেমেন্ট মাধ্যম</h2>
                <p className="text-xs text-muted-foreground">শেয়ার ও পরিমাণ</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="inline-flex h-7 items-center rounded-full border border-border bg-card/80 px-3 text-muted-foreground">
              মোট: {showTotalPlaceholder ? "লোড হচ্ছে..." : `৳ ${totalAmount.toLocaleString("bn-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </span>
            <RefreshingPill visible={loading && data.length > 0} />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border/70 bg-card/80 p-2 shadow-[0_10px_20px_rgba(15,23,42,0.06)] space-y-2">
        {showEmpty ? (
          <ReportEmptyState
            icon="💳"
            title="পেমেন্ট মাধ্যমের ডাটা নেই"
            description="নির্বাচিত সময়ে কোনো recorded sale নেই, তাই payment split দেখানো যাচ্ছে না।"
            actions={[
              {
                label: "নতুন বিক্রি করুন",
                href: `/dashboard/sales/new?shopId=${shopId}`,
              },
            ]}
            size="compact"
          />
        ) : data.length === 0 ? (
          <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            লোড হচ্ছে...
          </p>
        ) : (
          <>
            {data.map((item, idx) => {
              const percent =
                totalAmount > 0
                  ? Math.round((Number(item.value || 0) / totalAmount) * 100)
                  : 0;

              return (
                <div
                  key={`${item.name}-${idx}`}
                  className="relative overflow-hidden rounded-2xl border border-primary/20 bg-card p-3 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 space-y-2"
                >
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-soft/40 via-transparent to-transparent" />
                  <div className="relative flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary text-lg">
                        💳
                      </span>
                      <div>
                        <p className="font-semibold text-foreground">
                          {item.name || "অজানা"}
                        </p>
                        {typeof item.count === "number" && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {item.count} টি লেনদেন
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-foreground tabular-nums">
                        ৳ {Number(item.value || 0).toLocaleString("bn-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {percent}% শেয়ার
                      </p>
                    </div>
                  </div>
                  <div className="relative h-2 w-full rounded-full bg-muted/70 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary via-primary-hover to-primary"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {loading && (
              <p className="text-xs text-muted-foreground text-center pt-1">
                আপডেট হচ্ছে...
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
