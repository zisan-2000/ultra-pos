"use client";

import { useEffect, useState } from "react";
import { DateRangePicker } from "./DateRangePicker";
import PieChartComponent from "../charts/PieChart";
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
  const [chartData, setChartData] = useState<{ name: string; value: number }[]>(
    []
  );

  async function load(from?: string, to?: string) {
    const params = new URLSearchParams({ shopId });
    if (from) params.append("from", from);
    if (to) params.append("to", to);

    const res = await fetch(`/api/reports/cash?${params.toString()}`);

    const data = await res.json();
    const rows: CashRow[] = data.rows || [];

    setItems(rows);

    const totalIn = rows
      .filter((i) => i.entryType === "IN")
      .reduce((sum, i) => sum + Number(i.amount), 0);

    const totalOut = rows
      .filter((i) => i.entryType === "OUT")
      .reduce((sum, i) => sum + Number(i.amount), 0);

    setChartData([
      { name: "Cash IN", value: totalIn },
      { name: "Cash OUT", value: totalOut },
    ]);
  }

  useEffect(() => {
    load(); // all time by default
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Cashbook Report</h2>

      <DateRangePicker onChange={load} />
      <QuickDateFilter onSelect={load} />

      {/* CSV Export */}
      <button
        onClick={() => {
          const csv = generateCSV(
            ["id", "entryType", "amount", "reason", "createdAt"],
            items // ✅ FIXED
          );
          downloadFile("cashbook-report.csv", csv);
        }}
        className="px-3 py-1 border rounded text-sm"
      >
        Export CSV
      </button>

      {chartData.length > 0 && <PieChartComponent data={chartData} />}

      <div className="border rounded p-3 mt-3 space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-gray-500">No cash entries found</p>
        ) : (
          items.map((e) => (
            <div
              key={e.id}
              className="border p-2 rounded flex justify-between items-center"
            >
              <div>
                <p
                  className={`font-semibold ${
                    e.entryType === "IN" ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {e.entryType === "IN" ? "+" : "-"}
                  {e.amount} ৳
                </p>

                {e.reason && (
                  <p className="text-sm text-gray-600">{e.reason}</p>
                )}
              </div>

              <p className="text-xs text-gray-500">
                {new Date(e.createdAt).toLocaleString()}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
