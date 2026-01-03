// app/dashboard/reports/components/PaymentMethodReport.tsx

"use client";

import { useEffect, useMemo, useState } from "react";

type PaymentRow = { name: string; value: number; count?: number };
type Props = { shopId: string; from?: string; to?: string };

export default function PaymentMethodReport({ shopId, from, to }: Props) {
  const [data, setData] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(false);

  async function load(rangeFrom?: string, rangeTo?: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ shopId });
      if (rangeFrom) params.append("from", rangeFrom);
      if (rangeTo) params.append("to", rangeTo);

      const res = await fetch(
        `/api/reports/payment-method?${params.toString()}`,
        { cache: "no-store" }
      );

      if (!res.ok) {
        setData([]);
        return;
      }

      const text = await res.text();
      if (!text) {
        setData([]);
        return;
      }
      const json = JSON.parse(text);
      setData(Array.isArray(json?.data) ? json.data : []);
    } catch (err) {
      console.error("Payment method load failed", err);
      setData([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(from, to);
  }, [shopId, from, to]);

  const totalAmount = useMemo(
    () => data.reduce((sum, item) => sum + Number(item.value || 0), 0),
    [data]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">পেমেন্ট মাধ্যম</h2>
          <p className="text-xs text-muted-foreground">শেয়ার ও পরিমাণ</p>
        </div>
      </div>

      <div className="border border-border rounded-lg bg-card divide-y divide-border">
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground text-center">লোড হচ্ছে...</p>
        ) : data.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground text-center">
            কোনো পেমেন্ট ডেটা নেই
          </p>
        ) : (
          data.map((item, idx) => {
            const percent =
              totalAmount > 0
                ? Math.round((Number(item.value || 0) / totalAmount) * 100)
                : 0;

            return (
              <div
                key={`${item.name}-${idx}`}
                className="p-4 hover:bg-muted transition-colors space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-foreground">
                      {item.name || "নগদ"}
                    </p>
                    {typeof item.count === "number" && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {item.count} টি লেনদেন
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-foreground">
                      {Number(item.value || 0)} ৳
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{percent}% শেয়ার</p>
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
