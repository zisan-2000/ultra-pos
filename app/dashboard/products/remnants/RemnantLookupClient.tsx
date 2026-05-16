"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Info,
  Scissors,
  X,
  ArrowRight,
  Package,
  AlertTriangle,
} from "lucide-react";
import { UnifiedPagination } from "@/components/pagination/UnifiedPagination";

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

const PAGE_SIZE = 20;
const MAX_PAGE_BUTTONS = 5;

const statusLabelMap: Record<string, string> = {
  ACTIVE: "চালু",
  CONSUMED: "ব্যবহৃত",
  RESTORED: "ফেরত",
};

const sourceLabelMap: Record<string, string> = {
  CUT_SALE: "কাট সেল থেকে বাকি",
  REMNANT_SALE: "remnant থেকে বিক্রি",
  SALE_RETURN: "রিটার্নে ফেরত",
  SALE_VOID: "ভয়েডে ফেরত",
  STOCK_ADJUSTMENT: "স্টক সমন্বয়",
  PURCHASE_RETURN: "supplier return",
};

const sourceIconMap: Record<string, string> = {
  CUT_SALE: "✂️",
  REMNANT_SALE: "📦",
  SALE_RETURN: "↩️",
  SALE_VOID: "✖️",
  STOCK_ADJUSTMENT: "⚙️",
  PURCHASE_RETURN: "🚚",
};

function formatLength(value: string | number) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString("bn-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCount(value: number) {
  return value.toLocaleString("bn-BD");
}

function getUsedPercent(row: RemnantRow): number {
  const original = Number(row.originalLength || 0);
  const remaining = Number(row.remainingLength || 0);
  if (original <= 0) return 0;
  const used = Math.max(0, original - remaining);
  return Math.min(100, Math.max(0, (used / original) * 100));
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
  const [showGuide, setShowGuide] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const tableRef = useRef<HTMLDivElement>(null);

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

  // Reset to page 1 whenever filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [query, statusFilter, productFilter, variantFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedRows = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage]
  );
  const pageNumbers = useMemo(() => {
    const half = Math.floor(MAX_PAGE_BUTTONS / 2);
    let start = Math.max(1, safePage - half);
    const end = Math.min(totalPages, start + MAX_PAGE_BUTTONS - 1);
    start = Math.max(1, end - MAX_PAGE_BUTTONS + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [safePage, totalPages]);

  // --- Top-level stats (all rows, not filtered) ---
  const activeRows = useMemo(() => rows.filter((r) => r.status === "ACTIVE"), [rows]);
  const activeTotalLength = useMemo(
    () => activeRows.reduce((sum, r) => sum + Number(r.remainingLength || 0), 0),
    [activeRows]
  );
  const consumedCount = rows.length - activeRows.length;
  const productsWithActiveCount = useMemo(() => {
    const set = new Set<string>();
    for (const r of activeRows) set.add(r.productId);
    return set.size;
  }, [activeRows]);

  // --- Selected product breakdown ---
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
      return `${activeProductLabel} · সব ভ্যারিয়েন্ট`;
    }
    return activeProductLabel;
  }, [activeProductLabel, selectedProductSummary, selectedVariantSummary]);

  const hasFilter = Boolean(
    query || statusFilter !== "all" || productFilter || variantFilter
  );

  function handleNavigate(page: number) {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function clearAllFilters() {
    setQuery("");
    setStatusFilter("all");
    setProductFilter("");
    setVariantFilter("");
  }

  return (
    <div className="space-y-4">
      {/* === Top stats strip (always visible) === */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <div className="rounded-2xl border border-success/20 bg-success-soft/40 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-success/80">
            চালু cut piece
          </p>
          <p className="mt-1 text-xl font-extrabold text-success leading-tight">
            {formatCount(activeRows.length)}
          </p>
          <p className="mt-0.5 text-[11px] text-success/80">
            মোট {formatLength(activeTotalLength)} বাকি
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-muted/30 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            ব্যবহৃত / ইতিহাস
          </p>
          <p className="mt-1 text-xl font-extrabold text-foreground leading-tight">
            {formatCount(consumedCount)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            বিক্রিত বা restored
          </p>
        </div>
        <div className="rounded-2xl border border-primary/20 bg-primary-soft/40 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/80">
            ভিন্ন পণ্য
          </p>
          <p className="mt-1 text-xl font-extrabold text-primary leading-tight">
            {formatCount(productsWithActiveCount)}
          </p>
          <p className="mt-0.5 text-[11px] text-primary/80">
            যেগুলোর cut piece আছে
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            মোট entries
          </p>
          <p className="mt-1 text-xl font-extrabold text-foreground leading-tight">
            {formatCount(rows.length)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            সব history সহ
          </p>
        </div>
      </div>

      {/* === Collapsible info banner === */}
      <div className="rounded-2xl border border-primary/20 bg-primary-soft/30">
        <button
          type="button"
          onClick={() => setShowGuide((v) => !v)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <span className="inline-flex items-center gap-2">
            <Info className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">
              Cut piece / remnant কী এবং কীভাবে কাজ করে?
            </span>
          </span>
          {showGuide ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        {showGuide && (
          <div className="space-y-3 border-t border-primary/20 px-4 pb-4 pt-3 text-xs leading-6 text-foreground">
            <p>
              <span className="font-semibold">Cut piece / remnant</span> = কাটা বিক্রির পরে
              যে বাকি অংশ থাকে। যেমন ৬ মিটার পাইপ থেকে ২ মিটার বিক্রি করলে ৪ মিটার বাকি
              থাকে — এই ৪ মিটারই remnant।
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-card p-3">
                <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-base">
                  1️⃣
                </div>
                <p className="font-semibold text-foreground">কাট সেল দিন</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  সেল পেইজে cut sale করলে পণ্যের বাকি অংশ এখানে নথিভুক্ত হয়।
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-3">
                <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-base">
                  2️⃣
                </div>
                <p className="font-semibold text-foreground">পরে ব্যবহার করুন</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  পরের cut sale-এ system প্রথমে এই remnant থেকে দেবে — waste কমায়।
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-3">
                <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-base">
                  3️⃣
                </div>
                <p className="font-semibold text-foreground">Return / void</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Sale return বা void করলে remnant length ফেরত আসে।
                </p>
              </div>
            </div>
            <p className="text-[11px] italic text-muted-foreground">
              পণ্যের মোট stock-এ অকাটা full stock-ও থাকে, তাই remnant total stock এর সমান
              হবে না — একটা product বাছাই করলে breakdown দেখাবে।
            </p>
          </div>
        )}
      </div>

      {/* === Filter bar === */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_180px_180px]">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="পণ্য, ভ্যারিয়েন্ট, ইনভয়েস, কাস্টমার দিয়ে খুঁজুন..."
          className="h-11 rounded-xl border border-border bg-card px-4 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/25"
        />
        <select
          value={productFilter}
          onChange={(e) => {
            setProductFilter(e.target.value);
            setVariantFilter("");
          }}
          className="h-11 rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
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
            className="h-11 rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
          >
            <option value="">সব ভ্যারিয়েন্ট</option>
            {variantOptions.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.label}
              </option>
            ))}
          </select>
        ) : (
          <div className="hidden sm:block" />
        )}
      </div>

      {/* Status pills + clear */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {(["all", "active", "consumed"] as const).map((filterKey) => {
          const isActive = statusFilter === filterKey;
          const count =
            filterKey === "all"
              ? rows.length
              : filterKey === "active"
                ? activeRows.length
                : consumedCount;
          const label =
            filterKey === "all" ? "সব" : filterKey === "active" ? "চালু" : "ইতিহাস";
          return (
            <button
              key={filterKey}
              type="button"
              onClick={() => setStatusFilter(filterKey)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold transition-colors ${
                isActive
                  ? filterKey === "active"
                    ? "bg-success text-white"
                    : "bg-primary text-primary-foreground"
                  : "border border-border bg-card text-foreground hover:bg-muted"
              }`}
            >
              {label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                  isActive
                    ? "bg-white/25"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {formatCount(count)}
              </span>
            </button>
          );
        })}
        {hasFilter && (
          <button
            type="button"
            onClick={clearAllFilters}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 font-semibold text-foreground hover:bg-muted"
          >
            <X className="h-3 w-3" />
            ফিল্টার মুছুন
          </button>
        )}
        {scopeLabel && (
          <span className="ml-auto text-muted-foreground">
            বাছাই: <span className="font-semibold text-foreground">{scopeLabel}</span>
          </span>
        )}
      </div>

      {/* === Selected product breakdown card === */}
      {selectedProductSummary && (
        <div className="space-y-3 rounded-2xl border border-border bg-muted/15 p-4">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">
              {scopeLabel} — Stock breakdown
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                মোট usable stock
              </p>
              <p className="mt-1 text-lg font-extrabold text-foreground">
                {formatLength(totalUsableStock ?? 0)} {selectedProductSummary.baseUnit}
              </p>
            </div>
            <div className="rounded-xl border border-success/20 bg-success-soft/45 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-success/80">
                চালু cut piece
              </p>
              <p className="mt-1 text-lg font-extrabold text-success">
                {formatLength(activeRemnantTotal)} {selectedProductSummary.baseUnit}
              </p>
            </div>
            <div className="rounded-xl border border-primary/20 bg-primary-soft/45 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/80">
                অকাটা / অন্য usable
              </p>
              <p className="mt-1 text-lg font-extrabold text-primary">
                {formatLength(otherUsableStock ?? 0)} {selectedProductSummary.baseUnit}
              </p>
            </div>
          </div>

          {/* Visual stacked bar */}
          {totalUsableStock !== null && totalUsableStock > 0 && !hasRemnantMismatch && (
            <div>
              <div className="flex h-3 w-full overflow-hidden rounded-full border border-border bg-card">
                <div
                  className="h-full bg-success transition-all"
                  style={{
                    width: `${Math.min(100, (activeRemnantTotal / totalUsableStock) * 100)}%`,
                  }}
                />
                <div
                  className="h-full bg-primary transition-all"
                  style={{
                    width: `${Math.min(100, ((otherUsableStock ?? 0) / totalUsableStock) * 100)}%`,
                  }}
                />
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-success" />
                  cut piece
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  অকাটা
                </span>
              </div>
            </div>
          )}

          {hasRemnantMismatch && (
            <div className="flex items-start gap-2 rounded-xl border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <span className="font-semibold">Mismatch:</span> চালু remnant total মোট
                usable stock-এর চেয়ে বেশি। এটা data issue — sale-এর আগে reconcile করুন।
              </span>
            </div>
          )}
        </div>
      )}

      {/* === Result count === */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <p className="text-muted-foreground">
          {formatCount(filtered.length)}টি ফলাফল
          {hasFilter && rows.length !== filtered.length
            ? ` (মোট ${formatCount(rows.length)}-এর মধ্যে)`
            : ""}
        </p>
      </div>

      {/* === Empty state === */}
      {filtered.length === 0 ? (
        rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/10 p-8 text-center">
            <div className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft/60">
              <Scissors className="h-6 w-6 text-primary" />
            </div>
            <p className="text-base font-semibold text-foreground">
              এখনো কোনো cut piece তৈরি হয়নি
            </p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-6 text-muted-foreground">
              পণ্যের cut-length tracking চালু থাকলে cut sale করার পর বাকি অংশ এখানে
              automatically যুক্ত হবে। শুরু করতে নিচের যেকোনো একটি করুন:
            </p>
            <div className="mt-4 inline-flex flex-wrap items-center justify-center gap-2">
              <Link
                href={`/dashboard/sales/new?shopId=${shopId}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                <Scissors className="h-4 w-4" />
                নতুন কাট সেল
              </Link>
              <Link
                href={`/dashboard/products?shopId=${shopId}`}
                className="inline-flex h-9 items-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
              >
                পণ্য edit করুন (cut-length চালু করতে)
              </Link>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <p className="text-sm font-medium text-foreground">কোনো ফলাফল পাওয়া যায়নি</p>
            <p className="mt-1 text-xs text-muted-foreground">
              ভিন্ন কীওয়ার্ড বা ফিল্টার দিয়ে চেষ্টা করুন
            </p>
            {hasFilter && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="mt-3 text-xs font-semibold text-primary hover:underline"
              >
                সব ফিল্টার মুছুন
              </button>
            )}
          </div>
        )
      ) : (
        <div
          ref={tableRef}
          className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
        >
          {/* === Desktop table === */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    পণ্য / ভ্যারিয়েন্ট
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Usage
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    উৎস
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    ইনভয়েস / কাস্টমার
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    অবস্থা
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((row) => {
                  const isActive = row.status === "ACTIVE";
                  const usedPct = getUsedPercent(row);
                  const consumed = Number(row.consumedLength || 0);
                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-border/50 align-top transition-colors ${
                        isActive
                          ? "bg-success-soft/10 hover:bg-success-soft/20"
                          : "hover:bg-muted/20"
                      }`}
                    >
                      <td className="px-4 py-3 align-middle">
                        <Link
                          href={`/dashboard/products/${row.productId}`}
                          className="font-semibold text-foreground hover:text-primary"
                        >
                          {row.productName}
                        </Link>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {row.variantLabel ? `${row.variantLabel} · ` : ""}
                          {row.baseUnit}
                        </p>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <div className="space-y-1.5 min-w-45">
                          <div className="flex items-baseline justify-between gap-2 text-xs">
                            <span className="font-semibold text-foreground">
                              {formatLength(row.remainingLength)}
                              <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                                / {formatLength(row.originalLength)}
                              </span>
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {usedPct.toFixed(0)}% ব্যবহৃত
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className={`h-full transition-all ${
                                isActive ? "bg-success/70" : "bg-muted-foreground/40"
                              }`}
                              style={{ width: `${usedPct}%` }}
                            />
                          </div>
                          {consumed > 0 && (
                            <p className="text-[10px] text-muted-foreground">
                              কাটা: {formatLength(consumed)} {row.baseUnit}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle text-xs">
                        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 font-medium text-foreground">
                          <span aria-hidden>{sourceIconMap[row.source] || "•"}</span>
                          {sourceLabelMap[row.source] || row.source}
                        </span>
                        {row.note && (
                          <p className="mt-1 text-[11px] italic text-muted-foreground">
                            {row.note}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 align-middle text-xs">
                        {row.saleId ? (
                          <Link
                            href={`/dashboard/sales/${row.saleId}/invoice`}
                            className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                          >
                            {row.invoiceNo || "ইনভয়েস"}
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        ) : row.invoiceNo ? (
                          <span className="text-muted-foreground">{row.invoiceNo}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {row.customerName || "Walk-in"}
                          {row.saleDate ? ` · ${row.saleDate}` : ""}
                        </p>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                            isActive
                              ? "border-success/30 bg-success-soft text-success"
                              : row.status === "RESTORED"
                                ? "border-primary/30 bg-primary-soft text-primary"
                                : "border-border bg-muted text-muted-foreground"
                          }`}
                        >
                          {isActive && (
                            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                          )}
                          {statusLabelMap[row.status] || row.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* === Mobile cards === */}
          <div className="divide-y divide-border md:hidden">
            {paginatedRows.map((row) => {
              const isActive = row.status === "ACTIVE";
              const usedPct = getUsedPercent(row);
              return (
                <div
                  key={row.id}
                  className={`space-y-2.5 p-4 ${
                    isActive ? "bg-success-soft/10" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/dashboard/products/${row.productId}`}
                        className="truncate font-semibold text-foreground hover:text-primary"
                      >
                        {row.productName}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {row.variantLabel ? `${row.variantLabel} · ` : ""}
                        {row.baseUnit}
                      </p>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                        isActive
                          ? "border-success/30 bg-success-soft text-success"
                          : row.status === "RESTORED"
                            ? "border-primary/30 bg-primary-soft text-primary"
                            : "border-border bg-muted text-muted-foreground"
                      }`}
                    >
                      {isActive && (
                        <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                      )}
                      {statusLabelMap[row.status] || row.status}
                    </span>
                  </div>

                  {/* Length progress */}
                  <div>
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="font-semibold text-foreground">
                        বাকি {formatLength(row.remainingLength)}{" "}
                        <span className="text-[10px] font-normal text-muted-foreground">
                          / {formatLength(row.originalLength)}
                        </span>
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {usedPct.toFixed(0)}% ব্যবহৃত
                      </span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full transition-all ${
                          isActive ? "bg-success/70" : "bg-muted-foreground/40"
                        }`}
                        style={{ width: `${usedPct}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 text-[11px]">
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 font-medium text-foreground">
                      <span aria-hidden>{sourceIconMap[row.source] || "•"}</span>
                      {sourceLabelMap[row.source] || row.source}
                    </span>
                  </div>

                  {row.note && (
                    <p className="text-[11px] italic text-muted-foreground">{row.note}</p>
                  )}

                  {(row.saleId || row.invoiceNo || row.customerName) && (
                    <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-2 text-xs">
                      <div>
                        {row.saleId ? (
                          <Link
                            href={`/dashboard/sales/${row.saleId}/invoice`}
                            className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                          >
                            {row.invoiceNo || "ইনভয়েস"}
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">
                            {row.invoiceNo || "—"}
                          </span>
                        )}
                        <p className="text-[10px] text-muted-foreground">
                          {row.customerName || "Walk-in"}
                          {row.saleDate ? ` · ${row.saleDate}` : ""}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* === Pagination === */}
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

      {/* Footer hint */}
      <p className="text-xs text-muted-foreground">
        Cut-length tracking চালু করতে পণ্য edit করুন। নতুন cut piece তৈরি হয় cut sale
        করলে।
        <Link
          href={`/dashboard/sales/new?shopId=${shopId}`}
          className="ml-2 font-semibold text-primary hover:underline"
        >
          নতুন কাট সেল →
        </Link>
      </p>
    </div>
  );
}
