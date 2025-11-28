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
          <h2 className="text-lg font-bold text-gray-900">লাভের প্রবণতা</h2>
          <p className="text-xs text-gray-500">
            বিক্রয় বনাম খরচের তুলনা।
          </p>
        </div>
        <QuickDateFilter onSelect={load} />
      </div>

      <p className="text-sm font-semibold text-gray-900">
        মোট লাভ: {totalProfit.toFixed(2)} ৳
      </p>

      <div className="border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-3 text-left text-gray-900">তারিখ</th>
              <th className="p-3 text-right text-gray-900">বিক্রয় (৳)</th>
              <th className="p-3 text-right text-gray-900">খরচ (৳)</th>
              <th className="p-3 text-right text-gray-900">লাভ (৳)</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td className="p-3 text-center text-gray-500" colSpan={4}>
                  লোড হচ্ছে...
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td className="p-3 text-center text-gray-500" colSpan={4}>
                  কোনো লাভের ডেটা নেই
                </td>
              </tr>
            ) : (
              data.map((row, idx) => {
                const profit =
                  Number(row.sales || 0) - Number(row.expense || 0);
                return (
                  <tr key={`${row.date}-${idx}`} className="border-t hover:bg-gray-50 transition-colors">
                    <td className="p-3 text-gray-900">{new Date(row.date).toLocaleDateString("bn-BD")}</td>
                    <td className="p-3 text-right text-gray-900">
                      {Number(row.sales || 0).toFixed(2)}
                    </td>
                    <td className="p-3 text-right text-gray-900">
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
