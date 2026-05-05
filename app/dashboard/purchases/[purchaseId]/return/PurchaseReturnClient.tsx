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
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
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
    setDrafts((current) => ({
      ...current,
      [itemId]: {
        ...current[itemId],
        ...patch,
      },
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const payloadItems = items
      .map((item) => {
        const draft = drafts[item.id];
        const qty = Number(draft?.qty || 0);
        const serialNumbers = parseSerials(draft?.serialInput || "");
        return {
          purchaseItemId: item.id,
          qty,
          serialNumbers: serialNumbers.length > 0 ? serialNumbers : null,
          item,
        };
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
        throw new Error(data?.error || "Supplier return সংরক্ষণ করা যায়নি");
      }

      router.push(`/dashboard/purchases/${purchaseId}?shopId=${shopId}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Supplier return করা যায়নি");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_12px_26px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Supplier Credit
            </p>
            <h1 className="text-2xl font-bold text-foreground">পারচেজ রিটার্ন</h1>
            <p className="text-xs text-muted-foreground">
              সরবরাহকারী: <span className="font-semibold text-foreground">{supplierName}</span>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:w-[280px]">
            <div className="rounded-xl border border-border bg-card px-3 py-2">
              <p className="text-muted-foreground">বর্তমান বাকি</p>
              <p className="font-bold text-foreground">৳ {Number(dueAmount || 0).toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card px-3 py-2">
              <p className="text-muted-foreground">রিটার্ন টোটাল</p>
              <p className="font-bold text-foreground">৳ {totals.returnTotal.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card px-3 py-2">
              <p className="text-muted-foreground">বাকি কমবে</p>
              <p className="font-semibold text-success">৳ {totals.dueReduction.toFixed(2)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card px-3 py-2">
              <p className="text-muted-foreground">সাপ্লায়ার ক্রেডিট</p>
              <p className="font-semibold text-primary">৳ {totals.supplierCredit.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_12px_26px_rgba(15,23,42,0.08)] space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">রিটার্ন তারিখ</label>
            <input
              type="date"
              value={returnDate}
              onChange={(event) => setReturnDate(event.target.value)}
              className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">নোট</label>
            <input
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="যেমন: ভাঙা/ড্যামেজড পণ্য ফেরত"
              className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>
        {error ? (
          <div className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </div>
        ) : null}
      </div>

      <div className="space-y-3">
        {items.map((item) => {
          const draft = drafts[item.id];
          const serialCount = parseSerials(draft?.serialInput || "").length;
          return (
            <div
              key={item.id}
              className="rounded-2xl border border-border bg-card p-4 shadow-[0_12px_26px_rgba(15,23,42,0.08)] space-y-3"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1 min-w-0">
                  <h2 className="text-sm font-bold text-foreground">
                    {item.productName}
                    {item.variantLabel ? ` (${item.variantLabel})` : ""}
                  </h2>
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded-full border border-border px-2 py-1 text-muted-foreground">
                      কেনা: {Number(item.purchasedQty).toFixed(2)}
                    </span>
                    <span className="rounded-full border border-border px-2 py-1 text-muted-foreground">
                      আগে ফেরত: {Number(item.alreadyReturnedQty).toFixed(2)}
                    </span>
                    <span className="rounded-full border border-success/25 bg-success-soft px-2 py-1 text-success">
                      এখন ফেরতযোগ্য: {Number(item.returnableQty).toFixed(2)}
                    </span>
                    {item.batchNo ? (
                      <span className="rounded-full border border-primary/25 bg-primary-soft px-2 py-1 text-primary">
                        Batch: {item.batchNo} · বাকি {Number(item.batchRemainingQty || 0).toFixed(2)}
                      </span>
                    ) : null}
                    {item.trackCutLength ? (
                      <span className="rounded-full border border-warning/25 bg-warning-soft px-2 py-1 text-warning">
                        Cut-length tracked
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="text-right text-xs">
                  <p className="text-muted-foreground">ক্রয় মূল্য</p>
                  <p className="font-semibold text-foreground">৳ {Number(item.unitCost).toFixed(2)}</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">রিটার্ন পরিমাণ</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    max={item.returnableQty}
                    value={draft?.qty || ""}
                    onChange={(event) => updateDraft(item.id, { qty: event.target.value })}
                    placeholder="0"
                    className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">লাইন টোটাল</label>
                  <div className="flex h-11 items-center rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground">
                    ৳ {(Number(draft?.qty || 0) * Number(item.unitCost || 0)).toFixed(2)}
                  </div>
                </div>
              </div>

              {item.trackSerialNumbers ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-muted-foreground">Available serials</span>
                    {item.availableSerials.map((serial) => (
                      <button
                        key={serial}
                        type="button"
                        onClick={() => {
                          const current = parseSerials(draft?.serialInput || "");
                          if (current.includes(serial)) return;
                          updateDraft(item.id, {
                            serialInput: [...current, serial].join(", "),
                          });
                        }}
                        className="rounded-full border border-border px-2 py-1 text-foreground hover:bg-muted"
                      >
                        {serial}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={draft?.serialInput || ""}
                    onChange={(event) => updateDraft(item.id, { serialInput: event.target.value })}
                    rows={3}
                    placeholder="Serial number লিখুন, কমা বা space দিয়ে আলাদা করুন"
                    className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <p className="text-xs text-muted-foreground">
                    বাছাই করা serial: <span className="font-semibold text-foreground">{serialCount}</span>
                  </p>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => router.push(`/dashboard/purchases/${purchaseId}?shopId=${shopId}`)}
          className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
        >
          বাতিল
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex h-11 items-center justify-center rounded-xl border border-primary/30 bg-primary-soft px-4 text-sm font-semibold text-primary disabled:opacity-60"
        >
          {saving ? "সংরক্ষণ হচ্ছে..." : "সাপ্লায়ার রিটার্ন সংরক্ষণ করুন"}
        </button>
      </div>
    </form>
  );
}
