// app/dashboard/reports/components/TopProductsReport.tsx

"use client";

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { REPORT_ROW_LIMIT } from "@/lib/reporting-config";
import { handlePermissionError } from "@/lib/permission-toast";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";
import { ReportEmptyState } from "./ReportEmptyState";
import { RefreshingPill } from "./Shimmer";
import { ReportControls, SortableHeader } from "./ReportControls";
import { useNamespacedReportState } from "./report-url-state";

type TopProduct = { name: string; qty: number; revenue: number };
type Props = { shopId: string; from?: string; to?: string };

const TOP_PRODUCTS_FILTER_DEFAULTS: Record<"q" | "sort" | "dir", string> = {
  q: "",
  sort: "revenue",
  dir: "desc",
};

function formatMoney(value: number) {
  return `৳ ${value.toLocaleString("bn-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function TopProductsReport({ shopId, from, to }: Props) {
  const online = useOnlineStatus();
  const {
    values: filters,
    setValue: setFilter,
    reset: resetFilters,
    activeCount,
  } = useNamespacedReportState("products", TOP_PRODUCTS_FILTER_DEFAULTS);
  const sortDirection = filters.dir === "asc" ? "asc" : "desc";

  const buildCacheKey = useCallback(
    (rangeFrom?: string, rangeTo?: string) =>
      `reports:top-products:${shopId}:${rangeFrom || "all"}:${rangeTo || "all"}:${REPORT_ROW_LIMIT}`,
    [shopId]
  );

  
  const readCached = useCallback((rangeFrom?: string, rangeTo?: string) => {
    if (typeof window === "undefined") return null;
    try {
      const raw = safeLocalStorageGet(buildCacheKey(rangeFrom, rangeTo));
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
      return readCached(from, to) ?? [];
    }
    const params = new URLSearchParams({
      shopId,
      limit: `${REPORT_ROW_LIMIT}`,
    });
    if (from) params.append("from", from);
    if (to) params.append("to", to);
    params.append("fresh", "1");
    const res = await fetch(`/api/reports/top-products?${params.toString()}`, {
      cache: "no-store",
    });
    if (res.status === 304) {
      return readCached(from, to) ?? [];
    }
    if (!res.ok) {
      const cached = readCached(from, to);
      if (cached) return cached;
      throw new Error("Top products fetch failed");
    }
    const text = await res.text();
    if (!text) {
      return readCached(from, to) ?? [];
    }
    const json = JSON.parse(text);
    const rows = Array.isArray(json?.data) ? json.data : [];
    if (typeof window !== "undefined") {
      try {
        safeLocalStorageSet(buildCacheKey(from, to), JSON.stringify(rows));
      } catch (err) {
        handlePermissionError(err);
        console.warn("Top products cache write failed", err);
      }
    }
    return rows;
  }, [online, shopId, buildCacheKey, readCached, from, to]);

  const queryKey = useMemo(
    () => ["reports", "top-products", shopId, from ?? "all", to ?? "all", REPORT_ROW_LIMIT],
    [shopId, from, to]
  );

  const initialRows = useMemo(
    () => (online ? [] : (readCached(from, to) ?? [])),
    [online, readCached, from, to]
  );

  const topProductsQuery = useQuery({
    queryKey,
    queryFn: fetchTopProducts,
    enabled: online,
    initialData: initialRows,
    staleTime: 0,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: "always",
  });

  const rawData: TopProduct[] = topProductsQuery.data ?? initialRows;
  const data: TopProduct[] = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const rows = q
      ? rawData.filter((row) => row.name.toLowerCase().includes(q))
      : [...rawData];
    const dir = sortDirection === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      if (filters.sort === "qty") return (Number(a.qty || 0) - Number(b.qty || 0)) * dir;
      if (filters.sort === "name") return a.name.localeCompare(b.name) * dir;
      return (Number(a.revenue || 0) - Number(b.revenue || 0)) * dir;
    });
    return rows;
  }, [filters.q, filters.sort, rawData, sortDirection]);
  const loading = topProductsQuery.isFetching && online;
  const hasFetched = topProductsQuery.isFetchedAfterMount;
  const showEmpty = data.length === 0 && (!online || hasFetched) && !loading;
  const showSummaryPlaceholder = loading && data.length === 0;
  const totals = useMemo(
    () =>
      data.reduce(
        (sum, item) => ({
          qty: sum.qty + Number(item.qty || 0),
          revenue: sum.revenue + Number(item.revenue || 0),
        }),
        { qty: 0, revenue: 0 }
      ),
    [data]
  );
  const topProduct = data[0] ?? null;
  const changeSort = (field: "revenue" | "qty" | "name") => {
    if (filters.sort === field) {
      setFilter("dir", sortDirection === "asc" ? "desc" : "asc");
      return;
    }
    setFilter("sort", field);
  };

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-soft/50 via-card to-card" />
        <div className="relative space-y-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary text-lg">
                🏆
              </span>
              <div>
                <h2 className="text-lg font-bold text-foreground">
                  সেরা বিক্রি হওয়া পণ্য
                </h2>
                <p className="text-xs text-muted-foreground">
                  নির্বাচিত সময়ের বিক্রি থেকে কোন পণ্য সবচেয়ে বেশি গেছে ও সবচেয়ে বেশি টাকা এনেছে
                </p>
              </div>
            </div>
            <span className="inline-flex h-7 items-center rounded-full border border-border bg-card/80 px-3 text-xs font-semibold text-muted-foreground">
              Top {REPORT_ROW_LIMIT}
            </span>
          </div>
          <RefreshingPill visible={loading && data.length > 0} />

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card/90 p-3">
              <p className="text-xs text-muted-foreground">সবচেয়ে এগিয়ে</p>
              <p className="mt-1 text-sm font-bold text-foreground">
                {topProduct?.name ||
                  (showSummaryPlaceholder ? "লোড হচ্ছে..." : "তথ্য নেই")}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {topProduct
                  ? `${topProduct.qty} টি · ${formatMoney(Number(topProduct.revenue || 0))}`
                  : "দেখানো তালিকার ১ নম্বর পণ্য"}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card/90 p-3">
              <p className="text-xs text-muted-foreground">মোট বিক্রিত সংখ্যা</p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {showSummaryPlaceholder ? "..." : totals.qty}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                দেখানো Top {REPORT_ROW_LIMIT} পণ্যের মোট
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card/90 p-3 col-span-2 lg:col-span-1">
              <p className="text-xs text-muted-foreground">মোট বিক্রি টাকা</p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {showSummaryPlaceholder ? "..." : formatMoney(totals.revenue)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                দেখানো Top {REPORT_ROW_LIMIT} পণ্য থেকে এসেছে
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            <p>
              সহজভাবে: উপরের ১ নম্বর পণ্যটি সবচেয়ে বেশি বিক্রি হয়েছে। নিচের তালিকায়
              প্রতি পণ্যের <span className="font-semibold text-foreground">কতটি বিক্রি হয়েছে</span> এবং
              <span className="font-semibold text-foreground"> কত টাকা এসেছে</span> তা দেখানো হচ্ছে।
            </p>
          </div>
        </div>
      </div>

      {showEmpty ? (
        <div className="rounded-2xl border border-border bg-card">
          <ReportEmptyState
            icon="🏆"
            title="Top products দেখানোর মতো sale data নেই"
            description="নির্বাচিত সময়ে কোনো sale item record পাওয়া যায়নি। নতুন বিক্রি করুন বা সময়সীমা বদলে দেখুন।"
            actions={[
              {
                label: "নতুন বিক্রি করুন",
                href: `/dashboard/sales/new?shopId=${shopId}`,
              },
            ]}
          />
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <ReportControls
              searchValue={filters.q}
              searchPlaceholder="পণ্য খুঁজুন..."
              onSearchChange={(value) => setFilter("q", value)}
              sortValue={filters.sort}
              sortDirection={sortDirection}
              sortOptions={[
                { label: "বিক্রি টাকা অনুযায়ী", value: "revenue" },
                { label: "সংখ্যা অনুযায়ী", value: "qty" },
                { label: "নাম অনুযায়ী", value: "name" },
              ]}
              onSortChange={(value) => setFilter("sort", value)}
              onSortDirectionChange={(value) => setFilter("dir", value)}
              onClear={resetFilters}
              activeCount={activeCount}
            />
          </div>

          <div className="rounded-2xl border border-border overflow-x-auto hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="p-3 text-left text-foreground">র্যাঙ্ক</th>
                  <th className="p-3 text-left text-foreground">
                    <SortableHeader
                      label="পণ্য"
                      active={filters.sort === "name"}
                      direction={sortDirection}
                      onClick={() => changeSort("name")}
                    />
                  </th>
                  <th className="p-3 text-right text-foreground">
                    <SortableHeader
                      label="বিক্রিত সংখ্যা"
                      active={filters.sort === "qty"}
                      direction={sortDirection}
                      align="right"
                      onClick={() => changeSort("qty")}
                    />
                  </th>
                  <th className="p-3 text-right text-foreground">
                    <SortableHeader
                      label="মোট বিক্রি টাকা"
                      active={filters.sort === "revenue"}
                      direction={sortDirection}
                      align="right"
                      onClick={() => changeSort("revenue")}
                    />
                  </th>
                </tr>
              </thead>

              <tbody>
                {data.length === 0 ? (
                  <tr>
                    <td className="p-3 text-center text-muted-foreground" colSpan={4}>
                      লোড হচ্ছে...
                    </td>
                  </tr>
                ) : (
                  data.map((item, idx) => (
                    <tr
                      key={idx}
                      className="border-t hover:bg-muted transition-colors"
                    >
                      <td className="p-3 text-foreground">
                        <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-primary/10 px-2 text-xs font-semibold text-primary">
                          #{idx + 1}
                        </span>
                      </td>
                      <td className="p-3 text-foreground">{item.name}</td>
                      <td className="p-3 text-right text-foreground">{item.qty}</td>
                      <td className="p-3 text-right text-foreground tabular-nums">
                        {formatMoney(Number(item.revenue || 0))}
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
                  লোড হচ্ছে...
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
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary text-lg">
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
                    <span className="font-semibold text-foreground tabular-nums">
                      {formatMoney(Number(item.revenue || 0))}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
