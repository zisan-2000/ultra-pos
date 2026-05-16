"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { UnifiedPagination } from "@/components/pagination/UnifiedPagination";

type LocationRow = {
  id: string;
  productId: string;
  productName: string;
  category: string;
  baseUnit: string;
  trackStock: boolean;
  stockQty: string;
  reorderPoint: number | null;
  location: string;
  sku: string | null;
  barcode: string | null;
  variantId: string | null;
  variantLabel: string | null;
  source: "base" | "variant";
};

const PAGE_SIZE = 30;
const MAX_PAGE_BUTTONS = 5;

function formatQty(value: string | number, unit: string) {
  const qty = Number(value ?? 0);
  const formatted = qty.toLocaleString("bn-BD", {
    minimumFractionDigits: Number.isInteger(qty) ? 0 : 2,
    maximumFractionDigits: Number.isInteger(qty) ? 0 : 2,
  });
  return `${formatted} ${unit}`.trim();
}

function getStockStatus(row: LocationRow): "zero" | "low" | "ok" | "untracked" {
  if (!row.trackStock) return "untracked";
  const qty = Number(row.stockQty);
  if (qty <= 0) return "zero";
  if (row.reorderPoint !== null && qty <= row.reorderPoint) return "low";
  return "ok";
}

export default function LocationLookupClient({
  rows,
  shopId,
  initialQuery = "",
  initialProductId = "",
}: {
  rows: LocationRow[];
  shopId: string;
  initialQuery?: string;
  initialProductId?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [productFilter, setProductFilter] = useState(initialProductId);
  const [currentPage, setCurrentPage] = useState(1);
  const tableRef = useRef<HTMLDivElement>(null);

  const productOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of rows) {
      if (!seen.has(row.productId)) seen.set(row.productId, row.productName);
    }
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (productFilter && row.productId !== productFilter) return false;
      if (!q) return true;
      const haystack = [
        row.productName,
        row.category,
        row.location,
        row.variantLabel ?? "",
        row.sku ?? "",
        row.barcode ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [productFilter, query, rows]);

  // Reset to page 1 whenever filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [query, productFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedRows = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage]
  );

  const pageNumbers = useMemo(() => {
    const half = Math.floor(MAX_PAGE_BUTTONS / 2);
    let start = Math.max(1, safePage - half);
    let end = Math.min(totalPages, start + MAX_PAGE_BUTTONS - 1);
    start = Math.max(1, end - MAX_PAGE_BUTTONS + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [safePage, totalPages]);

  const locationCount = useMemo(
    () => new Set(filtered.map((r) => r.location.trim().toLowerCase())).size,
    [filtered]
  );
  const zeroCount = useMemo(
    () => filtered.filter((r) => getStockStatus(r) === "zero").length,
    [filtered]
  );
  const lowCount = useMemo(
    () => filtered.filter((r) => getStockStatus(r) === "low").length,
    [filtered]
  );

  const hasFilter = Boolean(query || productFilter);

  function handleNavigate(page: number) {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-4">
      {/* Search + filter bar */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="লোকেশন, পণ্য, ভ্যারিয়েন্ট, SKU, বারকোড দিয়ে খুঁজুন..."
          className="h-11 rounded-xl border border-border bg-card px-4 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/25"
        />
        <select
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value)}
          className="h-11 rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
        >
          <option value="">সব পণ্য</option>
          {productOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Stats + alert badges */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-muted-foreground">
          {filtered.length.toLocaleString("bn-BD")}টি row
        </span>
        <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-muted-foreground">
          {locationCount.toLocaleString("bn-BD")}টি লোকেশন
        </span>
        {zeroCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-danger/30 bg-danger-soft px-3 py-1 font-semibold text-danger">
            ⚠ {zeroCount}টি স্টক শূন্য
          </span>
        )}
        {lowCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning-soft/60 px-3 py-1 font-semibold text-warning">
            ↓ {lowCount}টি কম স্টক
          </span>
        )}
        {hasFilter && (
          <button
            type="button"
            onClick={() => { setQuery(""); setProductFilter(""); }}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 font-semibold text-foreground hover:bg-muted"
          >
            <X className="h-3 w-3" />
            ফিল্টার মুছুন
          </button>
        )}
      </div>

      {/* Table / list */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <p className="text-sm font-medium text-foreground">কোনো result পাওয়া যায়নি</p>
          <p className="mt-1 text-xs text-muted-foreground">
            ভিন্ন কীওয়ার্ড বা ফিল্টার দিয়ে চেষ্টা করুন
          </p>
          {hasFilter && (
            <button
              type="button"
              onClick={() => { setQuery(""); setProductFilter(""); }}
              className="mt-3 text-xs font-semibold text-primary hover:underline"
            >
              ফিল্টার মুছুন
            </button>
          )}
        </div>
      ) : (
        <div ref={tableRef} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">লোকেশন</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">পণ্য</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">ধরন</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">স্টক</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">SKU / বারকোড</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">রিঅর্ডার</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row) => {
                  const status = getStockStatus(row);
                  const stockColor =
                    status === "zero" ? "text-danger font-bold" :
                    status === "low"  ? "text-warning font-semibold" :
                                        "text-foreground font-semibold";
                  const rowBg =
                    status === "zero" ? "bg-danger-soft/10 hover:bg-danger-soft/20" :
                    status === "low"  ? "bg-warning-soft/10 hover:bg-warning-soft/20" :
                                        "hover:bg-muted/20";
                  return (
                    <tr key={row.id} className={`border-b border-border/50 align-middle transition-colors ${rowBg}`}>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full border border-primary/20 bg-primary/8 px-2.5 py-1 text-xs font-semibold text-primary">
                          {row.location}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/products/${row.productId}`}
                          className="font-semibold text-foreground hover:text-primary"
                        >
                          {row.productName}
                        </Link>
                        <p className="mt-0.5 text-xs text-muted-foreground">{row.category}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {row.variantLabel ?? "মূল পণ্য"}
                      </td>
                      <td className={`px-4 py-3 text-right ${stockColor}`}>
                        {row.trackStock ? (
                          <span className="inline-flex items-center gap-1.5">
                            {formatQty(row.stockQty, row.baseUnit)}
                            {status === "zero" && (
                              <span className="rounded-full bg-danger px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">শূন্য</span>
                            )}
                            {status === "low" && (
                              <span className="rounded-full bg-warning px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">কম</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-xs font-normal text-muted-foreground">ট্র্যাক নয়</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {row.sku || row.barcode
                          ? `${row.sku ?? "—"}${row.barcode ? ` · ${row.barcode}` : ""}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                        {row.reorderPoint ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="divide-y divide-border md:hidden">
            {paginatedRows.map((row) => {
              const status = getStockStatus(row);
              return (
                <div
                  key={row.id}
                  className={`space-y-2.5 p-4 ${
                    status === "zero" ? "bg-danger-soft/10" :
                    status === "low"  ? "bg-warning-soft/10" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-foreground">{row.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.variantLabel ?? "মূল পণ্য"} · {row.category}
                      </p>
                    </div>
                    <span className="inline-flex shrink-0 rounded-full border border-primary/20 bg-primary/8 px-2.5 py-1 text-[11px] font-semibold text-primary">
                      {row.location}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    {row.trackStock ? (
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 font-semibold ${
                        status === "zero" ? "border-danger/30 bg-danger-soft text-danger" :
                        status === "low"  ? "border-warning/30 bg-warning-soft text-warning" :
                                            "border-border bg-muted/50 text-foreground"
                      }`}>
                        {formatQty(row.stockQty, row.baseUnit)}
                        {status === "zero" && " — শূন্য"}
                        {status === "low"  && " — কম"}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2.5 py-1 text-muted-foreground">
                        ট্র্যাক নয়
                      </span>
                    )}
                    {row.reorderPoint ? (
                      <span className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-1 text-muted-foreground">
                        রিঅর্ডার: {row.reorderPoint}
                      </span>
                    ) : null}
                    {(row.sku || row.barcode) && (
                      <span className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-1 text-muted-foreground">
                        {row.sku ?? ""}
                        {row.sku && row.barcode ? " · " : ""}
                        {row.barcode ?? ""}
                      </span>
                    )}
                  </div>

                  <Link
                    href={`/dashboard/products/${row.productId}`}
                    className="inline-flex text-xs font-semibold text-primary hover:underline"
                  >
                    পণ্য খুলুন →
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <UnifiedPagination
          mode="offset"
          page={safePage}
          totalPages={totalPages}
          totalCount={filtered.length}
          loadedCount={paginatedRows.length}
          pageSize={PAGE_SIZE}
          pageNumbers={pageNumbers}
          onNavigate={handleNavigate}
          prevLabel="আগের"
          nextLabel="পরের"
        />
      )}

      <p className="text-xs text-muted-foreground">
        কোনো item খুঁজে না পেলে location search করুন — product edit করে location ঠিক করুন।
        <Link href={`/dashboard/reports?shopId=${shopId}`} className="ml-2 font-semibold text-primary hover:underline">
          রিপোর্টেও দেখুন →
        </Link>
      </p>
    </div>
  );
}
