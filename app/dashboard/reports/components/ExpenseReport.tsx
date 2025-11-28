"use client";

import { useEffect, useState } from "react";
import { QuickDateFilter } from "./QuickDateFilter";
import { generateCSV } from "@/lib/utils/csv";
import { downloadFile } from "@/lib/utils/download";

export default function ExpenseReport({ shopId }: { shopId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function load(from?: string, to?: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ shopId });
      if (from) params.append("from", from);
      if (to) params.append("to", to);

      const res = await fetch(`/api/reports/expenses?${params.toString()}`);
      if (!res.ok) {
        setItems([]);
        return;
      }

      const data = await res.json();
      const rows = data.rows || [];
      setItems(rows);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(); // all time by default
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  const totalAmount = items.reduce(
    (sum, e) => sum + Number(e.amount || 0),
    0
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">খরচ রিপোর্ট</h2>
          <p className="text-xs text-gray-500">
            সহজ তালিকা, কোনো চার্ট নেই।
          </p>
        </div>
        <QuickDateFilter onSelect={load} />
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <p className="text-sm font-semibold text-gray-900">
          মোট: {totalAmount.toFixed(2)} ৳
        </p>
        <button
          onClick={() => {
            const csv = generateCSV(
              ["id", "amount", "category", "expenseDate", "note"],
              items // ? FIXED
            );
            downloadFile("expenses-report.csv", csv);
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
          <p className="text-sm text-gray-500 text-center py-4">কোনো খরচ পাওয়া যায়নি</p>
        ) : (
          items.map((e) => (
            <div
              key={e.id}
              className="border border-gray-200 p-3 rounded-lg flex justify-between items-start hover:bg-gray-50 transition-colors"
            >
              <div>
                <p className="font-semibold text-gray-900">{e.amount} ৳</p>
                <p className="text-sm text-gray-600">{e.category}</p>
                {e.note && <p className="text-xs text-gray-500 mt-1">{e.note}</p>}
              </div>

              <p className="text-xs text-gray-500">
                {new Date(e.expenseDate).toLocaleDateString("bn-BD")}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
