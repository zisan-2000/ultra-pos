// app/dashboard/reports/components/TopProductsReport.tsx

"use client";

import { useCallback, useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { REPORT_ROW_LIMIT } from "@/lib/reporting-config";
import { handlePermissionError } from "@/lib/permission-toast";

type TopProduct = { name: string; qty: number; revenue: number };

export default function TopProductsReport({ shopId }: { shopId: string }) {
  const online = useOnlineStatus();

  const buildCacheKey = useCallback(
    () => `reports:top-products:${shopId}:${REPORT_ROW_LIMIT}`,
    [shopId]
  );

  
  const readCached = useCallback(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(buildCacheKey());
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as TopProduct[]) : null;
    } catch (err) {
      handlePermissionError(err);
      console.warn("Top products cache read failed", err);
      return null;
    }
  }, [buildCacheKey]);

  const fetchTopProducts = useCallback(async () => {
    if (!online) {
      return readCached() ?? [];
    }
    const params = new URLSearchParams({
      shopId,
      limit: `${REPORT_ROW_LIMIT}`,
      fresh: "1",
    });
    const res = await fetch(`/api/reports/top-products?${params.toString()}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      const cached = readCached();
      if (cached) return cached;
      throw new Error("Top products fetch failed");
    }
    const text = await res.text();
    if (!text) {
      return readCached() ?? [];
    }
    const json = JSON.parse(text);
    const rows = Array.isArray(json?.data) ? json.data : [];
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(buildCacheKey(), JSON.stringify(rows));
      } catch (err) {
        handlePermissionError(err);
        console.warn("Top products cache write failed", err);
      }
    }
    return rows;
  }, [online, shopId, buildCacheKey, readCached]);

  const queryKey = useMemo(
    () => ["reports", "top-products", shopId, REPORT_ROW_LIMIT],
    [shopId]
  );

  const topProductsQuery = useQuery({
    queryKey,
    queryFn: fetchTopProducts,
    enabled: online,
    initialData: () => readCached() ?? [],
    placeholderData: keepPreviousData,
  });

  const data: TopProduct[] = topProductsQuery.data ?? [];
  const loading = topProductsQuery.isFetching && online;
  const hasFetched = topProductsQuery.isFetchedAfterMount;
  const showEmpty = data.length === 0 && (!online || hasFetched) && !loading;

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-soft/50 via-card to-card" />
        <div className="relative space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary text-lg">
                🏆
              </span>
              <div>
                <h2 className="text-lg font-bold text-foreground">
                  সেরা বিক্রি হওয়া পণ্য
                </h2>
                <p className="text-xs text-muted-foreground">
                  বিক্রিত সংখ্যা ও আয়ের ভিত্তিতে তালিকা
                </p>
              </div>
            </div>
            <span className="inline-flex h-7 items-center rounded-full border border-border bg-card/80 px-3 text-xs font-semibold text-muted-foreground">
              Top {REPORT_ROW_LIMIT}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border overflow-x-auto hidden md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-3 text-left text-foreground">পণ্য</th>
              <th className="p-3 text-right text-foreground">বিক্রিত সংখ্যা</th>
              <th className="p-3 text-right text-foreground">আয় (৳)</th>
            </tr>
          </thead>

          <tbody>
            {data.length === 0 ? (
              <tr>
                <td className="p-3 text-center text-muted-foreground" colSpan={3}>
                  {showEmpty ? "কোনো তথ্য পাওয়া যায়নি" : "লোড হচ্ছে..."}
                </td>
              </tr>
            ) : (
              data.map((item, idx) => (
                <tr
                  key={idx}
                  className="border-t hover:bg-muted transition-colors"
                >
                  <td className="p-3 text-foreground">{item.name}</td>
                  <td className="p-3 text-right text-foreground">{item.qty}</td>
                  <td className="p-3 text-right text-foreground">
                    {Number(item.revenue || 0).toFixed(2)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {data.length === 0 ? (
          <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            {showEmpty ? "কোনো তথ্য পাওয়া যায়নি" : "লোড হচ্ছে..."}
          </p>
        ) : (
          data.map((item, idx) => (
            <div
              key={idx}
              className="relative overflow-hidden bg-card border border-border/70 rounded-2xl p-4 shadow-[0_10px_20px_rgba(15,23,42,0.06)]"
            >
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-soft/35 via-transparent to-transparent" />
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/15 text-primary text-lg">
                    🏆
                  </span>
                  <div>
                    <p className="text-xs text-muted-foreground">#{idx + 1}</p>
                    <h3 className="text-base font-semibold text-foreground mt-1">
                      {item.name}
                    </h3>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">বিক্রিত</p>
                  <p className="text-lg font-semibold text-foreground">
                    {item.qty}
                  </p>
                </div>
              </div>
              <div className="relative mt-3 flex items-center justify-between text-sm text-muted-foreground">
                <span>আয়</span>
                <span className="font-semibold text-foreground">
                  {Number(item.revenue || 0).toFixed(2)} ৳
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
