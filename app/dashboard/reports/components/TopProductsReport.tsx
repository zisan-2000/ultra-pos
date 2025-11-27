"use client";

import { useCallback, useEffect, useState } from "react";

type TopProduct = { name: string; qty: number; revenue: number };

export default function TopProductsReport({ shopId }: { shopId: string }) {
  const [data, setData] = useState<TopProduct[]>([]);

  const load = useCallback(
    async (limit = 10) => {
      const res = await fetch(
        `/api/reports/top-products?shopId=${shopId}&limit=${limit}`
      );
      const json = await res.json();
      setData(json.data || []);
    },
    [shopId]
  );

  useEffect(() => {
    load(10);
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-gray-900">সেরা বিক্রিত পণ্য</h2>
          <p className="text-xs text-gray-500">
            সবচেয়ে বেশি বিক্রিত পণ্যগুলি।
          </p>
        </div>

        <select
          className="border border-gray-300 px-3 py-2 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          defaultValue="10"
          onChange={(e) => load(Number(e.target.value))}
        >
          <option value="5">শীর্ষ ৫</option>
          <option value="10">শীর্ষ ১০</option>
          <option value="20">শীর্ষ ২০</option>
        </select>
      </div>

      <div className="border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-3 text-left text-gray-900">পণ্য</th>
              <th className="p-3 text-right text-gray-900">বিক্রয় সংখ্যা</th>
              <th className="p-3 text-right text-gray-900">আয় (৳)</th>
            </tr>
          </thead>

          <tbody>
            {data.length === 0 ? (
              <tr>
                <td className="p-3 text-center text-gray-500" colSpan={3}>
                  কোনো ডেটা পাওয়া যায়নি
                </td>
              </tr>
            ) : (
              data.map((item, idx) => (
                <tr key={idx} className="border-t hover:bg-gray-50 transition-colors">
                  <td className="p-3 text-gray-900">{item.name}</td>
                  <td className="p-3 text-right text-gray-900">{item.qty}</td>
                  <td className="p-3 text-right text-gray-900">{item.revenue.toFixed(2)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
