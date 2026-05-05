// app/dashboard/reports/components/SalesReport.tsx

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { REPORT_ROW_LIMIT } from "@/lib/reporting-config";
import { handlePermissionError } from "@/lib/permission-toast";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";

type Props = { shopId: string; from?: string; to?: string };

type ReportCursor = { at: string; id: string };
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

function getBillTitle(row: SalesRow) {
  return row.invoiceNo?.trim() || "সরাসরি বিক্রি";
}

export default function SalesReport({ shopId, from, to }: Props) {
  const online = useOnlineStatus();
  const [page, setPage] = useState(1);
  const [cursorList, setCursorList] = useState<ReportCursor[]>([]);
  const currentCursor = page > 1 ? cursorList[page - 2] ?? null : null;

  const buildCacheKey = useCallback(
    (f?: string, t?: string) => `reports:sales:${shopId}:${f || "all"}:${t || "all"}:${REPORT_ROW_LIMIT}`,
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
      return Array.isArray(parsed) ? parsed : null;
    } catch { return null; }
  }, [buildCacheKey]);

  const fetchSales = useCallback(async (f?: string, t?: string, cursor?: ReportCursor | null, shouldCache = false) => {
    const params = new URLSearchParams({ shopId, limit: `${REPORT_ROW_LIMIT}` });
    if (f) params.append("from", f);
    if (t) params.append("to", t);
    if (cursor) { params.append("cursorAt", cursor.at); params.append("cursorId", cursor.id); }
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

  const initialSalesData = useMemo(() => {
    if (online || page !== 1) return { rows: [], hasMore: false, nextCursor: null };
    const cached = readCached(from, to);
    return cached ? { rows: cached, hasMore: false, nextCursor: null } : { rows: [], hasMore: false, nextCursor: null };
  }, [online, page, readCached, from, to]);

  const salesQuery = useQuery({
    queryKey: ["reports", "sales", shopId, from ?? "all", to ?? "all", page, currentCursor?.at ?? "start", currentCursor?.id ?? "start"],
    queryFn: () => fetchSales(from, to, currentCursor, page === 1),
    enabled: online,
    initialData: initialSalesData,
    staleTime: 0,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: "always",
  });

  const items: SalesRow[] = salesQuery.data?.rows ?? initialSalesData.rows ?? [];
  const hasMore = salesQuery.data?.hasMore ?? false;
  const nextCursor = salesQuery.data?.nextCursor ?? null;
  const loading = salesQuery.isFetching && online;
  const showEmpty = items.length === 0 && (!online || salesQuery.isFetchedAfterMount) && !loading;

  useEffect(() => {
    if (online || page <= 1) return;
    let cancelled = false;
    scheduleStateUpdate(() => { if (cancelled) return; setPage(1); setCursorList([]); });
    return () => { cancelled = true; };
  }, [online, page]);

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

  const shownTotal = useMemo(() => items.reduce((s, r) => s + Number(r.totalAmount || 0), 0), [items]);

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
    return `/dashboard/sales?${params}`;
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

      {/* ── Payment Method Breakdown ─────────────────────────── */}
      {paymentBreakdown.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">পেমেন্ট পদ্ধতি</p>
            <p className="text-xs text-muted-foreground">এই তালিকার {items.length} টি বিল থেকে</p>
          </div>
          <div className="space-y-2">
            {paymentBreakdown.map((m) => {
              const cfg = getPaymentCfg(m.key);
              const pct = shownTotal > 0 ? (m.total / shownTotal) * 100 : 0;
              return (
                <div key={m.key} className="flex items-center gap-3">
                  <span className={`inline-flex w-16 shrink-0 items-center justify-center rounded-full border px-2 py-0.5 text-xs font-semibold ${cfg.cls}`}>
                    {cfg.label}
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full ${cfg.bar}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-24 shrink-0 text-right text-xs font-semibold text-foreground tabular-nums">
                    {formatMoney(m.total)}
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

      {/* ── Bill List ────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <div>
            <p className="text-sm font-semibold text-foreground">বিলের তালিকা</p>
            <p className="text-xs text-muted-foreground">সর্বশেষ {REPORT_ROW_LIMIT} টি বিল</p>
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
            <p className="text-sm text-muted-foreground">এই সময়ে কোনো বিক্রি নেই</p>
          </div>
        ) : items.length === 0 && loading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                <div className="h-4 w-24 rounded bg-muted" />
                <div className="flex-1 h-4 w-20 rounded bg-muted" />
                <div className="h-6 w-14 rounded-full bg-muted" />
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
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">বিল · সময়</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">গ্রাহক</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">পেমেন্ট</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">ছাড়</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">অবস্থা</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">মোট টাকা</th>
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
                      এই পাতার মোট ({items.length} টি বিল)
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
                <p className="text-xs text-muted-foreground">{items.length} টি বিল · এই পাতার মোট</p>
                <p className="text-sm font-bold text-foreground tabular-nums">{formatMoney(shownTotal)}</p>
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
            <span className="text-xs font-semibold text-muted-foreground">
              পাতা {page}
            </span>
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
