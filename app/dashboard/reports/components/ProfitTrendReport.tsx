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

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  const totalProfit = useMemo(
    () =>
      data.reduce(
        (sum, row) =>
          sum + Number(row.sales || 0) - Number(row.expense || 0),
        0
      ),
    [data]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">লাভের ধারাবাহিকতা</h2>
          <p className="text-xs text-gray-500">নির্বাচিত তারিখের সারাংশ</p>
        </div>
        <QuickDateFilter onSelect={load} />
      </div>

      <p className="text-sm font-semibold text-gray-900">
        মোট লাভ: {totalProfit.toFixed(2)} ?
      </p>

      <div className="border border-gray-200 rounded-lg overflow-x-auto hidden md:block">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-3 text-left text-gray-900">তারিখ</th>
              <th className="p-3 text-right text-gray-900">বিক্রি (৳)</th>
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
                  কোনো ডেটা পাওয়া যায়নি
                </td>
              </tr>
            ) : (
              data.map((row, idx) => {
                const profit =
                  Number(row.sales || 0) - Number(row.expense || 0);
                return (
                  <tr
                    key={`${row.date}-${idx}`}
                    className="border-t hover:bg-gray-50 transition-colors"
                  >
                    <td className="p-3 text-gray-900">
                      {new Date(row.date).toLocaleDateString("bn-BD")}
                    </td>
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

      <div className="space-y-3 md:hidden">
        {loading ? (
          <p className="text-center text-gray-500 bg-white border border-gray-200 rounded-lg p-4">
            লোড হচ্ছে...
          </p>
        ) : data.length === 0 ? (
          <p className="text-center text-gray-500 bg-white border border-gray-200 rounded-lg p-4">
            কোনো ডেটা পাওয়া যায়নি
          </p>
        ) : (
          data.map((row, idx) => {
            const profit =
              Number(row.sales || 0) - Number(row.expense || 0);
            const positive = profit >= 0;
            return (
              <div
                key={`${row.date}-${idx}`}
                className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500">#{idx + 1}</p>
                    <h3 className="text-base font-semibold text-gray-900 mt-1">
                      {new Date(row.date).toLocaleDateString("bn-BD")}
                    </h3>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      positive
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {positive ? "লাভ" : "ক্ষতি"}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-gray-600">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">বিক্রি</p>
                    <p className="text-base font-semibold text-gray-900">
                      {Number(row.sales || 0).toFixed(2)} ?
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">খরচ</p>
                    <p className="text-base font-semibold text-gray-900">
                      {Number(row.expense || 0).toFixed(2)} ?
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
                  <span>লাভ</span>
                  <span
                    className={`font-semibold ${
                      positive ? "text-emerald-700" : "text-red-700"
                    }`}
                  >
                    {profit.toFixed(2)} ?
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
