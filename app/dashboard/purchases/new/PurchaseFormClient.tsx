"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type ProductVariantOption = {
  id: string;
  label: string;
  buyPrice?: string | null;
  stockQty: string;
  storageLocation?: string | null;
};

type ProductUnitConversionOption = {
  id: string;
  label: string;
  baseUnitQuantity: string;
};

type ProductOption = {
  id: string;
  name: string;
  genericName?: string | null;
  strength?: string | null;
  dosageForm?: string | null;
  manufacturer?: string | null;
  baseUnit: string;
  buyPrice?: string | null;
  stockQty?: string | null;
  storageLocation?: string | null;
  trackStock?: boolean | null;
  trackSerialNumbers?: boolean | null;
  trackBatch?: boolean | null;
  variants?: ProductVariantOption[];
  unitConversions?: ProductUnitConversionOption[];
};

type PurchaseItemDraft = {
  id: string;
  productId: string;
  variantId?: string | null;
  unitConversionId?: string | null;
  qty: string;
  unitCost: string;
  serialNumbers: string[];
  serialInput: string;
  serialTab: "bulk" | "one";
  batchNo: string;
  batchExpiryDate: string;
};

type Props = {
  shopId: string;
  shopName: string;
  businessType?: string | null;
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
  icon: string;
}> = [
  { value: "cash", label: "ক্যাশ", hint: "পুরো টাকা এখনই দেওয়া হয়েছে" , icon: "💵" },
  { value: "bkash", label: "বিকাশ", hint: "পুরো টাকা মোবাইল ব্যাংকিং-এ দেওয়া হয়েছে" , icon: "📱" },
  { value: "bank", label: "ব্যাংক", hint: "পুরো টাকা ব্যাংক/ট্রান্সফারে দেওয়া হয়েছে" , icon: "🏦" },
  { value: "due", label: "বাকিতে", hint: "কিছু বা সব টাকা পরে দেওয়া হবে" , icon: "📋" },
];

const blankItem = (): PurchaseItemDraft => ({
  id: crypto.randomUUID(),
  productId: "",
  variantId: null,
  unitConversionId: null,
  qty: "1",
  unitCost: "",
  serialNumbers: [],
  serialInput: "",
  serialTab: "bulk",
  batchNo: "",
  batchExpiryDate: "",
});

function formatMoney(value: number) {
  return value.toLocaleString("bn-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function toPositiveNumber(raw: string | number | null | undefined, fallback = 0) {
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return num;
}

function parseSerialTokens(raw: string) {
  const all = raw
    .split(/[\n,]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const seen = new Set<string>();
  const unique: string[] = [];
  let duplicateCount = 0;
  for (const serial of all) {
    if (seen.has(serial)) {
      duplicateCount++;
      continue;
    }
    seen.add(serial);
    unique.push(serial);
  }
  return { unique, duplicateCount };
}

export default function PurchaseFormClient({
  shopId,
  shopName,
  businessType,
  products,
  suppliers,
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState<PurchaseItemDraft[]>([blankItem()]);
  const [supplierId, setSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [supplierAddress, setSupplierAddress] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
    return `${y}-${m}-${day}`;
  });
  const [paidNow, setPaidNow] = useState("0");
  const [transportCost, setTransportCost] = useState("0");
  const [unloadingCost, setUnloadingCost] = useState("0");
  const [carryingCost, setCarryingCost] = useState("0");
  const [otherLandedCost, setOtherLandedCost] = useState("0");
  const [note, setNote] = useState("");
  const [purchaseMethod, setPurchaseMethod] = useState<PurchaseMethod>("cash");
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const isPharmacy = businessType === "pharmacy";

  const productMap = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  );

  const supplierMap = useMemo(
    () => new Map(suppliers.map((supplier) => [supplier.id, supplier.name])),
    [suppliers]
  );

  const resolveSelectedConversion = (
    product: ProductOption | undefined,
    unitConversionId: string | null | undefined
  ) => {
    if (!product || !unitConversionId) return null;
    return (product.unitConversions ?? []).find(
      (conversion) => conversion.id === unitConversionId
    ) ?? null;
  };

  const resolveUnitMultiplier = (
    product: ProductOption | undefined,
    unitConversionId: string | null | undefined
  ) => {
    const selected = resolveSelectedConversion(product, unitConversionId);
    const factor = toPositiveNumber(selected?.baseUnitQuantity, 1);
    return factor > 0 ? factor : 1;
  };

  const resolveSuggestedPurchaseUnitCost = (
    product: ProductOption | undefined,
    variantId: string | null | undefined,
    unitConversionId: string | null | undefined
  ) => {
    if (!product) return "";
    const selectedVariant = variantId
      ? (product.variants ?? []).find((variant) => variant.id === variantId)
      : null;
    const baseCost = toPositiveNumber(
      selectedVariant?.buyPrice ?? product.buyPrice ?? "",
      0
    );
    if (baseCost <= 0) return "";
    const factor = resolveUnitMultiplier(product, unitConversionId);
    return String(Number((baseCost * factor).toFixed(2)));
  };

  const totalAmount = useMemo(() => {
    return items.reduce((sum, item) => {
      const qty = Number(item.qty || 0);
      const unitCost = Number(item.unitCost || 0);
      if (!Number.isFinite(qty) || !Number.isFinite(unitCost)) return sum;
      return sum + qty * unitCost;
    }, 0);
  }, [items]);

  const landedCostTotal = useMemo(() => {
    const total =
      Number(transportCost || 0) +
      Number(unloadingCost || 0) +
      Number(carryingCost || 0) +
      Number(otherLandedCost || 0);
    return Number.isFinite(total) ? Math.max(0, total) : 0;
  }, [carryingCost, otherLandedCost, transportCost, unloadingCost]);

  const grandTotal = useMemo(() => totalAmount + landedCostTotal, [landedCostTotal, totalAmount]);

  const validItemCount = useMemo(() => {
    return items.filter((item) => item.productId).length;
  }, [items]);

  const paidNowAmount = useMemo(() => {
    if (purchaseMethod !== "due") return grandTotal;
    const amount = Number(paidNow || 0);
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    return amount;
  }, [grandTotal, paidNow, purchaseMethod]);

  const dueAmount = useMemo(() => {
    if (purchaseMethod !== "due") return 0;
    return Math.max(grandTotal - paidNowAmount, 0);
  }, [grandTotal, paidNowAmount, purchaseMethod]);

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

  const handleBulkSerialChange = (itemId: string, raw: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, serialInput: raw }
          : item
      )
    );
  };

  const handleApplyBulkSerials = (itemId: string, mode: "append" | "replace") => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const { unique } = parseSerialTokens(item.serialInput);
        if (mode === "replace") {
          return { ...item, serialNumbers: unique };
        }
        const merged = new Set(item.serialNumbers);
        for (const serial of unique) merged.add(serial);
        return { ...item, serialNumbers: Array.from(merged) };
      })
    );
  };

  const handleAddOneSerial = (itemId: string, value: string) => {
    const { unique } = parseSerialTokens(value);
    if (unique.length === 0) return;
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              serialNumbers: Array.from(new Set([...item.serialNumbers, ...unique])),
              serialInput: "",
            }
          : item
      )
    );
  };

  const handleRemoveSerial = (itemId: string, serial: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              serialNumbers: item.serialNumbers.filter((s) => s !== serial),
            }
          : item
      )
    );
  };

  const handleClearSerials = (itemId: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, serialNumbers: [], serialInput: "" }
          : item
      )
    );
  };

  const handleSyncQtyWithSerialCount = (itemId: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, qty: String(item.serialNumbers.length || 1) }
          : item
      )
    );
  };

  const handleProductSelect = (id: string, productId: string) => {
    const product = productMap.get(productId);
    const suggestedCost = resolveSuggestedPurchaseUnitCost(product, null, null);
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              productId,
              variantId: null,
              unitConversionId: null,
              serialNumbers: [],
              serialInput: "",
              batchNo: "",
              batchExpiryDate: "",
              unitCost: item.unitCost || suggestedCost,
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
    const nextVariantId = variantId || null;
    const suggestedCost = resolveSuggestedPurchaseUnitCost(
      selectedProduct ?? undefined,
      nextVariantId,
      currentItem?.unitConversionId ?? null
    );
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              variantId: nextVariantId,
              serialNumbers: [],
              serialInput: "",
              batchNo: "",
              batchExpiryDate: "",
              unitCost: item.unitCost || suggestedCost,
            }
          : item
      )
    );
  };

  const handleUnitConversionSelect = (itemId: string, unitConversionId: string) => {
    const currentItem = items.find((item) => item.id === itemId);
    const selectedProduct = currentItem?.productId
      ? productMap.get(currentItem.productId)
      : null;
    const nextUnitConversionId = unitConversionId || null;
    const suggestedCost = resolveSuggestedPurchaseUnitCost(
      selectedProduct ?? undefined,
      currentItem?.variantId ?? null,
      nextUnitConversionId
    );
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              unitConversionId: nextUnitConversionId,
              unitCost: suggestedCost || item.unitCost,
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
      const product = productMap.get(item.productId);
      if ((product?.variants?.length ?? 0) > 0 && !item.variantId) {
        return `"${product?.name ?? "এই পণ্য"}" variant-wise managed। আগে variant নির্বাচন করুন।`;
      }
      if (product?.trackBatch && !item.batchNo.trim()) {
        return `"${product.name}" batch / lot tracked। batch নম্বর দিন।`;
      }
      if (isPharmacy && product?.trackBatch && !item.batchExpiryDate) {
        return `"${product.name}" ফার্মেসি batch। expiry date দিন।`;
      }
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
    const extraCosts = [transportCost, unloadingCost, carryingCost, otherLandedCost];
    for (const raw of extraCosts) {
      const value = Number(raw || 0);
      if (!Number.isFinite(value) || value < 0) {
        return "অতিরিক্ত খরচের ঘরগুলোতে সঠিক সংখ্যা দিন।";
      }
    }
    if (purchaseMethod !== "due") return null;
    if (!supplierId && !supplierName.trim()) {
      return "বাকি ক্রয়ের জন্য সরবরাহকারী দিন।";
    }
    const currentPaidNow = Number(paidNow || 0);
    if (!Number.isFinite(currentPaidNow) || currentPaidNow < 0) {
      return "আজ কত দিলেন, সেটা সঠিকভাবে লিখুন।";
    }
    if (currentPaidNow > grandTotal) {
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
              unitConversionId: item.unitConversionId || null,
              serialNumbers: item.serialNumbers.length > 0 ? item.serialNumbers : null,
              batchNo: item.batchNo.trim() || null,
              batchExpiryDate: item.batchExpiryDate || null,
            })),
            supplierId: supplierId || null,
            supplierName: supplierId ? null : supplierName || null,
            supplierPhone: supplierId ? null : supplierPhone || null,
            supplierAddress: supplierId ? null : supplierAddress || null,
            purchaseDate,
            paymentMethod: purchaseMethod,
            paidNow: purchaseMethod === "due" ? paidNow || "0" : "0",
            transportCost,
            unloadingCost,
            carryingCost,
            otherLandedCost,
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
      <div className="rounded-2xl border border-border bg-card p-3 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-border bg-muted/35 px-2 py-2 text-center">
            <p className="text-[10px] font-semibold text-muted-foreground">পণ্য</p>
            <p className="mt-0.5 text-xl font-extrabold tabular-nums text-foreground">
              {validItemCount}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-muted/35 px-2 py-2 text-center">
            <p className="text-[10px] font-semibold text-muted-foreground">সাবটোটাল</p>
            <p className="mt-0.5 text-xs font-bold tabular-nums text-foreground">
              ৳{formatMoney(totalAmount)}
            </p>
          </div>
          <div className={`rounded-xl border px-2 py-2 text-center ${landedCostTotal > 0 ? "border-primary/20 bg-primary-soft/35" : "border-border bg-muted/35"}`}>
            <p className="text-[10px] font-semibold text-muted-foreground">অতিরিক্ত</p>
            <p className="mt-0.5 text-xs font-bold tabular-nums text-foreground">
              ৳{formatMoney(landedCostTotal)}
            </p>
          </div>
          <div className={`rounded-xl border px-2 py-2 text-center ${grandTotal > totalAmount ? "border-success/20 bg-success-soft/35" : "border-border bg-muted/35"}`}>
            <p className="text-[10px] font-semibold text-muted-foreground">গ্র্যান্ড টোটাল</p>
            <p className={`mt-0.5 text-xs font-bold tabular-nums ${grandTotal > 0 ? "text-foreground" : "text-success"}`}>
              ৳{formatMoney(grandTotal)}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card px-4 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
        <div className="flex items-start">
          {PURCHASE_STEPS.map((step, index) => {
            const active = index === currentStep;
            const complete = index < currentStep;
            const isLast = index === PURCHASE_STEPS.length - 1;
            return (
              <div key={step.key} className="flex items-start flex-1 min-w-0">
                <div className="flex flex-col items-center flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (index <= currentStep) {
                        setError(null);
                        setCurrentStep(index);
                      }
                    }}
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : complete
                        ? "border-success bg-success text-white"
                        : "border-border bg-card text-muted-foreground"
                    }`}
                  >
                    {complete ? "✓" : index + 1}
                  </button>
                  <p className={`mt-1.5 text-[10px] font-semibold text-center leading-tight hidden sm:block ${
                    active ? "text-primary" : complete ? "text-success" : "text-muted-foreground"
                  }`}>
                    {step.title.replace(/^\d+\.\s/, "")}
                  </p>
                </div>
                {!isLast && (
                  <div className={`h-0.5 flex-1 mt-4 mx-2 ${complete ? "bg-success/40" : "bg-border"}`} />
                )}
              </div>
            );
          })}
        </div>
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
              <div className="rounded-xl border border-primary/20 bg-primary-soft/20 p-3 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-primary/70">
                  নতুন সরবরাহকারীর তথ্য
                </p>
                <input
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="সরবরাহকারীর নাম *  (যেমন: মেসার্স রহমান ট্রেডার্স)"
                  className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={supplierPhone}
                    onChange={(e) => setSupplierPhone(e.target.value)}
                    placeholder="ফোন (ঐচ্ছিক)"
                    className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <input
                    type="text"
                    value={supplierAddress}
                    onChange={(e) => setSupplierAddress(e.target.value)}
                    placeholder="ঠিকানা (ঐচ্ছিক)"
                    className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  ক্রয় সংরক্ষণের সময় এই তথ্য দিয়ে নতুন সরবরাহকারী তৈরি হবে।
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
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-foreground">কি কি কিনছেন</h2>
                <p className="text-xs text-muted-foreground">
                  প্রতিটি পণ্যের পরিমাণ ও ক্রয় মূল্য দিন। মোট টাকার হিসাব নিজে হবে।
                </p>
              </div>
              <button
                type="button"
                onClick={addItem}
                className="inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary-soft px-4 text-sm font-semibold text-primary hover:bg-primary/15 transition-colors"
              >
                + আরেকটি পণ্য
              </button>
            </div>

            <div className="space-y-3">
              {items.map((item, index) => {
                const product = productMap.get(item.productId);
                const hasVariants = (product?.variants?.length ?? 0) > 0;
                const selectedVariant = item.variantId
                  ? (product?.variants ?? []).find((v) => v.id === item.variantId)
                  : null;
                const totalVariantStock = (product?.variants ?? []).reduce(
                  (sum, variant) => sum + Math.max(0, Number(variant.stockQty ?? 0)),
                  0
                );
                const lineTotal =
                  Math.max(0, Number(item.qty || 0)) *
                  Math.max(0, Number(item.unitCost || 0));
                const serialQtyTarget = Math.max(0, Math.round(Number(item.qty || 0)));
                const serialBulkPreview = parseSerialTokens(item.serialInput);
                const serialRemaining = Math.max(
                  serialQtyTarget - item.serialNumbers.length,
                  0
                );

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

                    <div className="mt-3 grid gap-3 sm:grid-cols-[1.35fr_0.95fr_0.8fr_0.8fr]">
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
                          ক্রয় ইউনিট
                        </label>
                        <select
                          value={item.unitConversionId ?? ""}
                          onChange={(e) =>
                            handleUnitConversionSelect(item.id, e.target.value)
                          }
                          disabled={!product}
                          className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <option value="">
                            {product?.baseUnit ? `Base: ${product.baseUnit}` : "Base ইউনিট"}
                          </option>
                          {(product?.unitConversions ?? []).map((conversion) => (
                            <option key={conversion.id} value={conversion.id}>
                              {conversion.label} ({conversion.baseUnitQuantity} {product?.baseUnit})
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
                        <p className="text-[10px] text-muted-foreground">
                          এখানে এখন কত কিনছেন সেটা দিন। এটা current stock না।
                        </p>
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
                              {v.storageLocation ? ` — লোকেশন: ${v.storageLocation}` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}

                    {product ? (() => {
                      const selectedConversion = item.unitConversionId
                        ? (product.unitConversions ?? []).find(
                            (conversion) => conversion.id === item.unitConversionId
                          )
                        : null;
                      const baseMultiplier = toPositiveNumber(
                        selectedConversion?.baseUnitQuantity,
                        1
                      );
                      const purchaseQty = Math.max(0, Number(item.qty || 0));
                      const convertedBaseQty = purchaseQty * baseMultiplier;
                      const stockDisplay = selectedVariant
                        ? selectedVariant.stockQty
                        : hasVariants
                        ? totalVariantStock.toFixed(2)
                        : product.trackStock
                        ? product.stockQty ?? "0"
                        : null;
                      return (
                        <div className="mt-3 rounded-xl border border-border bg-muted/35 px-3 py-2 text-[11px] text-muted-foreground">
                          আগের ক্রয় মূল্য: {selectedVariant?.buyPrice ?? product.buyPrice ?? "N/A"}
                          {stockDisplay != null
                            ? ` | বর্তমান স্টক: ${stockDisplay}`
                            : " | স্টক ট্র্যাক নয়"}
                          {selectedVariant
                            ? ` (${selectedVariant.label})`
                            : hasVariants
                            ? " (সব variant মিলিয়ে)"
                            : ""}
                          {selectedVariant?.storageLocation
                            ? ` | লোকেশন: ${selectedVariant.storageLocation}`
                            : product.storageLocation
                            ? ` | লোকেশন: ${product.storageLocation}`
                            : ""}
                          {` | কনভার্টেড: ${convertedBaseQty.toFixed(2)} ${product.baseUnit}`}
                          {selectedConversion ? ` (${selectedConversion.label})` : ""}
                        </div>
                      );
                    })() : null}

                    {product && hasVariants && !item.variantId ? (
                      <div className="mt-3 rounded-xl border border-warning/30 bg-warning-soft/40 px-3 py-2 text-[11px] text-warning">
                        এই product variant-wise managed। আগে variant বাছাই করুন, তারপর qty/serial final করুন।
                      </div>
                    ) : null}

                    {/* Batch number input — shown when product has trackBatch */}
                    {productMap.get(item.productId)?.trackBatch && (
                      <div className="mt-3 rounded-xl border border-warning/30 bg-warning-soft/60 p-3 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <span className="text-[11px] font-semibold text-warning">
                              Batch / Lot {isPharmacy ? "+ Expiry" : "নম্বর"} <span className="text-danger">*</span>
                            </span>
                            {isPharmacy && product ? (
                              <p className="mt-0.5 text-[10px] text-warning/80">
                                {[
                                  product.genericName,
                                  product.strength,
                                  product.dosageForm,
                                  product.manufacturer,
                                ]
                                  .filter(Boolean)
                                  .join(" · ") || "এই medicine-এর batch ও মেয়াদ দিন"}
                              </p>
                            ) : null}
                          </div>
                          {item.productId ? (
                            <Link
                              href={`/dashboard/products/batches?shopId=${shopId}&productId=${item.productId}${item.batchNo.trim() ? `&query=${encodeURIComponent(item.batchNo.trim())}` : ""}`}
                              className="text-[10px] font-semibold text-warning underline underline-offset-2"
                            >
                              আগের batch দেখুন
                            </Link>
                          ) : null}
                        </div>
                        <div className={`grid gap-2 ${isPharmacy ? "sm:grid-cols-[1fr_180px]" : ""}`}>
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-warning/90">
                              Batch/Lot No
                            </label>
                            <input
                              type="text"
                              value={item.batchNo}
                              onChange={(e) =>
                                setItems((prev) =>
                                  prev.map((i) =>
                                    i.id === item.id
                                      ? { ...i, batchNo: e.target.value }
                                      : i
                                  )
                                )
                              }
                              placeholder="যেমন: BEX-2506-A"
                              className="h-10 w-full rounded-lg border border-warning/20 bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-warning/30"
                            />
                          </div>
                          {isPharmacy ? (
                            <div className="space-y-1">
                              <label className="text-[10px] font-semibold text-warning/90">
                                Expiry Date
                              </label>
                              <input
                                type="date"
                                value={item.batchExpiryDate}
                                onChange={(e) =>
                                  setItems((prev) =>
                                    prev.map((i) =>
                                      i.id === item.id
                                        ? { ...i, batchExpiryDate: e.target.value }
                                        : i
                                    )
                                  )
                                }
                                className="h-10 w-full rounded-lg border border-warning/20 bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-warning/30"
                              />
                            </div>
                          ) : null}
                        </div>
                        <p className="text-[10px] text-warning/80">
                          {isPharmacy
                            ? "এই batch expiry অনুযায়ী আগে মেয়াদ শেষ হবে এমন stock আগে বিক্রি হবে।"
                            : "এই চালানের lot code লিখুন। পরে recall, supplier claim, আর FIFO trace এই code দিয়েই হবে।"}
                        </p>
                      </div>
                    )}

                    {/* Serial number input — shown when product has trackSerialNumbers */}
                    {productMap.get(item.productId)?.trackSerialNumbers &&
                    (!hasVariants || Boolean(item.variantId)) ? (
                      <div className="mt-3 rounded-xl border border-primary/30 bg-primary-soft/60 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold text-primary shrink-0">
                            Serial Numbers
                          </span>
                          <span
                            className={`text-[11px] font-semibold rounded-full px-2 py-0.5 whitespace-nowrap ${
                              item.serialNumbers.length === serialQtyTarget
                                ? "bg-success-soft text-success"
                                : "bg-warning-soft text-warning"
                            }`}
                          >
                            {item.serialNumbers.length} / {serialQtyTarget}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleSyncQtyWithSerialCount(item.id)}
                            className="rounded-full border border-primary/30 bg-card px-2.5 py-1 text-[10px] font-semibold text-primary hover:bg-primary/10"
                          >
                            qty = serial ({item.serialNumbers.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => handleClearSerials(item.id)}
                            className="rounded-full border border-danger/30 bg-card px-2.5 py-1 text-[10px] font-semibold text-danger hover:bg-danger-soft"
                          >
                            clear all
                          </button>
                          <span className="text-[10px] text-muted-foreground">
                            বাকি: {serialRemaining}
                          </span>
                        </div>
                        <p className="text-[10px] text-primary/80">
                          শুধু নতুন incoming serial দিন। existing serial এখানে দেখানো হয় না।
                        </p>
                        <div>
                          <Link
                            href={`/dashboard/products/serials?shopId=${shopId}&productId=${item.productId}&status=IN_STOCK`}
                            className="text-[10px] font-semibold text-primary underline underline-offset-2"
                          >
                            আগের in-stock serial দেখুন
                          </Link>
                        </div>

                        {/* Tab switcher */}
                        <div className="flex gap-1">
                          {(["bulk", "one"] as const).map((tab) => (
                            <button
                              key={tab}
                              type="button"
                              onClick={() =>
                                setItems((prev) =>
                                  prev.map((i) =>
                                    i.id === item.id ? { ...i, serialTab: tab } : i
                                  )
                                )
                              }
                              className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                                item.serialTab === tab
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-card text-primary border border-primary/30"
                              }`}
                            >
                              {tab === "bulk" ? "একসাথে Paste" : "একটা একটা"}
                            </button>
                          ))}
                        </div>

                        {item.serialTab === "bulk" ? (
                          <div className="space-y-1.5">
                            <textarea
                              rows={3}
                              value={item.serialInput}
                              onChange={(e) =>
                                handleBulkSerialChange(item.id, e.target.value)
                              }
                              placeholder={"প্রতিটা serial এক লাইনে বা কমা দিয়ে আলাদা করুন\nযেমন: SN001\nSN002\nSN003"}
                              className="w-full rounded-lg border border-primary/20 bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                            />
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleApplyBulkSerials(item.id, "append")}
                                className="h-8 rounded-lg border border-primary/30 bg-card px-3 text-[11px] font-semibold text-primary hover:bg-primary/10"
                              >
                                list-এ যোগ করুন
                              </button>
                              <button
                                type="button"
                                onClick={() => handleApplyBulkSerials(item.id, "replace")}
                                className="h-8 rounded-lg border border-warning/30 bg-card px-3 text-[11px] font-semibold text-warning hover:bg-warning/10"
                              >
                                list replace
                              </button>
                            </div>
                            <p className="text-[10px] text-primary/70">
                              parse preview: {serialBulkPreview.unique.length}টি serial
                              {serialBulkPreview.duplicateCount > 0
                                ? `, duplicate বাদ: ${serialBulkPreview.duplicateCount}`
                                : ""}
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={item.serialInput}
                                onChange={(e) =>
                                  setItems((prev) =>
                                    prev.map((i) =>
                                      i.id === item.id
                                        ? { ...i, serialInput: e.target.value }
                                        : i
                                    )
                                  )
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === ",") {
                                    e.preventDefault();
                                    handleAddOneSerial(item.id, item.serialInput);
                                  }
                                }}
                                placeholder="Serial scan/type করুন, Enter চাপুন"
                                className="flex-1 h-9 rounded-lg border border-primary/20 bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                              />
                              <button
                                type="button"
                                onClick={() => handleAddOneSerial(item.id, item.serialInput)}
                                className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary-hover"
                              >
                                যোগ
                              </button>
                            </div>
                            {item.serialNumbers.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {item.serialNumbers.map((sn) => (
                                  <span
                                    key={sn}
                                    className="inline-flex items-center gap-1 rounded-full bg-primary-soft text-primary border border-primary/30 text-[11px] font-medium px-2 py-0.5"
                                  >
                                    {sn}
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveSerial(item.id, sn)}
                                      className="text-primary/60 hover:text-danger leading-none"
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        {serialQtyTarget > 0 && item.serialNumbers.length !== serialQtyTarget ? (
                          <p className="text-[10px] font-semibold text-warning">
                            qty ({serialQtyTarget}) এবং serial count ({item.serialNumbers.length}) সমান করুন।
                          </p>
                        ) : null}
                      </div>
                    ) : productMap.get(item.productId)?.trackSerialNumbers && hasVariants ? (
                      <div className="mt-3 rounded-xl border border-warning/30 bg-warning-soft/40 px-3 py-2 text-[11px] text-warning">
                        Serial add করার আগে variant নির্বাচন করুন। variant-specific incoming serial-ই এখানে নথিভুক্ত হবে।
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="rounded-2xl border border-border bg-muted/50 px-4 py-4 space-y-2">
              <div className="flex items-center justify-between text-sm font-semibold text-foreground">
                <span>পণ্যের সাবটোটাল</span>
                <span>৳ {formatMoney(totalAmount)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>ল্যান্ডেড কস্ট</span>
                <span>৳ {formatMoney(landedCostTotal)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-border/60 pt-2 text-sm font-bold text-foreground">
                <span>সব মিলিয়ে মোট</span>
                <span>৳ {formatMoney(grandTotal)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                সব পরিমাণ, ক্রয় মূল্য আর অতিরিক্ত খরচ ঠিক থাকলে পরের ধাপে পেমেন্ট ঠিক করুন।
              </p>
            </div>
          </div>
        ) : null}

        {currentStep === 2 ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">
                অতিরিক্ত খরচ ও পেমেন্ট
              </h2>
              <p className="text-xs text-muted-foreground">
                transport, unloading, carrying add করলে stock cost আরও accurate হবে। তারপর payment ঠিক করুন।
              </p>
            </div>

            <div className="rounded-2xl border border-primary/20 bg-primary-soft/20 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Landed Cost Allocation</p>
                  <p className="text-xs text-muted-foreground">
                    এই খরচগুলো সব পণ্যের cost-এ proportional ভাবে ভাগ হবে।
                  </p>
                </div>
                <span className="rounded-full border border-primary/20 bg-card px-3 py-1 text-xs font-semibold text-primary">
                  মোট ৳ {formatMoney(landedCostTotal)}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Transport</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={transportCost}
                    onChange={(e) => setTransportCost(e.target.value)}
                    className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Unloading</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={unloadingCost}
                    onChange={(e) => setUnloadingCost(e.target.value)}
                    className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Carrying</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={carryingCost}
                    onChange={(e) => setCarryingCost(e.target.value)}
                    className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Other Cost</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={otherLandedCost}
                    onChange={(e) => setOtherLandedCost(e.target.value)}
                    className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              {PAYMENT_OPTIONS.map((option) => {
                const active = purchaseMethod === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPurchaseMethod(option.value)}
                    className={`flex items-center gap-1.5 h-10 rounded-full border px-4 text-sm font-semibold transition-colors ${
                      active
                        ? "border-primary/40 bg-primary-soft text-primary shadow-sm"
                        : "border-border bg-card text-foreground hover:border-primary/30 hover:bg-primary-soft/40"
                    }`}
                  >
                    <span>{option.icon}</span>
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
            {purchaseMethod !== "due" ? (
              <p className="text-xs text-muted-foreground">{PAYMENT_OPTIONS.find((o) => o.value === purchaseMethod)?.hint}</p>
            ) : null}

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
                      <span className="text-muted-foreground">পণ্যের সাবটোটাল</span>
                      <span className="font-semibold text-foreground">
                        ৳ {formatMoney(totalAmount)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">ল্যান্ডেড কস্ট</span>
                      <span className="font-semibold text-foreground">
                        ৳ {formatMoney(landedCostTotal)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">সব মিলিয়ে মোট</span>
                      <span className="font-semibold text-foreground">
                        ৳ {formatMoney(grandTotal)}
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
            ) : null}

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
                <div>
                  <p className="text-xs text-muted-foreground">সাবটোটাল</p>
                  <p className="mt-1 font-semibold text-foreground">৳ {formatMoney(totalAmount)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">ল্যান্ডেড কস্ট</p>
                  <p className="mt-1 font-semibold text-foreground">৳ {formatMoney(landedCostTotal)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">গ্র্যান্ড টোটাল</p>
                  <p className="mt-1 font-semibold text-foreground">৳ {formatMoney(grandTotal)}</p>
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
