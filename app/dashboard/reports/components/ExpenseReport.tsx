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
          <h2 className="text-lg font-bold">Expense Report</h2>
          <p className="text-xs text-gray-500">
            Clear list for quick checks. Zero charts.
          </p>
        </div>
        <QuickDateFilter onSelect={load} />
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <p className="text-sm font-semibold">
          Total: {totalAmount.toFixed(2)} ?
        </p>
        <button
          onClick={() => {
            const csv = generateCSV(
              ["id", "amount", "category", "expenseDate", "note"],
              items // ? FIXED
            );
            downloadFile("expenses-report.csv", csv);
          }}
          className="px-3 py-1 border rounded text-sm"
        >
          Export CSV
        </button>
      </div>

      <div className="border rounded p-3 mt-3 space-y-2">
        {loading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-500">No expenses found</p>
        ) : (
          items.map((e) => (
            <div
              key={e.id}
              className="border p-2 rounded flex justify-between items-center"
            >
              <div>
                <p className="font-semibold">{e.amount} ?</p>
                <p className="text-sm text-gray-700">{e.category}</p>
                {e.note && <p className="text-xs text-gray-500">{e.note}</p>}
              </div>

              <p className="text-xs text-gray-500">
                {new Date(e.expenseDate).toLocaleString()}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
