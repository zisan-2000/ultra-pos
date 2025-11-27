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

  // auto load first time and whenever threshold changes
  useEffect(() => {
    load(threshold);
  }, [load, threshold]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-gray-900">কম স্টক পণ্য</h2>
          <p className="text-xs text-gray-500">
            দ্রুত রিস্টক করার জন্য তালিকা।
          </p>
        </div>

        <select
          className="border border-gray-300 px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          value={threshold}
          onChange={(e) => {
            const th = Number(e.target.value);
            setThreshold(th);
          }}
        >
          <option value={5}>স্টক ≤ ৫</option>
          <option value={10}>স্টক ≤ ১০</option>
          <option value={20}>স্টক ≤ ২০</option>
        </select>
      </div>

      <div className="border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-3 text-left text-gray-900">পণ্য</th>
              <th className="p-3 text-right text-gray-900">স্টক সংখ্যা</th>
              <th className="p-3 text-right text-gray-900">অবস্থা</th>
            </tr>
          </thead>

          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="p-3 text-center text-gray-500" colSpan={3}>
                  {loading ? "লোড হচ্ছে..." : "কোনো কম স্টক পণ্য নেই"}
                </td>
              </tr>
            ) : (
              items.map((p, i) => (
                <tr key={i} className="border-t hover:bg-gray-50 transition-colors">
                  <td className="p-3 text-gray-900">{p.name}</td>
                  <td className="p-3 text-right text-gray-900">{p.stockQty}</td>
                  <td
                    className={`p-3 text-right font-semibold ${
                      Number(p.stockQty) <= 5
                        ? "text-red-600"
                        : "text-orange-500"
                    }`}
                  >
                    {Number(p.stockQty) <= 5 ? "জরুরি" : "কম"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
