"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type RemnantRow = {
  id: string;
  productId: string;
  productName: string;
  baseUnit: string;
  variantId: string | null;
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
  saleId: string | null;
  invoiceNo: string | null;
  customerName: string | null;
  saleDate: string | null;
};

type ProductSummary = {
  id: string;
  name: string;
  baseUnit: string;
  stockQty: string;
  variants: Array<{
    id: string;
    label: string;
    stockQty: string;
  }>;
};

const statusLabelMap: Record<string, string> = {
  ACTIVE: "চালু",
  CONSUMED: "ব্যবহৃত",
  RESTORED: "ফেরত",
};

const sourceLabelMap: Record<string, string> = {
  CUT_SALE: "কাট সেল থেকে বাকি",
  REMNANT_SALE: "পুরনো remnant থেকে বিক্রি",
  SALE_RETURN: "রিটার্ন থেকে ফেরত",
  SALE_VOID: "ভয়েড থেকে ফেরত",
  STOCK_ADJUSTMENT: "স্টক সমন্বয়",
  PURCHASE_RETURN: "supplier return",
};

function formatLength(value: string | number) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString("bn-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function RemnantLookupClient({
  rows,
  shopId,
  productSummaries,
  initialQuery = "",
  initialStatus = "all",
  initialProductId = "",
  initialVariantId = "",
}: {
  rows: RemnantRow[];
  shopId: string;
  productSummaries: ProductSummary[];
  initialQuery?: string;
  initialStatus?: string;
  initialProductId?: string;
  initialVariantId?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "consumed">(
    initialStatus === "active" || initialStatus === "consumed" ? initialStatus : "all"
  );
  const [productFilter, setProductFilter] = useState(initialProductId);
  const [variantFilter, setVariantFilter] = useState(initialVariantId);

  const productOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of rows) {
      if (!seen.has(row.productId)) {
        seen.set(row.productId, row.productName);
      }
    }
    return Array.from(seen.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const selectedProductSummary = useMemo(
    () => productSummaries.find((product) => product.id === productFilter) ?? null,
    [productFilter, productSummaries]
  );

  const variantOptions = useMemo(() => {
    if (!selectedProductSummary) return [];
    return selectedProductSummary.variants;
  }, [selectedProductSummary]);

  const selectedVariantSummary = useMemo(
    () => variantOptions.find((variant) => variant.id === variantFilter) ?? null,
    [variantFilter, variantOptions]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && row.status === "ACTIVE") ||
        (statusFilter === "consumed" && row.status !== "ACTIVE");
      const matchesProduct = !productFilter || row.productId === productFilter;
      const matchesVariant = !variantFilter || row.variantId === variantFilter;
      const matchesQuery =
        !q ||
        row.productName.toLowerCase().includes(q) ||
        (row.variantLabel || "").toLowerCase().includes(q) ||
        (row.invoiceNo || "").toLowerCase().includes(q) ||
        (row.customerName || "").toLowerCase().includes(q) ||
        (row.note || "").toLowerCase().includes(q);
      return matchesStatus && matchesProduct && matchesVariant && matchesQuery;
    });
  }, [productFilter, query, rows, statusFilter, variantFilter]);

  const activeCount = rows.filter((row) => row.status === "ACTIVE").length;
  const consumedCount = rows.length - activeCount;

  const activeProductLabel = useMemo(() => {
    if (!productFilter) return null;
    return productOptions.find((row) => row.id === productFilter)?.name ?? null;
  }, [productFilter, productOptions]);

  const activeScopeRows = useMemo(() => {
    return rows.filter((row) => {
      if (row.status !== "ACTIVE") return false;
      if (productFilter && row.productId !== productFilter) return false;
      if (variantFilter && row.variantId !== variantFilter) return false;
      return true;
    });
  }, [productFilter, rows, variantFilter]);

  const activeRemnantTotal = useMemo(
    () =>
      activeScopeRows.reduce((sum, row) => sum + Number(row.remainingLength || 0), 0),
    [activeScopeRows]
  );

  const totalUsableStock = useMemo(() => {
    if (!selectedProductSummary) return null;
    if (selectedVariantSummary) {
      return Number(selectedVariantSummary.stockQty || 0);
    }
    if (selectedProductSummary.variants.length > 0) {
      return selectedProductSummary.variants.reduce(
        (sum, variant) => sum + Number(variant.stockQty || 0),
        0
      );
    }
    return Number(selectedProductSummary.stockQty || 0);
  }, [selectedProductSummary, selectedVariantSummary]);

  const otherUsableStock =
    totalUsableStock === null ? null : Math.max(totalUsableStock - activeRemnantTotal, 0);
  const hasRemnantMismatch =
    totalUsableStock !== null && activeRemnantTotal > totalUsableStock + 0.000001;

  const scopeLabel = useMemo(() => {
    if (!activeProductLabel) return null;
    if (selectedVariantSummary) {
      return `${activeProductLabel} · ${selectedVariantSummary.label}`;
    }
    if (selectedProductSummary && selectedProductSummary.variants.length > 0) {
      return `${activeProductLabel} · সব ভ্যারিয়েন্ট`;
    }
    return activeProductLabel;
  }, [activeProductLabel, selectedProductSummary, selectedVariantSummary]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-success/20 bg-success-soft/40 p-4">
        <p className="text-sm font-semibold text-foreground">এই পেইজে কী দেখায়</p>
        <p className="mt-1 text-xs leading-6 text-muted-foreground">
          এখানে শুধু কাটা বিক্রির পরে যে বাকি অংশ থাকে, সেই cut piece / remnant আর তার
          history দেখায়। পণ্যের মোট stock এর মধ্যে অকাটা full stock-ও থাকে, তাই remnant
          সংখ্যার সাথে product card-এর মোট stock এক না-ও হতে পারে।
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="পণ্য, ভ্যারিয়েন্ট, ইনভয়েস, কাস্টমার দিয়ে খুঁজুন..."
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

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <select
            value={productFilter}
            onChange={(e) => {
              setProductFilter(e.target.value);
              setVariantFilter("");
            }}
            className="h-10 rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">সব পণ্য</option>
            {productOptions.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>

          {variantOptions.length > 0 ? (
            <select
              value={variantFilter}
              onChange={(e) => setVariantFilter(e.target.value)}
              className="h-10 rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">সব ভ্যারিয়েন্ট</option>
              {variantOptions.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.label}
                </option>
              ))}
            </select>
          ) : null}

          {(query || statusFilter !== "all" || productFilter || variantFilter) && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setStatusFilter("all");
                setProductFilter("");
                setVariantFilter("");
              }}
              className="h-10 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-muted-foreground hover:bg-muted"
            >
              Clear filter
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {scopeLabel ? (
            <span>
              এখন দেখাচ্ছে: <span className="font-semibold text-foreground">{scopeLabel}</span>
            </span>
          ) : (
            <span>একটা পণ্য বাছাই করলে exact stock breakdown দেখাবে</span>
          )}
          <Link
            href={`/dashboard/products?shopId=${shopId}`}
            className="font-semibold text-primary hover:underline"
          >
            পণ্য তালিকায় ফিরুন
          </Link>
        </div>
      </div>

      {selectedProductSummary ? (
        <div className="space-y-3 rounded-2xl border border-border bg-muted/20 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                মোট usable stock
              </p>
              <p className="mt-1 text-xl font-extrabold text-foreground">
                {formatLength(totalUsableStock ?? 0)} {selectedProductSummary.baseUnit}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {selectedVariantSummary
                  ? "এই ভ্যারিয়েন্টের মোট usable stock"
                  : selectedProductSummary.variants.length > 0
                    ? "সব ভ্যারিয়েন্ট মিলিয়ে মোট usable stock"
                    : "এই পণ্যের মোট usable stock"}
              </p>
            </div>

            <div className="rounded-2xl border border-success/20 bg-success-soft/45 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-success/80">
                চালু cut piece
              </p>
              <p className="mt-1 text-xl font-extrabold text-success">
                {formatLength(activeRemnantTotal)} {selectedProductSummary.baseUnit}
              </p>
              <p className="mt-1 text-xs text-success/80">
                কাটা বিক্রির পরে যেগুলো বাকি আছে
              </p>
            </div>

            <div className="rounded-2xl border border-primary/20 bg-primary-soft/45 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
                অকাটা / অন্য usable stock
              </p>
              <p className="mt-1 text-xl font-extrabold text-primary">
                {formatLength(otherUsableStock ?? 0)} {selectedProductSummary.baseUnit}
              </p>
              <p className="mt-1 text-xs text-primary/80">
                full stock বা remnant page-এ না-থাকা usable অংশ
              </p>
            </div>
          </div>

          <div
            className={`rounded-2xl border px-3 py-2 text-xs ${
              hasRemnantMismatch
                ? "border-danger/25 bg-danger-soft text-danger"
                : "border-border bg-card text-muted-foreground"
            }`}
          >
            {hasRemnantMismatch ? (
              <span>
                Remnant mismatch: চালু remnant total মোট usable stock-এর চেয়ে বেশি। এটা data
                issue; sale-এর আগে reconcile করুন।
              </span>
            ) : (
              <span>
                Formula: <span className="font-semibold text-foreground">মোট usable stock</span>{" "}
                = <span className="font-semibold text-success">চালু cut piece</span> +{" "}
                <span className="font-semibold text-primary">অকাটা / অন্য usable stock</span>
              </span>
            )}
          </div>
        </div>
      ) : null}

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
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    পণ্য
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    ফুল length
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    এখন বাকি
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    উৎস
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    ইনভয়েস
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    কাস্টমার
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    অবস্থা
                  </th>
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
                      {formatLength(row.originalLength)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`font-semibold ${
                          row.status === "ACTIVE" ? "text-success" : "text-muted-foreground"
                        }`}
                      >
                        {formatLength(row.remainingLength)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {sourceLabelMap[row.source] || row.source}
                      {row.note ? <div className="mt-1">{row.note}</div> : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {row.saleId ? (
                        <Link
                          href={`/dashboard/sales/${row.saleId}/invoice`}
                          className="font-semibold text-primary hover:underline"
                        >
                          {row.invoiceNo || "ইনভয়েস খুলুন"}
                        </Link>
                      ) : (
                        row.invoiceNo || "—"
                      )}
                      {row.saleDate ? <div className="mt-1">{row.saleDate}</div> : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {row.customerName || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                          row.status === "ACTIVE"
                            ? "border-green-200 bg-green-50 text-green-700"
                            : "border-border bg-muted text-muted-foreground"
                        }`}
                      >
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
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                      row.status === "ACTIVE"
                        ? "border-green-200 bg-green-50 text-green-700"
                        : "border-border bg-muted text-muted-foreground"
                    }`}
                  >
                    {statusLabelMap[row.status] || row.status}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
                  <span className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-1 text-foreground">
                    ফুল {formatLength(row.originalLength)}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-1 text-foreground">
                    বাকি {formatLength(row.remainingLength)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {sourceLabelMap[row.source] || row.source}
                </p>
                {row.note ? <p className="text-xs text-muted-foreground">{row.note}</p> : null}
                {row.saleId ? (
                  <Link
                    href={`/dashboard/sales/${row.saleId}/invoice`}
                    className="inline-flex text-xs font-semibold text-primary hover:underline"
                  >
                    {row.invoiceNo || "ইনভয়েস খুলুন"}
                  </Link>
                ) : row.invoiceNo || row.customerName ? (
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
