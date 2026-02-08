// app/dashboard/reports/components/ProfitTrendReport.tsx

"use client";

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { handlePermissionError } from "@/lib/permission-toast";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";

type ProfitRow = { date: string; sales: number; expense: number };
type Props = { shopId: string; from?: string; to?: string };

export default function ProfitTrendReport({ shopId, from, to }: Props) {
  const online = useOnlineStatus();

  const buildCacheKey = useCallback(
    (rangeFrom?: string, rangeTo?: string) =>
      `reports:profit:${shopId}:${rangeFrom || "all"}:${rangeTo || "all"}`,
    [shopId]
  );

  
  const readCached = useCallback(
    (rangeFrom?: string, rangeTo?: string) => {
      if (typeof window === "undefined") return null;
      try {
        const raw = safeLocalStorageGet(buildCacheKey(rangeFrom, rangeTo));
        if (!raw) {
          return null;
        }
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as ProfitRow[]) : null;
      } catch (err) {
        handlePermissionError(err);
        console.warn("Profit report cache read failed", err);
        return null;
      }
    },
    [buildCacheKey]
  );

  const fetchProfit = useCallback(
    async (rangeFrom?: string, rangeTo?: string) => {
      const params = new URLSearchParams({ shopId });
      if (rangeFrom) params.append("from", rangeFrom);
      if (rangeTo) params.append("to", rangeTo);
      const res = await fetch(`/api/reports/profit-trend?${params.toString()}`, {
        cache: "no-store",
      });
      if (res.status === 304) {
        return readCached(rangeFrom, rangeTo) ?? [];
      }
      if (!res.ok) {
        const cached = readCached(rangeFrom, rangeTo);
        if (cached) return cached;
        throw new Error("Profit report fetch failed");
      }
      const json = await res.json();
      const rows = Array.isArray(json?.data) ? json.data : [];
      if (typeof window !== "undefined") {
        try {
          safeLocalStorageSet(
            buildCacheKey(rangeFrom, rangeTo),
            JSON.stringify(rows)
          );
        } catch (err) {
          handlePermissionError(err);
          console.warn("Profit report cache write failed", err);
        }
      }
      return rows;
    },
    [shopId, buildCacheKey, readCached]
  );

  const profitQueryKey = useMemo(
    () => ["reports", "profit", shopId, from ?? "all", to ?? "all"],
    [shopId, from, to]
  );

  const initialRows = useMemo(
    () => readCached(from, to) ?? undefined,
    [readCached, from, to]
  );
  const hasInitialRows = initialRows !== undefined;

  const profitQuery = useQuery({
    queryKey: profitQueryKey,
    queryFn: () => fetchProfit(from, to),
    enabled: online,
    ...(hasInitialRows ? { initialData: initialRows } : {}),
    ...(hasInitialRows ? { placeholderData: initialRows } : {}),
  });

  const data: ProfitRow[] = useMemo(
    () => profitQuery.data ?? initialRows ?? [],
    [profitQuery.data, initialRows]
  );
  const loading = profitQuery.isFetching && online;
  const hasFetched = profitQuery.isFetchedAfterMount;
  const showEmpty = data.length === 0 && (!online || hasFetched) && !loading;

  const totalProfit = useMemo(
    () =>
      data.reduce(
        (sum, row) => sum + Number(row.sales || 0) - Number(row.expense || 0),
        0
      ),
    [data]
  );
  const showTotalPlaceholder = data.length === 0 && loading && !hasFetched;

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-soft/50 via-card to-card" />
        <div className="relative space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary text-lg">
                📈
              </span>
              <div>
                <h2 className="text-lg font-bold text-foreground">লাভের প্রবণতা</h2>
                <p className="text-xs text-muted-foreground">
                  দিনওয়ারি লাভ/খরচ (COGS সহ)
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="inline-flex h-7 items-center rounded-full border border-border bg-card/80 px-3 text-muted-foreground">
              মোট লাভ: {showTotalPlaceholder ? "লোড হচ্ছে..." : `${totalProfit.toFixed(2)} ৳`}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border overflow-x-auto hidden md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-3 text-left text-foreground">তারিখ</th>
              <th className="p-3 text-right text-foreground">বিক্রি (৳)</th>
              <th className="p-3 text-right text-foreground">
                খরচ + COGS (৳)
              </th>
              <th className="p-3 text-right text-foreground">লাভ (৳)</th>
            </tr>
          </thead>

          <tbody>
            {data.length === 0 ? (
              <tr>
                <td className="p-3 text-center text-muted-foreground" colSpan={4}>
                  {showEmpty ? "কোনো তথ্য নেই" : "লোড হচ্ছে..."}
                </td>
              </tr>
            ) : (
              data.map((row, idx) => {
                const profit =
                  Number(row.sales || 0) - Number(row.expense || 0);
                return (
                  <tr
                    key={`${row.date}-${idx}`}
                    className="border-t hover:bg-muted transition-colors"
                  >
                    <td className="p-3 text-foreground">
                      {new Date(row.date).toLocaleDateString("bn-BD")}
                    </td>
                    <td className="p-3 text-right text-foreground">
                      {Number(row.sales || 0).toFixed(2)}
                    </td>
                    <td className="p-3 text-right text-foreground">
                      {Number(row.expense || 0).toFixed(2)}
                    </td>
                    <td
                      className={`p-2 text-right font-semibold ${
                        profit >= 0 ? "text-success" : "text-danger"
                      }`}
                    >
                      {profit.toFixed(2)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        {loading && data.length > 0 && (
          <p className="p-2 text-center text-xs text-muted-foreground">
            আপডেট হচ্ছে...
          </p>
        )}
      </div>

      <div className="space-y-3 md:hidden">
        {data.length === 0 ? (
          <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            {showEmpty ? "কোনো তথ্য নেই" : "লোড হচ্ছে..."}
          </p>
        ) : (
          <>
            {data.map((row, idx) => {
              const profit = Number(row.sales || 0) - Number(row.expense || 0);
              const positive = profit >= 0;
              return (
                <div
                  key={`${row.date}-${idx}`}
                  className="relative overflow-hidden bg-card border border-border/70 rounded-2xl p-4 shadow-[0_10px_20px_rgba(15,23,42,0.06)] flex gap-3"
                >
                  <div
                    className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${
                      positive ? "from-success-soft/35" : "from-danger-soft/35"
                    } via-transparent to-transparent`}
                  />
                  <div
                    className={`relative w-1 rounded-full ${
                      positive ? "bg-success" : "bg-danger"
                    }`}
                  />
                  <div className="relative flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">#{idx + 1}</p>
                        <h3 className="text-base font-semibold text-foreground mt-1">
                          {new Date(row.date).toLocaleDateString("bn-BD")}
                        </h3>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          positive
                            ? "bg-success-soft text-success"
                            : "bg-danger-soft text-danger"
                        }`}
                      >
                        {positive ? "লাভ" : "ক্ষতি"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground">
                      <div className="bg-muted/60 rounded-xl p-3">
                        <p className="text-xs text-muted-foreground">বিক্রি</p>
                        <p className="text-base font-semibold text-foreground">
                          {Number(row.sales || 0).toFixed(2)} ৳
                        </p>
                      </div>
                      <div className="bg-muted/60 rounded-xl p-3">
                        <p className="text-xs text-muted-foreground">
                          খরচ + COGS
                        </p>
                        <p className="text-base font-semibold text-foreground">
                          {Number(row.expense || 0).toFixed(2)} ৳
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>লাভ</span>
                      <span
                        className={`font-semibold ${
                          positive ? "text-success" : "text-danger"
                        }`}
                      >
                        {profit.toFixed(2)} ৳
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
            {loading && (
              <p className="text-xs text-muted-foreground text-center">
                আপডেট হচ্ছে...
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
