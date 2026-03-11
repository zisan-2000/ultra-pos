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
    completedCount?: number;
    voidedCount?: number;
    count?: number;
  };
};
type SalesRow = {
  id: string;
  invoiceNo?: string | null;
  totalAmount: number | string;
  paymentMethod?: string | null;
  saleDate: string;
  note?: string | null;
  customer?: { name?: string | null; phone?: string | null } | null;
  _count?: { saleItems?: number };
};

function scheduleStateUpdate(fn: () => void) {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(fn);
    return;
  }
  Promise.resolve().then(fn);
}

function formatMoney(value: number) {
  return `${value.toFixed(2)} ৳`;
}

function formatPaymentMethod(value?: string | null) {
  const key = (value || "cash").toLowerCase();
  const labelMap: Record<string, string> = {
    cash: "ক্যাশ",
    bkash: "বিকাশ",
    নগদ: "নগদ",
    nagad: "নগদ",
    card: "কার্ড",
    bank_transfer: "ব্যাংক ট্রান্সফার",
    due: "ধার",
  };
  return labelMap[key] ?? value ?? "ক্যাশ";
}

function getPaymentTone(value?: string | null) {
  const key = (value || "cash").toLowerCase();
  if (key === "due") return "bg-amber-500/15 text-amber-700 border-amber-300/60";
  if (key === "cash") return "bg-emerald-500/15 text-emerald-700 border-emerald-300/60";
  if (key === "bkash" || key === "nagad") {
    return "bg-sky-500/15 text-sky-700 border-sky-300/60";
  }
  if (key === "card" || key === "bank_transfer") {
    return "bg-violet-500/15 text-violet-700 border-violet-300/60";
  }
  return "bg-muted text-foreground border-border";
}

function getBillTitle(row: SalesRow) {
  return row.invoiceNo?.trim() || "সরাসরি বিক্রি";
}

function getBillMeta(row: SalesRow) {
  const note = row.note?.trim();
  if (note) return note;
  if (row.invoiceNo?.trim()) return null;
  return `রেকর্ড #${row.id.slice(0, 8)}`;
}

function shortenText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}...`;
}

export default function SalesReport({ shopId, from, to }: Props) {
  const online = useOnlineStatus();
  const [page, setPage] = useState(1);
  const [cursorList, setCursorList] = useState<ReportCursor[]>([]);

  const currentCursor = page > 1 ? cursorList[page - 2] ?? null : null;

  const buildCacheKey = useCallback(
    (rangeFrom?: string, rangeTo?: string) =>
      `reports:sales:${shopId}:${rangeFrom || "all"}:${rangeTo || "all"}:${REPORT_ROW_LIMIT}`,
    [shopId]
  );

  useEffect(() => {
    let cancelled = false;
    scheduleStateUpdate(() => {
      if (cancelled) return;
      setPage(1);
      setCursorList([]);
    });
    return () => {
      cancelled = true;
    };
  }, [shopId, from, to]);

  const readCached = useCallback(
    (rangeFrom?: string, rangeTo?: string) => {
      if (typeof window === "undefined") return null;
      try {
        const raw = safeLocalStorageGet(buildCacheKey(rangeFrom, rangeTo));
        if (!raw) {
          return null;
        }
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : null;
      } catch (err) {
        handlePermissionError(err);
        console.warn("Sales report cache read failed", err);
        return null;
      }
    },
    [buildCacheKey]
  );

  const fetchSales = useCallback(
    async (
      rangeFrom?: string,
      rangeTo?: string,
      cursor?: ReportCursor | null,
      shouldCache = false
    ) => {
      const params = new URLSearchParams({
        shopId,
        limit: `${REPORT_ROW_LIMIT}`,
      });
      if (rangeFrom) params.append("from", rangeFrom);
      if (rangeTo) params.append("to", rangeTo);
      if (cursor) {
        params.append("cursorAt", cursor.at);
        params.append("cursorId", cursor.id);
      }

      const res = await fetch(`/api/reports/sales?${params.toString()}`, {
        cache: "no-store",
      });
      if (res.status === 304) {
        const cached = readCached(rangeFrom, rangeTo);
        if (cached && !cursor) {
          return { rows: cached, hasMore: false, nextCursor: null };
        }
        throw new Error("Sales report not modified");
      }
      if (!res.ok) {
        const cached = readCached(rangeFrom, rangeTo);
        if (cached && !cursor) {
          return { rows: cached, hasMore: false, nextCursor: null };
        }
        throw new Error("Sales report fetch failed");
      }
      const data = await res.json();
      const rows = data.rows || [];
      if (shouldCache && !cursor && typeof window !== "undefined") {
        try {
          safeLocalStorageSet(
            buildCacheKey(rangeFrom, rangeTo),
            JSON.stringify(rows)
          );
        } catch (err) {
          handlePermissionError(err);
          console.warn("Sales report cache write failed", err);
        }
      }
      return {
        rows,
        hasMore: Boolean(data.hasMore),
        nextCursor: data.nextCursor ?? null,
      };
    },
    [shopId, buildCacheKey, readCached]
  );

  const summaryQueryKey = useMemo(
    () => ["reports", "summary", shopId, from ?? "all", to ?? "all"],
    [shopId, from, to]
  );

  const fetchSummary = useCallback(async () => {
    const params = new URLSearchParams({ shopId });
    if (from) params.append("from", from);
    if (to) params.append("to", to);
    params.append("fresh", "1");
    const res = await fetch(`/api/reports/summary?${params.toString()}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error("Sales summary fetch failed");
    }
    return (await res.json()) as SummaryPayload;
  }, [shopId, from, to]);

  const summaryQuery = useQuery({
    queryKey: summaryQueryKey,
    queryFn: fetchSummary,
    enabled: online,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    staleTime: 15_000,
  });

  const salesQueryKey = useMemo(
    () => [
      "reports",
      "sales",
      shopId,
      from ?? "all",
      to ?? "all",
      page,
      currentCursor?.at ?? "start",
      currentCursor?.id ?? "start",
    ],
    [shopId, from, to, page, currentCursor?.at, currentCursor?.id]
  );

  const initialSalesData = useMemo(() => {
    if (online || page !== 1) {
      return { rows: [], hasMore: false, nextCursor: null };
    }
    const cached = readCached(from, to);
    return cached
      ? { rows: cached, hasMore: false, nextCursor: null }
      : { rows: [], hasMore: false, nextCursor: null };
  }, [online, page, readCached, from, to]);

  const salesQuery = useQuery({
    queryKey: salesQueryKey,
    queryFn: () => fetchSales(from, to, currentCursor, page === 1),
    enabled: online,
    initialData: initialSalesData,
    staleTime: 0,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: "always",
  });

  const rawItems: SalesRow[] = useMemo(
    () => salesQuery.data?.rows ?? initialSalesData.rows ?? [],
    [salesQuery.data?.rows, initialSalesData.rows]
  );
  const items: SalesRow[] = rawItems;
  const hasMore = salesQuery.data?.hasMore ?? initialSalesData.hasMore ?? false;
  const nextCursor =
    salesQuery.data?.nextCursor ?? initialSalesData.nextCursor ?? null;
  const loading = salesQuery.isFetching && online;
  const hasFetched = salesQuery.isFetchedAfterMount;
  const showEmpty = items.length === 0 && (!online || hasFetched) && !loading;

  useEffect(() => {
    if (online || page <= 1) return;
    let cancelled = false;
    scheduleStateUpdate(() => {
      if (cancelled) return;
      setPage(1);
      setCursorList([]);
    });
    return () => {
      cancelled = true;
    };
  }, [online, page]);

  useEffect(() => {
    if (page <= 1 || currentCursor) return;
    let cancelled = false;
    scheduleStateUpdate(() => {
      if (cancelled) return;
      setPage(1);
    });
    return () => {
      cancelled = true;
    };
  }, [page, currentCursor]);

  const shownTotal = useMemo(
    () => items.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0),
    [items]
  );

  const summaryData = summaryQuery.data;
  const completedCount =
    Number(summaryData?.sales?.completedCount ?? summaryData?.sales?.count ?? 0);
  const voidedCount = Number(summaryData?.sales?.voidedCount ?? 0);
  const averageBill = completedCount
    ? Number(summaryData?.sales?.totalAmount ?? 0) / completedCount
    : 0;

  const paymentBreakdown = useMemo(() => {
    const stats = new Map<
      string,
      { key: string; label: string; count: number; total: number }
    >();
    for (const sale of items) {
      const key = (sale.paymentMethod || "cash").toLowerCase();
      const current = stats.get(key) ?? {
        key,
        label: formatPaymentMethod(key),
        count: 0,
        total: 0,
      };
      current.count += 1;
      current.total += Number(sale.totalAmount || 0);
      stats.set(key, current);
    }
    return Array.from(stats.values()).sort((a, b) => b.total - a.total);
  }, [items]);

  const topPayment = paymentBreakdown[0] ?? null;

  const handlePrev = () => {
    setPage((prev) => Math.max(1, prev - 1));
  };

  const handleNext = () => {
    const cursorToUse = cursorList[page - 1] ?? nextCursor;
    if (!cursorToUse) return;
    setCursorList((prev) => {
      const next = [...prev];
      next[page - 1] = cursorToUse;
      return next;
    });
    setPage((prev) => prev + 1);
  };

  const buildHref = () => {
    const params = new URLSearchParams({ shopId });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return `/dashboard/sales?${params.toString()}`;
  };

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-card to-sky-500/10" />
        <div className="relative space-y-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-success/15 text-success text-lg">
                🧾
              </span>
              <div>
                <h2 className="text-lg font-bold text-foreground">বিক্রি রিপোর্ট</h2>
                <p className="text-xs text-muted-foreground">
                  এক নজরে বিক্রি, গড় বিল, পেমেন্ট ধরন, তারপর নিচে বিলের তালিকা
                </p>
              </div>
            </div>
            <Link
              href={buildHref()}
              className="inline-flex h-7 items-center rounded-full border border-primary/20 bg-primary-soft px-3 text-xs font-semibold text-primary hover:bg-primary/20"
            >
              পূর্ণ রিপোর্ট দেখুন
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div className="rounded-2xl border border-border bg-card/90 p-3">
              <p className="text-xs text-muted-foreground">মোট বিক্রি</p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {summaryData ? formatMoney(Number(summaryData.sales.totalAmount ?? 0)) : "..."}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                নির্বাচিত সময়ের নেট বিক্রি
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card/90 p-3">
              <p className="text-xs text-muted-foreground">মোট বিল</p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {summaryData ? completedCount : "..."}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                সফলভাবে সম্পন্ন বিক্রি
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card/90 p-3">
              <p className="text-xs text-muted-foreground">গড় বিল</p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {summaryData ? formatMoney(averageBill) : "..."}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                প্রতি বিলে গড়ে বিক্রি
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card/90 p-3">
              <p className="text-xs text-muted-foreground">বাতিল বিল</p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {summaryData ? voidedCount : "..."}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                একই সময়ে বাতিল হওয়া বিক্রি
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card/90 p-3">
              <p className="text-xs text-muted-foreground">এই তালিকায় বেশি</p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {topPayment ? topPayment.label : loading ? "..." : "তথ্য নেই"}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {topPayment
                  ? `${topPayment.count} বিল · ${formatMoney(topPayment.total)}`
                  : "দেখানো বিল থেকে হিসাব"}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            <p>
              সহজভাবে: <span className="font-semibold text-foreground">মোট বিক্রি</span> দেখুন,
              তারপর <span className="font-semibold text-foreground">গড় বিল</span> ও
              <span className="font-semibold text-foreground"> পেমেন্ট ধরন</span> বুঝুন,
              শেষে নিচের তালিকা থেকে কোন বিল কার ছিল সেটা দেখুন।
            </p>
          </div>

          <div className="hidden sm:flex flex-wrap gap-2">
            <span className="inline-flex h-8 items-center rounded-full border border-border bg-card/80 px-3 text-xs font-semibold text-muted-foreground">
              দেখানো তালিকার মোট: {formatMoney(shownTotal)}
            </span>
            {paymentBreakdown.slice(0, 3).map((method) => (
              <span
                key={method.label}
                className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold ${getPaymentTone(
                  method.key
                )}`}
              >
                {method.label}: {formatMoney(method.total)}
              </span>
            ))}
          </div>
          <div className="sm:hidden rounded-2xl border border-border bg-card/90 p-3">
            <p className="text-xs text-muted-foreground">এই তালিকায় সবচেয়ে বেশি</p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {topPayment
                ? `${topPayment.label} · ${formatMoney(topPayment.total)}`
                : `মোট: ${formatMoney(shownTotal)}`}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border/70 bg-card/80 p-3 shadow-[0_10px_20px_rgba(15,23,42,0.06)] space-y-3">
        <div className="flex items-center justify-between gap-3 px-1">
          <div>
            <h3 className="text-base font-semibold text-foreground">সাম্প্রতিক বিল তালিকা</h3>
            <p className="text-xs text-muted-foreground">
              কোন বিল, কার নামে, কীভাবে পেমেন্ট হয়েছে, কত আইটেম ছিল
            </p>
          </div>
          <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground">
            সর্বশেষ {REPORT_ROW_LIMIT} টি
          </span>
        </div>

        {items.length === 0 ? (
          <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            {showEmpty ? "কোনো বিক্রি পাওয়া যায়নি" : "লোড হচ্ছে..."}
          </p>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-3 text-left text-foreground">বিল</th>
                    <th className="p-3 text-center text-foreground">পণ্য</th>
                    <th className="p-3 text-center text-foreground">পেমেন্ট</th>
                    <th className="p-3 text-right text-foreground">সময়</th>
                    <th className="p-3 text-right text-foreground">টাকা</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((s) => {
                    const amount = Number(s.totalAmount || 0);
                    const billTitle = getBillTitle(s);
                    const billMeta = getBillMeta(s);
                    const itemCount = Number(s._count?.saleItems ?? 0);
                    return (
                      <tr key={s.id} className="border-t hover:bg-muted/50">
                        <td className="p-3">
                          <div>
                            <p className="font-semibold text-foreground">{billTitle}</p>
                            {billMeta ? (
                              <p className="text-xs text-muted-foreground">
                                {shortenText(billMeta, 36)}
                              </p>
                            ) : null}
                          </div>
                        </td>
                        <td className="p-3 text-center text-foreground">
                          {itemCount || "-"}
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getPaymentTone(
                              s.paymentMethod
                            )}`}
                          >
                            {formatPaymentMethod(s.paymentMethod)}
                          </span>
                        </td>
                        <td className="p-3 text-right text-muted-foreground">
                          {new Date(s.saleDate).toLocaleString("bn-BD", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="p-3 text-right font-semibold text-foreground">
                          {formatMoney(amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {items.map((s) => {
                const amount = Number(s.totalAmount || 0);
                const billTitle = getBillTitle(s);
                const billMeta = getBillMeta(s);
                const itemCount = Number(s._count?.saleItems ?? 0);
                return (
                  <div
                    key={s.id}
                    className="relative overflow-hidden rounded-2xl border border-success/20 bg-card p-3.5 shadow-sm transition-all hover:shadow-md"
                  >
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-success-soft/40 via-transparent to-transparent" />
                    <div className="relative space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-success/15 text-success text-lg">
                            🛒
                          </span>
                          <div>
                            <p className="text-xs text-muted-foreground">বিল</p>
                            <h4 className="text-base font-semibold text-foreground">
                              {billTitle}
                            </h4>
                            {billMeta ? (
                              <p className="text-xs text-muted-foreground mt-1">
                                {shortenText(billMeta, 42)}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getPaymentTone(
                            s.paymentMethod
                          )}`}
                        >
                          {formatPaymentMethod(s.paymentMethod)}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5 text-sm">
                        <div className="rounded-xl bg-muted/60 p-3">
                          <p className="text-xs text-muted-foreground">পণ্য</p>
                          <p className="mt-1 font-semibold text-foreground">
                            {itemCount || 0} টি
                          </p>
                        </div>
                        <div className="rounded-xl bg-muted/60 p-3">
                          <p className="text-xs text-muted-foreground">সময়</p>
                          <p className="mt-1 font-semibold text-foreground">
                            {new Date(s.saleDate).toLocaleString("bn-BD", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                        <span>মোট টাকা</span>
                        <span className="font-semibold text-foreground">
                          {formatMoney(amount)}
                        </span>
                      </div>

                      {s.note?.trim() ? (
                        <p className="text-xs text-muted-foreground">{s.note}</p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
            {loading && (
              <p className="text-xs text-muted-foreground text-center pt-1">
                আপডেট হচ্ছে...
              </p>
            )}
          </>
        )}
      </div>

      {(page > 1 || hasMore) && (
        <div className="flex items-center justify-between gap-2 pt-2">
          <button
            type="button"
            onClick={handlePrev}
            disabled={page <= 1 || loading || !online}
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Prev
          </button>
          <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground">
            Page {page}
          </span>
          <button
            type="button"
            onClick={handleNext}
            disabled={!hasMore || !nextCursor || loading || !online}
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
