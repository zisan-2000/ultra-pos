"use client";

import { useEffect, useMemo, useState } from "react";
import { QuickDateFilter } from "./QuickDateFilter";

type ProfitRow = { date: string; sales: number; expense: number };

export default function ProfitTrendReport({ shopId }: { shopId: string }) {
  const [data, setData] = useState<ProfitRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function load(from?: string, to?: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ shopId });
      if (from) params.append("from", from);
      if (to) params.append("to", to);

      const res = await fetch(
        `/api/reports/profit-trend?${params.toString()}`
      );
      if (!res.ok) {
        setData([]);
        return;
      }
      const json = await res.json();
      setData(json.data || []);
    } finally {
      setLoading(false);
    }
  }

  // Load all time by default
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

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
          <h2 className="text-lg font-bold">Profit Snapshot</h2>
          <p className="text-xs text-gray-500">
            Quick table for sales vs expenses. No charts.
          </p>
        </div>
        <QuickDateFilter onSelect={load} />
      </div>

      <p className="text-sm font-semibold">
        Total Profit: {totalProfit.toFixed(2)} ?
      </p>

      <div className="border rounded">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 text-left">Date</th>
              <th className="p-2 text-right">Sales (?)</th>
              <th className="p-2 text-right">Expenses (?)</th>
              <th className="p-2 text-right">Profit (?)</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td className="p-2 text-center" colSpan={4}>
                  Loading...
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td className="p-2 text-center" colSpan={4}>
                  No profit data
                </td>
              </tr>
            ) : (
              data.map((row, idx) => {
                const profit =
                  Number(row.sales || 0) - Number(row.expense || 0);
                return (
                  <tr key={`${row.date}-${idx}`} className="border-t">
                    <td className="p-2">{row.date}</td>
                    <td className="p-2 text-right">
                      {Number(row.sales || 0).toFixed(2)}
                    </td>
                    <td className="p-2 text-right">
                      {Number(row.expense || 0).toFixed(2)}
                    </td>
                    <td
                      className={`p-2 text-right font-semibold ${
                        profit >= 0 ? "text-green-700" : "text-red-600"
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
    </div>
  );
}
