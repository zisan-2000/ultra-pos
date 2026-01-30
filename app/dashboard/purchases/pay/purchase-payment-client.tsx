// app/dashboard/purchases/pay/purchase-payment-client.tsx

"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type SupplierRow = {
  id: string;
  name: string;
};

type PurchaseRow = {
  id: string;
  supplierId: string | null;
  supplierName?: string | null;
  purchaseDate: string;
  totalAmount: string;
  paidAmount: string;
  dueAmount: string;
};

type Props = {
  shopId: string;
  suppliers: SupplierRow[];
  purchases: PurchaseRow[];
  defaultSupplierId?: string;
  defaultPurchaseId?: string;
};

export default function PurchasePaymentClient({
  shopId,
  suppliers,
  purchases,
  defaultSupplierId,
  defaultPurchaseId,
}: Props) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(defaultSupplierId || "");
  const [purchaseId, setPurchaseId] = useState(defaultPurchaseId || "");
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
    return `${y}-${m}-${day}`;
  });
  const [note, setNote] = useState("");
  const [method, setMethod] = useState("cash");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const filteredPurchases = useMemo(() => {
    if (!supplierId) return purchases;
    return purchases.filter((p) => p.supplierId === supplierId);
  }, [supplierId, purchases]);

  const selectedPurchase = useMemo(
    () => purchases.find((p) => p.id === purchaseId) || null,
    [purchases, purchaseId]
  );

  useEffect(() => {
    if (!selectedPurchase) return;
    setAmount(selectedPurchase.dueAmount?.toString?.() ?? "");
  }, [selectedPurchase]);

  const handleSubmit = () => {
    if (!supplierId) {
      setError("সরবরাহকারী নির্বাচন করুন।");
      return;
    }
    if (!purchaseId) {
      setError("ক্রয় নির্বাচন করুন।");
      return;
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("পরিশোধের অংক সঠিক দিন।");
      return;
    }

    setError(null);
    startSaving(async () => {
      try {
        const res = await fetch("/api/purchases/pay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shopId,
            purchaseId,
            amount,
            paidAt,
            note: note || null,
            method,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || "পরিশোধ করা যায়নি");
        }
        router.push(`/dashboard/purchases?shopId=${shopId}`);
      } catch (err: any) {
        setError(err?.message || "কিছু একটা ভুল হয়েছে");
      }
    });
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">
            সরবরাহকারী
          </label>
          <select
            value={supplierId}
            onChange={(e) => {
              setSupplierId(e.target.value);
              setPurchaseId("");
            }}
            className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">সরবরাহকারী নির্বাচন করুন</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">
            ক্রয় (বাকি আছে)
          </label>
          <select
            value={purchaseId}
            onChange={(e) => setPurchaseId(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">ক্রয় নির্বাচন করুন</option>
            {filteredPurchases
              .filter((p) => Number(p.dueAmount) > 0)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {new Date(p.purchaseDate).toLocaleDateString("bn-BD")} · বাকি ৳{" "}
                  {Number(p.dueAmount).toFixed(2)}
                </option>
              ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">
            পরিশোধের তারিখ
          </label>
          <input
            type="date"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">
            পরিশোধের পরিমাণ
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">
            পেমেন্ট মেথড
          </label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="cash">ক্যাশ</option>
            <option value="bkash">বিকাশ</option>
            <option value="bank">ব্যাংক</option>
          </select>
        </div>
      </div>

      {selectedPurchase ? (
        <div className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          মোট: ৳ {Number(selectedPurchase.totalAmount).toFixed(2)} · পরিশোধ: ৳{" "}
          {Number(selectedPurchase.paidAmount).toFixed(2)} · বাকি: ৳{" "}
          {Number(selectedPurchase.dueAmount).toFixed(2)}
        </div>
      ) : null}

      <div className="space-y-1">
        <label className="text-xs font-semibold text-muted-foreground">
          নোট (ঐচ্ছিক)
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="min-h-[80px] w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {error ? (
        <div className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-xs font-semibold text-danger">
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={saving}
        className="w-full h-12 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold shadow-lg hover:bg-primary-hover disabled:opacity-60"
      >
        {saving ? "সংরক্ষণ হচ্ছে..." : "পরিশোধ সংরক্ষণ করুন"}
      </button>
    </div>
  );
}
