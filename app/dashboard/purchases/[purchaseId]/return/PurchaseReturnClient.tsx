"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type PurchaseReturnItemRow = {
  id: string;
  productId: string;
  productName: string;
  variantId: string | null;
  variantLabel: string | null;
  purchasedQty: string;
  alreadyReturnedQty: string;
  returnableQty: string;
  unitCost: string;
  lineTotal: string;
  trackStock: boolean;
  trackSerialNumbers: boolean;
  trackBatch: boolean;
  trackCutLength: boolean;
  batchNo: string | null;
  batchRemainingQty: string | null;
  availableSerials: string[];
};

type PurchaseReturnClientProps = {
  shopId: string;
  purchaseId: string;
  supplierName: string;
  dueAmount: string;
  defaultReturnDate: string;
  items: PurchaseReturnItemRow[];
};

type DraftRow = {
  qty: string;
  serialInput: string;
};

function parseSerials(raw: string) {
  return raw
    .split(/[\s,]+/)
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean);
}

function fmt(n: number) {
  return n.toLocaleString("bn-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PurchaseReturnClient({
  shopId,
  purchaseId,
  supplierName,
  dueAmount,
  defaultReturnDate,
  items,
}: PurchaseReturnClientProps) {
  const router = useRouter();
  const [returnDate, setReturnDate] = useState(defaultReturnDate);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>(
    Object.fromEntries(items.map((item) => [item.id, { qty: "", serialInput: "" }]))
  );

  const totals = useMemo(() => {
    let total = 0;
    for (const item of items) {
      const qty = Number(drafts[item.id]?.qty || 0);
      const unitCost = Number(item.unitCost || 0);
      if (Number.isFinite(qty) && qty > 0 && Number.isFinite(unitCost)) {
        total += qty * unitCost;
      }
    }
    const supplierDue = Number(dueAmount || 0);
    return {
      returnTotal: total,
      dueReduction: Math.min(total, supplierDue),
      supplierCredit: Math.max(0, total - supplierDue),
    };
  }, [drafts, dueAmount, items]);

  function updateDraft(itemId: string, patch: Partial<DraftRow>) {
    setDrafts((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const payloadItems = items
      .map((item) => {
        const draft = drafts[item.id];
        const qty = Number(draft?.qty || 0);
        const serialNumbers = parseSerials(draft?.serialInput || "");
        return { purchaseItemId: item.id, qty, serialNumbers: serialNumbers.length > 0 ? serialNumbers : null, item };
      })
      .filter((row) => row.qty > 0);

    if (payloadItems.length === 0) {
      setError("কমপক্ষে একটি আইটেমের রিটার্ন পরিমাণ দিন।");
      return;
    }

    for (const row of payloadItems) {
      const returnableQty = Number(row.item.returnableQty || 0);
      if (!Number.isFinite(row.qty) || row.qty <= 0) {
        setError(`"${row.item.productName}" এর জন্য সঠিক রিটার্ন পরিমাণ দিন।`);
        return;
      }
      if (row.qty > returnableQty + 0.000001) {
        setError(`"${row.item.productName}" এর returnable quantity অতিক্রম করেছে।`);
        return;
      }
      if (row.item.trackSerialNumbers && (row.serialNumbers?.length ?? 0) !== Math.round(row.qty)) {
        setError(`"${row.item.productName}" এর জন্য serial count ও qty সমান হতে হবে।`);
        return;
      }
    }

    setSaving(true);
    try {
      const response = await fetch("/api/purchases/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId,
          purchaseId,
          returnDate,
          note: note.trim() || null,
          items: payloadItems.map((row) => ({
            purchaseItemId: row.purchaseItemId,
            qty: row.qty,
            serialNumbers: row.serialNumbers,
          })),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || "Supplier return সংরক্ষণ করা যায়নি");
      }
      router.push(`/dashboard/purchases/${purchaseId}?shopId=${shopId}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Supplier return করা যায়নি");
    } finally {
      setSaving(false);
    }
  }

  const supplierDue = Number(dueAmount || 0);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* ── Live summary strip ── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card px-3 py-3 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">রিটার্ন টোটাল</p>
          <p className="mt-1 text-base font-extrabold tabular-nums text-foreground">
            ৳ {fmt(totals.returnTotal)}
          </p>
        </div>
        <div className="rounded-2xl border border-warning/30 bg-warning-soft/40 px-3 py-3 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-warning/70">বর্তমান বাকি</p>
          <p className="mt-1 text-base font-extrabold tabular-nums text-warning">
            ৳ {fmt(supplierDue)}
          </p>
        </div>
        <div className="rounded-2xl border border-success/30 bg-success-soft/40 px-3 py-3 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-success/70">বাকি কমবে</p>
          <p className="mt-1 text-base font-extrabold tabular-nums text-success">
            ৳ {fmt(totals.dueReduction)}
          </p>
        </div>
        <div className="rounded-2xl border border-primary/30 bg-primary-soft/40 px-3 py-3 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-primary/70">সাপ্লায়ার ক্রেডিট</p>
          <p className="mt-1 text-base font-extrabold tabular-nums text-primary">
            ৳ {fmt(totals.supplierCredit)}
          </p>
        </div>
      </div>

      {/* ── Date + Note ── */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-3">
          রিটার্নের তথ্য
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">রিটার্ন তারিখ</label>
            <input
              type="date"
              value={returnDate}
              onChange={(e) => setReturnDate(e.target.value)}
              className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">নোট (ঐচ্ছিক)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="যেমন: ভাঙা / ড্যামেজড পণ্য ফেরত"
              className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>
      </div>

      {/* ── Item cards ── */}
      <div className="space-y-3">
        {items.map((item) => {
          const draft = drafts[item.id];
          const qty = Number(draft?.qty || 0);
          const lineTotal = qty * Number(item.unitCost || 0);
          const returnableQty = Number(item.returnableQty || 0);
          const serialCount = parseSerials(draft?.serialInput || "").length;
          const hasQty = qty > 0;

          return (
            <div
              key={item.id}
              className={`rounded-2xl border bg-card p-4 shadow-sm transition-shadow ${
                hasQty ? "border-warning/40 shadow-md" : "border-border"
              }`}
            >
              {/* Product header */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-foreground leading-tight">
                    {item.productName}
                    {item.variantLabel ? (
                      <span className="ml-1 font-normal text-muted-foreground">({item.variantLabel})</span>
                    ) : null}
                  </h2>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      কেনা {Number(item.purchasedQty).toFixed(2)}
                    </span>
                    {Number(item.alreadyReturnedQty) > 0 ? (
                      <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        আগে ফেরত {Number(item.alreadyReturnedQty).toFixed(2)}
                      </span>
                    ) : null}
                    <span className="inline-flex items-center rounded-full border border-success/30 bg-success-soft px-2 py-0.5 text-[10px] font-semibold text-success">
                      ফেরতযোগ্য {returnableQty.toFixed(2)}
                    </span>
                    {item.batchNo ? (
                      <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary-soft px-2 py-0.5 text-[10px] font-semibold text-primary">
                        Batch {item.batchNo} · বাকি {Number(item.batchRemainingQty || 0).toFixed(2)}
                      </span>
                    ) : null}
                    {item.trackCutLength ? (
                      <span className="inline-flex items-center rounded-full border border-warning/30 bg-warning-soft px-2 py-0.5 text-[10px] font-semibold text-warning">
                        Cut-length
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[10px] text-muted-foreground">একক মূল্য</p>
                  <p className="text-sm font-bold tabular-nums text-foreground">৳ {fmt(Number(item.unitCost))}</p>
                </div>
              </div>

              {/* Qty + Line total */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">রিটার্ন পরিমাণ</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    max={item.returnableQty}
                    value={draft?.qty || ""}
                    onChange={(e) => updateDraft(item.id, { qty: e.target.value })}
                    placeholder="0"
                    className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-warning/30"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">লাইন টোটাল</label>
                  <div className={`flex h-11 items-center rounded-xl border px-3 text-sm font-bold tabular-nums transition-colors ${
                    hasQty
                      ? "border-warning/30 bg-warning-soft/40 text-warning"
                      : "border-border bg-card text-muted-foreground"
                  }`}>
                    ৳ {fmt(lineTotal)}
                  </div>
                </div>
              </div>

              {/* Serial numbers */}
              {item.trackSerialNumbers ? (
                <div className="mt-3 space-y-2 rounded-xl border border-primary/20 bg-primary-soft/20 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-primary/70">
                    Serial Numbers
                  </p>
                  {item.availableSerials.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {item.availableSerials.map((serial) => {
                        const selected = parseSerials(draft?.serialInput || "").includes(serial);
                        return (
                          <button
                            key={serial}
                            type="button"
                            onClick={() => {
                              const current = parseSerials(draft?.serialInput || "");
                              if (selected) {
                                updateDraft(item.id, { serialInput: current.filter((s) => s !== serial).join(", ") });
                              } else {
                                updateDraft(item.id, { serialInput: [...current, serial].join(", ") });
                              }
                            }}
                            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                              selected
                                ? "border-primary/40 bg-primary text-primary-foreground shadow-sm"
                                : "border-primary/30 bg-primary-soft text-primary hover:bg-primary/15"
                            }`}
                          >
                            {serial}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  <textarea
                    value={draft?.serialInput || ""}
                    onChange={(e) => updateDraft(item.id, { serialInput: e.target.value })}
                    rows={2}
                    placeholder="Serial number লিখুন, কমা বা space দিয়ে আলাদা করুন"
                    className="w-full resize-none rounded-xl border border-primary/20 bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <p className="text-xs text-muted-foreground">
                    বাছাই করা:{" "}
                    <span className={`font-semibold ${serialCount > 0 ? "text-primary" : "text-muted-foreground"}`}>
                      {serialCount} টি serial
                    </span>
                    {qty > 0 && serialCount !== Math.round(qty) ? (
                      <span className="ml-2 text-danger font-semibold">
                        (qty {Math.round(qty)} এর সাথে মিলছে না)
                      </span>
                    ) : null}
                  </p>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* ── Error ── */}
      {error ? (
        <div className="rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
          {error}
        </div>
      ) : null}

      {/* ── Actions ── */}
      <div className="space-y-2">
        <button
          type="submit"
          disabled={saving}
          className="w-full h-12 rounded-2xl bg-warning text-white text-sm font-bold shadow-sm hover:bg-warning/90 disabled:opacity-60 transition-colors"
        >
          {saving ? "সংরক্ষণ হচ্ছে..." : "সাপ্লায়ার রিটার্ন সংরক্ষণ করুন"}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/dashboard/purchases/${purchaseId}?shopId=${shopId}`)}
          className="w-full h-10 rounded-2xl border border-border bg-card text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          বাতিল করুন
        </button>
      </div>

    </form>
  );
}
