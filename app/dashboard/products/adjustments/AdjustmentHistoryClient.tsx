"use client";

import { useMemo, useState } from "react";

type AdjustmentRow = {
  id: string;
  reason: string;
  note: string | null;
  quantityChange: string;
  previousQty: string;
  newQty: string;
  createdAt: string;
  productId: string;
  productName: string;
  variantLabel: string | null;
};

const REASON_LABELS: Record<string, string> = {
  DAMAGE: "ক্ষতি / নষ্ট",
  SHRINKAGE: "কমতি / মিলছে না",
  RECOUNT: "গণনা সংশোধন",
  RETURN_TO_SUPPLIER: "সরবরাহকারীকে ফেরত",
  FOUND: "অতিরিক্ত পাওয়া গেছে",
  OTHER: "অন্যান্য",
};

const ALL_REASONS = ["ALL", ...Object.keys(REASON_LABELS)];

function formatQty(v: string) {
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return v;
  return n % 1 === 0 ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("bn-BD", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function AdjustmentHistoryClient({ rows }: { rows: AdjustmentRow[] }) {
  const [query, setQuery] = useState("");
  const [reasonFilter, setReasonFilter] = useState("ALL");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (reasonFilter !== "ALL" && r.reason !== reasonFilter) return false;
      if (q && !r.productName.toLowerCase().includes(q) && !(r.variantLabel ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, query, reasonFilter]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="পণ্যের নাম খুঁজুন..."
          className="h-10 rounded-xl border border-border bg-card px-3 text-sm flex-1 min-w-[180px] focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <select
          value={reasonFilter}
          onChange={(e) => setReasonFilter(e.target.value)}
          className="h-10 rounded-xl border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          {ALL_REASONS.map((r) => (
            <option key={r} value={r}>
              {r === "ALL" ? "সব কারণ" : REASON_LABELS[r]}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <p className="text-muted-foreground text-sm">
            {rows.length === 0 ? "এখনো কোনো স্টক সমন্বয় করা হয়নি।" : "কোনো ফলাফল পাওয়া যায়নি।"}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-2xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">পণ্য</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">কারণ</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">পূর্বে</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">পরে</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">পরিবর্তন</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">নোট</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">তারিখ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((r) => {
                  const change = parseFloat(r.quantityChange);
                  const positive = change > 0;
                  return (
                    <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{r.productName}</p>
                        {r.variantLabel ? (
                          <p className="text-xs text-muted-foreground">{r.variantLabel}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {REASON_LABELS[r.reason] ?? r.reason}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{formatQty(r.previousQty)}</td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">{formatQty(r.newQty)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-semibold ${positive ? "text-emerald-600 dark:text-emerald-400" : "text-danger"}`}>
                          {positive ? "+" : ""}{formatQty(r.quantityChange)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[180px] truncate">{r.note ?? "—"}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.map((r) => {
              const change = parseFloat(r.quantityChange);
              const positive = change > 0;
              return (
                <div key={r.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-foreground">{r.productName}</p>
                      {r.variantLabel ? (
                        <p className="text-xs text-muted-foreground">{r.variantLabel}</p>
                      ) : null}
                    </div>
                    <span className={`text-base font-bold ${positive ? "text-emerald-600 dark:text-emerald-400" : "text-danger"}`}>
                      {positive ? "+" : ""}{formatQty(r.quantityChange)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 font-medium text-muted-foreground">
                      {REASON_LABELS[r.reason] ?? r.reason}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-muted-foreground">
                      {formatQty(r.previousQty)} → {formatQty(r.newQty)}
                    </span>
                  </div>
                  {r.note ? (
                    <p className="text-xs text-muted-foreground">{r.note}</p>
                  ) : null}
                  <p className="text-xs text-muted-foreground text-right">{formatDateTime(r.createdAt)}</p>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground text-right">
            মোট {filtered.length.toLocaleString("bn-BD")} এন্ট্রি দেখাচ্ছে
          </p>
        </>
      )}
    </div>
  );
}
