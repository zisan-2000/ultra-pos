// app/dashboard/reports/components/ExpenseReport.tsx

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { REPORT_ROW_LIMIT } from "@/lib/reporting-config";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";

type Props = { shopId: string; from?: string; to?: string };
type ReportCursor = { at: string; id: string };

type SummaryPayload = {
  expense: { totalAmount: number; count?: number };
};

type ExpenseRow = {
  id: string;
  amount: number | string;
  category?: string | null;
  note?: string | null;
  expenseDate: string;
  createdAt?: string;
};

// Rotating palette for category bars
const CATEGORY_COLORS = [
  "bg-rose-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-sky-500",
  "bg-teal-500",
];

function scheduleStateUpdate(fn: () => void) {
  if (typeof queueMicrotask === "function") { queueMicrotask(fn); return; }
  Promise.resolve().then(fn);
}

function formatMoney(value: number) {
  return `৳ ${value.toLocaleString("bn-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(item: ExpenseRow) {
  const d = new Date(item.expenseDate);
  const t = item.createdAt ? new Date(item.createdAt) : null;
  const date = d.toLocaleDateString("bn-BD", { day: "2-digit", month: "short" });
  if (!t || Number.isNaN(t.getTime())) return date;
  const time = t.toLocaleTimeString("bn-BD", { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}`;
}

function categoryLabel(raw?: string | null) {
  return raw?.trim() || "অনির্ধারিত";
}

export default function ExpenseReport({ shopId, from, to }: Props) {
  const online = useOnlineStatus();
  const [page, setPage] = useState(1);
  const [cursorList, setCursorList] = useState<ReportCursor[]>([]);
  const currentCursor = page > 1 ? cursorList[page - 2] ?? null : null;

  const buildCacheKey = useCallback(
    (f?: string, t?: string) => `reports:expenses:${shopId}:${f || "all"}:${t || "all"}:${REPORT_ROW_LIMIT}`,
    [shopId]
  );

  useEffect(() => {
    let cancelled = false;
    scheduleStateUpdate(() => { if (cancelled) return; setPage(1); setCursorList([]); });
    return () => { cancelled = true; };
  }, [shopId, from, to]);

  const readCached = useCallback((f?: string, t?: string) => {
    try {
      const raw = safeLocalStorageGet(buildCacheKey(f, t));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as ExpenseRow[]) : null;
    } catch { return null; }
  }, [buildCacheKey]);

  const fetchExpenses = useCallback(async (f?: string, t?: string, cursor?: ReportCursor | null, shouldCache = false) => {
    const params = new URLSearchParams({ shopId, limit: `${REPORT_ROW_LIMIT}` });
    if (f) params.append("from", f);
    if (t) params.append("to", t);
    if (cursor) { params.append("cursorAt", cursor.at); params.append("cursorId", cursor.id); }
    else params.append("fresh", "1");
    const res = await fetch(`/api/reports/expenses?${params}`, { cache: "no-store" });
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
    const rows: ExpenseRow[] = data.rows || [];
    if (shouldCache && !cursor) {
      try { safeLocalStorageSet(buildCacheKey(f, t), JSON.stringify(rows)); } catch { /* ignore */ }
    }
    return { rows, hasMore: Boolean(data.hasMore), nextCursor: data.nextCursor ?? null };
  }, [shopId, buildCacheKey, readCached]);

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

  const initialData = useMemo(() => {
    if (online || page !== 1) return { rows: [], hasMore: false, nextCursor: null };
    const cached = readCached(from, to);
    return cached ? { rows: cached, hasMore: false, nextCursor: null } : { rows: [], hasMore: false, nextCursor: null };
  }, [online, page, readCached, from, to]);

  const expenseQuery = useQuery({
    queryKey: ["reports", "expenses", shopId, from ?? "all", to ?? "all", page, currentCursor?.at ?? "start", currentCursor?.id ?? "start"],
    queryFn: () => fetchExpenses(from, to, currentCursor, page === 1),
    enabled: online,
    initialData,
    staleTime: 0,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: "always",
  });

  const items: ExpenseRow[] = expenseQuery.data?.rows ?? initialData.rows ?? [];
  const hasMore = expenseQuery.data?.hasMore ?? false;
  const nextCursor = expenseQuery.data?.nextCursor ?? null;
  const loading = expenseQuery.isFetching && online;
  const showEmpty = items.length === 0 && (!online || expenseQuery.isFetchedAfterMount) && !loading;

  useEffect(() => {
    if (online || page <= 1) return;
    let cancelled = false;
    scheduleStateUpdate(() => { if (cancelled) return; setPage(1); setCursorList([]); });
    return () => { cancelled = true; };
  }, [online, page]);

  const summaryData = summaryQuery.data;
  const listTotal = useMemo(() => items.reduce((s, r) => s + Number(r.amount || 0), 0), [items]);
  const totalExpense = summaryData?.expense.totalAmount ?? listTotal;
  const entryCount = summaryData?.expense.count ?? items.length;
  const avgExpense = entryCount > 0 ? totalExpense / entryCount : 0;

  // Category breakdown with color index
  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      const label = categoryLabel(item.category);
      map.set(label, (map.get(label) ?? 0) + Number(item.amount || 0));
    }
    return Array.from(map.entries())
      .map(([label, amount], i) => ({ label, amount, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }))
      .sort((a, b) => b.amount - a.amount);
  }, [items]);

  const handlePrev = () => setPage((p) => Math.max(1, p - 1));
  const handleNext = () => {
    const c = cursorList[page - 1] ?? nextCursor;
    if (!c) return;
    setCursorList((prev) => { const n = [...prev]; n[page - 1] = c; return n; });
    setPage((p) => p + 1);
  };

  const buildHref = () => {
    const params = new URLSearchParams({ shopId });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return `/dashboard/expenses?${params}`;
  };

  return (
    <div className="space-y-4">

      {/* ── KPI Row ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {/* Hero */}
        <div className="col-span-2 sm:col-span-1 rounded-2xl border border-rose-200/60 dark:border-rose-800/40 bg-rose-50/60 dark:bg-rose-950/20 p-4">
          <p className="text-xs font-medium text-rose-700 dark:text-rose-400">মোট খরচ</p>
          <p className="mt-1 text-2xl font-bold text-rose-800 dark:text-rose-300 tabular-nums">
            {summaryData ? formatMoney(totalExpense) : <span className="text-muted-foreground text-lg">লোড হচ্ছে...</span>}
          </p>
          <p className="mt-1 text-xs text-rose-600/80 dark:text-rose-500">
            {entryCount} টি এন্ট্রি
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">গড় খরচ</p>
          <p className="mt-1 text-xl font-bold text-foreground tabular-nums">
            {summaryData ? formatMoney(avgExpense) : "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">প্রতি এন্ট্রিতে গড়ে</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">সর্বোচ্চ খাত</p>
          <p className="mt-1 text-base font-bold text-foreground truncate">
            {categoryBreakdown[0]?.label ?? (loading ? "..." : "—")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {categoryBreakdown[0] ? formatMoney(categoryBreakdown[0].amount) : "এই তালিকা থেকে"}
          </p>
        </div>
      </div>

      {/* ── Category Breakdown ───────────────────────────────── */}
      {categoryBreakdown.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">খাতভিত্তিক খরচ</p>
            <p className="text-xs text-muted-foreground">এই তালিকার {items.length} এন্ট্রি থেকে</p>
          </div>
          <div className="space-y-2">
            {categoryBreakdown.map((cat) => {
              const pct = listTotal > 0 ? (cat.amount / listTotal) * 100 : 0;
              return (
                <div key={cat.label} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 text-xs font-semibold text-foreground truncate">
                    {cat.label}
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full ${cat.color}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-24 shrink-0 text-right text-xs font-semibold text-foreground tabular-nums">
                    {formatMoney(cat.amount)}
                  </span>
                  <span className="w-10 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                    {pct.toFixed(0)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Expense List ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <div>
            <p className="text-sm font-semibold text-foreground">খরচের তালিকা</p>
            <p className="text-xs text-muted-foreground">সর্বশেষ {REPORT_ROW_LIMIT} টি এন্ট্রি</p>
          </div>
          <div className="flex items-center gap-2">
            {loading && (
              <span className="text-xs text-muted-foreground animate-pulse">আপডেট হচ্ছে...</span>
            )}
            <Link
              href={buildHref()}
              className="inline-flex h-7 items-center rounded-full border border-primary/25 bg-primary-soft px-3 text-xs font-semibold text-primary hover:bg-primary/15 transition"
            >
              সব দেখুন →
            </Link>
          </div>
        </div>

        {showEmpty ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">এই সময়ে কোনো খরচ নেই</p>
          </div>
        ) : items.length === 0 && loading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                <div className="h-4 w-20 rounded bg-muted" />
                <div className="flex-1 h-4 rounded bg-muted" />
                <div className="h-4 w-16 rounded bg-muted" />
                <div className="h-4 w-20 rounded bg-muted ml-auto" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">খাত · তারিখ</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">নোট</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">টাকা</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{categoryLabel(item.category)}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{formatDate(item)}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {item.note?.trim() ? (
                          <span className="truncate max-w-xs block">{item.note.trim()}</span>
                        ) : (
                          <span>—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-rose-600 dark:text-rose-400 tabular-nums whitespace-nowrap">
                        {formatMoney(Number(item.amount || 0))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/20">
                    <td colSpan={2} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">
                      এই পাতার মোট ({items.length} টি এন্ট্রি)
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                      {formatMoney(listTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Mobile list */}
            <div className="md:hidden divide-y divide-border">
              {items.map((item) => (
                <div key={item.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{categoryLabel(item.category)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(item)}
                      {item.note?.trim() ? ` · ${item.note.trim()}` : ""}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                    {formatMoney(Number(item.amount || 0))}
                  </p>
                </div>
              ))}
              {/* Mobile footer */}
              <div className="flex items-center justify-between px-4 py-3 bg-muted/20">
                <p className="text-xs text-muted-foreground">{items.length} এন্ট্রি · এই পাতার মোট</p>
                <p className="text-sm font-bold text-rose-600 dark:text-rose-400 tabular-nums">{formatMoney(listTotal)}</p>
              </div>
            </div>
          </>
        )}

        {/* Pagination */}
        {(page > 1 || hasMore) && (
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-border bg-muted/10">
            <button
              type="button"
              onClick={handlePrev}
              disabled={page <= 1 || loading || !online}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              ← আগের পাতা
            </button>
            <span className="text-xs font-semibold text-muted-foreground">পাতা {page}</span>
            <button
              type="button"
              onClick={handleNext}
              disabled={!hasMore || !nextCursor || loading || !online}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              পরের পাতা →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
