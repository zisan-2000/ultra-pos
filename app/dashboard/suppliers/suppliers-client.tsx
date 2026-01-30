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
          className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-lg hover:bg-primary-hover disabled:opacity-60"
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
          {localSuppliers.map((supplier) => (
            <div
              key={supplier.id}
              className="rounded-2xl border border-border bg-card p-4 shadow-[0_12px_26px_rgba(15,23,42,0.08)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-foreground">
                    {supplier.name}
                  </p>
                  {supplier.phone ? (
                    <p className="text-xs text-muted-foreground">
                      ফোন: {supplier.phone}
                    </p>
                  ) : null}
                  {supplier.address ? (
                    <p className="text-xs text-muted-foreground">
                      ঠিকানা: {supplier.address}
                    </p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">বাকি টাকা</p>
                  <p
                    className={`text-base font-bold ${
                      supplier.balance > 0 ? "text-danger" : "text-success"
                    }`}
                  >
                    ৳ {supplier.balance.toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-center">
                  <p className="text-muted-foreground">মোট ক্রয়</p>
                  <p className="font-semibold text-foreground">
                    ৳ {supplier.purchaseTotal.toFixed(2)}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-center">
                  <p className="text-muted-foreground">পরিশোধ</p>
                  <p className="font-semibold text-foreground">
                    ৳ {supplier.paymentTotal.toFixed(2)}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-center">
                  <p className="text-muted-foreground">বাকি</p>
                  <p className="font-semibold text-foreground">
                    ৳ {supplier.balance.toFixed(2)}
                  </p>
                </div>
              </div>
              <div className="mt-3 rounded-xl border border-border bg-muted/50 px-3 py-2 text-xs">
                <p className="text-[11px] text-muted-foreground">
                  বকেয়া বয়স দেখতে স্টেটমেন্ট ওপেন করুন।
                </p>
              </div>
              <div className="mt-3 text-right">
                <a
                  href={`/dashboard/purchases/pay?shopId=${shopId}&supplierId=${supplier.id}`}
                  className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary-soft px-4 py-1.5 text-xs font-semibold text-primary hover:bg-primary/15"
                >
                  বাকি পরিশোধ করুন
                </a>
                <a
                  href={`/dashboard/suppliers/statement?shopId=${shopId}&supplierId=${supplier.id}`}
                  className="ml-2 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                >
                  স্টেটমেন্ট
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
