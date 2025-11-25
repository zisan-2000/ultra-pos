"use client";

import { useEffect, useState } from "react";
import { DateRangePicker } from "./DateRangePicker";
import {
  LineChart as LChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { QuickDateFilter } from "./QuickDateFilter";

export default function ProfitTrendReport({ shopId }: { shopId: string }) {
  const [data, setData] = useState<any[]>([]);

  async function load(from?: string, to?: string) {
    const params = new URLSearchParams({ shopId });
    if (from) params.append("from", from);
    if (to) params.append("to", to);

    const res = await fetch(
      `/api/reports/profit-trend?${params.toString()}`
    );
    const json = await res.json();
    setData(json.data || []);
  }

  // Load last 7 days by default
  useEffect(() => {
    load(); // all time by default
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Profit Trend (Sales vs Expenses)</h2>

      <DateRangePicker onChange={load} />
      <QuickDateFilter onSelect={load} />

      <div className="w-full h-72 border rounded p-3">
        <ResponsiveContainer width="100%" height="100%">
          <LChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />

            <Line
              type="monotone"
              dataKey="sales"
              stroke="#2563eb"
              strokeWidth={2}
              name="Sales"
            />

            <Line
              type="monotone"
              dataKey="expense"
              stroke="#ef4444"
              strokeWidth={2}
              name="Expenses"
            />
          </LChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
