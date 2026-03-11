// app/dashboard/reports/components/ExpenseReport.tsx

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
  expense: {
    totalAmount: number;
    count?: number;
  };
};
type ExpenseRow = {
  id: string;
  amount: number | string;
  category?: string | null;
  note?: string | null;
  expenseDate: string;
  createdAt?: string;
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

function shortenText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}...`;
}

function formatExpenseDateTime(item: ExpenseRow) {
  const businessDate = new Date(item.expenseDate);
  const entryTime = item.createdAt ? new Date(item.createdAt) : null;
  const dateLabel = businessDate.toLocaleDateString("bn-BD");

  if (!entryTime || Number.isNaN(entryTime.getTime())) {
    return dateLabel;
  }

  const timeLabel = entryTime.toLocaleTimeString("bn-BD", {
    hour: "numeric",
    minute: "2-digit",
  });

  return `${dateLabel} • ${timeLabel}`;
}

export default function ExpenseReport({ shopId, from, to }: Props) {
  const online = useOnlineStatus();
  const [page, setPage] = useState(1);
  const [cursorList, setCursorList] = useState<ReportCursor[]>([]);

  const currentCursor = page > 1 ? cursorList[page - 2] ?? null : null;

  const buildCacheKey = useCallback(
    (rangeFrom?: string, rangeTo?: string) =>
      `reports:expenses:${shopId}:${rangeFrom || "all"}:${rangeTo || "all"}:${REPORT_ROW_LIMIT}`,
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
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as ExpenseRow[]) : null;
      } catch (err) {
        handlePermissionError(err);
        console.warn("Expense report cache read failed", err);
        return null;
      }
    },
    [buildCacheKey]
  );

  const fetchExpenses = useCallback(
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
      } else {
        params.append("fresh", "1");
      }

      const res = await fetch(`/api/reports/expenses?${params.toString()}`, {
        cache: "no-store",
      });
      if (res.status === 304) {
        const cached = readCached(rangeFrom, rangeTo);
        if (cached && !cursor) {
          return { rows: cached, hasMore: false, nextCursor: null };
        }
        throw new Error("Expense report not modified");
      }
      if (!res.ok) {
        const cached = readCached(rangeFrom, rangeTo);
        if (cached && !cursor) {
          return { rows: cached, hasMore: false, nextCursor: null };
        }
        throw new Error("Expense report fetch failed");
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
          console.warn("Expense report cache write failed", err);
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

  const fetchSummary = useCallback(async () => {
    const params = new URLSearchParams({ shopId });
    if (from) params.append("from", from);
    if (to) params.append("to", to);
    params.append("fresh", "1");
    const res = await fetch(`/api/reports/summary?${params.toString()}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error("Expense summary fetch failed");
    }
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

  const expenseQueryKey = useMemo(
    () => [
      "reports",
      "expenses",
      shopId,
      from ?? "all",
      to ?? "all",
      page,
      currentCursor?.at ?? "start",
      currentCursor?.id ?? "start",
    ],
    [shopId, from, to, page, currentCursor?.at, currentCursor?.id]
  );

  const initialExpenseData = useMemo(() => {
    if (online || page !== 1) {
      return { rows: [], hasMore: false, nextCursor: null };
    }
    const cached = readCached(from, to);
    return cached
      ? { rows: cached, hasMore: false, nextCursor: null }
      : { rows: [], hasMore: false, nextCursor: null };
  }, [online, page, readCached, from, to]);

  const expenseQuery = useQuery({
    queryKey: expenseQueryKey,
    queryFn: () => fetchExpenses(from, to, currentCursor, page === 1),
    enabled: online,
    initialData: initialExpenseData,
    staleTime: 0,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: "always",
  });

  const rawItems: ExpenseRow[] = useMemo(
    () => expenseQuery.data?.rows ?? initialExpenseData.rows ?? [],
    [expenseQuery.data?.rows, initialExpenseData.rows]
  );
  const items: ExpenseRow[] = rawItems;
  const hasMore =
    expenseQuery.data?.hasMore ?? initialExpenseData.hasMore ?? false;
  const nextCursor =
    expenseQuery.data?.nextCursor ?? initialExpenseData.nextCursor ?? null;
  const loading = expenseQuery.isFetching && online;
  const hasFetched = expenseQuery.isFetchedAfterMount;
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

  const summaryData = summaryQuery.data;
  const listTotal = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [items]
  );
  const totalExpense = summaryData?.expense.totalAmount ?? listTotal;
  const entryCount = summaryData?.expense.count ?? items.length;
  const averageExpense = entryCount > 0 ? totalExpense / entryCount : 0;

  const categoryBreakdown = useMemo(() => {
    const totals = new Map<string, number>();
    for (const item of items) {
      const label = item.category?.trim() || "অনির্ধারিত খরচ";
      totals.set(label, (totals.get(label) ?? 0) + Number(item.amount || 0));
    }
    return Array.from(totals.entries())
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [items]);

  const topCategory = categoryBreakdown[0] ?? null;
  const showSummaryPlaceholder = !summaryData && summaryQuery.isFetching;

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
    return `/dashboard/expenses?${params.toString()}`;
  };

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-danger-soft/45 via-card to-card" />
        <div className="relative space-y-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-danger/15 text-danger text-lg">
                💸
              </span>
              <div>
                <h2 className="text-lg font-bold text-foreground">সহজ খরচ রিপোর্ট</h2>
                <p className="text-xs text-muted-foreground">
                  কোন খাতে কত খরচ হয়েছে, সেটা এক নজরে বোঝার জন্য এই রিপোর্ট
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

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-2xl border border-border bg-card/90 p-3">
              <p className="text-xs text-muted-foreground">মোট খরচ</p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {showSummaryPlaceholder ? "..." : formatMoney(totalExpense)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                নির্বাচিত সময়ের মোট খরচ
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card/90 p-3">
              <p className="text-xs text-muted-foreground">মোট এন্ট্রি</p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {showSummaryPlaceholder ? "..." : entryCount}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                সব খরচের রেকর্ড মিলিয়ে
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card/90 p-3">
              <p className="text-xs text-muted-foreground">গড় খরচ</p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {showSummaryPlaceholder ? "..." : formatMoney(averageExpense)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                প্রতি এন্ট্রিতে গড় খরচ
              </p>
            </div>
            <div className="col-span-2 rounded-2xl border border-border bg-card/90 p-3 lg:col-span-1">
              <p className="text-xs text-muted-foreground">সবচেয়ে বেশি খাত</p>
              <p className="mt-1 text-sm font-bold text-foreground">
                {topCategory?.label ||
                  (loading && items.length === 0 ? "লোড হচ্ছে..." : "তথ্য নেই")}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {topCategory
                  ? `${formatMoney(topCategory.amount)} এই তালিকায়`
                  : "visible list অনুযায়ী দেখানো হচ্ছে"}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            <p>
              সহজভাবে: <span className="font-semibold text-foreground">কোথায় টাকা যাচ্ছে</span>{" "}
              সেটা আগে বুঝুন। তারপর নিচের তালিকা দেখে দেখুন কোন খাতে খরচ বেশি
              হয়েছে, আর কোন খরচগুলো বারবার হচ্ছে।
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="inline-flex h-7 items-center rounded-full border border-border bg-card/80 px-3 text-muted-foreground">
              এই তালিকায় দেখা যাচ্ছে: {formatMoney(listTotal)}
            </span>
            {categoryBreakdown.slice(0, 3).map((item) => (
              <span
                key={item.label}
                className="inline-flex h-7 items-center rounded-full border border-danger/20 bg-danger-soft/40 px-3 text-danger"
              >
                {shortenText(item.label, 18)} • {formatMoney(item.amount)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border/70 bg-card/80 p-3 shadow-[0_10px_20px_rgba(15,23,42,0.06)]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">খরচের বিস্তারিত তালিকা</h3>
            <p className="text-xs text-muted-foreground">
              category, note, date আর amount একসাথে দেখে দ্রুত মিলিয়ে নিন
            </p>
          </div>
          <span className="hidden rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground md:inline-flex">
            Page {page}
          </span>
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="p-3 text-left text-foreground">খাত</th>
                <th className="p-3 text-left text-foreground">বিস্তারিত</th>
                <th className="p-3 text-left text-foreground">তারিখ</th>
                <th className="p-3 text-right text-foreground">টাকা</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td className="p-4 text-center text-muted-foreground" colSpan={4}>
                    {showEmpty ? "কোনো খরচ পাওয়া যায়নি" : "লোড হচ্ছে..."}
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="border-t border-border/70">
                    <td className="p-3 align-top">
                      <div className="font-semibold text-foreground">
                        {item.category?.trim() || "অনির্ধারিত খরচ"}
                      </div>
                    </td>
                    <td className="p-3 align-top text-muted-foreground">
                      {item.note?.trim()
                        ? shortenText(item.note.trim(), 70)
                        : "কোনো নোট দেওয়া হয়নি"}
                    </td>
                    <td className="p-3 align-top text-muted-foreground">
                      {formatExpenseDateTime(item)}
                    </td>
                    <td className="p-3 align-top text-right font-semibold text-danger">
                      {formatMoney(Number(item.amount || 0))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 md:hidden">
          {items.length === 0 ? (
            <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
              {showEmpty ? "কোনো খরচ পাওয়া যায়নি" : "লোড হচ্ছে..."}
            </p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-danger/20 bg-card p-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-foreground">
                      {item.category?.trim() || "অনির্ধারিত খরচ"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.note?.trim()
                        ? shortenText(item.note.trim(), 60)
                        : "কোনো নোট দেওয়া হয়নি"}
                    </p>
                  </div>
                  <span className="rounded-full border border-danger/20 bg-danger-soft/40 px-2.5 py-1 text-xs font-semibold text-danger">
                    {formatMoney(Number(item.amount || 0))}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>তারিখ</span>
                  <span>
                    {formatExpenseDateTime(item)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {loading && (
          <p className="pt-3 text-center text-xs text-muted-foreground">
            আপডেট হচ্ছে...
          </p>
        )}
      </div>

      {(page > 1 || hasMore) && (
        <div className="flex items-center justify-between gap-2 pt-2">
          <button
            type="button"
            onClick={handlePrev}
            disabled={page <= 1 || loading || !online}
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
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
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
