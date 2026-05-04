"use client";

import { useState, useMemo } from "react";

type BatchRow = {
  id: string;
  batchNo: string;
  totalQty: string;
  remainingQty: string;
  isActive: boolean;
  productName: string;
  productId: string;
  variantLabel?: string | null;
  purchaseDate?: string | null;
  createdAt: string;
};

export default function BatchLookupClient({ rows }: { rows: BatchRow[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "depleted">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && r.isActive) ||
        (statusFilter === "depleted" && !r.isActive);
      const matchQuery =
        !q ||
        r.batchNo.toLowerCase().includes(q) ||
        r.productName.toLowerCase().includes(q);
      return matchStatus && matchQuery;
    });
  }, [rows, query, statusFilter]);

  const activeCnt = rows.filter((r) => r.isActive).length;
  const depletedCnt = rows.filter((r) => !r.isActive).length;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Batch নম্বর বা পণ্য নাম দিয়ে খুঁজুন..."
          className="flex-1 h-11 rounded-xl border border-border bg-card px-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <div className="flex gap-2 flex-wrap">
          {(["all", "active", "depleted"] as const).map((s) => (
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
                : s === "active"
                ? `চালু (${activeCnt})`
                : `শেষ (${depletedCnt})`}
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      <p className="text-xs text-muted-foreground">{filtered.length}টি ফলাফল</p>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">কোনো batch পাওয়া যায়নি</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Batch No</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">পণ্য</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">মোট পরিমাণ</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">অবশিষ্ট</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">ক্রয় তারিখ</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">অবস্থা</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const pct = Number(r.totalQty) > 0
                    ? Math.round((Number(r.remainingQty) / Number(r.totalQty)) * 100)
                    : 0;
                  return (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-mono font-semibold text-foreground">{r.batchNo}</td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-foreground">{r.productName}</span>
                        {r.variantLabel && (
                          <span className="ml-1 text-xs text-muted-foreground">({r.variantLabel})</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{Number(r.totalQty).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground">
                        {Number(r.remainingQty).toFixed(2)}
                        <span className="ml-1 text-xs text-muted-foreground">({pct}%)</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.purchaseDate ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                          r.isActive
                            ? "bg-green-50 text-green-700 border-green-200"
                            : "bg-muted text-muted-foreground border-border"
                        }`}>
                          {r.isActive ? "চালু" : "শেষ"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-border">
            {filtered.map((r) => {
              const pct = Number(r.totalQty) > 0
                ? Math.round((Number(r.remainingQty) / Number(r.totalQty)) * 100)
                : 0;
              return (
                <div key={r.id} className="p-4 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono font-bold text-foreground">{r.batchNo}</span>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                      r.isActive
                        ? "bg-green-50 text-green-700 border-green-200"
                        : "bg-muted text-muted-foreground border-border"
                    }`}>
                      {r.isActive ? "চালু" : "শেষ"}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    {r.productName}
                    {r.variantLabel && <span className="ml-1 text-xs text-muted-foreground">({r.variantLabel})</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    অবশিষ্ট: <span className="font-semibold text-foreground">{Number(r.remainingQty).toFixed(2)}</span>
                    {" "} / {Number(r.totalQty).toFixed(2)} ({pct}%)
                  </p>
                  {r.purchaseDate && (
                    <p className="text-xs text-muted-foreground">ক্রয়: {r.purchaseDate}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
