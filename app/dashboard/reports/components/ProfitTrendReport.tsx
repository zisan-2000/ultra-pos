// app/dashboard/reports/components/ProfitTrendReport.tsx

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useOnlineStatus } from "@/lib/sync/net-status";

type ProfitRow = { date: string; sales: number; expense: number };
type Props = { shopId: string; from?: string; to?: string };

export default function ProfitTrendReport({ shopId, from, to }: Props) {
  const online = useOnlineStatus();
  const [data, setData] = useState<ProfitRow[]>([]);
  const [loading, setLoading] = useState(false);

  const buildCacheKey = useCallback(
    (rangeFrom?: string, rangeTo?: string) =>
      `reports:profit:${shopId}:${rangeFrom || "all"}:${rangeTo || "all"}`,
    [shopId]
  );

  const loadCached = useCallback(
    (rangeFrom?: string, rangeTo?: string) => {
      try {
        const raw = localStorage.getItem(buildCacheKey(rangeFrom, rangeTo));
        if (!raw) {
          setData([]);
          return false;
        }
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setData(parsed);
          return true;
        }
      } catch (err) {
        console.warn("Profit report cache read failed", err);
      }
      setData([]);
      return false;
    },
    [buildCacheKey]
  );

  const load = useCallback(
    async (rangeFrom?: string, rangeTo?: string) => {
      if (!online) {
        setLoading(false);
        loadCached(rangeFrom, rangeTo);
        return;
      }
      setLoading(true);
      try {
        const params = new URLSearchParams({ shopId });
        if (rangeFrom) params.append("from", rangeFrom);
        if (rangeTo) params.append("to", rangeTo);

        const res = await fetch(`/api/reports/profit-trend?${params.toString()}`);
        if (!res.ok) {
          loadCached(rangeFrom, rangeTo);
          return;
        }
        const json = await res.json();
        const rows = json.data || [];
        setData(rows);
        try {
          localStorage.setItem(
            buildCacheKey(rangeFrom, rangeTo),
            JSON.stringify(rows)
          );
        } catch (err) {
          console.warn("Profit report cache write failed", err);
        }
      } finally {
        setLoading(false);
      }
    },
    [online, shopId, buildCacheKey, loadCached]
  );

  useEffect(() => {
    void load(from, to);
  }, [load, from, to]);

  const totalProfit = useMemo(
    () =>
      data.reduce(
        (sum, row) => sum + Number(row.sales || 0) - Number(row.expense || 0),
        0
      ),
    [data]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">লাভের প্রবণতা</h2>
          <p className="text-xs text-muted-foreground">দিনওয়ারি লাভ/খরচ</p>
        </div>
      </div>

      <p className="text-sm font-semibold text-foreground">
        মোট লাভ: {totalProfit.toFixed(2)} ৳
      </p>

      <div className="border border-border rounded-lg overflow-x-auto hidden md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="p-3 text-left text-foreground">তারিখ</th>
              <th className="p-3 text-right text-foreground">বিক্রি (৳)</th>
              <th className="p-3 text-right text-foreground">খরচ (৳)</th>
              <th className="p-3 text-right text-foreground">লাভ (৳)</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td className="p-3 text-center text-muted-foreground" colSpan={4}>
                  লোড হচ্ছে...
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td className="p-3 text-center text-muted-foreground" colSpan={4}>
                  কোনো তথ্য নেই
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
      </div>

      <div className="space-y-3 md:hidden">
        {loading ? (
          <p className="text-center text-muted-foreground bg-card border border-border rounded-lg p-4">
            লোড হচ্ছে...
          </p>
        ) : data.length === 0 ? (
          <p className="text-center text-muted-foreground bg-card border border-border rounded-lg p-4">
            কোনো তথ্য নেই
          </p>
        ) : (
          data.map((row, idx) => {
            const profit = Number(row.sales || 0) - Number(row.expense || 0);
            const positive = profit >= 0;
            return (
              <div
                key={`${row.date}-${idx}`}
                className="bg-card border border-border rounded-xl p-4 shadow-sm flex gap-3"
              >
                <div
                  className={`w-1 rounded-full ${
                    positive ? "bg-success" : "bg-danger"
                  }`}
                />
                <div className="flex-1 space-y-2">
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
                    <div className="bg-muted rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">বিক্রি</p>
                      <p className="text-base font-semibold text-foreground">
                        {Number(row.sales || 0).toFixed(2)} ৳
                      </p>
                    </div>
                    <div className="bg-muted rounded-lg p-3">
                      <p className="text-xs text-muted-foreground">খরচ</p>
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
          })
        )}
      </div>
    </div>
  );
}
