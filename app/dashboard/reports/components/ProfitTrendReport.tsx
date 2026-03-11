// app/dashboard/reports/components/ProfitTrendReport.tsx

"use client";

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { handlePermissionError } from "@/lib/permission-toast";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";

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
  return `${value.toFixed(2)} ৳`;
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function normalizeProfitRow(row: ProfitRow): NormalizedProfitRow {
  const sales = Number(row.sales ?? 0);
  const totalExpense = Number(row.expense ?? 0);
  const cogs = Number(row.cogs ?? 0);
  const operatingExpense = Number(
    row.operatingExpense ?? Math.max(totalExpense - cogs, 0)
  );
  const grossProfit = Number(row.grossProfit ?? sales - cogs);
  const netProfit = Number(row.netProfit ?? grossProfit - operatingExpense);
  const grossMarginPct = Number(
    row.grossMarginPct ?? (sales ? (grossProfit / sales) * 100 : 0)
  );
  const netMarginPct = Number(
    row.netMarginPct ?? (sales ? (netProfit / sales) * 100 : 0)
  );

  return {
    date: row.date,
    sales,
    expense: totalExpense,
    operatingExpense,
    cogs,
    grossProfit,
    netProfit,
    grossMarginPct,
    netMarginPct,
  };
}

export default function ProfitTrendReport({
  shopId,
  from,
  to,
  needsCogs = false,
}: Props) {
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
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed)
          ? (parsed as ProfitRow[]).map(normalizeProfitRow)
          : null;
      } catch (err) {
        handlePermissionError(err);
        console.warn("Profit report cache read failed", err);
        return null;
      }
    },
    [buildCacheKey]
  );

  const fetchProfit = useCallback(
    async (rangeFrom?: string, rangeTo?: string, fresh = false) => {
      const params = new URLSearchParams({ shopId });
      if (rangeFrom) params.append("from", rangeFrom);
      if (rangeTo) params.append("to", rangeTo);
      if (fresh) params.append("fresh", "1");
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
      const rows = Array.isArray(json?.data)
        ? (json.data as ProfitRow[]).map(normalizeProfitRow)
        : [];
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

  const initialRows = useMemo(() => {
    if (online) return undefined;
    return readCached(from, to) ?? undefined;
  }, [online, readCached, from, to]);
  const hasInitialRows = initialRows !== undefined;

  const profitQuery = useQuery({
    queryKey: profitQueryKey,
    queryFn: () => fetchProfit(from, to, true),
    enabled: online,
    staleTime: 0,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: "always",
    ...(hasInitialRows ? { initialData: initialRows } : {}),
  });

  const rawData: NormalizedProfitRow[] = useMemo(
    () => profitQuery.data ?? initialRows ?? [],
    [profitQuery.data, initialRows]
  );
  const loading = profitQuery.isFetching && online;
  const hasFetched = profitQuery.isFetchedAfterMount;
  const data = rawData;
  const showEmpty = data.length === 0 && (!online || hasFetched) && !loading;
  const showTotalPlaceholder = data.length === 0 && loading;

  const totals = useMemo(() => {
    const aggregated = data.reduce(
      (sum, row) => ({
        sales: sum.sales + row.sales,
        cogs: sum.cogs + row.cogs,
        operatingExpense: sum.operatingExpense + row.operatingExpense,
        grossProfit: sum.grossProfit + row.grossProfit,
        netProfit: sum.netProfit + row.netProfit,
      }),
      { sales: 0, cogs: 0, operatingExpense: 0, grossProfit: 0, netProfit: 0 }
    );

    return {
      ...aggregated,
      grossMarginPct: aggregated.sales
        ? (aggregated.grossProfit / aggregated.sales) * 100
        : 0,
      netMarginPct: aggregated.sales
        ? (aggregated.netProfit / aggregated.sales) * 100
        : 0,
    };
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-soft/50 via-card to-card" />
        <div className="relative space-y-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary text-lg">
                📈
              </span>
              <div>
                <h2 className="text-lg font-bold text-foreground">সহজ লাভ রিপোর্ট</h2>
                <p className="text-xs text-muted-foreground">
                  বিক্রি থেকে পণ্যের খরচ ও অন্যান্য খরচ বাদ দিলে হাতে কত লাভ থাকছে
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="inline-flex h-7 items-center rounded-full border border-border bg-card/80 px-3 text-muted-foreground">
                {showTotalPlaceholder
                  ? "লাভ হিসাব হচ্ছে..."
                  : `চূড়ান্ত লাভ: ${formatMoney(totals.netProfit)}`}
              </span>
              <span className="inline-flex h-7 items-center rounded-full border border-border bg-card/80 px-3 text-muted-foreground">
                লাভের হার: {showTotalPlaceholder ? "..." : formatPercent(totals.netMarginPct)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <div className="rounded-2xl border border-border bg-card/90 p-3">
              <p className="text-xs text-muted-foreground">মোট বিক্রি</p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {showTotalPlaceholder ? "..." : formatMoney(totals.sales)}
              </p>
            </div>
            {needsCogs ? (
              <div className="rounded-2xl border border-border bg-card/90 p-3">
                <p className="text-xs text-muted-foreground">পণ্যের খরচ</p>
                <p className="mt-1 text-lg font-bold text-foreground">
                  {showTotalPlaceholder ? "..." : formatMoney(totals.cogs)}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  বিক্রিত পণ্যের ক্রয়মূল্য
                </p>
              </div>
            ) : null}
            <div className="rounded-2xl border border-border bg-card/90 p-3">
              <p className="text-xs text-muted-foreground">অন্যান্য খরচ</p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {showTotalPlaceholder ? "..." : formatMoney(totals.operatingExpense)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                ভাড়া, বেতন, দৈনিক খরচ
              </p>
            </div>
            {needsCogs ? (
              <div className="rounded-2xl border border-border bg-card/90 p-3">
                <p className="text-xs text-muted-foreground">প্রাথমিক লাভ</p>
                <p className="mt-1 text-lg font-bold text-foreground">
                  {showTotalPlaceholder ? "..." : formatMoney(totals.grossProfit)}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  বিক্রি - পণ্যের খরচ
                </p>
              </div>
            ) : null}
            <div className="rounded-2xl border border-border bg-card/90 p-3">
              <p className="text-xs text-muted-foreground">চূড়ান্ত লাভ</p>
              <p
                className={`mt-1 text-lg font-bold ${
                  totals.netProfit >= 0 ? "text-success" : "text-danger"
                }`}
              >
                {showTotalPlaceholder ? "..." : formatMoney(totals.netProfit)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                সব খরচ বাদে হাতে থাকা লাভ
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card/90 p-3">
              <p className="text-xs text-muted-foreground">লাভের হার</p>
              <p
                className={`mt-1 text-lg font-bold ${
                  totals.netMarginPct >= 0 ? "text-success" : "text-danger"
                }`}
              >
                {showTotalPlaceholder ? "..." : formatPercent(totals.netMarginPct)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                প্রতি ১০০ টাকায় কত টাকা লাভ
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            {needsCogs ? (
              <p>
                সূত্র: <span className="font-semibold text-foreground">মোট বিক্রি</span> -
                <span className="font-semibold text-foreground"> পণ্যের খরচ</span> =
                <span className="font-semibold text-foreground"> প্রাথমিক লাভ</span> -
                <span className="font-semibold text-foreground"> অন্যান্য খরচ</span> =
                <span className="font-semibold text-foreground"> চূড়ান্ত লাভ</span>
              </p>
            ) : (
              <p>
                সূত্র: <span className="font-semibold text-foreground">মোট বিক্রি</span> -
                <span className="font-semibold text-foreground"> অন্যান্য খরচ</span> =
                <span className="font-semibold text-foreground"> চূড়ান্ত লাভ</span>
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border overflow-x-auto hidden md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-3 text-left text-foreground">তারিখ</th>
              <th className="p-3 text-right text-foreground">মোট বিক্রি</th>
              {needsCogs ? (
                <th className="p-3 text-right text-foreground">পণ্যের খরচ</th>
              ) : null}
              <th className="p-3 text-right text-foreground">অন্যান্য খরচ</th>
              {needsCogs ? (
                <th className="p-3 text-right text-foreground">প্রাথমিক লাভ</th>
              ) : null}
              <th className="p-3 text-right text-foreground">চূড়ান্ত লাভ</th>
              <th className="p-3 text-right text-foreground">লাভের হার</th>
            </tr>
          </thead>

          <tbody>
            {data.length === 0 ? (
              <tr>
                <td
                  className="p-3 text-center text-muted-foreground"
                  colSpan={needsCogs ? 7 : 5}
                >
                  {showEmpty ? "কোনো তথ্য নেই" : "লোড হচ্ছে..."}
                </td>
              </tr>
            ) : (
              data.map((row, idx) => (
                <tr
                  key={`${row.date}-${idx}`}
                  className="border-t hover:bg-muted transition-colors"
                >
                  <td className="p-3 text-foreground">
                    {new Date(row.date).toLocaleDateString("bn-BD")}
                  </td>
                  <td className="p-3 text-right text-foreground">
                    {row.sales.toFixed(2)}
                  </td>
                  {needsCogs ? (
                    <td className="p-3 text-right text-foreground">
                      {row.cogs.toFixed(2)}
                    </td>
                  ) : null}
                  <td className="p-3 text-right text-foreground">
                    {row.operatingExpense.toFixed(2)}
                  </td>
                  {needsCogs ? (
                    <td className="p-3 text-right text-foreground">
                      {row.grossProfit.toFixed(2)}
                    </td>
                  ) : null}
                  <td
                    className={`p-3 text-right font-semibold ${
                      row.netProfit >= 0 ? "text-success" : "text-danger"
                    }`}
                  >
                    {row.netProfit.toFixed(2)}
                  </td>
                  <td
                    className={`p-3 text-right font-semibold ${
                      row.netMarginPct >= 0 ? "text-success" : "text-danger"
                    }`}
                  >
                    {formatPercent(row.netMarginPct)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {loading && data.length > 0 ? (
          <p className="p-2 text-center text-xs text-muted-foreground">
            আপডেট হচ্ছে...
          </p>
        ) : null}
      </div>

      <div className="space-y-3 md:hidden">
        {data.length === 0 ? (
          <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            {showEmpty ? "কোনো তথ্য নেই" : "লোড হচ্ছে..."}
          </p>
        ) : (
          <>
            {data.map((row, idx) => {
              const positive = row.netProfit >= 0;
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
                  <div className="relative flex-1 space-y-3">
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

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="bg-muted/60 rounded-xl p-3">
                        <p className="text-xs text-muted-foreground">মোট বিক্রি</p>
                        <p className="text-base font-semibold text-foreground">
                          {formatMoney(row.sales)}
                        </p>
                      </div>
                      {needsCogs ? (
                        <div className="bg-muted/60 rounded-xl p-3">
                          <p className="text-xs text-muted-foreground">পণ্যের খরচ</p>
                          <p className="text-base font-semibold text-foreground">
                            {formatMoney(row.cogs)}
                          </p>
                        </div>
                      ) : null}
                      <div className="bg-muted/60 rounded-xl p-3">
                        <p className="text-xs text-muted-foreground">অন্যান্য খরচ</p>
                        <p className="text-base font-semibold text-foreground">
                          {formatMoney(row.operatingExpense)}
                        </p>
                      </div>
                      {needsCogs ? (
                        <div className="bg-muted/60 rounded-xl p-3">
                          <p className="text-xs text-muted-foreground">প্রাথমিক লাভ</p>
                          <p className="text-base font-semibold text-foreground">
                            {formatMoney(row.grossProfit)}
                          </p>
                        </div>
                      ) : null}
                    </div>

                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>চূড়ান্ত লাভ</span>
                      <span
                        className={`font-semibold ${
                          positive ? "text-success" : "text-danger"
                        }`}
                      >
                        {formatMoney(row.netProfit)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>লাভের হার</span>
                      <span
                        className={`font-semibold ${
                          row.netMarginPct >= 0 ? "text-success" : "text-danger"
                        }`}
                      >
                        {formatPercent(row.netMarginPct)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
            {loading ? (
              <p className="text-xs text-muted-foreground text-center">
                আপডেট হচ্ছে...
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
