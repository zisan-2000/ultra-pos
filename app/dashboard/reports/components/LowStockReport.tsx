// app/dashboard/reports/components/LowStockReport.tsx

"use client";

import { useCallback, useEffect, useState } from "react";

export default function LowStockReport({ shopId }: { shopId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [threshold, setThreshold] = useState(10);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (th: number) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/reports/low-stock?shopId=${shopId}&limit=${th}`
        );
        const json = await res.json();
        setItems(json.data || []);
      } finally {
        setLoading(false);
      }
    },
    [shopId]
  );

  useEffect(() => {
    load(threshold);
  }, [load, threshold]);

  const renderStatus = (qty: number) => (qty <= 5 ? "জরুরি" : "কম");

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-gray-900">স্টক কম</h2>
          <p className="text-xs text-gray-500">থ্রেশহোল্ডের নিচের পণ্যগুলো</p>
        </div>

        <select
          className="border border-gray-300 px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          value={threshold}
          onChange={(e) => {
            const th = Number(e.target.value);
            setThreshold(th);
          }}
        >
          <option value={5}>শীর্ষ ৫</option>
          <option value={10}>শীর্ষ ১০</option>
          <option value={20}>শীর্ষ ২০</option>
        </select>
      </div>

      <div className="border border-gray-200 rounded-lg overflow-x-auto hidden md:block">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-3 text-left text-gray-900">পণ্য</th>
              <th className="p-3 text-right text-gray-900">মজুত সংখ্যা</th>
              <th className="p-3 text-right text-gray-900">অবস্থা</th>
            </tr>
          </thead>

          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="p-3 text-center text-gray-500" colSpan={3}>
                  {loading ? "লোড হচ্ছে..." : "কোনো পণ্য মজুত শূন্য নয়"}
                </td>
              </tr>
            ) : (
              items.map((p, i) => (
                <tr
                  key={i}
                  className="border-t hover:bg-gray-50 transition-colors"
                >
                  <td className="p-3 text-gray-900">{p.name}</td>
                  <td className="p-3 text-right text-gray-900">{p.stockQty}</td>
                  <td
                    className={`p-3 text-right font-semibold ${
                      Number(p.stockQty) <= 5
                        ? "text-red-600"
                        : "text-orange-500"
                    }`}
                  >
                    {renderStatus(Number(p.stockQty))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {items.length === 0 ? (
          <p className="text-center text-gray-500 bg-white border border-gray-200 rounded-lg p-4">
            {loading ? "লোড হচ্ছে..." : "কোনো পণ্য মজুত শূন্য নয়"}
          </p>
        ) : (
          items.map((p, i) => {
            const qty = Number(p.stockQty || 0);
            const critical = qty <= 5;
            return (
              <div
                key={i}
                className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-gray-500">#{i + 1}</p>
                    <h3 className="text-base font-semibold text-gray-900 mt-1">
                      {p.name}
                    </h3>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      critical
                        ? "bg-red-100 text-red-700"
                        : "bg-orange-100 text-orange-700"
                    }`}
                  >
                    {renderStatus(qty)}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
                  <span>মজুত সংখ্যা</span>
                  <span className="font-semibold text-gray-900">{qty}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
