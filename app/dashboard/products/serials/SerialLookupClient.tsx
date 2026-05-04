"use client";

import { useState, useMemo } from "react";

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
  createdAt: string;
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  IN_STOCK: { label: "স্টকে আছে", cls: "bg-green-50 text-green-700 border-green-200" },
  SOLD: { label: "বিক্রি হয়েছে", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  RETURNED: { label: "ফেরত", cls: "bg-orange-50 text-orange-700 border-orange-200" },
  DAMAGED: { label: "নষ্ট", cls: "bg-red-50 text-red-700 border-red-200" },
};

export default function SerialLookupClient({
  rows,
}: {
  rows: SerialRow[];
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const matchStatus =
        statusFilter === "all" || r.status === statusFilter;
      const matchQuery =
        !q ||
        r.serialNo.toLowerCase().includes(q) ||
        r.productName.toLowerCase().includes(q) ||
        (r.customerName ?? "").toLowerCase().includes(q) ||
        (r.invoiceNo ?? "").toLowerCase().includes(q);
      return matchStatus && matchQuery;
    });
  }, [rows, query, statusFilter]);

  return (
    <div className="space-y-4">
      {/* Filters */}
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
                ? `সব (${rows.length})`
                : `${STATUS_LABELS[s]?.label ?? s} (${rows.filter((r) => r.status === s).length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      <p className="text-xs text-muted-foreground">
        {filtered.length}টি ফলাফল
      </p>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">কোনো serial number পাওয়া যায়নি</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
          {/* Desktop table */}
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
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
                {r.customerName && (
                  <p className="text-xs text-muted-foreground">কাস্টমার: {r.customerName}</p>
                )}
                {r.invoiceNo && (
                  <p className="text-xs text-muted-foreground">ইনভয়েস: {r.invoiceNo}</p>
                )}
                {r.saleDate && (
                  <p className="text-xs text-muted-foreground">বিক্রয়: {r.saleDate} {r.saleAmount ? `— ৳ ${r.saleAmount}` : ""}</p>
                )}
                {r.purchaseDate && (
                  <p className="text-xs text-muted-foreground">ক্রয়: {r.purchaseDate}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
