// app/dashboard/reports/components/LowStockReport.tsx

"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { REPORT_ROW_LIMIT } from "@/lib/reporting-config";
import { getStockToneClasses } from "@/lib/stock-level";
import { handlePermissionError } from "@/lib/permission-toast";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";
import { ReportEmptyState } from "./ReportEmptyState";
import { RefreshingPill } from "./Shimmer";
import { ReportControls, SortableHeader } from "./ReportControls";
import { useNamespacedReportState } from "./report-url-state";

type StockRow = { id?: string; name: string; stockQty: number };

type Props = {
  shopId: string;
  threshold?: number;
  onThresholdChange?: (value: number) => void;
};

const LOW_STOCK_FILTER_DEFAULTS: Record<"q" | "sort" | "dir", string> = {
  q: "",
  sort: "stock",
  dir: "asc",
};

export default function LowStockReport({
  shopId,
  threshold: thresholdProp,
  onThresholdChange,
}: Props) {
  const online = useOnlineStatus();
  const {
    values: filters,
    setValue: setFilter,
    reset: resetFilters,
    activeCount,
  } = useNamespacedReportState("stock", LOW_STOCK_FILTER_DEFAULTS);
  const sortDirection = filters.dir === "desc" ? "desc" : "asc";
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
    params.append("fresh", "1");
    const res = await fetch(`/api/reports/low-stock?${params.toString()}`, {
      cache: "no-store",
    });
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

  const initialRows = useMemo(
    () => (online ? [] : (readCached() ?? [])),
    [online, readCached]
  );

  const lowStockQuery = useQuery({
    queryKey,
    queryFn: fetchLowStock,
    enabled: online,
    initialData: initialRows,
    staleTime: 0,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: "always",
  });

  const rawItems: StockRow[] = lowStockQuery.data ?? initialRows;
  const items: StockRow[] = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const rows = q
      ? rawItems.filter((row) => row.name.toLowerCase().includes(q))
      : [...rawItems];
    const dir = sortDirection === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      if (filters.sort === "name") return a.name.localeCompare(b.name) * dir;
      return (Number(a.stockQty || 0) - Number(b.stockQty || 0)) * dir;
    });
    return rows;
  }, [filters.q, filters.sort, rawItems, sortDirection]);
  const loading = lowStockQuery.isFetching && online;
  const hasFetched = lowStockQuery.isFetchedAfterMount;
  const showEmpty = items.length === 0 && (!online || hasFetched) && !loading;
  const urgentCount = useMemo(
    () => items.filter((item) => Number(item.stockQty || 0) <= 5).length,
    [items]
  );
  const lowestStockItem = items[0] ?? null;
  const showSummaryPlaceholder = loading && items.length === 0;

  // Items in this list are always low — never show green "ok" tone.
  // qty > 5 maps to the "warning" (yellow) band, not "ok" (green).
  const getLowStockToneClasses = (qty: number) => {
    if (qty <= 0) return getStockToneClasses(0);   // danger (red)
    if (qty <= 5) return getStockToneClasses(qty); // warning-strong or warning
    return getStockToneClasses(5);                  // warning (yellow), never green
  };

  const renderStatus = (qty: number) => {
    if (qty <= 0) return "শেষ";
    if (qty <= 5) return "জরুরি";
    return "কম";
  };
  const changeSort = (field: "stock" | "name") => {
    if (filters.sort === field) {
      setFilter("dir", sortDirection === "asc" ? "desc" : "asc");
      return;
    }
    setFilter("sort", field);
  };

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-warning-soft/50 via-card to-card" />
        <div className="relative space-y-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-warning/15 text-warning text-lg">
                📦
              </span>
              <div>
                <h2 className="text-lg font-bold text-foreground">কম স্টক</h2>
                <p className="text-xs text-muted-foreground">
                  যেসব পণ্যের স্টক কমে গেছে, সেগুলো দ্রুত কেনার জন্য এই তালিকা দেখুন
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

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card/90 p-3">
              <p className="text-xs text-muted-foreground">মোট কম স্টক পণ্য</p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {showSummaryPlaceholder ? "..." : items.length}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                বর্তমান filter অনুযায়ী
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card/90 p-3">
              <p className="text-xs text-muted-foreground">জরুরি পণ্য</p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {showSummaryPlaceholder ? "..." : urgentCount}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                ৫ বা তার কম স্টক
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card/90 p-3 col-span-2 lg:col-span-1">
              <p className="text-xs text-muted-foreground">সবচেয়ে কম স্টক</p>
              <p className="mt-1 text-sm font-bold text-foreground">
                {lowestStockItem?.name ||
                  (showSummaryPlaceholder ? "লোড হচ্ছে..." : "তথ্য নেই")}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {lowestStockItem
                  ? `বর্তমান স্টক ${Number(lowestStockItem.stockQty || 0)}`
                  : "তালিকার শুরুর পণ্য"}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            <p>
              সহজভাবে: যেসব পণ্যের স্টক কম, সেগুলো আগে কিনুন।{" "}
              <span className="font-semibold text-foreground">জরুরি</span> মানে এখনই
              ব্যবস্থা নেওয়া দরকার, আর <span className="font-semibold text-foreground">কম</span> মানে
              খুব শিগগির রিস্টক করা ভালো।
            </p>
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
            <RefreshingPill visible={loading && items.length > 0} />
          </div>
        </div>
      </div>

      {showEmpty ? (
        <div className="rounded-2xl border border-border bg-card">
          <ReportEmptyState
            icon="📦"
            title="কম স্টকের পণ্য নেই"
            description="বর্তমান threshold অনুযায়ী কোনো পণ্য alert level-এ নেই। threshold বাড়িয়ে দেখুন বা পণ্য তালিকা খুলুন।"
            actions={[
              {
                label: "পণ্য তালিকা খুলুন",
                href: `/dashboard/products?shopId=${shopId}`,
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
                { label: "স্টক অনুযায়ী", value: "stock" },
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
                      label="স্টক পরিমাণ"
                      active={filters.sort === "stock"}
                      direction={sortDirection}
                      align="right"
                      onClick={() => changeSort("stock")}
                    />
                  </th>
                  <th className="p-3 text-right text-foreground">স্ট্যাটাস</th>
                </tr>
              </thead>

              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td className="p-3 text-center text-muted-foreground" colSpan={4}>
                      লোড হচ্ছে...
                    </td>
                  </tr>
                ) : (
                  items.map((p, i) => {
                    const qty = Number(p.stockQty || 0);
                    const stockClasses = getLowStockToneClasses(qty);
                    return (
                      <tr key={p.id ? `${p.id}-${i}` : (p.name ?? i)} className="border-t hover:bg-muted/30 transition-colors">
                        <td className="p-3 text-foreground">
                          <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-warning/10 px-2 text-xs font-semibold text-warning">
                            #{i + 1}
                          </span>
                        </td>
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
                  লোড হচ্ছে...
              </p>
            ) : (
              items.map((p, i) => {
                const qty = Number(p.stockQty || 0);
                const stockClasses = getLowStockToneClasses(qty);
                return (
                <div
                  key={p.id ? `${p.id}-${i}` : (p.name ?? i)}
                  className="relative overflow-hidden bg-card border border-border/70 rounded-2xl p-4 shadow-[0_10px_20px_rgba(15,23,42,0.06)]"
                >
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-warning-soft/35 via-transparent to-transparent" />
                  <div className="relative flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-warning/15 text-warning text-lg">
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
              })
            )}
            {loading && (
              <p className="text-xs text-muted-foreground text-center">
                আপডেট হচ্ছে...
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
