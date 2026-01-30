// app/dashboard/purchases/new/PurchaseFormClient.tsx

"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type ProductOption = {
  id: string;
  name: string;
  buyPrice?: string | null;
  stockQty?: string | null;
  trackStock?: boolean | null;
};

type PurchaseItemDraft = {
  id: string;
  productId: string;
  qty: string;
  unitCost: string;
};

type Props = {
  shopId: string;
  shopName: string;
  products: ProductOption[];
  suppliers: { id: string; name: string }[];
};

const blankItem = (): PurchaseItemDraft => ({
  id: crypto.randomUUID(),
  productId: "",
  qty: "1",
  unitCost: "",
});

export default function PurchaseFormClient({
  shopId,
  shopName,
  products,
  suppliers,
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState<PurchaseItemDraft[]>([blankItem()]);
  const [supplierId, setSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
    return `${y}-${m}-${day}`;
  });
  const [paidNow, setPaidNow] = useState("0");
  const [note, setNote] = useState("");
  type PurchaseMethod = "cash" | "bkash" | "bank" | "due";
  const [purchaseMethod, setPurchaseMethod] = useState<PurchaseMethod>("cash");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const productMap = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  );

  const totalAmount = useMemo(() => {
    return items.reduce((sum, item) => {
      const qty = Number(item.qty || 0);
      const unitCost = Number(item.unitCost || 0);
      if (!Number.isFinite(qty) || !Number.isFinite(unitCost)) return sum;
      return sum + qty * unitCost;
    }, 0);
  }, [items]);

  const handleItemChange = (
    id: string,
    field: keyof PurchaseItemDraft,
    value: string
  ) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleProductSelect = (id: string, productId: string) => {
    const product = productMap.get(productId);
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              productId,
              unitCost:
                item.unitCost ||
                (product?.buyPrice != null ? String(product.buyPrice) : ""),
            }
          : item
      )
    );
  };

  const addItem = () => setItems((prev) => [...prev, blankItem()]);
  const removeItem = (id: string) =>
    setItems((prev) => prev.filter((item) => item.id !== id));

  const validate = () => {
    if (!items.length) return "কমপক্ষে একটি পণ্য যোগ করুন।";
    if (purchaseMethod === "due" && !supplierId && !supplierName.trim()) {
      return "বাকি ক্রয়ের জন্য সরবরাহকারী দিন।";
    }
    for (const item of items) {
      if (!item.productId) return "প্রতিটি আইটেমে পণ্য নির্বাচন করুন।";
      const qty = Number(item.qty);
      const unitCost = Number(item.unitCost);
      if (!Number.isFinite(qty) || qty <= 0) return "পরিমাণ সঠিক দিন।";
      if (!Number.isFinite(unitCost) || unitCost <= 0) return "ক্রয় মূল্য সঠিক দিন।";
    }
    return null;
  };

  const handleSubmit = () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    startSaving(async () => {
      try {
        const res = await fetch("/api/purchases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shopId,
            items: items.map((item) => ({
              productId: item.productId,
              qty: item.qty,
              unitCost: item.unitCost,
            })),
            supplierId: supplierId || null,
            supplierName: supplierId ? null : supplierName || null,
            purchaseDate,
            paymentMethod: purchaseMethod as "cash" | "bkash" | "bank" | "due",
            paidNow: paidNow || "0",
            note: note || null,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || "ক্রয় যোগ করা যায়নি");
        }

        router.push(`/dashboard/purchases?shopId=${shopId}`);
      } catch (err: any) {
        setError(err?.message || "কিছু একটা ভুল হয়েছে");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">দোকান</p>
          <p className="text-base font-semibold text-foreground">{shopName}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 space-y-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">ক্রয়ের তথ্য</h2>
            <p className="text-xs text-muted-foreground">
              ক্রয়ের দিন, সরবরাহকারী ও পেমেন্ট তথ্য দিন।
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">
              ক্রয়ের তারিখ
            </label>
            <input
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">
              সরবরাহকারী (ঐচ্ছিক)
            </label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">নতুন সরবরাহকারী লিখুন</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {!supplierId ? (
              <input
                type="text"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="যেমন: মেসার্স রহমান ট্রেডার্স"
                className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            ) : null}
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">
              পেমেন্ট ধরন
            </label>
            <select
              value={purchaseMethod}
              onChange={(e) => setPurchaseMethod(e.target.value as PurchaseMethod)}
              className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="cash">ক্যাশ</option>
              <option value="bkash">বিকাশ</option>
              <option value="bank">ব্যাংক</option>
              <option value="due">বাকি</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">
              আজ পরিশোধ (ঐচ্ছিক)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={paidNow}
              onChange={(e) => setPaidNow(e.target.value)}
              disabled={purchaseMethod !== "due"}
              className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">
            নোট (ঐচ্ছিক)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="প্রয়োজনে নোট লিখুন"
            className="min-h-[80px] w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 space-y-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">পণ্য তালিকা</h2>
            <p className="text-xs text-muted-foreground">
              পণ্য বাছাই করে পরিমাণ ও ক্রয় মূল্য দিন।
            </p>
          </div>
          <button
            type="button"
            onClick={addItem}
            className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary-soft px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/15"
          >
            ➕ আইটেম
          </button>
        </div>

        <div className="space-y-3">
          {items.map((item, index) => {
            const product = productMap.get(item.productId);
            return (
              <div
                key={item.id}
                className="rounded-2xl border border-border/70 bg-card/80 p-3 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground font-semibold">
                    আইটেম #{index + 1}
                  </p>
                  {items.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="text-[11px] font-semibold text-danger"
                    >
                      মুছুন
                    </button>
                  ) : null}
                </div>

                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground font-semibold">
                      পণ্য
                    </label>
                    <select
                      value={item.productId}
                      onChange={(e) =>
                        handleProductSelect(item.id, e.target.value)
                      }
                      className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="">পণ্য নির্বাচন করুন</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground font-semibold">
                      পরিমাণ
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.qty}
                      onChange={(e) =>
                        handleItemChange(item.id, "qty", e.target.value)
                      }
                      className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground font-semibold">
                      ক্রয় মূল্য
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitCost}
                      onChange={(e) =>
                        handleItemChange(item.id, "unitCost", e.target.value)
                      }
                      className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>

                {product ? (
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    বর্তমান ক্রয় মূল্য: {product.buyPrice ?? "N/A"} | স্টক:{" "}
                    {product.trackStock ? product.stockQty ?? "0" : "স্টক ট্র্যাক নয়"}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="rounded-xl border border-border bg-muted/50 px-4 py-3 flex items-center justify-between text-sm font-semibold">
          <span>মোট ক্রয়</span>
          <span>৳ {totalAmount.toFixed(2)}</span>
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
          {saving ? "সংরক্ষণ হচ্ছে..." : "ক্রয় সংরক্ষণ করুন"}
        </button>
      </div>
    </div>
  );
}
