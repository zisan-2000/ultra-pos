"use client";

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { REPORT_ROW_LIMIT } from "@/lib/reporting-config";
import { handlePermissionError } from "@/lib/permission-toast";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";

type ValuationRow = {
  id: string;
  productId: string;
  kind: "product" | "variant";
  name: string;
  category: string;
  unit: string;
  qty: number;
  buyPrice: number;
  sellPrice: number;
  costValue: number;
  retailValue: number;
};

type Payload = {
  summary: {
    trackedItems: number;
    totalQty: number;
    costValue: number;
    retailValue: number;
    estimatedGrossValue: number;
  };
  rows: ValuationRow[];
};

type Props = { shopId: string };

function money(value: number) {
  return `${Number(value || 0).toFixed(2)} ৳`;
}

export default function StockValuationReport({ shopId }: Props) {
  const online = useOnlineStatus();

  const buildCacheKey = useCallback(
    () => `reports:stock-valuation:${shopId}:${REPORT_ROW_LIMIT}`,
    [shopId]
  );

  const readCached = useCallback(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = safeLocalStorageGet(buildCacheKey());
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return parsed as Payload;
    } catch (err) {
      handlePermissionError(err);
      console.warn("Stock valuation cache read failed", err);
      return null;
    }
  }, [buildCacheKey]);

  const fetchValuation = useCallback(async () => {
    if (!online) {
      return readCached() ?? {
        summary: {
          trackedItems: 0,
          totalQty: 0,
          costValue: 0,
          retailValue: 0,
          estimatedGrossValue: 0,
        },
        rows: [],
      };
    }

    const params = new URLSearchParams({
      shopId,
      limit: `${REPORT_ROW_LIMIT}`,
    });
    const res = await fetch(`/api/reports/stock-valuation?${params.toString()}`, {
      cache: "no-store",
    });
    if (res.status === 304) {
      return readCached();
    }
    if (!res.ok) {
      const cached = readCached();
      if (cached) return cached;
      throw new Error("Stock valuation fetch failed");
    }
    const text = await res.text();
    if (!text) return readCached();
    const json = JSON.parse(text);
    const data = json?.data as Payload;
    if (typeof window !== "undefined") {
      try {
        safeLocalStorageSet(buildCacheKey(), JSON.stringify(data));
      } catch (err) {
        handlePermissionError(err);
        console.warn("Stock valuation cache write failed", err);
      }
    }
    return data;
  }, [online, readCached, shopId, buildCacheKey]);

  const queryKey = useMemo(
    () => ["reports", "stock-valuation", shopId, REPORT_ROW_LIMIT],
    [shopId]
  );

  const initialData = useMemo(
    () =>
      online
        ? undefined
        : readCached() ?? {
            summary: {
              trackedItems: 0,
              totalQty: 0,
              costValue: 0,
              retailValue: 0,
              estimatedGrossValue: 0,
            },
            rows: [],
          },
    [online, readCached]
  );

  const query = useQuery({
    queryKey,
    queryFn: fetchValuation,
    enabled: online,
    initialData,
    staleTime: 0,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: "always",
  });

  const data = query.data ?? initialData ?? {
    summary: {
      trackedItems: 0,
      totalQty: 0,
      costValue: 0,
      retailValue: 0,
      estimatedGrossValue: 0,
    },
    rows: [],
  };

  const loading = query.isFetching && online;
  const hasFetched = query.isFetchedAfterMount;
  const showEmpty = data.rows.length === 0 && (!online || hasFetched) && !loading;
  const topRow = data.rows[0] ?? null;

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-success-soft/45 via-card to-card" />
        <div className="relative space-y-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-success/15 text-success text-lg">
                🧮
              </span>
              <div>
                <h2 className="text-lg font-bold text-foreground">স্টক ভ্যালুয়েশন</h2>
                <p className="text-xs text-muted-foreground">
                  current stock-এর buy cost আর retail value একসাথে দেখুন
                </p>
              </div>
            </div>
            <span className="inline-flex h-7 items-center rounded-full border border-border bg-card/80 px-3 text-xs font-semibold text-muted-foreground">
              Top {REPORT_ROW_LIMIT}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-2xl border border-border bg-card/90 p-3">
              <p className="text-xs text-muted-foreground">Cost Value</p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {loading && data.rows.length === 0 ? "..." : money(data.summary.costValue)}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card/90 p-3">
              <p className="text-xs text-muted-foreground">Retail Value</p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {loading && data.rows.length === 0 ? "..." : money(data.summary.retailValue)}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card/90 p-3">
              <p className="text-xs text-muted-foreground">Estimated Gross</p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {loading && data.rows.length === 0
                  ? "..."
                  : money(data.summary.estimatedGrossValue)}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card/90 p-3">
              <p className="text-xs text-muted-foreground">Tracked Rows</p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {loading && data.rows.length === 0 ? "..." : data.summary.trackedItems}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            <p>
              সহজভাবে: এটা দেখায় এখন স্টকে থাকা পণ্য কিনতে আপনার কত টাকা আটকে আছে।
              variant stock আলাদা row হিসেবে ধরা হয়, আর remnant আলাদা করে double-count করা হয় না।
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)] md:hidden">
        {showEmpty ? (
          <p className="text-sm text-muted-foreground">স্টক ভ্যালুয়েশন দেখানোর মতো tracked stock নেই।</p>
        ) : (
          <div className="space-y-3">
            {topRow ? (
              <div className="rounded-2xl border border-border bg-muted/40 p-3 text-sm">
                <p className="text-xs text-muted-foreground">সবচেয়ে বেশি cost value</p>
                <p className="mt-1 font-bold text-foreground">{topRow.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {Number(topRow.qty).toFixed(2)} {topRow.unit} · {money(topRow.costValue)}
                </p>
              </div>
            ) : null}
            {data.rows.map((row) => (
              <div key={row.id} className="rounded-2xl border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">{row.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.category} · {Number(row.qty).toFixed(2)} {row.unit}
                    </p>
                  </div>
                  <span className="rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground">
                    {row.kind === "variant" ? "ভ্যারিয়েন্ট" : "সাধারণ"}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl bg-muted/40 px-3 py-2">
                    <p className="text-muted-foreground">Buy Price</p>
                    <p className="font-semibold text-foreground">{money(row.buyPrice)}</p>
                  </div>
                  <div className="rounded-xl bg-muted/40 px-3 py-2">
                    <p className="text-muted-foreground">Cost Value</p>
                    <p className="font-semibold text-foreground">{money(row.costValue)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="hidden overflow-x-auto rounded-2xl border border-border md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-3 text-left text-foreground">পণ্য</th>
              <th className="p-3 text-left text-foreground">ক্যাটাগরি</th>
              <th className="p-3 text-right text-foreground">স্টক</th>
              <th className="p-3 text-right text-foreground">Buy Price</th>
              <th className="p-3 text-right text-foreground">Cost Value</th>
              <th className="p-3 text-right text-foreground">Retail Value</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr>
                <td className="p-3 text-center text-muted-foreground" colSpan={6}>
                  {showEmpty ? "স্টক ভ্যালুয়েশন দেখানোর মতো tracked stock নেই" : "লোড হচ্ছে..."}
                </td>
              </tr>
            ) : (
              data.rows.map((row) => (
                <tr key={row.id} className="border-t hover:bg-muted/60">
                  <td className="p-3 text-foreground">
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold">{row.name}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {row.kind === "variant" ? "ভ্যারিয়েন্ট" : "সাধারণ"}
                      </span>
                    </div>
                  </td>
                  <td className="p-3 text-muted-foreground">{row.category}</td>
                  <td className="p-3 text-right text-foreground">
                    {Number(row.qty).toFixed(2)} {row.unit}
                  </td>
                  <td className="p-3 text-right text-foreground">{money(row.buyPrice)}</td>
                  <td className="p-3 text-right font-semibold text-foreground">{money(row.costValue)}</td>
                  <td className="p-3 text-right text-muted-foreground">{money(row.retailValue)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
