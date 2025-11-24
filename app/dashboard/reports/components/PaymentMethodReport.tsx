"use client";

import { useState } from "react";
import PieChartComponent from "../charts/PieChart";
import BarChart from "../charts/BarChart";
import { DateRangePicker } from "./DateRangePicker";

export default function PaymentMethodReport({ shopId }: { shopId: string }) {
  const [chartData, setChartData] = useState<any[]>([]);

  async function load(from: string, to: string) {
    const res = await fetch(
      `/api/reports/payment-method?shopId=${shopId}&from=${from}&to=${to}`
    );

    const json = await res.json();
    setChartData(json.data || []);
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold">Payment Method Analytics</h2>

      <DateRangePicker onChange={load} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* PIE CHART */}
        <div className="border rounded p-3">
          <PieChartComponent data={chartData} />
        </div>

        {/* BAR CHART */}
        <div className="border rounded p-3">
          <BarChart data={chartData} />
        </div>
      </div>
    </div>
  );
}
