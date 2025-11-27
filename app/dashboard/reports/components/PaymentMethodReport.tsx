"use client";

import { useEffect, useMemo, useState } from "react";
import { QuickDateFilter } from "./QuickDateFilter";

type PaymentRow = { name: string; value: number; count?: number };

export default function PaymentMethodReport({ shopId }: { shopId: string }) {
  const [data, setData] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function load(from?: string, to?: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ shopId });
      if (from) params.append("from", from);
      if (to) params.append("to", to);

      const res = await fetch(
        `/api/reports/payment-method?${params.toString()}`
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
    load(); // all time by default
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  const totalAmount = useMemo(
    () => data.reduce((sum, item) => sum + Number(item.value || 0), 0),
    [data]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">পেমেন্ট পদ্ধতি</h2>
          <p className="text-xs text-gray-500">
            পেমেন্ট পদ্ধতির সারসংক্ষেপ।
          </p>
        </div>
        <QuickDateFilter onSelect={load} />
      </div>

      <div className="border border-gray-200 rounded-lg divide-y divide-gray-200">
        {loading ? (
          <p className="p-4 text-sm text-gray-500 text-center">লোড হচ্ছে...</p>
        ) : data.length === 0 ? (
          <p className="p-4 text-sm text-gray-500 text-center">কোনো পেমেন্ট ডেটা নেই</p>
        ) : (
          data.map((item, idx) => {
            const percent =
              totalAmount > 0
                ? Math.round((Number(item.value || 0) / totalAmount) * 100)
                : 0;

            return (
              <div
                key={`${item.name}-${idx}`}
                className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              >
                <div>
                  <p className="font-semibold text-gray-900">{item.name || "অজানা"}</p>
                  {typeof item.count === "number" && (
                    <p className="text-xs text-gray-500 mt-1">
                      {item.count} টি পেমেন্ট
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900">{Number(item.value || 0)} ৳</p>
                  <p className="text-xs text-gray-500 mt-1">{percent}% মোটের</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
