"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type ProductVariantOption = {
  id: string;
  label: string;
  buyPrice?: string | null;
  stockQty: string;
};

type ProductOption = {
  id: string;
  name: string;
  buyPrice?: string | null;
  stockQty?: string | null;
  trackStock?: boolean | null;
  variants?: ProductVariantOption[];
};

type PurchaseItemDraft = {
  id: string;
  productId: string;
  variantId?: string | null;
  qty: string;
  unitCost: string;
};

type Props = {
  shopId: string;
  shopName: string;
  products: ProductOption[];
  suppliers: { id: string; name: string }[];
};

type PurchaseMethod = "cash" | "bkash" | "bank" | "due";

const PURCHASE_STEPS = [
  {
    key: "supplier",
    title: "১. সরবরাহকারী",
    subtitle: "কার কাছ থেকে কিনছেন আর কোন দিনে কিনছেন",
  },
  {
    key: "items",
    title: "২. পণ্য",
    subtitle: "কি কি কিনছেন, কত পরিমাণে, কত দামে",
  },
  {
    key: "payment",
    title: "৩. পেমেন্ট",
    subtitle: "আজ কত দিচ্ছেন আর কত বাকি থাকছে",
  },
] as const;

const PAYMENT_OPTIONS: Array<{
  value: PurchaseMethod;
  label: string;
  hint: string;
}> = [
  { value: "cash", label: "ক্যাশ", hint: "পুরো টাকা এখনই দেওয়া হয়েছে" },
  { value: "bkash", label: "বিকাশ", hint: "পুরো টাকা মোবাইল ব্যাংকিং-এ দেওয়া হয়েছে" },
  { value: "bank", label: "ব্যাংক", hint: "পুরো টাকা ব্যাংক/ট্রান্সফারে দেওয়া হয়েছে" },
  { value: "due", label: "বাকিতে", hint: "কিছু বা সব টাকা পরে দেওয়া হবে" },
];

const blankItem = (): PurchaseItemDraft => ({
  id: crypto.randomUUID(),
  productId: "",
  variantId: null,
  qty: "1",
  unitCost: "",
});

function formatMoney(value: number) {
  return value.toLocaleString("bn-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

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
  const [purchaseMethod, setPurchaseMethod] = useState<PurchaseMethod>("cash");
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const productMap = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  );

  const supplierMap = useMemo(
    () => new Map(suppliers.map((supplier) => [supplier.id, supplier.name])),
    [suppliers]
  );

  const totalAmount = useMemo(() => {
    return items.reduce((sum, item) => {
      const qty = Number(item.qty || 0);
      const unitCost = Number(item.unitCost || 0);
      if (!Number.isFinite(qty) || !Number.isFinite(unitCost)) return sum;
      return sum + qty * unitCost;
    }, 0);
  }, [items]);

  const validItemCount = useMemo(() => {
    return items.filter((item) => item.productId).length;
  }, [items]);

  const paidNowAmount = useMemo(() => {
    if (purchaseMethod !== "due") return totalAmount;
    const amount = Number(paidNow || 0);
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    return amount;
  }, [paidNow, purchaseMethod, totalAmount]);

  const dueAmount = useMemo(() => {
    if (purchaseMethod !== "due") return 0;
    return Math.max(totalAmount - paidNowAmount, 0);
  }, [paidNowAmount, purchaseMethod, totalAmount]);

  const selectedSupplierLabel = supplierId
    ? supplierMap.get(supplierId) || "নির্বাচিত সরবরাহকারী"
    : supplierName.trim() || "কোনো সরবরাহকারী দেওয়া হয়নি";

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
              variantId: null,
              unitCost:
                item.unitCost ||
                (product?.buyPrice != null ? String(product.buyPrice) : ""),
            }
          : item
      )
    );
  };

  const handleVariantSelect = (itemId: string, variantId: string) => {
    const currentItem = items.find((item) => item.id === itemId);
    const selectedProduct = currentItem?.productId
      ? productMap.get(currentItem.productId)
      : null;
    const selectedVariant = variantId
      ? (selectedProduct?.variants ?? []).find((variant) => variant.id === variantId)
      : null;
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              variantId: variantId || null,
              unitCost:
                item.unitCost ||
                (selectedVariant?.buyPrice != null
                  ? String(selectedVariant.buyPrice)
                  : item.unitCost),
            }
          : item
      )
    );
  };

  const addItem = () => setItems((prev) => [...prev, blankItem()]);
  const removeItem = (id: string) =>
    setItems((prev) => prev.filter((item) => item.id !== id));

  const validateItemsStep = () => {
    if (!items.length) return "কমপক্ষে একটি পণ্য যোগ করুন।";
    for (const item of items) {
      if (!item.productId) return "প্রতিটি আইটেমে পণ্য নির্বাচন করুন।";
      const qty = Number(item.qty);
      const unitCost = Number(item.unitCost);
      if (!Number.isFinite(qty) || qty <= 0) return "পরিমাণ সঠিক দিন।";
      if (!Number.isFinite(unitCost) || unitCost <= 0) {
        return "ক্রয় মূল্য সঠিক দিন।";
      }
    }
    return null;
  };

  const validatePaymentStep = () => {
    if (purchaseMethod !== "due") return null;
    if (!supplierId && !supplierName.trim()) {
      return "বাকি ক্রয়ের জন্য সরবরাহকারী দিন।";
    }
    const currentPaidNow = Number(paidNow || 0);
    if (!Number.isFinite(currentPaidNow) || currentPaidNow < 0) {
      return "আজ কত দিলেন, সেটা সঠিকভাবে লিখুন।";
    }
    if (currentPaidNow > totalAmount) {
      return "আজ পরিশোধ মোট ক্রয়ের চেয়ে বেশি হতে পারবে না।";
    }
    return null;
  };

  const validate = () => validateItemsStep() || validatePaymentStep();

  const goNext = () => {
    const stepError =
      currentStep === 1
        ? validateItemsStep()
        : currentStep === 2
        ? validatePaymentStep()
        : null;

    if (stepError) {
      setError(stepError);
      return;
    }

    setError(null);
    setCurrentStep((prev) => Math.min(prev + 1, PURCHASE_STEPS.length - 1));
  };

  const goBack = () => {
    setError(null);
    setCurrentStep((prev) => Math.max(prev - 1, 0));
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
              variantId: item.variantId || null,
              qty: item.qty,
              unitCost: item.unitCost,
            })),
            supplierId: supplierId || null,
            supplierName: supplierId ? null : supplierName || null,
            purchaseDate,
            paymentMethod: purchaseMethod,
            paidNow: purchaseMethod === "due" ? paidNow || "0" : "0",
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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">দোকান</p>
            <p className="text-base font-semibold text-foreground">{shopName}</p>
            <p className="text-xs text-muted-foreground">
              সহজ ধাপে ক্রয় লিখুন: সরবরাহকারী, পণ্য, তারপর পেমেন্ট।
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:min-w-[280px]">
            <div className="rounded-2xl border border-border bg-muted/35 px-3 py-3">
              <p className="text-[11px] font-semibold text-muted-foreground">
                মোট পণ্য
              </p>
              <p className="mt-1 text-lg font-bold text-foreground">
                {validItemCount}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/35 px-3 py-3">
              <p className="text-[11px] font-semibold text-muted-foreground">
                মোট ক্রয়
              </p>
              <p className="mt-1 text-lg font-bold text-foreground">
                ৳ {formatMoney(totalAmount)}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/35 px-3 py-3">
              <p className="text-[11px] font-semibold text-muted-foreground">
                আজ পরিশোধ
              </p>
              <p className="mt-1 text-lg font-bold text-foreground">
                ৳ {formatMoney(paidNowAmount)}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/35 px-3 py-3">
              <p className="text-[11px] font-semibold text-muted-foreground">
                বাকি
              </p>
              <p
                className={`mt-1 text-lg font-bold ${
                  dueAmount > 0 ? "text-warning" : "text-success"
                }`}
              >
                ৳ {formatMoney(dueAmount)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {PURCHASE_STEPS.map((step, index) => {
          const active = index === currentStep;
          const complete = index < currentStep;

          return (
            <button
              key={step.key}
              type="button"
              onClick={() => {
                if (index <= currentStep) {
                  setError(null);
                  setCurrentStep(index);
                }
              }}
              className={`rounded-2xl border px-4 py-4 text-left transition-colors ${
                active
                  ? "border-primary/40 bg-primary-soft"
                  : complete
                  ? "border-success/30 bg-success-soft/60"
                  : "border-border bg-card"
              }`}
            >
              <p
                className={`text-xs font-semibold uppercase tracking-[0.18em] ${
                  active
                    ? "text-primary"
                    : complete
                    ? "text-success"
                    : "text-muted-foreground"
                }`}
              >
                ধাপ {index + 1}
              </p>
              <p className="mt-2 text-base font-bold text-foreground">
                {step.title}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {step.subtitle}
              </p>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
        {currentStep === 0 ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">
                কার কাছ থেকে কিনছেন
              </h2>
              <p className="text-xs text-muted-foreground">
                সরবরাহকারী থাকলে বেছে নিন, না থাকলে নতুন নাম লিখুন।
              </p>
            </div>

            {suppliers.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">
                  দ্রুত বেছে নিন
                </p>
                <div className="flex flex-wrap gap-2">
                  {suppliers.slice(0, 6).map((supplier) => {
                    const active = supplier.id === supplierId;
                    return (
                      <button
                        key={supplier.id}
                        type="button"
                        onClick={() => {
                          setSupplierId(supplier.id);
                          setSupplierName("");
                        }}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                          active
                            ? "border-primary/40 bg-primary-soft text-primary"
                            : "border-border bg-card text-foreground hover:bg-muted"
                        }`}
                      >
                        {supplier.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
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
                  সরবরাহকারী তালিকা
                </label>
                <select
                  value={supplierId}
                  onChange={(e) => {
                    setSupplierId(e.target.value);
                    if (e.target.value) setSupplierName("");
                  }}
                  className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">নতুন সরবরাহকারী লিখব</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {!supplierId ? (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">
                  নতুন সরবরাহকারীর নাম
                </label>
                <input
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="যেমন: মেসার্স রহমান ট্রেডার্স"
                  className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <p className="text-xs text-muted-foreground">
                  পরে বাকি থাকলে এই নাম supplier হিসাবেই সংরক্ষণ হবে।
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-success/30 bg-success-soft/50 px-4 py-3 text-sm text-foreground">
                এই ক্রয় যাবে: <span className="font-semibold">{selectedSupplierLabel}</span>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">
                নোট
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="চালান নম্বর, অতিরিক্ত তথ্য বা দরকারি নোট লিখুন"
                className="min-h-[90px] w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
        ) : null}

        {currentStep === 1 ? (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-foreground">কি কি কিনছেন</h2>
                <p className="text-xs text-muted-foreground">
                  প্রতিটি পণ্যের পরিমাণ ও ক্রয় মূল্য দিন। মোট টাকার হিসাব নিজে হবে।
                </p>
              </div>
              <button
                type="button"
                onClick={addItem}
                className="inline-flex h-10 items-center justify-center rounded-full border border-primary/30 bg-primary-soft px-4 text-xs font-semibold text-primary hover:bg-primary/15"
              >
                + আরেকটি পণ্য
              </button>
            </div>

            <div className="space-y-3">
              {items.map((item, index) => {
                const product = productMap.get(item.productId);
                const lineTotal =
                  Math.max(0, Number(item.qty || 0)) *
                  Math.max(0, Number(item.unitCost || 0));

                return (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-border/70 bg-card/80 p-4 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">
                          পণ্য #{index + 1}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-foreground">
                          এই লাইনের মোট: ৳ {formatMoney(lineTotal)}
                        </p>
                      </div>
                      {items.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="rounded-full border border-danger/30 bg-danger-soft px-3 py-1.5 text-[11px] font-semibold text-danger"
                        >
                          মুছুন
                        </button>
                      ) : null}
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-[1.4fr_0.8fr_0.8fr]">
                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-muted-foreground">
                          পণ্য
                        </label>
                        <select
                          value={item.productId}
                          onChange={(e) =>
                            handleProductSelect(item.id, e.target.value)
                          }
                          className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                          <option value="">পণ্য নির্বাচন করুন</option>
                          {products.map((productOption) => (
                            <option key={productOption.id} value={productOption.id}>
                              {productOption.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-muted-foreground">
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
                          className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-muted-foreground">
                          ক্রয় মূল্য
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitCost}
                          onChange={(e) =>
                            handleItemChange(item.id, "unitCost", e.target.value)
                          }
                          className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                    </div>

                    {product && (product.variants ?? []).length > 0 ? (
                      <div className="mt-3 space-y-1">
                        <label className="text-[11px] font-semibold text-muted-foreground">
                          ভ্যারিয়েন্ট / সাইজ
                        </label>
                        <select
                          value={item.variantId ?? ""}
                          onChange={(e) =>
                            handleVariantSelect(item.id, e.target.value)
                          }
                          className="h-11 w-full rounded-xl border border-primary/30 bg-primary-soft px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                          <option value="">ভ্যারিয়েন্ট নির্বাচন করুন</option>
                          {(product.variants ?? []).map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.label} — স্টক: {v.stockQty}
                              {v.buyPrice != null ? ` — ক্রয়: ${v.buyPrice}` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}

                    {product ? (() => {
                      const selectedVariant = item.variantId
                        ? (product.variants ?? []).find((v) => v.id === item.variantId)
                        : null;
                      const stockDisplay = selectedVariant
                        ? selectedVariant.stockQty
                        : product.trackStock
                        ? product.stockQty ?? "0"
                        : null;
                      return (
                        <div className="mt-3 rounded-xl border border-border bg-muted/35 px-3 py-2 text-[11px] text-muted-foreground">
                          আগের ক্রয় মূল্য: {selectedVariant?.buyPrice ?? product.buyPrice ?? "N/A"}
                          {stockDisplay != null
                            ? ` | বর্তমান স্টক: ${stockDisplay}`
                            : " | স্টক ট্র্যাক নয়"}
                          {selectedVariant ? ` (${selectedVariant.label})` : ""}
                        </div>
                      );
                    })() : null}
                  </div>
                );
              })}
            </div>

            <div className="rounded-2xl border border-border bg-muted/50 px-4 py-4">
              <div className="flex items-center justify-between text-sm font-semibold text-foreground">
                <span>এখন পর্যন্ত মোট ক্রয়</span>
                <span>৳ {formatMoney(totalAmount)}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                সব পরিমাণ আর ক্রয় মূল্য ঠিক থাকলে পরের ধাপে পেমেন্ট ঠিক করুন।
              </p>
            </div>
          </div>
        ) : null}

        {currentStep === 2 ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">
                কীভাবে পরিশোধ করছেন
              </h2>
              <p className="text-xs text-muted-foreground">
                পুরো টাকা দিলে শুধু মাধ্যম বেছে নিন। বাকিতে হলে আজ কত দিলেন সেটাও লিখুন।
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {PAYMENT_OPTIONS.map((option) => {
                const active = purchaseMethod === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPurchaseMethod(option.value)}
                    className={`rounded-2xl border px-4 py-4 text-left transition-colors ${
                      active
                        ? "border-primary/40 bg-primary-soft"
                        : "border-border bg-card hover:bg-muted/40"
                    }`}
                  >
                    <p className="text-base font-bold text-foreground">
                      {option.label}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {option.hint}
                    </p>
                  </button>
                );
              })}
            </div>

            {purchaseMethod === "due" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">
                    আজ কত দিলেন
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={paidNow}
                    onChange={(e) => setPaidNow(e.target.value)}
                    className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <p className="text-xs text-muted-foreground">
                    কিছু না দিলে `0` রাখুন। পরে supplier payment থেকে শোধ করতে পারবেন।
                  </p>
                </div>

                <div className="rounded-2xl border border-warning/30 bg-warning-soft/45 px-4 py-4">
                  <p className="text-xs font-semibold text-muted-foreground">
                    বাকি হিসাব
                  </p>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">মোট ক্রয়</span>
                      <span className="font-semibold text-foreground">
                        ৳ {formatMoney(totalAmount)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">আজ পরিশোধ</span>
                      <span className="font-semibold text-foreground">
                        ৳ {formatMoney(paidNowAmount)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-warning/20 pt-2">
                      <span className="font-semibold text-foreground">
                        বাকি থাকছে
                      </span>
                      <span className="font-bold text-warning">
                        ৳ {formatMoney(dueAmount)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-success/30 bg-success-soft/50 px-4 py-4 text-sm">
                <p className="font-semibold text-foreground">
                  এই ক্রয় পুরো পরিশোধ ধরা হবে।
                </p>
                <p className="mt-1 text-muted-foreground">
                  মোট ৳ {formatMoney(totalAmount)} {PAYMENT_OPTIONS.find((option) => option.value === purchaseMethod)?.label} এ পরিশোধ হয়েছে।
                </p>
              </div>
            )}

            <div className="rounded-2xl border border-border bg-muted/45 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                শেষবার দেখে নিন
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">সরবরাহকারী</p>
                  <p className="mt-1 font-semibold text-foreground">
                    {selectedSupplierLabel}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">ক্রয়ের তারিখ</p>
                  <p className="mt-1 font-semibold text-foreground">{purchaseDate}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">পণ্য সংখ্যা</p>
                  <p className="mt-1 font-semibold text-foreground">
                    {validItemCount} টি
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">পেমেন্ট</p>
                  <p className="mt-1 font-semibold text-foreground">
                    {PAYMENT_OPTIONS.find((option) => option.value === purchaseMethod)?.label}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
          {error}
        </div>
      ) : null}

      <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {currentStep < PURCHASE_STEPS.length - 1
              ? "সব তথ্য একসাথে না দেখে ধাপে ধাপে পূরণ করুন।"
              : "সব ঠিক থাকলে এখনই ক্রয় সংরক্ষণ করুন।"}
          </div>

          <div className="flex gap-2">
            {currentStep > 0 ? (
              <button
                type="button"
                onClick={goBack}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
              >
                আগের ধাপ
              </button>
            ) : null}

            {currentStep < PURCHASE_STEPS.length - 1 ? (
              <button
                type="button"
                onClick={goNext}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
              >
                পরের ধাপ
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
              >
                {saving ? "সংরক্ষণ হচ্ছে..." : "ক্রয় সংরক্ষণ করুন"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
