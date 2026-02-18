"use client";

import { type FormEvent, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

type QueueProductOption = {
  id: string;
  name: string;
  sellPrice: string;
  trackStock: boolean;
  availableStock: string | null;
};

type ItemDraft = {
  id: string;
  productId: string;
  quantity: string;
};

type Props = {
  shopId: string;
  products: QueueProductOption[];
  orderTypeOptions: Array<{ value: string; label: string }>;
  action: (formData: FormData) => Promise<void>;
};

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

function parseQty(value: string) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.max(0, n) * 100) / 100;
}

function getAvailableQty(product?: QueueProductOption) {
  if (!product || !product.trackStock) return Number.POSITIVE_INFINITY;
  return Math.max(0, Number(product.availableStock || 0));
}

function isSelectableProduct(product?: QueueProductOption) {
  if (!product) return false;
  if (!product.trackStock) return true;
  return getAvailableQty(product) > 0;
}

function makeBlankItem(defaultProductId: string): ItemDraft {
  return {
    id: createId(),
    productId: defaultProductId,
    quantity: "1",
  };
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-11 items-center rounded-full border border-primary/30 bg-primary-soft px-4 text-sm font-semibold text-primary hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "ইস্যু হচ্ছে..." : "নতুন টোকেন ইস্যু"}
    </button>
  );
}

export default function CreateQueueTokenForm({
  shopId,
  products,
  orderTypeOptions,
  action,
}: Props) {
  const defaultProductId =
    products.find((product) => isSelectableProduct(product))?.id ??
    products[0]?.id ??
    "";
  const [items, setItems] = useState<ItemDraft[]>([makeBlankItem(defaultProductId)]);
  const [error, setError] = useState<string | null>(null);

  const productMap = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  );

  const normalizedItems = useMemo(
    () =>
      items
        .map((item) => ({
          productId: item.productId,
          quantity: parseQty(item.quantity),
        }))
        .filter((item) => item.productId && item.quantity > 0),
    [items]
  );

  const totalAmount = useMemo(() => {
    return normalizedItems.reduce((sum, item) => {
      const unitPrice = Number(productMap.get(item.productId)?.sellPrice || 0);
      return sum + unitPrice * item.quantity;
    }, 0);
  }, [normalizedItems, productMap]);

  const setItem = (id: string, patch: Partial<ItemDraft>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const addItem = () => {
    setItems((prev) => [...prev, makeBlankItem(defaultProductId)]);
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (normalizedItems.length === 0) {
      event.preventDefault();
      setError("কমপক্ষে একটি valid আইটেম দিন।");
      return;
    }
    const firstInvalid = normalizedItems.find((item) => {
      const product = productMap.get(item.productId);
      return !product || !isSelectableProduct(product);
    });
    if (firstInvalid) {
      const product = productMap.get(firstInvalid.productId);
      event.preventDefault();
      setError(`"${product?.name || "পণ্য"}" এর available stock নেই।`);
      return;
    }
    setError(null);
  };

  return (
    <form action={action} onSubmit={handleSubmit} className="mt-3 grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="shopId" value={shopId} />
      <input type="hidden" name="itemsJson" value={JSON.stringify(normalizedItems)} />

      <div className="space-y-1">
        <label className="text-xs font-semibold text-muted-foreground">অর্ডার টাইপ</label>
        <select
          name="orderType"
          className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          defaultValue={orderTypeOptions[0]?.value || ""}
        >
          {orderTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold text-muted-foreground">
          কাস্টমার নাম (ঐচ্ছিক)
        </label>
        <input
          name="customerName"
          className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="যেমন: রাহিম"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold text-muted-foreground">ফোন (ঐচ্ছিক)</label>
        <input
          name="customerPhone"
          className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="01700000000"
        />
      </div>

      <div className="space-y-1 sm:col-span-2">
        <label className="text-xs font-semibold text-muted-foreground">আইটেম তালিকা</label>
        <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
          {items.map((item) => {
            const product = productMap.get(item.productId);
            const qty = parseQty(item.quantity);
            const lineTotal = Number(product?.sellPrice || 0) * qty;
            const availableQty = getAvailableQty(product);
            const selectedOutOfStock =
              Boolean(product?.trackStock) && availableQty <= 0;
            return (
              <div key={item.id} className="grid grid-cols-12 gap-2">
                <select
                  value={item.productId}
                  onChange={(event) =>
                    setItem(item.id, { productId: event.target.value })
                  }
                  className="col-span-7 h-10 rounded-lg border border-border bg-card px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {products.map((productOption) => (
                    <option
                      key={productOption.id}
                      value={productOption.id}
                      disabled={!isSelectableProduct(productOption)}
                    >
                      {productOption.name}{" "}
                      {productOption.trackStock
                        ? `(স্টক ${Number(productOption.availableStock || 0).toFixed(
                            2
                          )})`
                        : "(স্টক ট্র্যাক নয়)"}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={item.quantity}
                  onChange={(event) =>
                    setItem(item.id, { quantity: event.target.value })
                  }
                  className="col-span-3 h-10 rounded-lg border border-border bg-card px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Qty"
                />
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  disabled={items.length === 1}
                  className="col-span-2 h-10 rounded-lg border border-danger/30 bg-danger-soft px-2 text-xs font-semibold text-danger hover:bg-danger/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  বাদ
                </button>
                <div className="col-span-12 text-right text-xs text-muted-foreground">
                  ৳ {lineTotal.toFixed(2)}
                </div>
                {selectedOutOfStock ? (
                  <div className="col-span-12 text-xs font-medium text-danger">
                    এই পণ্যের available stock নেই, অন্য পণ্য সিলেক্ট করুন।
                  </div>
                ) : null}
              </div>
            );
          })}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-2">
            <button
              type="button"
              onClick={addItem}
              className="inline-flex h-9 items-center rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted"
            >
              + আইটেম যোগ করুন
            </button>
            <span className="text-sm font-semibold text-foreground">
              মোট: ৳ {totalAmount.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-1 sm:col-span-2">
        <label className="text-xs font-semibold text-muted-foreground">নোট (ঐচ্ছিক)</label>
        <textarea
          name="note"
          className="min-h-[88px] w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="অতিরিক্ত নির্দেশনা লিখুন"
        />
      </div>

      {error ? (
        <p className="sm:col-span-2 rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
          {error}
        </p>
      ) : null}

      <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
        <SubmitButton />
      </div>
    </form>
  );
}
