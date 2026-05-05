"use client";

import { useMemo, useState } from "react";

type RemnantRow = {
  id: string;
  productId: string;
  productName: string;
  baseUnit: string;
  variantLabel: string | null;
  originalLength: string;
  remainingLength: string;
  consumedLength: string;
  source: string;
  sourceRef: string | null;
  status: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  invoiceNo: string | null;
  customerName: string | null;
  saleDate: string | null;
};

const statusLabelMap: Record<string, string> = {
  ACTIVE: "চালু",
  CONSUMED: "ব্যবহৃত",
  RESTORED: "ফেরত",
};

const sourceLabelMap: Record<string, string> = {
  CUT_SALE: "কাট সেল leftover",
  REMNANT_SALE: "পুরনো remnant থেকে বিক্রি",
  SALE_RETURN: "রিটার্ন থেকে ফেরত",
  SALE_VOID: "ভয়েড থেকে ফেরত",
};

export default function RemnantLookupClient({ rows }: { rows: RemnantRow[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "consumed">(
    "all"
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && row.status === "ACTIVE") ||
        (statusFilter === "consumed" && row.status !== "ACTIVE");
      const matchesQuery =
        !q ||
        row.productName.toLowerCase().includes(q) ||
        (row.variantLabel || "").toLowerCase().includes(q) ||
        (row.invoiceNo || "").toLowerCase().includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [rows, query, statusFilter]);

  const activeCount = rows.filter((row) => row.status === "ACTIVE").length;
  const consumedCount = rows.length - activeCount;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="পণ্য, সাইজ, ইনভয়েস দিয়ে খুঁজুন..."
          className="h-11 flex-1 rounded-xl border border-border bg-card px-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <div className="flex flex-wrap gap-2">
          {(["all", "active", "consumed"] as const).map((filterKey) => (
            <button
              key={filterKey}
              type="button"
              onClick={() => setStatusFilter(filterKey)}
              className={`h-9 rounded-full px-3 text-xs font-semibold transition-colors ${
                statusFilter === filterKey
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card text-foreground hover:bg-muted"
              }`}
            >
              {filterKey === "all"
                ? `সব (${rows.length})`
                : filterKey === "active"
                  ? `চালু (${activeCount})`
                  : `ইতিহাস (${consumedCount})`}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length}টি ফলাফল</p>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">কোনো remnant পাওয়া যায়নি</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">পণ্য</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">ফুল লেন্থ</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">অবশিষ্ট</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">উৎস</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">ইনভয়েস</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">কাস্টমার</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">অবস্থা</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className="border-b border-border/50 align-top hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{row.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.variantLabel ? `${row.variantLabel} · ` : ""}
                        {row.baseUnit}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground">
                      {Number(row.originalLength).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-semibold ${
                        row.status === "ACTIVE" ? "text-success" : "text-muted-foreground"
                      }`}>
                        {Number(row.remainingLength).toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {sourceLabelMap[row.source] || row.source}
                      {row.note ? <div className="mt-1">{row.note}</div> : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {row.invoiceNo || "—"}
                      {row.saleDate ? <div className="mt-1">{row.saleDate}</div> : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {row.customerName || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                        row.status === "ACTIVE"
                          ? "border-green-200 bg-green-50 text-green-700"
                          : "border-border bg-muted text-muted-foreground"
                      }`}>
                        {statusLabelMap[row.status] || row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-border md:hidden">
            {filtered.map((row) => (
              <div key={row.id} className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">{row.productName}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.variantLabel ? `${row.variantLabel} · ` : ""}
                      {row.baseUnit}
                    </p>
                  </div>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                    row.status === "ACTIVE"
                      ? "border-green-200 bg-green-50 text-green-700"
                      : "border-border bg-muted text-muted-foreground"
                  }`}>
                    {statusLabelMap[row.status] || row.status}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
                  <span className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-1 text-foreground">
                    ফুল {Number(row.originalLength).toFixed(2)}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-1 text-foreground">
                    বাকি {Number(row.remainingLength).toFixed(2)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {sourceLabelMap[row.source] || row.source}
                </p>
                {row.note ? (
                  <p className="text-xs text-muted-foreground">{row.note}</p>
                ) : null}
                {row.invoiceNo || row.customerName ? (
                  <p className="text-xs text-muted-foreground">
                    {row.invoiceNo || "—"} · {row.customerName || "Walk-in"}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
