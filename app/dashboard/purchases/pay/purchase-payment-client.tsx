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

const METHOD_OPTIONS = [
  { value: "cash", label: "ক্যাশ", icon: "💵" },
  { value: "bkash", label: "বিকাশ", icon: "📱" },
  { value: "bank", label: "ব্যাংক", icon: "🏦" },
];

function formatMoney(n: number) {
  return n.toLocaleString("bn-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

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
    return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
  });
  const [note, setNote] = useState("");
  const [method, setMethod] = useState("cash");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const filteredPurchases = useMemo(() => {
    if (!supplierId) return purchases;
    return purchases.filter((p) => p.supplierId === supplierId);
  }, [supplierId, purchases]);

  const duePurchases = useMemo(
    () => filteredPurchases.filter((p) => Number(p.dueAmount) > 0),
    [filteredPurchases]
  );

  const selectedPurchase = useMemo(
    () => purchases.find((p) => p.id === purchaseId) || null,
    [purchases, purchaseId]
  );

  useEffect(() => {
    if (!selectedPurchase) return;
    setAmount(selectedPurchase.dueAmount?.toString?.() ?? "");
  }, [selectedPurchase]);

  const remainingAfterPayment = useMemo(() => {
    if (!selectedPurchase) return 0;
    return Math.max(0, Number(selectedPurchase.dueAmount) - Number(amount || 0));
  }, [selectedPurchase, amount]);

  const handleSubmit = () => {
    if (!supplierId) { setError("সরবরাহকারী নির্বাচন করুন।"); return; }
    if (!purchaseId) { setError("ক্রয় নির্বাচন করুন।"); return; }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) { setError("পরিশোধের অংক সঠিক দিন।"); return; }
    setError(null);
    startSaving(async () => {
      try {
        const res = await fetch("/api/purchases/pay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shopId, purchaseId, amount, paidAt, note: note || null, method }),
        });
        const data = await res.json();
        if (!res.ok || !data?.success) throw new Error(data?.error || "পরিশোধ করা যায়নি");
        router.push(`/dashboard/purchases?shopId=${shopId}`);
      } catch (err: any) {
        setError(err?.message || "কিছু একটা ভুল হয়েছে");
      }
    });
  };

  return (
    <div className="space-y-4">

      {/* ── Step 1: Supplier ── */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-3">
          ধাপ ১ · সরবরাহকারী বেছে নিন
        </p>
        {suppliers.length === 0 ? (
          <p className="text-sm text-muted-foreground">কোনো সরবরাহকারী নেই।</p>
        ) : (
          <select
            value={supplierId}
            onChange={(e) => { setSupplierId(e.target.value); setPurchaseId(""); }}
            className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">সরবরাহকারী নির্বাচন করুন</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* ── Step 2: Purchase cards ── */}
      {supplierId ? (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-3">
            ধাপ ২ · বাকি ক্রয় নির্বাচন করুন
          </p>
          {duePurchases.length === 0 ? (
            <div className="rounded-xl border border-success/30 bg-success-soft/50 px-4 py-3 text-sm font-semibold text-success">
              এই সরবরাহকারীর কোনো বাকি ক্রয় নেই ✓
            </div>
          ) : (
            <div className="space-y-2">
              {duePurchases.map((p) => {
                const active = purchaseId === p.id;
                const dueAmt = Number(p.dueAmount);
                const totalAmt = Number(p.totalAmount);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPurchaseId(p.id)}
                    className={`w-full rounded-xl border p-3 text-left transition-colors ${
                      active
                        ? "border-warning/40 bg-warning-soft/50 shadow-sm"
                        : "border-border bg-card hover:border-warning/20 hover:bg-warning-soft/20"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(p.purchaseDate).toLocaleDateString("bn-BD")}
                        </p>
                        <p className="mt-0.5 text-sm font-bold text-foreground tabular-nums">
                          মোট ৳ {formatMoney(totalAmt)}
                        </p>
                      </div>
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold tabular-nums ${
                        active
                          ? "border-warning/50 bg-warning text-white"
                          : "border-warning/30 bg-warning-soft text-warning"
                      }`}>
                        বাকি ৳ {formatMoney(dueAmt)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {/* ── Step 3: Payment details ── */}
      {purchaseId && selectedPurchase ? (
        <>
          {/* Live summary */}
          <div className="rounded-2xl border border-warning/30 bg-warning-soft/30 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-3">
              বাকির হিসাব
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">মোট ক্রয়</span>
                <span className="font-semibold tabular-nums text-foreground">
                  ৳ {formatMoney(Number(selectedPurchase.totalAmount))}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">আগে পরিশোধ</span>
                <span className="font-semibold tabular-nums text-success">
                  ৳ {formatMoney(Number(selectedPurchase.paidAmount))}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-warning/20 pt-2">
                <span className="font-semibold text-foreground">এখন বাকি</span>
                <span className="font-bold tabular-nums text-warning">
                  ৳ {formatMoney(Number(selectedPurchase.dueAmount))}
                </span>
              </div>
              {Number(amount) > 0 ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">এখন দিচ্ছেন</span>
                    <span className="font-semibold tabular-nums text-foreground">
                      ৳ {formatMoney(Number(amount))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-warning/20 pt-2">
                    <span className="font-bold text-foreground">পরে বাকি থাকবে</span>
                    <span className={`font-extrabold tabular-nums ${remainingAfterPayment > 0 ? "text-warning" : "text-success"}`}>
                      ৳ {formatMoney(remainingAfterPayment)}
                      {remainingAfterPayment === 0 ? " ✓" : ""}
                    </span>
                  </div>
                </>
              ) : null}
            </div>
          </div>

          {/* Form fields */}
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              ধাপ ৩ · পরিশোধের বিবরণ
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
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
                  placeholder="0.00"
                  className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
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
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-muted-foreground">পেমেন্ট মাধ্যম</p>
              <div className="flex flex-wrap gap-2">
                {METHOD_OPTIONS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMethod(m.value)}
                    className={`flex items-center gap-1.5 h-10 rounded-full border px-4 text-sm font-semibold transition-colors ${
                      method === m.value
                        ? "border-primary/40 bg-primary-soft text-primary shadow-sm"
                        : "border-border bg-card text-foreground hover:border-primary/30 hover:bg-primary-soft/40"
                    }`}
                  >
                    <span>{m.icon}</span>
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">
                নোট (ঐচ্ছিক)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="রেফারেন্স, চেক নম্বর বা অন্য তথ্য..."
                className="min-h-18 w-full resize-none rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
              {error}
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="w-full h-12 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold shadow-sm hover:bg-primary-hover disabled:opacity-60 transition-colors"
          >
            {saving ? "সংরক্ষণ হচ্ছে..." : "পরিশোধ সংরক্ষণ করুন"}
          </button>
        </>
      ) : null}

    </div>
  );
}
