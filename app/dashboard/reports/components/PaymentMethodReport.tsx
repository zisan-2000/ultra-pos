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
          <h2 className="text-lg font-bold">Payment Summary</h2>
          <p className="text-xs text-gray-500">
            Simple list of payment methods. Zero charts.
          </p>
        </div>
        <QuickDateFilter onSelect={load} />
      </div>

      <div className="border rounded divide-y">
        {loading ? (
          <p className="p-3 text-sm text-gray-500">Loading...</p>
        ) : data.length === 0 ? (
          <p className="p-3 text-sm text-gray-500">No payment data</p>
        ) : (
          data.map((item, idx) => {
            const percent =
              totalAmount > 0
                ? Math.round((Number(item.value || 0) / totalAmount) * 100)
                : 0;

            return (
              <div
                key={`${item.name}-${idx}`}
                className="flex items-center justify-between p-3"
              >
                <div>
                  <p className="font-semibold">{item.name || "Unknown"}</p>
                  {typeof item.count === "number" && (
                    <p className="text-xs text-gray-500">
                      {item.count} payments
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-semibold">{Number(item.value || 0)} ?</p>
                  <p className="text-xs text-gray-500">{percent}% of total</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
