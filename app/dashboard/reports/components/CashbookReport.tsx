// app/dashboard/reports/components/CashbookReport.tsx

"use client";

import Link from "next/link";
import { useCallback, useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { REPORT_ROW_LIMIT } from "@/lib/reporting-config";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";
import { CashFlowChart, type CashFlowRow } from "./charts/ReportCharts";
import { RefreshingPill, TableShimmer } from "./Shimmer";
import { ReportEmptyState } from "./ReportEmptyState";
import { LoadMoreButton } from "./LoadMoreButton";
type Props = { shopId: string; from?: string; to?: string };

type CashRow = {
  id: string;
  entryType: string;
  amount: number;
  reason: string;
  createdAt: string;
};

type ReportCursor = { at: string; id: string };

function formatMoney(value: number) {
  return `৳ ${Math.abs(value).toLocaleString("bn-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("bn-BD", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export default function CashbookReport({ shopId, from, to }: Props) {
  const online = useOnlineStatus();

  const buildCacheKey = useCallback(
    (f?: string, t?: string) => `reports:cash:${shopId}:${f || "all"}:${t || "all"}:${REPORT_ROW_LIMIT}`,
    [shopId]
  );

  const readCached = useCallback((f?: string, t?: string) => {
    try {
      const raw = safeLocalStorageGet(buildCacheKey(f, t));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as CashRow[]) : null;
    } catch { return null; }
  }, [buildCacheKey]);

  const fetchCash = useCallback(async (f?: string, t?: string, cursor?: ReportCursor | null, shouldCache = false) => {
    const params = new URLSearchParams({ shopId, limit: `${REPORT_ROW_LIMIT}` });
    if (f) params.append("from", f);
    if (t) params.append("to", t);
    if (cursor) { params.append("cursorAt", cursor.at); params.append("cursorId", cursor.id); }
    const res = await fetch(`/api/reports/cash?${params}`, { cache: "no-store" });
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
    const rows: CashRow[] = data.rows || [];
    if (shouldCache && !cursor) {
      try { safeLocalStorageSet(buildCacheKey(f, t), JSON.stringify(rows)); } catch { /* ignore */ }
    }
    return { rows, hasMore: Boolean(data.hasMore), nextCursor: data.nextCursor ?? null };
  }, [shopId, buildCacheKey, readCached]);

  const initialCashData = useMemo(() => {
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

  const cashQuery = useInfiniteQuery({
    queryKey: ["reports", "cash", shopId, from ?? "all", to ?? "all"],
    queryFn: ({ pageParam }) => fetchCash(from, to, pageParam, pageParam == null),
    enabled: online,
    initialPageParam: null as ReportCursor | null,
    ...(initialCashData ? { initialData: initialCashData } : {}),
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined,
    staleTime: 0,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: "always",
  });

  const rows: CashRow[] = useMemo(() => {
    const seen = new Set<string>();
    const merged: CashRow[] = [];
    for (const page of cashQuery.data?.pages ?? []) {
      for (const row of page.rows as CashRow[]) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        merged.push(row);
      }
    }
    return merged;
  }, [cashQuery.data]);
  const hasMore = Boolean(cashQuery.hasNextPage);
  const loading = cashQuery.isFetching && online;
  const showEmpty = rows.length === 0 && (!online || cashQuery.isFetchedAfterMount) && !loading;

  const totals = useMemo(() => {
    const inbound  = rows.filter((r) => (r.entryType || "").toUpperCase() === "IN").reduce((s, r) => s + Number(r.amount || 0), 0);
    const outbound = rows.filter((r) => (r.entryType || "").toUpperCase() === "OUT").reduce((s, r) => s + Number(r.amount || 0), 0);
    return { inbound, outbound, net: inbound - outbound };
  }, [rows]);

  // Bucket visible cash entries into daily in/out totals for the area chart.
  const dailyFlow = useMemo<CashFlowRow[]>(() => {
    const map = new Map<string, { in: number; out: number }>();
    for (const r of rows) {
      const ts = new Date(r.createdAt);
      if (Number.isNaN(ts.getTime())) continue;
      const ymd = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, "0")}-${String(ts.getDate()).padStart(2, "0")}`;
      const bucket = map.get(ymd) ?? { in: 0, out: 0 };
      const amt = Number(r.amount || 0);
      if ((r.entryType || "").toUpperCase() === "IN") bucket.in += amt;
      else bucket.out += amt;
      map.set(ymd, bucket);
    }
    return Array.from(map.entries())
      .map(([date, v]) => ({ date, in: v.in, out: v.out, net: v.in - v.out }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [rows]);

  const handleLoadMore = () => {
    if (!cashQuery.hasNextPage || cashQuery.isFetchingNextPage) return;
    cashQuery.fetchNextPage();
  };

  const buildHref = () => {
    const params = new URLSearchParams({ shopId });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return `/dashboard/cash?${params}`;
  };

  return (
    <div className="space-y-4">

      {/* ── KPI Row ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {/* Hero: net balance */}
        <div className={`col-span-2 sm:col-span-1 rounded-2xl border p-4 ${
          totals.net >= 0
            ? "border-emerald-200/60 dark:border-emerald-800/40 bg-emerald-50/60 dark:bg-emerald-950/20"
            : "border-rose-200/60 dark:border-rose-800/40 bg-rose-50/60 dark:bg-rose-950/20"
        }`}>
          <p className={`text-xs font-medium ${totals.net >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
            নিট ব্যালান্স
          </p>
          <p className={`mt-1 text-2xl font-bold tabular-nums ${totals.net >= 0 ? "text-emerald-800 dark:text-emerald-300" : "text-rose-800 dark:text-rose-300"}`}>
            {rows.length === 0 && loading
              ? <span className="text-muted-foreground text-lg">লোড হচ্ছে...</span>
              : <>{totals.net >= 0 ? "+" : "-"}{formatMoney(totals.net)}</>
            }
          </p>
          <p className={`mt-1 text-xs ${totals.net >= 0 ? "text-emerald-600/80 dark:text-emerald-500" : "text-rose-600/80 dark:text-rose-500"}`}>
            {rows.length} টি এন্ট্রি এই পাতায়
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">মোট আয়</p>
          <p className="mt-1 text-xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {rows.length === 0 && loading ? "—" : formatMoney(totals.inbound)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {rows.filter((r) => (r.entryType || "").toUpperCase() === "IN").length} টি আয়ের এন্ট্রি
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">মোট ব্যয়</p>
          <p className="mt-1 text-xl font-bold text-rose-600 dark:text-rose-400 tabular-nums">
            {rows.length === 0 && loading ? "—" : formatMoney(totals.outbound)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {rows.filter((r) => (r.entryType || "").toUpperCase() === "OUT").length} টি ব্যয়ের এন্ট্রি
          </p>
        </div>
      </div>

      {/* ── Cash Flow Chart ──────────────────────────────────── */}
      {(dailyFlow.length >= 2 || (loading && rows.length === 0)) && (
        <CashFlowChart data={dailyFlow} loading={loading && rows.length === 0} />
      )}

      {/* ── Cash Entry List ──────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <div>
            <p className="text-sm font-semibold text-foreground">ক্যাশ এন্ট্রি</p>
            <p className="text-xs text-muted-foreground">
              সর্বশেষ ক্যাশ এন্ট্রিগুলো দেখানো হচ্ছে, দরকার হলে আরও লোড করুন
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

        {showEmpty ? (
          <ReportEmptyState
            icon="💵"
            title="এই সময়ে কোনো ক্যাশ এন্ট্রি নেই"
            description="নির্বাচিত সময়ে কোনো cash in/out record পাওয়া যায়নি। নতুন এন্ট্রি যোগ করুন বা full cashbook খুলে দেখুন।"
            actions={[
              {
                label: "নতুন ক্যাশ এন্ট্রি",
                href: `/dashboard/cash/new?shopId=${shopId}`,
              },
              {
                label: "সব ক্যাশ খুলুন",
                href: buildHref(),
                variant: "secondary",
              },
            ]}
          />
        ) : rows.length === 0 && loading ? (
          <TableShimmer rows={5} cols={4} />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">তারিখ · সময়</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">কারণ</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">ধরন</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">পরিমাণ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((r) => {
                    const isIn = (r.entryType || "").toUpperCase() === "IN";
                    return (
                      <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <p className="text-sm text-foreground tabular-nums">{formatDateTime(r.createdAt)}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-foreground">{r.reason || "ক্যাশ এন্ট্রি"}</p>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isIn ? (
                            <span className="inline-flex rounded-full border border-emerald-300/60 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                              আয়
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full border border-rose-300/60 bg-rose-500/10 px-2.5 py-0.5 text-xs font-semibold text-rose-700 dark:text-rose-400">
                              ব্যয়
                            </span>
                          )}
                        </td>
                        <td className={`px-4 py-3 text-right font-semibold tabular-nums whitespace-nowrap ${isIn ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                          {isIn ? "+" : "-"}{formatMoney(Number(r.amount || 0))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/20">
                    <td colSpan={3} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                      এখন দেখানো নিট ({rows.length} টি এন্ট্রি)
                    </td>
                    <td className={`px-4 py-2.5 text-right font-bold tabular-nums ${totals.net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                      {totals.net >= 0 ? "+" : "-"}{formatMoney(totals.net)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Mobile list */}
            <div className="md:hidden divide-y divide-border">
              {rows.map((r) => {
                const isIn = (r.entryType || "").toUpperCase() === "IN";
                return (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{r.reason || "ক্যাশ এন্ট্রি"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{formatDateTime(r.createdAt)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <p className={`text-sm font-bold tabular-nums ${isIn ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                        {isIn ? "+" : "-"}{formatMoney(Number(r.amount || 0))}
                      </p>
                      {isIn ? (
                        <span className="inline-flex rounded-full border border-emerald-300/60 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                          আয়
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full border border-rose-300/60 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-400">
                          ব্যয়
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              {/* Mobile footer */}
              <div className="flex items-center justify-between px-4 py-3 bg-muted/20">
                <p className="text-xs text-muted-foreground">{rows.length} এন্ট্রি · এখন দেখানো নিট</p>
                <p className={`text-sm font-bold tabular-nums ${totals.net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                  {totals.net >= 0 ? "+" : "-"}{formatMoney(totals.net)}
                </p>
              </div>
            </div>
          </>
        )}

        {(rows.length > 0 || hasMore) && (
          <LoadMoreButton
            hasMore={hasMore}
            loading={cashQuery.isFetchingNextPage}
            disabled={!online}
            onLoadMore={handleLoadMore}
            loadedCount={rows.length}
            label="আরও এন্ট্রি দেখুন"
          />
        )}
      </div>
    </div>
  );
}
