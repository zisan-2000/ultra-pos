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
          throw new Error(data?.error || "সরবরাহকারী যোগ করা যায়নি");
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
        setError(err?.message || "কিছু একটা ভুল হয়েছে");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)] space-y-3">
        <h2 className="text-lg font-bold text-foreground">নতুন সরবরাহকারী</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input
            type="text"
            placeholder="সরবরাহকারীর নাম"
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
          className="w-full h-11 rounded-xl bg-primary-soft text-primary border border-primary/30 text-sm font-semibold hover:bg-primary/15 hover:border-primary/40 transition-colors disabled:opacity-60"
        >
          {saving ? "সংরক্ষণ হচ্ছে..." : "সরবরাহকারী যোগ করুন"}
        </button>
      </div>

      {localSuppliers.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          কোনো সরবরাহকারী নেই।
        </div>
      ) : (
        <div className="space-y-3">
          {localSuppliers.map((supplier) => {
            const initials = supplier.name.trim().charAt(0).toUpperCase();
            const hasBalance = supplier.balance > 0;
            return (
              <div
                key={supplier.id}
                className={`rounded-2xl border bg-card shadow-[0_12px_26px_rgba(15,23,42,0.08)] overflow-hidden ${
                  hasBalance ? "border-warning/40" : "border-border"
                }`}
              >
                <div className={`h-1 w-full ${hasBalance ? "bg-warning" : "bg-success"}`} />
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary border border-primary/30 text-sm font-bold">
                      {initials}
                    </div>
                    <div className="flex flex-1 flex-wrap items-start justify-between gap-3">
                      <div className="space-y-0.5">
                        <p className="text-base font-semibold text-foreground">{supplier.name}</p>
                        {supplier.phone ? (
                          <p className="text-xs text-muted-foreground">ফোন: {supplier.phone}</p>
                        ) : null}
                        {supplier.address ? (
                          <p className="text-xs text-muted-foreground">ঠিকানা: {supplier.address}</p>
                        ) : null}
                      </div>
                      <div className="text-right space-y-1">
                        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${
                          hasBalance
                            ? "bg-warning-soft text-warning border border-warning/30"
                            : "bg-success-soft text-success border border-success/30"
                        }`}>
                          বাকি ৳ {supplier.balance.toLocaleString("bn-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-center">
                      <p className="text-muted-foreground">মোট ক্রয়</p>
                      <p className="font-semibold text-foreground">
                        ৳ {supplier.purchaseTotal.toLocaleString("bn-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-center">
                      <p className="text-muted-foreground">পরিশোধ</p>
                      <p className="font-semibold text-foreground">
                        ৳ {supplier.paymentTotal.toLocaleString("bn-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-center">
                      <p className="text-muted-foreground">বাকি</p>
                      <p className={`font-semibold ${hasBalance ? "text-warning" : "text-success"}`}>
                        ৳ {supplier.balance.toLocaleString("bn-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 justify-end">
                    <a
                      href={`/dashboard/purchases/pay?shopId=${shopId}&supplierId=${supplier.id}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning-soft px-4 py-1.5 text-xs font-semibold text-warning hover:bg-warning/15 transition-colors"
                    >
                      বাকি পরিশোধ করুন
                    </a>
                    <a
                      href={`/dashboard/suppliers/statement?shopId=${shopId}&supplierId=${supplier.id}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
                    >
                      স্টেটমেন্ট
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