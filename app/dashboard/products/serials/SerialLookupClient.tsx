"use client";

import { useMemo, useState, useTransition } from "react";
import { updateSerialRecord } from "@/app/actions/serials";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type SerialRow = {
  id: string;
  serialNo: string;
  status: "IN_STOCK" | "SOLD" | "RETURNED" | "DAMAGED";
  productName: string;
  productId: string;
  variantLabel?: string | null;
  purchaseDate?: string | null;
  saleDate?: string | null;
  invoiceNo?: string | null;
  customerName?: string | null;
  saleAmount?: string | null;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  IN_STOCK: { label: "স্টকে আছে", cls: "bg-green-50 text-green-700 border-green-200" },
  SOLD: { label: "বিক্রি হয়েছে", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  RETURNED: { label: "ফেরত", cls: "bg-orange-50 text-orange-700 border-orange-200" },
  DAMAGED: { label: "নষ্ট", cls: "bg-red-50 text-red-700 border-red-200" },
};

export default function SerialLookupClient({
  rows,
  shopId,
  initialQuery = "",
  initialStatus = "all",
  initialProductId = "",
}: {
  rows: SerialRow[];
  shopId: string;
  initialQuery?: string;
  initialStatus?: string;
  initialProductId?: string;
}) {
  const [localRows, setLocalRows] = useState<SerialRow[]>(rows);
  const [query, setQuery] = useState(initialQuery);
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus || "all");
  const [productFilter, setProductFilter] = useState(initialProductId);
  const [editing, setEditing] = useState<SerialRow | null>(null);
  const [editSerialNo, setEditSerialNo] = useState("");
  const [editStatus, setEditStatus] = useState<SerialRow["status"]>("IN_STOCK");
  const [editNote, setEditNote] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return localRows.filter((r) => {
      const matchStatus = statusFilter === "all" || r.status === statusFilter;
      const matchProduct = !productFilter || r.productId === productFilter;
      const matchQuery =
        !q ||
        r.serialNo.toLowerCase().includes(q) ||
        r.productName.toLowerCase().includes(q) ||
        (r.customerName ?? "").toLowerCase().includes(q) ||
        (r.invoiceNo ?? "").toLowerCase().includes(q) ||
        (r.note ?? "").toLowerCase().includes(q);
      return matchStatus && matchProduct && matchQuery;
    });
  }, [localRows, productFilter, query, statusFilter]);

  const productOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of localRows) {
      if (!seen.has(row.productId)) {
        seen.set(row.productId, row.productName);
      }
    }
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [localRows]);

  const activeProductLabel = useMemo(() => {
    if (!productFilter) return null;
    return productOptions.find((row) => row.id === productFilter)?.name ?? null;
  }, [productFilter, productOptions]);

  const openEditor = (row: SerialRow) => {
    setEditing(row);
    setEditSerialNo(row.serialNo);
    setEditStatus(row.status);
    setEditNote(row.note ?? "");
    setEditError(null);
  };

  const soldLocked = editing?.status === "SOLD";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Serial number, পণ্য নাম, কাস্টমার, ইনভয়েস..."
          className="flex-1 h-11 rounded-xl border border-border bg-card px-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <div className="flex gap-2 flex-wrap">
          {["all", "IN_STOCK", "SOLD", "RETURNED", "DAMAGED"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`h-9 rounded-full px-3 text-xs font-semibold transition-colors ${
                statusFilter === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-foreground hover:bg-muted"
              }`}
            >
              {s === "all"
                ? `সব (${localRows.length})`
                : `${STATUS_LABELS[s]?.label ?? s} (${localRows.filter((r) => r.status === s).length})`}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <select
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
            className="h-10 rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">সব পণ্য</option>
            {productOptions.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
          {(query || statusFilter !== "all" || productFilter) && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setStatusFilter("all");
                setProductFilter("");
              }}
              className="h-10 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-muted-foreground hover:bg-muted"
            >
              Clear filter
            </button>
          )}
        </div>
        {activeProductLabel ? (
          <p className="text-xs text-muted-foreground">
            এখন দেখাচ্ছে: <span className="font-semibold text-foreground">{activeProductLabel}</span>
          </p>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length}টি ফলাফল</p>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">কোনো serial number পাওয়া যায়নি</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Serial No</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">পণ্য</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">অবস্থা</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">ক্রয় তারিখ</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">বিক্রয় তারিখ</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">কাস্টমার</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">ইনভয়েস</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">বিক্রয়মূল্য</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-foreground">{r.serialNo}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-foreground">{r.productName}</span>
                      {r.variantLabel && (
                        <span className="ml-1 text-xs text-muted-foreground">({r.variantLabel})</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_LABELS[r.status]?.cls ?? ""}`}>
                        {STATUS_LABELS[r.status]?.label ?? r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.purchaseDate ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.saleDate ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.customerName ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.invoiceNo ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground">
                      {r.saleAmount ? `৳ ${r.saleAmount}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openEditor(r)}
                        className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden divide-y divide-border">
            {filtered.map((r) => (
              <div key={r.id} className="p-4 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono font-bold text-foreground">{r.serialNo}</span>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_LABELS[r.status]?.cls ?? ""}`}>
                    {STATUS_LABELS[r.status]?.label ?? r.status}
                  </span>
                </div>
                <p className="text-sm font-medium text-foreground">
                  {r.productName}
                  {r.variantLabel && <span className="ml-1 text-xs text-muted-foreground">({r.variantLabel})</span>}
                </p>
                {r.customerName && <p className="text-xs text-muted-foreground">কাস্টমার: {r.customerName}</p>}
                {r.invoiceNo && <p className="text-xs text-muted-foreground">ইনভয়েস: {r.invoiceNo}</p>}
                {r.saleDate && (
                  <p className="text-xs text-muted-foreground">বিক্রয়: {r.saleDate} {r.saleAmount ? `— ৳ ${r.saleAmount}` : ""}</p>
                )}
                {r.purchaseDate && <p className="text-xs text-muted-foreground">ক্রয়: {r.purchaseDate}</p>}
                {r.note ? <p className="text-xs text-muted-foreground line-clamp-2">নোট: {r.note}</p> : null}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => openEditor(r)}
                    className="inline-flex h-8 items-center rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted"
                  >
                    Edit / Mark
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Serial Management</DialogTitle>
            <DialogDescription>
              {editing?.productName}
              {editing?.variantLabel ? ` · ${editing.variantLabel}` : ""}
            </DialogDescription>
          </DialogHeader>

          {editing ? (
            <div className="space-y-3">
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">Serial No</span>
                <input
                  type="text"
                  value={editSerialNo}
                  onChange={(e) => setEditSerialNo(e.target.value.toUpperCase())}
                  disabled={soldLocked}
                  className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">Status</span>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as SerialRow["status"])}
                  disabled={soldLocked}
                  className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="IN_STOCK">স্টকে আছে</option>
                  {editing?.status === "SOLD" ? (
                    <option value="SOLD">বিক্রি হয়েছে</option>
                  ) : null}
                  <option value="RETURNED">ফেরত</option>
                  <option value="DAMAGED">নষ্ট</option>
                </select>
              </label>

              {soldLocked ? (
                <div className="rounded-xl border border-warning/30 bg-warning-soft px-3 py-2 text-xs font-semibold text-warning">
                  SOLD serial note ছাড়া edit করা যাবে না। status/serial পরিবর্তন sale return বা void flow থেকে করুন।
                </div>
              ) : null}

              <label className="block space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">Note</span>
                <textarea
                  rows={3}
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                  placeholder="ম্যানুয়াল নোট লিখুন"
                />
              </label>

              {editError ? <p className="text-sm font-medium text-danger">{editError}</p> : null}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="h-10 flex-1 rounded-xl border border-border bg-card text-sm font-semibold text-foreground hover:bg-muted"
                >
                  বাতিল
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    startSaving(async () => {
                      setEditError(null);
                      try {
                        await updateSerialRecord({
                          shopId,
                          serialId: editing.id,
                          serialNo: editSerialNo,
                          status: editStatus,
                          note: editNote || null,
                        });
                        setLocalRows((prev) =>
                          prev.map((row) =>
                            row.id === editing.id
                              ? {
                                  ...row,
                                  serialNo: editSerialNo.trim().toUpperCase(),
                                  status: editStatus,
                                  note: editNote.trim() || null,
                                  updatedAt: new Date().toISOString(),
                                }
                              : row
                          )
                        );
                        setEditing(null);
                      } catch (err) {
                        setEditError(err instanceof Error ? err.message : "আপডেট ব্যর্থ হয়েছে");
                      }
                    });
                  }}
                  className="h-10 flex-1 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
                >
                  {saving ? "সংরক্ষণ হচ্ছে..." : "Save"}
                </button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
