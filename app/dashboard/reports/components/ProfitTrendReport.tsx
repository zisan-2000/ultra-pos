// app/dashboard/reports/components/ProfitTrendReport.tsx

"use client";

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";
import { ProfitTrendChart, type ProfitTrendRow } from "./charts/ReportCharts";
import { RefreshingPill, TableShimmer } from "./Shimmer";
import { ReportEmptyState } from "./ReportEmptyState";
type ProfitRow = {
  date: string;
  sales: number;
  expense: number;
  operatingExpense?: number;
  cogs?: number;
  grossProfit?: number;
  netProfit?: number;
  grossMarginPct?: number;
  netMarginPct?: number;
};

type NormalizedProfitRow = {
  date: string;
  sales: number;
  expense: number;
  operatingExpense: number;
  cogs: number;
  grossProfit: number;
  netProfit: number;
  grossMarginPct: number;
  netMarginPct: number;
};

type Props = {
  shopId: string;
  from?: string;
  to?: string;
  needsCogs?: boolean;
};

function formatMoney(value: number) {
  return `৳ ${value.toLocaleString("bn-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("bn-BD", { day: "2-digit", month: "short", year: "numeric" });
}

function normalizeProfitRow(row: ProfitRow): NormalizedProfitRow {
  const sales = Number(row.sales ?? 0);
  const totalExpense = Number(row.expense ?? 0);
  const cogs = Number(row.cogs ?? 0);
  const operatingExpense = Number(row.operatingExpense ?? Math.max(totalExpense - cogs, 0));
  const grossProfit = Number(row.grossProfit ?? sales - cogs);
  const netProfit = Number(row.netProfit ?? grossProfit - operatingExpense);
  const grossMarginPct = Number(row.grossMarginPct ?? (sales ? (grossProfit / sales) * 100 : 0));
  const netMarginPct = Number(row.netMarginPct ?? (sales ? (netProfit / sales) * 100 : 0));
  return { date: row.date, sales, expense: totalExpense, operatingExpense, cogs, grossProfit, netProfit, grossMarginPct, netMarginPct };
}

export default function ProfitTrendReport({ shopId, from, to, needsCogs = false }: Props) {
  const online = useOnlineStatus();

  const buildCacheKey = useCallback(
    (f?: string, t?: string) => `reports:profit:${shopId}:${f || "all"}:${t || "all"}`,
    [shopId]
  );

  const readCached = useCallback((f?: string, t?: string) => {
    try {
      const raw = safeLocalStorageGet(buildCacheKey(f, t));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as ProfitRow[]).map(normalizeProfitRow) : null;
    } catch { return null; }
  }, [buildCacheKey]);

  const fetchProfit = useCallback(async (f?: string, t?: string) => {
    const params = new URLSearchParams({ shopId });
    if (f) params.append("from", f);
    if (t) params.append("to", t);
    params.append("fresh", "1");
    const res = await fetch(`/api/reports/profit-trend?${params}`, { cache: "no-store" });
    if (res.status === 304) return readCached(f, t) ?? [];
    if (!res.ok) {
      const cached = readCached(f, t);
      if (cached) return cached;
      throw new Error("Profit report fetch failed");
    }
    const json = await res.json();
    const rows = Array.isArray(json?.data) ? (json.data as ProfitRow[]).map(normalizeProfitRow) : [];
    try { safeLocalStorageSet(buildCacheKey(f, t), JSON.stringify(rows)); } catch { /* ignore */ }
    return rows;
  }, [shopId, buildCacheKey, readCached]);

  const initialRows = useMemo(() => online ? undefined : (readCached(from, to) ?? undefined), [online, readCached, from, to]);

  const profitQuery = useQuery({
    queryKey: ["reports", "profit", shopId, from ?? "all", to ?? "all"],
    queryFn: () => fetchProfit(from, to),
    enabled: online,
    staleTime: 0,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: "always",
    ...(initialRows !== undefined ? { initialData: initialRows } : {}),
  });

  const data: NormalizedProfitRow[] = useMemo(
    () => profitQuery.data ?? initialRows ?? [],
    [profitQuery.data, initialRows]
  );
  const loading = profitQuery.isFetching && online;
  const showEmpty = data.length === 0 && (!online || profitQuery.isFetchedAfterMount) && !loading;

  const totals = useMemo(() => {
    const agg = data.reduce(
      (s, r) => ({ sales: s.sales + r.sales, cogs: s.cogs + r.cogs, operatingExpense: s.operatingExpense + r.operatingExpense, grossProfit: s.grossProfit + r.grossProfit, netProfit: s.netProfit + r.netProfit }),
      { sales: 0, cogs: 0, operatingExpense: 0, grossProfit: 0, netProfit: 0 }
    );
    return {
      ...agg,
      netMarginPct: agg.sales ? (agg.netProfit / agg.sales) * 100 : 0,
      grossMarginPct: agg.sales ? (agg.grossProfit / agg.sales) * 100 : 0,
    };
  }, [data]);

  const isProfit = totals.netProfit >= 0;
  const colSpan = needsCogs ? 7 : 5;

  const chartData = useMemo<ProfitTrendRow[]>(
    () =>
      data.map((row) => ({
        date: row.date,
        sales: row.sales,
        // For the line chart we surface "মোট খরচ" (operating + cogs) so the
        // shape matches the per-day table the user sees just below.
        expense: row.operatingExpense + row.cogs,
        netProfit: row.netProfit,
      })),
    [data]
  );

  return (
    <div className="space-y-4">

      {/* ── KPI Row ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Hero */}
        <div className={`col-span-2 sm:col-span-1 rounded-2xl border p-4 ${
          isProfit
            ? "border-emerald-200/60 dark:border-emerald-800/40 bg-emerald-50/60 dark:bg-emerald-950/20"
            : "border-rose-200/60 dark:border-rose-800/40 bg-rose-50/60 dark:bg-rose-950/20"
        }`}>
          <p className={`text-xs font-medium ${isProfit ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
            চূড়ান্ত লাভ
          </p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${isProfit ? "text-emerald-800 dark:text-emerald-300" : "text-rose-800 dark:text-rose-300"}`}>
            {data.length === 0 && loading
              ? <span className="text-muted-foreground text-lg">লোড হচ্ছে...</span>
              : formatMoney(totals.netProfit)
            }
          </p>
          <p className={`mt-1 text-xs ${isProfit ? "text-emerald-600/80 dark:text-emerald-500" : "text-rose-600/80 dark:text-rose-500"}`}>
            {data.length === 0 && loading ? "..." : `হার: ${formatPercent(totals.netMarginPct)}`}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">মোট বিক্রি</p>
          <p className="mt-1 text-xl font-bold text-foreground tabular-nums">
            {data.length === 0 && loading ? "—" : formatMoney(totals.sales)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{data.length} দিনের সারসংক্ষেপ</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">মোট খরচ</p>
          <p className="mt-1 text-xl font-bold text-foreground tabular-nums">
            {data.length === 0 && loading ? "—" : formatMoney(totals.operatingExpense)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">পরিচালন খরচ</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">লাভের হার</p>
          <p className={`mt-1 text-xl font-bold tabular-nums ${isProfit ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            {data.length === 0 && loading ? "—" : formatPercent(totals.netMarginPct)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">প্রতি ১০০ টাকায়</p>
        </div>
      </div>

      {/* ── Trend Chart ──────────────────────────────────────── */}
      {(data.length >= 2 || (loading && data.length === 0)) && (
        <ProfitTrendChart data={chartData} loading={loading && data.length === 0} />
      )}

      {/* ── Per-Day Table ────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <div>
            <p className="text-sm font-semibold text-foreground">দিনভিত্তিক লাভ</p>
            <p className="text-xs text-muted-foreground">প্রতিদিনের বিক্রি থেকে খরচ বাদে লাভ</p>
          </div>
          <RefreshingPill visible={loading && data.length > 0} />
        </div>

        {showEmpty ? (
          <ReportEmptyState
            icon="📈"
            title="এই সময়ে লাভের তথ্য নেই"
            description="লাভ-ক্ষতির হিসাব দেখাতে sale আর expense data দরকার। নতুন বিক্রি বা খরচ যোগ করুন, অথবা সময়সীমা বদলে দেখুন।"
            actions={[
              {
                label: "নতুন বিক্রি করুন",
                href: `/dashboard/sales/new?shopId=${shopId}`,
              },
              {
                label: "নতুন খরচ যোগ করুন",
                href: `/dashboard/expenses/new?shopId=${shopId}`,
                variant: "secondary",
              },
            ]}
          />
        ) : data.length === 0 && loading ? (
          <TableShimmer rows={5} cols={5} />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">তারিখ</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">মোট বিক্রি</th>
                    {needsCogs && <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">পণ্যের খরচ</th>}
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">অন্যান্য খরচ</th>
                    {needsCogs && <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">প্রাথমিক লাভ</th>}
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">চূড়ান্ত লাভ</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">হার</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.map((row, idx) => {
                    const pos = row.netProfit >= 0;
                    return (
                      <tr key={`${row.date}-${idx}`} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-foreground">{formatDate(row.date)}</p>
                        </td>
                        <td className="px-4 py-3 text-right text-foreground tabular-nums">{formatMoney(row.sales)}</td>
                        {needsCogs && <td className="px-4 py-3 text-right text-rose-600 dark:text-rose-400 tabular-nums">{formatMoney(row.cogs)}</td>}
                        <td className="px-4 py-3 text-right text-rose-600 dark:text-rose-400 tabular-nums">{formatMoney(row.operatingExpense)}</td>
                        {needsCogs && <td className="px-4 py-3 text-right text-foreground tabular-nums">{formatMoney(row.grossProfit)}</td>}
                        <td className={`px-4 py-3 text-right font-semibold tabular-nums ${pos ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                          {formatMoney(row.netProfit)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                            pos
                              ? "border-emerald-300/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                              : "border-rose-300/60 bg-rose-500/10 text-rose-700 dark:text-rose-400"
                          }`}>
                            {formatPercent(row.netMarginPct)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/20">
                    <td className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                      মোট ({data.length} দিন)
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-foreground tabular-nums">{formatMoney(totals.sales)}</td>
                    {needsCogs && <td className="px-4 py-2.5 text-right font-bold text-rose-600 dark:text-rose-400 tabular-nums">{formatMoney(totals.cogs)}</td>}
                    <td className="px-4 py-2.5 text-right font-bold text-rose-600 dark:text-rose-400 tabular-nums">{formatMoney(totals.operatingExpense)}</td>
                    {needsCogs && <td className="px-4 py-2.5 text-right font-bold text-foreground tabular-nums">{formatMoney(totals.grossProfit)}</td>}
                    <td className={`px-4 py-2.5 text-right font-bold tabular-nums ${isProfit ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                      {formatMoney(totals.netProfit)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                        isProfit
                          ? "border-emerald-300/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                          : "border-rose-300/60 bg-rose-500/10 text-rose-700 dark:text-rose-400"
                      }`}>
                        {formatPercent(totals.netMarginPct)}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Mobile list */}
            <div className="md:hidden divide-y divide-border">
              {data.map((row, idx) => {
                const pos = row.netProfit >= 0;
                return (
                  <div key={`${row.date}-${idx}`} className="px-4 py-3 space-y-1.5">
                    {/* Row 1: date + profit amount */}
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">{formatDate(row.date)}</p>
                      <p className={`text-sm font-bold tabular-nums shrink-0 ${pos ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                        {formatMoney(row.netProfit)}
                      </p>
                    </div>
                    {/* Row 2: breakdown + badge */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">বিক্রি {formatMoney(row.sales)}</span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">খরচ {formatMoney(row.operatingExpense)}</span>
                      <span className={`ml-auto inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                        pos
                          ? "border-emerald-300/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                          : "border-rose-300/60 bg-rose-500/10 text-rose-700 dark:text-rose-400"
                      }`}>
                        {pos ? "লাভ" : "ক্ষতি"} {formatPercent(row.netMarginPct)}
                      </span>
                    </div>
                  </div>
                );
              })}
              {/* Mobile footer */}
              <div className="flex items-center justify-between px-4 py-3 bg-muted/20">
                <p className="text-xs text-muted-foreground">{data.length} দিন · মোট লাভ</p>
                <p className={`text-sm font-bold tabular-nums ${isProfit ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                  {formatMoney(totals.netProfit)}
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
