"use client";

import { useEffect, useState } from "react";
import { QuickDateFilter } from "./QuickDateFilter";
import { generateCSV } from "@/lib/utils/csv";
import { downloadFile } from "@/lib/utils/download";

type CashRow = {
  id: string;
  entryType: "IN" | "OUT";
  amount: string | number;
  reason?: string | null;
  createdAt: string | number;
};

export default function CashbookReport({ shopId }: { shopId: string }) {
  const [items, setItems] = useState<CashRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function load(from?: string, to?: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ shopId });
      if (from) params.append("from", from);
      if (to) params.append("to", to);

      const res = await fetch(`/api/reports/cash?${params.toString()}`);

      if (!res.ok) {
        setItems([]);
        return;
      }

      const data = await res.json();
      const rows: CashRow[] = data.rows || [];
      setItems(rows);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(); // all time by default
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  const totalIn = items
    .filter((i) => i.entryType === "IN")
    .reduce((sum, i) => sum + Number(i.amount), 0);

  const totalOut = items
    .filter((i) => i.entryType === "OUT")
    .reduce((sum, i) => sum + Number(i.amount), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">ক্যাশ খাতা রিপোর্ট</h2>
          <p className="text-xs text-gray-500">
            দ্রুত ক্যাশ ইন/আউট তালিকা।
          </p>
        </div>
        <QuickDateFilter onSelect={load} />
      </div>

      <div className="flex flex-wrap gap-4 text-sm font-semibold">
        <span className="text-green-700">ক্যাশ ইন: {totalIn.toFixed(2)} ৳</span>
        <span className="text-red-700">ক্যাশ আউট: {totalOut.toFixed(2)} ৳</span>
        <span className="text-blue-700">
          ব্যালেন্স: {(totalIn - totalOut).toFixed(2)} ৳
        </span>
        <button
          onClick={() => {
            const csv = generateCSV(
              ["id", "entryType", "amount", "reason", "createdAt"],
              items // ? FIXED
            );
            downloadFile("cashbook-report.csv", csv);
          }}
          className="px-3 py-1 border border-gray-300 rounded text-sm font-medium text-gray-900 hover:bg-gray-100 transition-colors"
        >
          CSV ডাউনলোড করুন
        </button>
      </div>

      <div className="border border-gray-200 rounded-lg p-4 mt-3 space-y-2">
        {loading ? (
          <p className="text-sm text-gray-500 text-center py-4">লোড হচ্ছে...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">কোনো ক্যাশ এন্ট্রি পাওয়া যায়নি</p>
        ) : (
          items.map((e) => (
            <div
              key={e.id}
              className="border border-gray-200 p-3 rounded-lg flex justify-between items-start hover:bg-gray-50 transition-colors"
            >
              <div>
                <p
                  className={`font-semibold ${
                    e.entryType === "IN" ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {e.entryType === "IN" ? "✓ +" : "✗ -"}
                  {e.amount} ৳
                </p>

                {e.reason && (
                  <p className="text-sm text-gray-600 mt-1">{e.reason}</p>
                )}
              </div>

              <p className="text-xs text-gray-500">
                {new Date(e.createdAt).toLocaleDateString("bn-BD")}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
