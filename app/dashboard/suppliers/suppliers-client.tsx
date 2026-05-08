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
  return n.toLocaleString("bn-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function SuppliersClient({ shopId, suppliers }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [localSuppliers, setLocalSuppliers] =
    useState<SupplierRow[]>(suppliers);

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
      <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-2.5">
          নতুন সরবরাহকারী
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="text"
            placeholder="নাম *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9 min-w-0 flex-[2] rounded-xl border border-border bg-muted/30 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-card transition-colors"
          />
          <input
            type="text"
            placeholder="ফোন"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-9 min-w-0 flex-1 rounded-xl border border-border bg-muted/30 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-card transition-colors"
          />
          <input
            type="text"
            placeholder="ঠিকানা"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="h-9 min-w-0 flex-1 rounded-xl border border-border bg-muted/30 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-card transition-colors"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving}
            className="h-9 shrink-0 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary-hover transition-colors disabled:opacity-60 sm:w-auto w-full"
          >
            {saving ? "..." : "+ যোগ করুন"}
          </button>
        </div>
        {error ? (
          <div className="mt-2 rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-xs font-semibold text-danger">
            {error}
          </div>
        ) : null}
      </div>

      {/* ── Supplier list ── */}
      {localSuppliers.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <p className="text-sm font-semibold text-muted-foreground">
            কোনো সরবরাহকারী নেই।
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            উপরের ফর্মে নতুন সরবরাহকারী যোগ করুন।
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {localSuppliers.map((supplier) => {
            const initial = supplier.name.trim().charAt(0).toUpperCase();
            const hasBalance = supplier.balance > 0;

            return (
              <div
                key={supplier.id}
                className={`group flex flex-col rounded-2xl border bg-card overflow-hidden shadow-sm transition-all hover:shadow-md ${
                  hasBalance ? "border-warning/30" : "border-border"
                }`}
              >
                {/* ── Top accent bar ── */}
                <div
                  className={`h-0.5 w-full ${hasBalance ? "bg-warning" : "bg-success/40"}`}
                />

                {/* ── Identity + balance ── */}
                <div className="flex items-start gap-3 p-4 pb-3">
                  {/* Avatar */}
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold shadow-sm ${
                      hasBalance
                        ? "bg-warning-soft text-warning border border-warning/20"
                        : "bg-primary-soft text-primary border border-primary/20"
                    }`}
                  >
                    {initial}
                  </div>

                  {/* Name + contact */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-foreground leading-tight truncate">
                      {supplier.name}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                      {supplier.phone ? (
                        <span className="text-[11px] text-muted-foreground">
                          📞 {supplier.phone}
                        </span>
                      ) : null}
                      {supplier.address ? (
                        <span className="text-[11px] text-muted-foreground truncate">
                          📍 {supplier.address}
                        </span>
                      ) : null}
                      {!supplier.phone && !supplier.address ? (
                        <span className="text-[11px] text-muted-foreground/50 italic">
                          যোগাযোগ নেই
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Balance badge */}
                  <div
                    className={`shrink-0 rounded-xl px-2.5 py-1.5 text-right ${
                      hasBalance ? "bg-warning-soft" : "bg-success-soft"
                    }`}
                  >
                    <p
                      className={`text-[10px] font-semibold uppercase tracking-wider leading-none ${
                        hasBalance ? "text-warning/70" : "text-success/70"
                      }`}
                    >
                      বাকি
                    </p>
                    <p
                      className={`mt-0.5 text-sm font-extrabold tabular-nums leading-none ${
                        hasBalance ? "text-warning" : "text-success"
                      }`}
                    >
                      ৳ {fmt(supplier.balance)}
                    </p>
                    {!hasBalance ? (
                      <p className="text-[9px] font-bold text-success/80 mt-0.5">
                        পরিশোধিত ✓
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* ── Stats row ── */}
                <div className="mx-4 mb-3 flex divide-x divide-border/50 overflow-hidden rounded-xl border border-border/50 bg-muted/20">
                  <div className="flex-1 px-3 py-2 text-center">
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                      মোট ক্রয়
                    </p>
                    <p className="mt-0.5 text-xs font-bold tabular-nums text-foreground">
                      ৳ {fmt(supplier.purchaseTotal)}
                    </p>
                  </div>
                  <div className="flex-1 px-3 py-2 text-center">
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                      পরিশোধ
                    </p>
                    <p className="mt-0.5 text-xs font-bold tabular-nums text-success">
                      ৳ {fmt(supplier.paymentTotal)}
                    </p>
                  </div>
                  <div className="flex-1 px-3 py-2 text-center">
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                      বকেয়া
                    </p>
                    <p
                      className={`mt-0.5 text-xs font-bold tabular-nums ${hasBalance ? "text-warning" : "text-success"}`}
                    >
                      ৳ {fmt(supplier.balance)}
                    </p>
                  </div>
                </div>

                {/* ── Actions ── */}
                <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/40 px-4 py-2.5">
                  <a
                    href={`/dashboard/suppliers/statement?shopId=${shopId}&supplierId=${supplier.id}`}
                    className="text-xs font-semibold text-muted-foreground hover:text-primary transition-colors"
                  >
                    স্টেটমেন্ট →
                  </a>
                  <div className="flex items-center gap-1.5">
                    {hasBalance ? (
                      <a
                        href={`/dashboard/purchases/pay?shopId=${shopId}&supplierId=${supplier.id}`}
                        className="inline-flex h-7 items-center gap-1 rounded-full border border-warning/30 bg-warning-soft px-3 text-[11px] font-semibold text-warning hover:bg-warning/15 transition-colors"
                      >
                        💳 পরিশোধ
                      </a>
                    ) : null}
                    <a
                      href={`/dashboard/purchases?shopId=${shopId}&supplierId=${supplier.id}`}
                      className="inline-flex h-7 items-center rounded-full border border-border bg-card px-3 text-[11px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
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
