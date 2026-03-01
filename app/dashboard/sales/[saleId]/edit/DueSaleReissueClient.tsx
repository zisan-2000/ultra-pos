"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type ProductOption = {
  id: string;
  name: string;
  sellPrice: string | number;
  stockQty?: string | number;
  trackStock?: boolean | null;
};

type CustomerOption = {
  id: string;
  name: string;
  totalDue: string | number;
  phone?: string | null;
};

type Draft = {
  sale: {
    id: string;
    shopId: string;
    invoiceNo: string | null;
    saleDate: string;
    status: string;
    paymentMethod: string;
    totalAmount: string;
    customer: { id: string; name: string; totalDue: string } | null;
    note: string | null;
  };
  items: {
    saleItemId: string;
    productId: string;
    productName: string;
    quantity: string;
    unitPrice: string;
    lineTotal: string;
  }[];
  completedReturnCount: number;
  partialPaidAtSale: string;
  outstandingDue: string;
  canReissue: boolean;
  blockingReason: string | null;
};

type ReissueResult = {
  success: boolean;
  oldSaleId: string;
  saleId: string;
  invoiceNo?: string | null;
};

type Props = {
  draft: Draft;
  products: ProductOption[];
  customers: CustomerOption[];
  submitReissue: (formData: FormData) => Promise<ReissueResult>;
};

type LineState = {
  key: string;
  productId: string;
  qty: string;
  unitPrice: string;
};

type ValidatedLine = {
  key: string;
  productId: string;
  productName: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  isValid: boolean;
  error: string | null;
};

function formatMoney(value: number | string) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString("bn-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function toNumber(value: string | number | null | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function newLine(defaultProductId = "", defaultPrice = ""): LineState {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    productId: defaultProductId,
    qty: "",
    unitPrice: defaultPrice,
  };
}

function buildOriginalLines(draft: Draft): LineState[] {
  if (draft.items.length === 0) return [newLine()];
  return draft.items.map((item) => ({
    key: item.saleItemId,
    productId: item.productId,
    qty: item.quantity,
    unitPrice: item.unitPrice,
  }));
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("bn-BD", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DueSaleReissueClient({
  draft,
  products,
  customers,
  submitReissue,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("Due sale correction");
  const [note, setNote] = useState(draft.sale.note ?? "");
  const [customerId, setCustomerId] = useState(draft.sale.customer?.id ?? "");
  const [paidNow, setPaidNow] = useState(draft.partialPaidAtSale);
  const [lines, setLines] = useState<LineState[]>(buildOriginalLines(draft));

  const productById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products]
  );

  const validatedLines = useMemo<ValidatedLine[]>(
    () =>
      lines.map((line) => {
        const qty = toNumber(line.qty);
        const unitPrice = toNumber(line.unitPrice);
        const product = productById.get(line.productId);

        if (!line.productId) {
          return {
            key: line.key,
            productId: "",
            productName: "",
            qty,
            unitPrice,
            lineTotal: 0,
            isValid: false,
            error: "পণ্য নির্বাচন করুন",
          };
        }

        if (qty <= 0) {
          return {
            key: line.key,
            productId: line.productId,
            productName: product?.name || "Unknown",
            qty,
            unitPrice,
            lineTotal: 0,
            isValid: false,
            error: "পরিমাণ 0 এর বেশি হতে হবে",
          };
        }

        if (unitPrice < 0) {
          return {
            key: line.key,
            productId: line.productId,
            productName: product?.name || "Unknown",
            qty,
            unitPrice,
            lineTotal: 0,
            isValid: false,
            error: "মূল্য নেগেটিভ হতে পারবে না",
          };
        }

        return {
          key: line.key,
          productId: line.productId,
          productName: product?.name || "Unknown",
          qty,
          unitPrice,
          lineTotal: qty * unitPrice,
          isValid: true,
          error: null,
        };
      }),
    [lines, productById]
  );

  const validLines = useMemo(
    () => validatedLines.filter((line) => line.isValid),
    [validatedLines]
  );
  const invalidCount = validatedLines.length - validLines.length;

  const duplicatedProductCount = useMemo(() => {
    const counter = new Map<string, number>();
    validLines.forEach((line) => {
      counter.set(line.productId, (counter.get(line.productId) ?? 0) + 1);
    });
    return Array.from(counter.values()).filter((count) => count > 1).length;
  }, [validLines]);

  const newTotal = useMemo(
    () => validLines.reduce((sum, line) => sum + line.lineTotal, 0),
    [validLines]
  );

  const originalTotal = toNumber(draft.sale.totalAmount);
  const originalPaid = toNumber(draft.partialPaidAtSale);
  const originalDue = toNumber(draft.outstandingDue);

  const enteredPaidNow = toNumber(paidNow);
  const normalizedPaidNow = clamp(enteredPaidNow, 0, newTotal);
  const newDue = Math.max(0, newTotal - normalizedPaidNow);
  const dueDelta = newDue - originalDue;

  const canSubmit =
    draft.canReissue &&
    customerId.trim() !== "" &&
    validLines.length > 0 &&
    invalidCount === 0 &&
    !isPending &&
    products.length > 0 &&
    customers.length > 0;

  const submitBlockReason = useMemo(() => {
    if (!draft.canReissue) {
      return draft.blockingReason || "এই বিক্রিতে reissue অনুমোদিত নয়";
    }
    if (products.length === 0) return "দোকানে কোনো active পণ্য নেই";
    if (customers.length === 0) return "কোনো কাস্টমার পাওয়া যায়নি";
    if (!customerId.trim()) return "কাস্টমার নির্বাচন করুন";
    if (validLines.length === 0) return "কমপক্ষে ১টি valid item দিন";
    if (invalidCount > 0) return `আরও ${invalidCount}টি লাইনে ভুল আছে`;
    return null;
  }, [
    customerId,
    customers.length,
    draft.blockingReason,
    draft.canReissue,
    invalidCount,
    products.length,
    validLines.length,
  ]);

  const addLine = () => {
    const p = products[0];
    setLines((prev) => [
      ...prev,
      newLine(p?.id ?? "", p?.sellPrice?.toString() ?? ""),
    ]);
  };

  const resetToOriginal = () => {
    setLines(buildOriginalLines(draft));
    setCustomerId(draft.sale.customer?.id ?? "");
    setPaidNow(draft.partialPaidAtSale);
    setReason("Due sale correction");
    setNote(draft.sale.note ?? "");
    setError(null);
  };

  const clearAllLines = () => {
    setLines([newLine(products[0]?.id ?? "", products[0]?.sellPrice?.toString() ?? "")]);
  };

  const updateLine = (key: string, patch: Partial<LineState>) => {
    setLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, ...patch } : line))
    );
  };

  const removeLine = (key: string) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    setError(null);

    startTransition(async () => {
      try {
        const payloadLines = validLines.map((line) => ({
          productId: line.productId,
          qty: line.qty,
          unitPrice: line.unitPrice,
          name: line.productName,
        }));

        const fd = new FormData();
        fd.set("originalSaleId", draft.sale.id);
        fd.set("customerId", customerId);
        fd.set("paidNow", normalizedPaidNow.toString());
        fd.set("note", note.trim());
        fd.set("reason", reason.trim());
        fd.set("items", JSON.stringify(payloadLines));

        const result = await submitReissue(fd);
        if (result?.success) {
          if (result.invoiceNo) {
            router.push(`/dashboard/sales/${result.saleId}/invoice`);
          } else {
            router.push(`/dashboard/sales?shopId=${draft.sale.shopId}`);
          }
          router.refresh();
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Reissue failed. Please try again."
        );
      }
    });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6 bn-typography">
      <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-[0_18px_40px_rgba(15,23,42,0.1)]">
        <div className="bg-gradient-to-r from-primary-soft via-card to-warning-soft p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Smart Correction Flow
              </p>
              <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
                Due Sale Edit / Reissue
              </h1>
              <p className="text-sm text-muted-foreground">
                পুরনো due sale void হবে, এরপর corrected নতুন due sale তৈরি হবে।
              </p>
            </div>
            <Link
              href="/dashboard/sales"
              className="inline-flex h-10 items-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
            >
              বিক্রিতে ফিরে যান
            </Link>
          </div>
        </div>

        <div className="border-t border-border p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-[11px] text-muted-foreground">Original Sale</p>
              <p className="mt-1 text-sm font-semibold text-foreground break-all">
                {draft.sale.id}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-[11px] text-muted-foreground">Sale Time</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {formatDateTime(draft.sale.saleDate)}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-[11px] text-muted-foreground">Original Total</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                ৳ {formatMoney(originalTotal)}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-[11px] text-muted-foreground">Paid At Sale</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                ৳ {formatMoney(originalPaid)}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-[11px] text-muted-foreground">Outstanding Due</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                ৳ {formatMoney(originalDue)}
              </p>
            </div>
          </div>

          {draft.blockingReason ? (
            <div className="mt-3 rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
              Reissue blocked: {draft.blockingReason}
            </div>
          ) : null}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-4 lg:grid-cols-[1.5fr,1fr]">
        <section className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  ১) Corrected Items
                </p>
                <p className="text-xs text-muted-foreground">
                  প্রতিটি লাইনে পণ্য, পরিমাণ, ইউনিট মূল্য ঠিক করুন।
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={addLine}
                  disabled={isPending}
                  className="rounded-full border border-primary/30 bg-primary-soft px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/15"
                >
                  + লাইন যোগ করুন
                </button>
                <button
                  type="button"
                  onClick={resetToOriginal}
                  disabled={isPending}
                  className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground hover:bg-muted"
                >
                  Original এ রিসেট
                </button>
                <button
                  type="button"
                  onClick={clearAllLines}
                  disabled={isPending}
                  className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground hover:bg-muted"
                >
                  সব মুছুন
                </button>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {lines.map((line, index) => {
                const product = productById.get(line.productId);
                const previewTotal = toNumber(line.qty) * toNumber(line.unitPrice);
                const rowValidation = validatedLines.find((row) => row.key === line.key);

                return (
                  <div
                    key={line.key}
                    className="rounded-xl border border-border bg-muted/25 p-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[11px] font-semibold text-muted-foreground">
                        Line {index + 1}
                      </p>
                      <button
                        type="button"
                        onClick={() => removeLine(line.key)}
                        disabled={isPending || lines.length <= 1}
                        className="rounded-md border border-danger/30 bg-danger-soft px-2 py-1 text-[11px] font-semibold text-danger disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-12">
                      <select
                        value={line.productId}
                        onChange={(e) => {
                          const selected = productById.get(e.target.value);
                          updateLine(line.key, {
                            productId: e.target.value,
                            unitPrice:
                              line.unitPrice || selected?.sellPrice?.toString() || "",
                          });
                        }}
                        disabled={isPending}
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm sm:col-span-6"
                      >
                        <option value="">পণ্য নির্বাচন করুন</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} · ৳ {formatMoney(p.sellPrice)}
                          </option>
                        ))}
                      </select>

                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.qty}
                        onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                        placeholder="Qty"
                        disabled={isPending}
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm sm:col-span-2"
                      />

                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.unitPrice}
                        onChange={(e) =>
                          updateLine(line.key, { unitPrice: e.target.value })
                        }
                        placeholder="Unit Price"
                        disabled={isPending}
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm sm:col-span-2"
                      />

                      <div className="flex items-center rounded-md border border-border bg-card px-3 text-xs font-semibold text-foreground sm:col-span-2">
                        ৳ {formatMoney(previewTotal)}
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      {product ? (
                        <span className="rounded-full border border-border bg-card px-2 py-0.5">
                          Stock: {formatMoney(product.stockQty ?? 0)}
                          {product.trackStock === false ? " · track off" : ""}
                        </span>
                      ) : null}
                      {rowValidation?.error ? (
                        <span className="rounded-full border border-danger/30 bg-danger-soft px-2 py-0.5 text-danger">
                          {rowValidation.error}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              <span className="rounded-full border border-border bg-card px-2.5 py-1 text-muted-foreground">
                Total lines: {lines.length}
              </span>
              <span className="rounded-full border border-success/30 bg-success-soft px-2.5 py-1 text-success">
                Valid: {validLines.length}
              </span>
              <span className="rounded-full border border-warning/30 bg-warning-soft px-2.5 py-1 text-warning">
                Invalid: {invalidCount}
              </span>
              {duplicatedProductCount > 0 ? (
                <span className="rounded-full border border-primary/30 bg-primary-soft px-2.5 py-1 text-primary">
                  Duplicate product lines auto-merge হবে
                </span>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <p className="text-sm font-semibold text-foreground">২) Settlement & Note</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  Customer
                </label>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  disabled={isPending}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">কাস্টমার নির্বাচন করুন</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name} · Due: ৳ {formatMoney(customer.totalDue)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  Paid Now
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={paidNow}
                  onChange={(e) => setPaidNow(e.target.value)}
                  disabled={isPending}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Auto clamp হবে: 0 থেকে ৳ {formatMoney(newTotal)}
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  Correction Reason
                </label>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={isPending}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  Note
                </label>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={isPending}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
              </div>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm lg:sticky lg:top-4">
            <p className="text-sm font-semibold text-foreground">৩) Impact Preview</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Submit করলে পুরনো sale void + নতুন corrected due sale create হবে।
            </p>

            <div className="mt-3 grid gap-2 text-sm">
              <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Original Total</p>
                <p className="font-semibold text-foreground">৳ {formatMoney(originalTotal)}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">New Total</p>
                <p className="font-semibold text-foreground">৳ {formatMoney(newTotal)}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">New Paid Now</p>
                <p className="font-semibold text-foreground">৳ {formatMoney(normalizedPaidNow)}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Previous Due</p>
                <p className="font-semibold text-foreground">৳ {formatMoney(originalDue)}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">New Due</p>
                <p className="font-semibold text-foreground">৳ {formatMoney(newDue)}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Due Delta</p>
                <p
                  className={`font-semibold ${
                    dueDelta > 0
                      ? "text-warning"
                      : dueDelta < 0
                      ? "text-success"
                      : "text-foreground"
                  }`}
                >
                  {dueDelta > 0 ? "+" : ""}
                  ৳ {formatMoney(dueDelta)}
                </p>
              </div>
            </div>

            <details className="mt-3 rounded-lg border border-border bg-card p-3">
              <summary className="cursor-pointer text-xs font-semibold text-foreground">
                Original item breakdown
              </summary>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                {draft.items.length === 0 ? (
                  <p>কোনো original item পাওয়া যায়নি।</p>
                ) : (
                  draft.items.map((item) => (
                    <p key={item.saleItemId}>
                      {item.productName} · {item.quantity} × ৳ {formatMoney(item.unitPrice)}
                    </p>
                  ))
                )}
              </div>
            </details>

            {error ? (
              <div className="mt-3 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
                {error}
              </div>
            ) : null}

            {submitBlockReason ? (
              <div className="mt-3 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
                Submit blocked: {submitBlockReason}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={!canSubmit}
              className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Reissuing..." : "Void + Create Corrected Sale"}
            </button>
          </div>
        </aside>
      </form>
    </div>
  );
}

