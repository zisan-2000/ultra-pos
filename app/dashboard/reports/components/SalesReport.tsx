// app/dashboard/reports/components/SalesReport.tsx

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { REPORT_ROW_LIMIT } from "@/lib/reporting-config";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";
import {
  SalesTrendChart,
  PaymentMethodDonut,
  type DailyRow,
  type PaymentSlice,
} from "./charts/ReportCharts";
import { RefreshingPill, TableShimmer } from "./Shimmer";
import { ReportEmptyState } from "./ReportEmptyState";
import { LoadMoreButton } from "./LoadMoreButton";
import { ReportControls, SortableHeader } from "./ReportControls";
import { useNamespacedReportState } from "./report-url-state";

type Props = { shopId: string; from?: string; to?: string };

type ReportCursor = { at: string; id: string; value?: string | null };
type SummaryPayload = {
  sales: {
    totalAmount: number;
    discountAmount?: number;
    taxAmount?: number;
    completedCount?: number;
    voidedCount?: number;
    count?: number;
  };
};
type SalesRow = {
  id: string;
  invoiceNo?: string | null;
  totalAmount: number | string;
  paidAmount?: number | string | null;
  discountAmount?: number | string | null;
  status?: string | null;
  paymentMethod?: string | null;
  saleDate: string;
  note?: string | null;
  customer?: { name?: string | null; phone?: string | null } | null;
  _count?: { saleItems?: number };
};

const SALES_FILTER_DEFAULTS: Record<"q" | "payment" | "status" | "sort" | "dir", string> = {
  q: "",
  payment: "all",
  status: "all",
  sort: "date",
  dir: "desc",
};

function scheduleStateUpdate(fn: () => void) {
  if (typeof queueMicrotask === "function") { queueMicrotask(fn); return; }
  Promise.resolve().then(fn);
}

function formatMoney(value: number) {
  return `৳ ${value.toLocaleString("bn-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("bn-BD", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

const PAYMENT_CONFIG: Record<string, { label: string; cls: string; bar: string }> = {
  cash:          { label: "ক্যাশ",          cls: "bg-emerald-500/15 text-emerald-700 border-emerald-300/60 dark:text-emerald-400", bar: "bg-emerald-500" },
  bkash:         { label: "বিকাশ",          cls: "bg-sky-500/15 text-sky-700 border-sky-300/60 dark:text-sky-400",                 bar: "bg-sky-500" },
  nagad:         { label: "নগদ",            cls: "bg-sky-500/15 text-sky-700 border-sky-300/60 dark:text-sky-400",                 bar: "bg-sky-400" },
  নগদ:           { label: "নগদ",            cls: "bg-sky-500/15 text-sky-700 border-sky-300/60 dark:text-sky-400",                 bar: "bg-sky-400" },
  card:          { label: "কার্ড",          cls: "bg-violet-500/15 text-violet-700 border-violet-300/60 dark:text-violet-400",     bar: "bg-violet-500" },
  bank_transfer: { label: "ব্যাংক",         cls: "bg-violet-500/15 text-violet-700 border-violet-300/60 dark:text-violet-400",     bar: "bg-violet-400" },
  due:           { label: "ধার",            cls: "bg-amber-500/15 text-amber-700 border-amber-300/60 dark:text-amber-400",         bar: "bg-amber-500" },
};

function getPaymentCfg(method?: string | null) {
  return PAYMENT_CONFIG[(method || "cash").toLowerCase()] ?? { label: method ?? "ক্যাশ", cls: "bg-muted text-foreground border-border", bar: "bg-muted-foreground" };
}

// Hex colors for the donut chart — keep in sync with PAYMENT_CONFIG visually.
const PAYMENT_SLICE_COLORS: Record<string, string> = {
  cash: "#10b981",
  bkash: "#ec4899",
  nagad: "#f97316",
  card: "#8b5cf6",
  bank_transfer: "#8b5cf6",
  due: "#f59e0b",
};

function paymentSliceColor(method: string) {
  return PAYMENT_SLICE_COLORS[method.toLowerCase()] ?? "#94a3b8";
}

function getBillTitle(row: SalesRow) {
  return row.invoiceNo?.trim() || "সরাসরি বিক্রি";
}

export default function SalesReport({ shopId, from, to }: Props) {
  const online = useOnlineStatus();
  const {
    values: filters,
    setValue: setFilter,
    reset: resetFilters,
    activeCount,
  } = useNamespacedReportState("sales", SALES_FILTER_DEFAULTS);
  const sortBy = filters.sort === "amount" ? "amount" : "date";
  const sortDirection = filters.dir === "asc" ? "asc" : "desc";
  const filterSignature = `${filters.q}|${filters.payment}|${filters.status}|${sortBy}|${sortDirection}`;

  const buildCacheKey = useCallback(
    (f?: string, t?: string) =>
      `reports:sales:${shopId}:${f || "all"}:${t || "all"}:${REPORT_ROW_LIMIT}:${filterSignature}`,
    [filterSignature, shopId]
  );

  const readCached = useCallback((f?: string, t?: string) => {
    try {
      const raw = safeLocalStorageGet(buildCacheKey(f, t));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch { return null; }
  }, [buildCacheKey]);

  const fetchSales = useCallback(async (f?: string, t?: string, cursor?: ReportCursor | null, shouldCache = false) => {
    const params = new URLSearchParams({ shopId, limit: `${REPORT_ROW_LIMIT}` });
    if (f) params.append("from", f);
    if (t) params.append("to", t);
    if (filters.q.trim()) params.append("q", filters.q.trim());
    if (filters.payment !== "all") params.append("payment", filters.payment);
    if (filters.status !== "all") params.append("status", filters.status);
    params.append("sort", sortBy);
    params.append("dir", sortDirection);
    if (cursor) {
      params.append("cursorAt", cursor.at);
      params.append("cursorId", cursor.id);
      if (cursor.value != null) params.append("cursorValue", cursor.value);
    }
    const res = await fetch(`/api/reports/sales?${params}`, { cache: "no-store" });
    if (res.status === 304) {
      const cached = readCached(f, t);
      if (cached && !cursor) return { rows: cached, hasMore: false, nextCursor: null };
      throw new Error("not modified");
    }
    if (!res.ok) {
      const cached = readCached(f, t);
      if (cached && !cursor) return { rows: cached, hasMore: false, nextCursor: null };
      throw new Error("fetch failed");
    }
    const data = await res.json();
    const rows = data.rows || [];
    if (shouldCache && !cursor) {
      try { safeLocalStorageSet(buildCacheKey(f, t), JSON.stringify(rows)); } catch { /* ignore */ }
    }
    return { rows, hasMore: Boolean(data.hasMore), nextCursor: data.nextCursor ?? null };
  }, [shopId, filters.q, filters.payment, filters.status, sortBy, sortDirection, buildCacheKey, readCached]);

  const fetchSummary = useCallback(async () => {
    const params = new URLSearchParams({ shopId });
    if (from) params.append("from", from);
    if (to) params.append("to", to);
    params.append("fresh", "1");
    const res = await fetch(`/api/reports/summary?${params}`, { cache: "no-store" });
    if (!res.ok) throw new Error("summary fetch failed");
    return (await res.json()) as SummaryPayload;
  }, [shopId, from, to]);

  const summaryQuery = useQuery({
    queryKey: ["reports", "summary", shopId, from ?? "all", to ?? "all"],
    queryFn: fetchSummary,
    enabled: online,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    staleTime: 15_000,
  });

  const initialSalesPage = useMemo(() => {
    if (online) return undefined;
    const cached = readCached(from, to);
    return {
      pages: [
        cached
          ? { rows: cached, hasMore: false, nextCursor: null }
          : { rows: [], hasMore: false, nextCursor: null },
      ],
      pageParams: [null as ReportCursor | null],
    };
  }, [online, readCached, from, to]);

  const salesQuery = useInfiniteQuery({
    queryKey: [
      "reports",
      "sales",
      shopId,
      from ?? "all",
      to ?? "all",
      filters.q,
      filters.payment,
      filters.status,
      sortBy,
      sortDirection,
    ],
    queryFn: ({ pageParam }) => fetchSales(from, to, pageParam, pageParam == null),
    enabled: online,
    initialPageParam: null as ReportCursor | null,
    ...(initialSalesPage ? { initialData: initialSalesPage } : {}),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined,
    staleTime: 0,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: "always",
  });

  const loading = salesQuery.isFetching && online;
  const hasMore = Boolean(salesQuery.hasNextPage);
  const items: SalesRow[] = useMemo(() => {
    const seen = new Set<string>();
    const merged: SalesRow[] = [];
    for (const page of salesQuery.data?.pages ?? []) {
      for (const row of page.rows as SalesRow[]) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        merged.push(row);
      }
    }
    return merged;
  }, [salesQuery.data]);
  const showEmpty =
    items.length === 0 &&
    (!online || salesQuery.isFetchedAfterMount) &&
    !loading;

  const summaryData = summaryQuery.data;
  const totalAmount   = Number(summaryData?.sales?.totalAmount ?? 0);
  const completedCount = Number(summaryData?.sales?.completedCount ?? summaryData?.sales?.count ?? 0);
  const voidedCount   = Number(summaryData?.sales?.voidedCount ?? 0);
  const discountAmount = Number(summaryData?.sales?.discountAmount ?? 0);
  const averageBill   = completedCount ? totalAmount / completedCount : 0;

  // Payment breakdown from visible rows
  const paymentBreakdown = useMemo(() => {
    const map = new Map<string, { key: string; count: number; total: number }>();
    for (const s of items) {
      const key = (s.paymentMethod || "cash").toLowerCase();
      const cur = map.get(key) ?? { key, count: 0, total: 0 };
      cur.count += 1;
      cur.total += Number(s.totalAmount || 0);
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [items]);

  // Daily totals from visible rows, used for the trend bar chart.
  // Falls back to "this page only" data — we surface that as caption text.
  const dailyTrend = useMemo<DailyRow[]>(() => {
    const buckets = new Map<string, number>();
    for (const s of items) {
      if (s.status === "VOIDED") continue;
      const date = new Date(s.saleDate);
      if (Number.isNaN(date.getTime())) continue;
      const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      buckets.set(ymd, (buckets.get(ymd) ?? 0) + Number(s.totalAmount || 0));
    }
    return Array.from(buckets.entries())
      .map(([date, total]) => ({ date, total }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [items]);

  const paymentSlices = useMemo<PaymentSlice[]>(
    () =>
      paymentBreakdown.map((m) => {
        const cfg = getPaymentCfg(m.key);
        return {
          key: m.key,
          label: cfg.label,
          total: m.total,
          color: paymentSliceColor(m.key),
        };
      }),
    [paymentBreakdown]
  );

  const shownTotal = useMemo(() => items.reduce((s, r) => s + Number(r.totalAmount || 0), 0), [items]);

  const handleLoadMore = () => {
    if (!salesQuery.hasNextPage || salesQuery.isFetchingNextPage) return;
    salesQuery.fetchNextPage();
  };

  const buildHref = () => {
    const params = new URLSearchParams({ shopId });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return `/dashboard/sales?${params}`;
  };

  const changeSort = (field: "date" | "amount") => {
    if (sortBy === field) {
      setFilter("dir", sortDirection === "asc" ? "desc" : "asc");
      return;
    }
    setFilter("sort", field);
  };

  return (
    <div className="space-y-4">

      {/* ── KPI Row ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Hero stat */}
        <div className="col-span-2 sm:col-span-1 rounded-2xl border border-emerald-200/60 dark:border-emerald-800/40 bg-emerald-50/60 dark:bg-emerald-950/20 p-4">
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">মোট বিক্রি</p>
          <p className="mt-1 text-2xl font-bold text-emerald-800 dark:text-emerald-300 tabular-nums">
            {summaryData ? formatMoney(totalAmount) : <span className="text-muted-foreground text-lg">লোড হচ্ছে...</span>}
          </p>
          <p className="mt-1 text-xs text-emerald-600/80 dark:text-emerald-500">
            {completedCount} টি সম্পন্ন বিল
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">গড় বিল</p>
          <p className="mt-1 text-xl font-bold text-foreground tabular-nums">
            {summaryData ? formatMoney(averageBill) : "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">প্রতি বিলে গড়ে</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">মোট ছাড়</p>
          <p className="mt-1 text-xl font-bold text-foreground tabular-nums">
            {summaryData ? formatMoney(discountAmount) : "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">discount মোট</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">বাতিল বিল</p>
          <p className={`mt-1 text-xl font-bold tabular-nums ${voidedCount > 0 ? "text-danger" : "text-foreground"}`}>
            {summaryData ? voidedCount : "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">void হয়েছে</p>
        </div>
      </div>

      {/* ── Visualisations ───────────────────────────────────── */}
      {items.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <SalesTrendChart
            data={dailyTrend}
            loading={loading && items.length === 0}
            caption="এই তালিকার বিলগুলো অনুযায়ী"
          />
          {paymentSlices.length > 0 ? (
            <PaymentMethodDonut data={paymentSlices} loading={loading && items.length === 0} />
          ) : null}
        </div>
      )}

      {/* ── Bill List ────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <div>
            <p className="text-sm font-semibold text-foreground">বিলের তালিকা</p>
            <p className="text-xs text-muted-foreground">
              সর্বশেষ বিলগুলো দেখানো হচ্ছে, দরকার হলে আরও লোড করুন
            </p>
          </div>
          <div className="flex items-center gap-2">
            <RefreshingPill visible={loading} />
            <Link
              href={buildHref()}
              className="inline-flex h-7 items-center rounded-full border border-primary/25 bg-primary-soft px-3 text-xs font-semibold text-primary hover:bg-primary/15 transition"
            >
              সব দেখুন →
            </Link>
          </div>
        </div>

        <ReportControls
          searchValue={filters.q}
          searchPlaceholder="বিল, গ্রাহক, ফোন বা নোট খুঁজুন..."
          onSearchChange={(value) => setFilter("q", value)}
          filters={[
            {
              label: "পেমেন্ট",
              value: filters.payment,
              onChange: (value) => setFilter("payment", value),
              options: [
                { label: "সব পেমেন্ট", value: "all" },
                { label: "ক্যাশ", value: "cash" },
                { label: "বিকাশ", value: "bkash" },
                { label: "নগদ", value: "nagad" },
                { label: "কার্ড", value: "card" },
                { label: "ব্যাংক", value: "bank_transfer" },
                { label: "ধার", value: "due" },
              ],
            },
            {
              label: "অবস্থা",
              value: filters.status,
              onChange: (value) => setFilter("status", value),
              options: [
                { label: "সব অবস্থা", value: "all" },
                { label: "পরিশোধিত", value: "paid" },
                { label: "বাকি", value: "due" },
              ],
            },
          ]}
          sortValue={sortBy}
          sortDirection={sortDirection}
          sortOptions={[
            { label: "তারিখ অনুযায়ী", value: "date" },
            { label: "টাকা অনুযায়ী", value: "amount" },
          ]}
          onSortChange={(value) => setFilter("sort", value)}
          onSortDirectionChange={(value) => setFilter("dir", value)}
          onClear={resetFilters}
          activeCount={activeCount}
        />

        {showEmpty ? (
          <ReportEmptyState
            icon="🧾"
            title="এই সময়ে কোনো বিক্রি নেই"
            description="নির্বাচিত সময়ে এখনো কোনো completed bill নেই। নতুন sale করুন বা সময়সীমা বদলে দেখুন।"
            actions={[
              {
                label: "নতুন বিক্রি করুন",
                href: `/dashboard/sales/new?shopId=${shopId}`,
              },
              {
                label: "সব বিক্রি খুলুন",
                href: buildHref(),
                variant: "secondary",
              },
            ]}
          />
        ) : items.length === 0 && loading ? (
          <TableShimmer rows={5} cols={5} />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">
                      <SortableHeader
                        label="বিল · সময়"
                        active={sortBy === "date"}
                        direction={sortDirection}
                        onClick={() => changeSort("date")}
                      />
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">গ্রাহক</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">পেমেন্ট</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">ছাড়</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">অবস্থা</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">
                      <SortableHeader
                        label="মোট টাকা"
                        active={sortBy === "amount"}
                        direction={sortDirection}
                        align="right"
                        onClick={() => changeSort("amount")}
                      />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((s) => {
                    const cfg = getPaymentCfg(s.paymentMethod);
                    const total = Number(s.totalAmount || 0);
                    const paid = Number(s.paidAmount ?? total);
                    const discount = Number(s.discountAmount || 0);
                    const dueRemaining = s.paymentMethod?.toLowerCase() === "due" ? total - paid : 0;
                    const isVoided = s.status === "VOIDED";
                    return (
                      <tr key={s.id} className={`hover:bg-muted/30 transition-colors ${isVoided ? "opacity-50" : ""}`}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-foreground">{getBillTitle(s)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{formatTime(s.saleDate)}</p>
                          {s.note?.trim() ? (
                            <p className="text-xs text-muted-foreground truncate max-w-40 mt-0.5 italic">{s.note}</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          {s.customer?.name ? (
                            <div>
                              <p className="text-sm text-foreground">{s.customer.name}</p>
                              {s.customer.phone ? (
                                <p className="text-xs text-muted-foreground">{s.customer.phone}</p>
                              ) : null}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">—</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.cls}`}>
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {discount > 0 ? (
                            <span className="text-xs font-semibold text-danger">
                              -{formatMoney(discount)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isVoided ? (
                            <span className="inline-flex rounded-full border border-danger/30 bg-danger/10 px-2.5 py-0.5 text-xs font-semibold text-danger">
                              বাতিল
                            </span>
                          ) : dueRemaining > 0 ? (
                            <span className="inline-flex rounded-full border border-amber-300/60 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                              বাকি {formatMoney(dueRemaining)}
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full border border-emerald-300/60 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                              সম্পন্ন
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-foreground tabular-nums whitespace-nowrap">
                          {formatMoney(total)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/20">
                    <td colSpan={5} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                      এখন দেখানো মোট ({items.length} টি বিল)
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-foreground tabular-nums">
                      {formatMoney(shownTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Mobile list */}
            <div className="md:hidden divide-y divide-border">
              {items.map((s) => {
                const cfg = getPaymentCfg(s.paymentMethod);
                const total = Number(s.totalAmount || 0);
                const paid = Number(s.paidAmount ?? total);
                const discount = Number(s.discountAmount || 0);
                const dueRemaining = s.paymentMethod?.toLowerCase() === "due" ? total - paid : 0;
                const isVoided = s.status === "VOIDED";
                return (
                  <div key={s.id} className={`px-4 py-3 space-y-1.5 ${isVoided ? "opacity-50" : ""}`}>
                    {/* Row 1: Bill + amount */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{getBillTitle(s)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {s.customer?.name ? `${s.customer.name} · ` : ""}
                          {formatTime(s.saleDate)}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-bold text-foreground tabular-nums">
                        {formatMoney(total)}
                      </p>
                    </div>
                    {/* Row 2: Badges */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${cfg.cls}`}>
                        {cfg.label}
                      </span>
                      {discount > 0 && (
                        <span className="inline-flex rounded-full border border-danger/30 bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">
                          ছাড় {formatMoney(discount)}
                        </span>
                      )}
                      {isVoided ? (
                        <span className="inline-flex rounded-full border border-danger/30 bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">
                          বাতিল
                        </span>
                      ) : dueRemaining > 0 ? (
                        <span className="inline-flex rounded-full border border-amber-300/60 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                          বাকি {formatMoney(dueRemaining)}
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full border border-emerald-300/60 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                          সম্পন্ন
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              {/* Mobile footer */}
              <div className="flex items-center justify-between px-4 py-3 bg-muted/20">
                <p className="text-xs text-muted-foreground">{items.length} টি বিল · এখন দেখানো মোট</p>
                <p className="text-sm font-bold text-foreground tabular-nums">{formatMoney(shownTotal)}</p>
              </div>
            </div>
          </>
        )}

        {(items.length > 0 || hasMore) && (
          <LoadMoreButton
            hasMore={hasMore}
            loading={salesQuery.isFetchingNextPage}
            disabled={!online}
            onLoadMore={handleLoadMore}
            loadedCount={items.length}
            label="আরও বিল দেখুন"
          />
        )}
      </div>
    </div>
  );
}
