"use client";

import {
  type FormEvent,
  type MouseEvent,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { processSaleReturn, type SaleReturnDraft } from "@/app/actions/sales";
import { handlePermissionError } from "@/lib/permission-toast";

type Props = {
  initialDraft: SaleReturnDraft;
};

type ExchangeRow = {
  key: string;
  productId: string;
  qty: string;
  unitPrice: string;
};

function toNumber(value: string | number | null | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(value: number) {
  return value.toLocaleString("bn-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateTime(value?: string | null) {
  if (!value) return "প্রযোজ্য নয়";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "প্রযোজ্য নয়";
  return date.toLocaleString("bn-BD", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function newExchangeRow(): ExchangeRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    productId: "",
    qty: "",
    unitPrice: "",
  };
}

export default function ReturnSaleClient({ initialDraft }: Props) {
  const router = useRouter();
  const [returnType, setReturnType] = useState<"refund" | "exchange">("refund");
  const [settlementMode, setSettlementMode] = useState<"cash" | "due">("cash");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [exchangeRows, setExchangeRows] = useState<ExchangeRow[]>([newExchangeRow()]);
  const [returnQtyBySaleItem, setReturnQtyBySaleItem] = useState<
    Record<string, string>
  >(() =>
    Object.fromEntries(
      initialDraft.returnableItems.map((item) => [item.saleItemId, ""])
    )
  );
  const [isPending, startTransition] = useTransition();

  const itemById = useMemo(
    () => new Map(initialDraft.returnableItems.map((item) => [item.saleItemId, item])),
    [initialDraft.returnableItems]
  );
  const productById = useMemo(
    () => new Map(initialDraft.exchangeProducts.map((row) => [row.id, row])),
    [initialDraft.exchangeProducts]
  );

  const returnRows = useMemo(
    () =>
      initialDraft.returnableItems.map((item) => {
        const enteredQty = toNumber(returnQtyBySaleItem[item.saleItemId]);
        const unitPrice = toNumber(item.unitPrice);
        const maxQty = toNumber(item.maxReturnQty);
        const safeQty = Math.max(0, Math.min(enteredQty, maxQty));
        return {
          ...item,
          enteredQty,
          safeQty,
          maxQty,
          lineTotal: safeQty * unitPrice,
          hasValue: safeQty > 0,
        };
      }),
    [initialDraft.returnableItems, returnQtyBySaleItem]
  );

  const selectedReturnRows = useMemo(
    () => returnRows.filter((row) => row.hasValue),
    [returnRows]
  );

  const returnedSubtotal = useMemo(
    () => selectedReturnRows.reduce((sum, row) => sum + row.lineTotal, 0),
    [selectedReturnRows]
  );

  const validExchangeRows = useMemo(() => {
    if (returnType !== "exchange") return [] as {
      productId: string;
      qty: number;
      unitPrice: number;
      lineTotal: number;
      productName: string;
    }[];

    return exchangeRows
      .map((row) => {
        const qty = toNumber(row.qty);
        if (!row.productId || qty <= 0) return null;

        const product = productById.get(row.productId);
        const fallbackPrice = product ? toNumber(product.sellPrice) : 0;
        const unitPrice = row.unitPrice.trim()
          ? toNumber(row.unitPrice)
          : fallbackPrice;

        if (unitPrice <= 0) return null;

        return {
          productId: row.productId,
          qty,
          unitPrice,
          lineTotal: qty * unitPrice,
          productName: product?.name || "অজানা",
        };
      })
      .filter(
        (
          row
        ): row is {
          productId: string;
          qty: number;
          unitPrice: number;
          lineTotal: number;
          productName: string;
        } => Boolean(row)
      );
  }, [exchangeRows, productById, returnType]);

  const exchangeSubtotal = useMemo(
    () => validExchangeRows.reduce((sum, row) => sum + row.lineTotal, 0),
    [validExchangeRows]
  );

  const netAmount = exchangeSubtotal - returnedSubtotal;
  const hasCustomer = Boolean(initialDraft.sale.customer?.id);

  const canSubmit =
    initialDraft.canManage &&
    selectedReturnRows.length > 0 &&
    (returnType === "refund" || exchangeSubtotal > 0);

  const settlementPreview = useMemo(() => {
    if (returnType === "refund") {
      return {
        label:
          "এই রিটার্নে সিস্টেম রিফান্ড/ডিউ সমন্বয় স্বয়ংক্রিয়ভাবে করবে (কাস্টমার থাকলে আগে due adjust হতে পারে)।",
        tone: "text-muted-foreground",
      };
    }

    if (netAmount < 0) {
      return {
        label:
          hasCustomer
            ? "নেগেটিভ নেট: আগে কাস্টমারের due adjust হবে, বাকি থাকলে cash refund যাবে।"
            : "নেগেটিভ নেট: cash refund যাবে।",
        tone: "text-danger",
      };
    }

    if (netAmount > 0) {
      if (hasCustomer && settlementMode === "due") {
        return {
          label: "পজিটিভ নেট: এই amount কাস্টমারের due-তে যোগ হবে।",
          tone: "text-warning",
        };
      }
      return {
        label: "পজিটিভ নেট: এই amount cashbook-এ IN হিসেবে যাবে।",
        tone: "text-warning",
      };
    }

    return {
      label: "নেট 0.00: অতিরিক্ত cash বা due movement হবে না।",
      tone: "text-success",
    };
  }, [hasCustomer, netAmount, returnType, settlementMode]);

  const submitLabel = isPending
    ? "প্রসেস হচ্ছে..."
    : returnType === "exchange"
    ? "এক্সচেঞ্জ প্রসেস করুন"
    : "রিটার্ন প্রসেস করুন";

  const totalReturnableCount = useMemo(
    () => returnRows.filter((row) => row.maxQty > 0).length,
    [returnRows]
  );

  const fullReturnSelectedCount = useMemo(
    () =>
      returnRows.filter(
        (row) =>
          row.maxQty > 0 &&
          row.safeQty > 0 &&
          Math.abs(row.safeQty - row.maxQty) < 0.0001
      ).length,
    [returnRows]
  );

  const isAllFullReturn =
    totalReturnableCount > 0 && fullReturnSelectedCount === totalReturnableCount;

  const handleAutoSelectMax = (
    saleItemId: string,
    maxQty: string,
    force = false
  ) => {
    const current = toNumber(returnQtyBySaleItem[saleItemId]);
    if (!force && current > 0) return;
    setReturnQtyBySaleItem((prev) => ({
      ...prev,
      [saleItemId]: maxQty,
    }));
  };

  const handleReturnCardClick = (
    event: MouseEvent<HTMLDivElement>,
    saleItemId: string,
    maxQty: string,
    disabled: boolean
  ) => {
    if (disabled || isPending) return;
    const target = event.target as HTMLElement | null;
    if (target && target.closest("input, button, select, textarea, label, a")) {
      return;
    }
    handleAutoSelectMax(saleItemId, maxQty);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || isPending) return;
    setError(null);

    if (isAllFullReturn) {
      const confirmed = window.confirm(
        "সবগুলো আইটেম পূর্ণ পরিমাণে ফেরত হচ্ছে। আপনি কি নিশ্চিত?"
      );
      if (!confirmed) return;
    }

    const returnedItems = selectedReturnRows.map((row) => ({
      saleItemId: row.saleItemId,
      qty: row.safeQty,
    }));

    const exchangeItems =
      returnType === "exchange"
        ? validExchangeRows.map((row) => ({
            productId: row.productId,
            qty: row.qty,
            unitPrice: row.unitPrice,
          }))
        : [];

    startTransition(async () => {
      try {
        const result = await processSaleReturn({
          saleId: initialDraft.sale.id,
          type: returnType,
          returnedItems,
          exchangeItems,
          settlementMode,
          reason: reason.trim() || null,
          note: note.trim() || null,
        });

        alert(`রিটার্ন সম্পন্ন হয়েছে: ${result.returnNo}`);
        router.refresh();
      } catch (err) {
        if (handlePermissionError(err)) return;
        setError(err instanceof Error ? err.message : "রিটার্ন প্রসেস ব্যর্থ হয়েছে");
      }
    });
  };

  return (
    <div className="space-y-4 bn-typography">
      {!initialDraft.canManage ? (
        <div className="rounded-xl border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
          আপনার রোলে রিটার্ন/এক্সচেঞ্জ প্রসেস করার অনুমতি নেই।
        </div>
      ) : null}

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          বিক্রির সারাংশ
        </p>
        <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-muted/20 p-2.5">
            <p className="text-[11px] text-muted-foreground">বিল তারিখ</p>
            <p className="font-semibold text-foreground">
              {formatDateTime(initialDraft.sale.saleDate)}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-muted/20 p-2.5">
            <p className="text-[11px] text-muted-foreground">মূল বিল</p>
            <p className="font-semibold text-foreground">
              ৳ {formatMoney(toNumber(initialDraft.sale.totalAmount))}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-muted/20 p-2.5">
            <p className="text-[11px] text-muted-foreground">কাস্টমার</p>
            <p className="font-semibold text-foreground">
              {initialDraft.sale.customer?.name || "ওয়াক-ইন"}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-muted/20 p-2.5">
            <p className="text-[11px] text-muted-foreground">আগের রিটার্ন</p>
            <p className="font-semibold text-foreground">
              {initialDraft.existingReturns.length}
            </p>
          </div>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm"
      >
        <section className="space-y-3 rounded-xl border border-border p-3">
          <div>
            <p className="text-sm font-semibold text-foreground">১) রিটার্নের ধরন</p>
            <p className="text-xs text-muted-foreground">
              আগে ঠিক করুন এটা রিফান্ড নাকি এক্সচেঞ্জ।
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setReturnType("refund")}
              disabled={isPending}
              className={`rounded-xl border px-3 py-2 text-left transition ${
                returnType === "refund"
                  ? "border-warning/40 bg-warning-soft text-warning"
                  : "border-border bg-card text-foreground"
              }`}
            >
              <p className="text-sm font-semibold">↩️ রিফান্ড</p>
              <p className="text-xs">শুধু ফেরত, নতুন আইটেম ছাড়া</p>
            </button>
            <button
              type="button"
              onClick={() => setReturnType("exchange")}
              disabled={isPending}
              className={`rounded-xl border px-3 py-2 text-left transition ${
                returnType === "exchange"
                  ? "border-primary/40 bg-primary-soft text-primary"
                  : "border-border bg-card text-foreground"
              }`}
            >
              <p className="text-sm font-semibold">🔁 এক্সচেঞ্জ</p>
              <p className="text-xs">ফেরত + নতুন আইটেম</p>
            </button>
          </div>

          {returnType === "exchange" && netAmount > 0 && hasCustomer ? (
            <div className="rounded-xl border border-border bg-muted/20 p-2.5">
              <p className="text-xs font-semibold text-foreground">অতিরিক্ত সমন্বয়</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                    settlementMode === "cash"
                      ? "border-primary/40 bg-primary-soft"
                      : "border-border bg-card"
                  }`}
                >
                  <input
                    type="radio"
                    name="settlementMode"
                    value="cash"
                    checked={settlementMode === "cash"}
                    onChange={() => setSettlementMode("cash")}
                    disabled={isPending}
                    className="mt-0.5"
                  />
                  <span>এখনই নিন (Cashbook IN)</span>
                </label>
                <label
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                    settlementMode === "due"
                      ? "border-primary/40 bg-primary-soft"
                      : "border-border bg-card"
                  }`}
                >
                  <input
                    type="radio"
                    name="settlementMode"
                    value="due"
                    checked={settlementMode === "due"}
                    onChange={() => setSettlementMode("due")}
                    disabled={isPending}
                    className="mt-0.5"
                  />
                  <span>কাস্টমারের due-তে যোগ করুন</span>
                </label>
              </div>
            </div>
          ) : null}
        </section>

        <section className="space-y-3 rounded-xl border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-foreground">২) রিটার্ন আইটেম</p>
              <p className="text-xs text-muted-foreground">
                আইটেম কার্ডে ট্যাপ করলে সর্বোচ্চ পরিমাণ অটো-সেট হবে, চাইলে পরিবর্তন করুন।
              </p>
            </div>
            <span className="inline-flex rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-semibold text-foreground">
              নির্বাচিত: {selectedReturnRows.length}
            </span>
          </div>

          <div className="space-y-2">
            {returnRows.map((item) => {
              const disabled = item.maxQty <= 0;
              return (
                <div
                  key={item.saleItemId}
                  onClick={(event) =>
                    handleReturnCardClick(
                      event,
                      item.saleItemId,
                      item.maxReturnQty,
                      disabled
                    )
                  }
                  className={`rounded-xl border p-3 ${
                    item.hasValue
                      ? "border-primary/40 bg-primary-soft/30"
                      : "border-border bg-card"
                  } ${disabled ? "opacity-70" : "cursor-pointer"}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">{item.productName}</p>
                      <p className="text-[11px] text-muted-foreground">
                        বিক্রি {item.soldQty} · ফেরত {item.returnedQty} · বাকি {item.maxReturnQty}
                      </p>
                    </div>
                    <p className="text-xs font-semibold text-foreground">
                      ইউনিট: ৳ {formatMoney(toNumber(item.unitPrice))}
                    </p>
                  </div>

                  <div className="mt-2 grid gap-2 sm:grid-cols-[140px,1fr] sm:items-end">
                    <div>
                      <label className="text-[11px] text-muted-foreground">ফেরত পরিমাণ</label>
                      <input
                        type="number"
                        min="0"
                        max={item.maxReturnQty}
                        step="0.01"
                        value={returnQtyBySaleItem[item.saleItemId] ?? ""}
                        onChange={(e) =>
                          setReturnQtyBySaleItem((prev) => ({
                            ...prev,
                            [item.saleItemId]: e.target.value,
                          }))
                        }
                        className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-right text-sm"
                        disabled={isPending || disabled}
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isPending || disabled}
                          onClick={() =>
                            handleAutoSelectMax(item.saleItemId, item.maxReturnQty, true)
                          }
                          className="rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                        >
                          সর্বোচ্চ
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() =>
                            setReturnQtyBySaleItem((prev) => ({
                              ...prev,
                              [item.saleItemId]: "",
                            }))
                          }
                          className="rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50"
                        >
                          মুছুন
                        </button>
                      </div>
                      <p className="text-xs font-semibold text-foreground">
                        লাইন মোট: ৳ {formatMoney(item.lineTotal)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {returnType === "exchange" ? (
          <section className="space-y-3 rounded-xl border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground">৩) এক্সচেঞ্জ আইটেম</p>
                <p className="text-xs text-muted-foreground">
                  যে নতুন আইটেম দিবেন, সেগুলো যোগ করুন।
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExchangeRows((prev) => [...prev, newExchangeRow()])}
                className="rounded-full border border-primary/30 bg-primary-soft px-3 py-1 text-xs font-semibold text-primary"
                disabled={isPending}
              >
                + সারি যোগ করুন
              </button>
            </div>

            <div className="space-y-2">
              {exchangeRows.map((row, index) => {
                const product = productById.get(row.productId);
                const qty = toNumber(row.qty);
                const unitPrice = row.unitPrice.trim()
                  ? toNumber(row.unitPrice)
                  : toNumber(product?.sellPrice);
                const lineTotal = qty > 0 && unitPrice > 0 ? qty * unitPrice : 0;

                return (
                  <div key={row.key} className="rounded-xl border border-border bg-card p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground">সারি {index + 1}</p>
                      <button
                        type="button"
                        onClick={() =>
                          setExchangeRows((prev) =>
                            prev.length <= 1 ? prev : prev.filter((r) => r.key !== row.key)
                          )
                        }
                        className="rounded-md border border-danger/30 bg-danger-soft px-2 py-1 text-[11px] font-semibold text-danger disabled:opacity-50"
                        disabled={isPending || exchangeRows.length <= 1}
                      >
                        বাদ দিন
                      </button>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-12">
                      <select
                        value={row.productId}
                        onChange={(e) =>
                          setExchangeRows((prev) =>
                            prev.map((r) =>
                              r.key === row.key
                                ? {
                                    ...r,
                                    productId: e.target.value,
                                    unitPrice:
                                      r.unitPrice ||
                                      (productById.get(e.target.value)?.sellPrice ?? ""),
                                  }
                                : r
                            )
                          )
                        }
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm sm:col-span-6"
                        disabled={isPending}
                      >
                        <option value="">পণ্য নির্বাচন করুন</option>
                        {initialDraft.exchangeProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} · ৳ {formatMoney(toNumber(p.sellPrice))}
                            {p.trackStock ? ` · স্টক ${formatMoney(toNumber(p.stockQty))}` : ""}
                          </option>
                        ))}
                      </select>

                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="পরিমাণ"
                        value={row.qty}
                        onChange={(e) =>
                          setExchangeRows((prev) =>
                            prev.map((r) =>
                              r.key === row.key ? { ...r, qty: e.target.value } : r
                            )
                          )
                        }
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm sm:col-span-2"
                        disabled={isPending}
                      />

                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="ইউনিট মূল্য"
                        value={row.unitPrice}
                        onChange={(e) =>
                          setExchangeRows((prev) =>
                            prev.map((r) =>
                              r.key === row.key ? { ...r, unitPrice: e.target.value } : r
                            )
                          )
                        }
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm sm:col-span-2"
                        disabled={isPending}
                      />

                      <div className="flex items-center rounded-md border border-border bg-muted/20 px-3 text-xs font-semibold text-foreground sm:col-span-2">
                        ৳ {formatMoney(lineTotal)}
                      </div>
                    </div>

                    {product ? (
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {product.name} · ডিফল্ট ৳ {formatMoney(toNumber(product.sellPrice))}
                        {product.trackStock
                          ? ` · স্টক ${formatMoney(toNumber(product.stockQty))}`
                          : " · স্টক ট্র্যাকিং বন্ধ"}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="space-y-2 rounded-xl border border-border p-3">
          <p className="text-sm font-semibold text-foreground">৪) কারণ ও নোট</p>
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">কারণ</label>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="নষ্ট / ভুল আইটেম / মেয়াদোত্তীর্ণ"
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                disabled={isPending}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">নোট</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="mt-1 min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                disabled={isPending}
              />
            </div>
          </div>
        </section>

        <section className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
          <p className="text-sm font-semibold text-foreground">৫) আর্থিক প্রিভিউ</p>
          <div className="grid gap-2 text-sm md:grid-cols-4">
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <p className="text-[11px] text-muted-foreground">রিটার্ন সাবটোটাল</p>
              <p className="font-semibold text-danger">৳ {formatMoney(returnedSubtotal)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <p className="text-[11px] text-muted-foreground">এক্সচেঞ্জ সাবটোটাল</p>
              <p className="font-semibold text-success">৳ {formatMoney(exchangeSubtotal)}</p>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <p className="text-[11px] text-muted-foreground">নেট</p>
              <p
                className={`font-semibold ${
                  netAmount < 0
                    ? "text-danger"
                    : netAmount > 0
                    ? "text-warning"
                    : "text-success"
                }`}
              >
                ৳ {formatMoney(netAmount)}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card px-3 py-2">
              <p className="text-[11px] text-muted-foreground">কাস্টমার</p>
              <p className="font-semibold text-foreground">
                {initialDraft.sale.customer?.name || "ওয়াক-ইন"}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card px-3 py-2">
            <p className={`text-xs ${settlementPreview.tone}`}>{settlementPreview.label}</p>
          </div>
        </section>

        {error ? (
          <div className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {canSubmit
              ? "সবকিছু ঠিক থাকলে প্রসেস করুন।"
              : "কমপক্ষে ১টি return qty দিন, আর এক্সচেঞ্জ হলে exchange item amount অবশ্যই থাকতে হবে।"}
          </p>
          <button
            type="submit"
            disabled={!canSubmit || isPending}
            className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitLabel}
          </button>
        </div>
      </form>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground">পূর্বের রিটার্ন</h2>
        {initialDraft.existingReturns.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">এই sale-এ এখনো return/exchange নেই।</p>
        ) : (
          <div className="mt-3 space-y-3">
            {initialDraft.existingReturns.map((row) => {
              const isRefund = row.type === "refund";
              const typeClass = isRefund
                ? "border-warning/30 bg-warning-soft text-warning"
                : "border-primary/30 bg-primary-soft text-primary";

              return (
                <div key={row.id} className="rounded-xl border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">{row.returnNo}</p>
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${typeClass}`}
                      >
                        {isRefund ? "রিফান্ড" : "এক্সচেঞ্জ"}
                      </span>
                      <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {row.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(row.createdAt).toLocaleString("bn-BD")}
                    </p>
                  </div>

                  <div className="mt-2 grid gap-2 text-xs sm:grid-cols-3">
                    <p className="rounded-lg border border-border bg-muted/20 px-2.5 py-1.5 text-muted-foreground">
                      রিটার্ন: <span className="font-semibold text-danger">৳ {formatMoney(toNumber(row.subtotal))}</span>
                    </p>
                    <p className="rounded-lg border border-border bg-muted/20 px-2.5 py-1.5 text-muted-foreground">
                      এক্সচেঞ্জ: <span className="font-semibold text-success">৳ {formatMoney(toNumber(row.exchangeSubtotal))}</span>
                    </p>
                    <p className="rounded-lg border border-border bg-muted/20 px-2.5 py-1.5 text-muted-foreground">
                      নেট: <span className="font-semibold text-foreground">৳ {formatMoney(toNumber(row.netAmount))}</span>
                    </p>
                  </div>

                  <p className="mt-2 text-[11px] text-muted-foreground">
                    রিটার্ন লাইন: {row.items.length} · এক্সচেঞ্জ লাইন: {row.exchangeItems.length}
                  </p>

                  {row.reason ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">কারণ: {row.reason}</p>
                  ) : null}
                  {row.note ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">নোট: {row.note}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
