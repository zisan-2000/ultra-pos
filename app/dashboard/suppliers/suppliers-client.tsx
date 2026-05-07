// app/dashboard/suppliers/suppliers-client.tsx

"use client";

import { useState, useTransition } from "react";

type SupplierRow = {
  id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  purchaseTotal: number;
  paymentTotal: number;
  balance: number;
};

type Props = {
  shopId: string;
  suppliers: SupplierRow[];
};

function fmt(n: number) {
  return n.toLocaleString("bn-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function SuppliersClient({ shopId, suppliers }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [localSuppliers, setLocalSuppliers] = useState<SupplierRow[]>(suppliers);

  const handleCreate = () => {
    if (!name.trim()) {
      setError("সরবরাহকারীর নাম লিখুন।");
      return;
    }
    setError(null);
    startSaving(async () => {
      try {
        const res = await fetch("/api/suppliers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shopId,
            name: name.trim(),
            phone: phone.trim() || null,
            address: address.trim() || null,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || "সরবরাহকারী যোগ করা যায়নি");
        }
        if (!data.alreadyExists) {
          setLocalSuppliers((prev) => [
            {
              id: data.supplierId,
              name: name.trim(),
              phone: phone.trim() || null,
              address: address.trim() || null,
              purchaseTotal: 0,
              paymentTotal: 0,
              balance: 0,
            },
            ...prev,
          ]);
        }
        setName("");
        setPhone("");
        setAddress("");
      } catch (err: any) {
        setError(err?.message || "কিছু একটা ভুল হয়েছে");
      }
    });
  };

  return (
    <div className="space-y-4">

      {/* ── Add supplier form ── */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          নতুন সরবরাহকারী যোগ করুন
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input
            type="text"
            placeholder="সরবরাহকারীর নাম *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-11 rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <input
            type="text"
            placeholder="ফোন (ঐচ্ছিক)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-11 rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <input
            type="text"
            placeholder="ঠিকানা (ঐচ্ছিক)"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="h-11 rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        {error ? (
          <div className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-xs font-semibold text-danger">
            {error}
          </div>
        ) : null}
        <button
          type="button"
          onClick={handleCreate}
          disabled={saving}
          className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-sm hover:bg-primary-hover transition-colors disabled:opacity-60"
        >
          {saving ? "সংরক্ষণ হচ্ছে..." : "+ সরবরাহকারী যোগ করুন"}
        </button>
      </div>

      {/* ── Supplier list ── */}
      {localSuppliers.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <p className="text-sm font-semibold text-muted-foreground">কোনো সরবরাহকারী নেই।</p>
          <p className="mt-1 text-xs text-muted-foreground">উপরের ফর্মে নতুন সরবরাহকারী যোগ করুন।</p>
        </div>
      ) : (
        <div className="space-y-3">
          {localSuppliers.map((supplier) => {
            const initial = supplier.name.trim().charAt(0).toUpperCase();
            const hasBalance = supplier.balance > 0;

            return (
              <div
                key={supplier.id}
                className={`rounded-2xl border bg-card overflow-hidden shadow-sm transition-shadow hover:shadow-md ${
                  hasBalance ? "border-warning/30" : "border-border"
                }`}
              >
                {/* ── Identity + balance ── */}
                <div className="flex items-start gap-3 p-4">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-base font-bold shadow-sm ${
                    hasBalance
                      ? "bg-warning-soft text-warning border-warning/20"
                      : "bg-primary-soft text-primary border-primary/20"
                  }`}>
                    {initial}
                  </div>

                  <div className="flex flex-1 min-w-0 items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground leading-tight">{supplier.name}</p>
                      <div className="mt-0.5 space-y-0.5">
                        {supplier.phone ? (
                          <p className="text-xs text-muted-foreground">📞 {supplier.phone}</p>
                        ) : null}
                        {supplier.address ? (
                          <p className="text-xs text-muted-foreground">📍 {supplier.address}</p>
                        ) : null}
                        {!supplier.phone && !supplier.address ? (
                          <p className="text-xs text-muted-foreground/50 italic">যোগাযোগ নেই</p>
                        ) : null}
                      </div>
                    </div>

                    {/* Balance */}
                    <div className="shrink-0 text-right">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">বাকি</p>
                      <p className={`text-xl font-extrabold tabular-nums leading-tight ${
                        hasBalance ? "text-warning" : "text-success"
                      }`}>
                        ৳ {fmt(supplier.balance)}
                      </p>
                      {!hasBalance ? (
                        <p className="text-[10px] font-semibold text-success">পরিশোধিত ✓</p>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* ── Stats strip ── */}
                <div className="mx-4 mb-3 flex divide-x divide-border/50 overflow-hidden rounded-xl border border-border/60 bg-muted/20">
                  <div className="flex-1 px-3 py-2 text-center">
                    <p className="text-[10px] font-medium text-muted-foreground">মোট ক্রয়</p>
                    <p className="mt-0.5 text-xs font-bold tabular-nums text-foreground">
                      ৳ {fmt(supplier.purchaseTotal)}
                    </p>
                  </div>
                  <div className="flex-1 px-3 py-2 text-center">
                    <p className="text-[10px] font-medium text-muted-foreground">পরিশোধ</p>
                    <p className="mt-0.5 text-xs font-bold tabular-nums text-success">
                      ৳ {fmt(supplier.paymentTotal)}
                    </p>
                  </div>
                  <div className="flex-1 px-3 py-2 text-center">
                    <p className="text-[10px] font-medium text-muted-foreground">বকেয়া</p>
                    <p className={`mt-0.5 text-xs font-bold tabular-nums ${hasBalance ? "text-warning" : "text-success"}`}>
                      ৳ {fmt(supplier.balance)}
                    </p>
                  </div>
                </div>

                {/* ── Actions footer ── */}
                <div className="flex items-center justify-between gap-2 border-t border-border/40 px-4 py-2.5">
                  <a
                    href={`/dashboard/suppliers/statement?shopId=${shopId}&supplierId=${supplier.id}`}
                    className="text-xs font-semibold text-muted-foreground hover:text-primary transition-colors"
                  >
                    স্টেটমেন্ট →
                  </a>
                  <div className="flex items-center gap-2">
                    {hasBalance ? (
                      <a
                        href={`/dashboard/purchases/pay?shopId=${shopId}&supplierId=${supplier.id}`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-warning/30 bg-warning-soft px-4 text-xs font-semibold text-warning hover:bg-warning/15 transition-colors"
                      >
                        💳 বাকি পরিশোধ
                      </a>
                    ) : null}
                    <a
                      href={`/dashboard/purchases?shopId=${shopId}&supplierId=${supplier.id}`}
                      className="inline-flex h-8 items-center rounded-full border border-border bg-card px-3 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      ক্রয় →
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
