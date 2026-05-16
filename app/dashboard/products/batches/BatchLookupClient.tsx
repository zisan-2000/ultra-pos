"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { X, ChevronDown, ChevronUp, Info } from "lucide-react";
import { generateCSV } from "@/lib/utils/csv";
import { downloadFile } from "@/lib/utils/download";
import { UnifiedPagination } from "@/components/pagination/UnifiedPagination";

type BatchRow = {
  id: string;
  batchNo: string;
  expiryDate?: string | null;
  totalQty: string;
  remainingQty: string;
  isActive: boolean;
  productName: string;
  productId: string;
  variantLabel?: string | null;
  purchaseDate?: string | null;
  createdAt: string;
  allocations: Array<{
    id: string;
    invoiceNo: string | null;
    saleId: string;
    customerName: string | null;
    saleDate: string;
    saleStatus: string | null;
    quantityAllocated: string;
    quantityReturned: string;
    createdAt: string;
  }>;
};

const PAGE_SIZE = 30;
const MAX_PAGE_BUTTONS = 5;

function getExpiryInfo(expiryDate?: string | null): {
  label: string;
  badgeClass: string;
  textClass: string;
} {
  if (!expiryDate) {
    return {
      label: "Expiry নেই",
      badgeClass: "border-border bg-muted text-muted-foreground",
      textClass: "text-muted-foreground",
    };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(`${expiryDate}T00:00:00`);
  const days = Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
  if (days < 0) {
    return {
      label: `মেয়াদ শেষ · ${expiryDate}`,
      badgeClass: "border-danger/30 bg-danger-soft text-danger",
      textClass: "text-danger",
    };
  }
  if (days <= 30) {
    return {
      label: `${days} দিন বাকি · ${expiryDate}`,
      badgeClass: "border-warning/30 bg-warning-soft/60 text-warning",
      textClass: "text-warning",
    };
  }
  return {
    label: `${days} দিন বাকি · ${expiryDate}`,
    badgeClass: "border-success/30 bg-success-soft text-success",
    textClass: "text-success",
  };
}

export default function BatchLookupClient({
  rows,
  shopId,
  initialQuery = "",
  initialStatus = "all",
  initialProductId = "",
}: {
  rows: BatchRow[];
  shopId: string;
  initialQuery?: string;
  initialStatus?: string;
  initialProductId?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "depleted">(
    initialStatus === "active" || initialStatus === "depleted" ? initialStatus : "all"
  );
  const [productFilter, setProductFilter] = useState(initialProductId);
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
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
    return rows.filter((r) => {
      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && r.isActive) ||
        (statusFilter === "depleted" && !r.isActive);
      const matchProduct = !productFilter || r.productId === productFilter;
      const matchQuery =
        !q ||
        r.batchNo.toLowerCase().includes(q) ||
        r.productName.toLowerCase().includes(q) ||
        (r.expiryDate ?? "").includes(q);
      return matchStatus && matchProduct && matchQuery;
    });
  }, [productFilter, query, rows, statusFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, statusFilter, productFilter]);

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

  const activeCnt = rows.filter((r) => r.isActive).length;
  const depletedCnt = rows.filter((r) => !r.isActive).length;

  const expiringSoonCnt = useMemo(
    () =>
      rows.filter((r) => {
        if (!r.expiryDate || !r.isActive) return false;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const expiry = new Date(`${r.expiryDate}T00:00:00`);
        const days = Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
        return days >= 0 && days <= 30;
      }).length,
    [rows]
  );

  const expiredCnt = useMemo(
    () =>
      rows.filter((r) => {
        if (!r.expiryDate || !r.isActive) return false;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const expiry = new Date(`${r.expiryDate}T00:00:00`);
        return expiry < today;
      }).length,
    [rows]
  );

  const hasFilter = Boolean(query || productFilter || statusFilter !== "all");

  function handleNavigate(page: number) {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function exportRows() {
    const flattened = filtered.flatMap((row) => {
      const netOutQty = row.allocations.reduce((sum, a) => {
        const allocated = Number(a.quantityAllocated || 0);
        const returned = Number(a.quantityReturned || 0);
        return sum + Math.max(0, allocated - returned);
      }, 0);

      if (row.allocations.length === 0) {
        return [
          {
            batchNo: row.batchNo,
            productName: row.productName,
            variantLabel: row.variantLabel || "",
            purchaseDate: row.purchaseDate || "",
            expiryDate: row.expiryDate || "",
            totalQty: row.totalQty,
            remainingQty: row.remainingQty,
            netOutQty: netOutQty.toFixed(2),
            invoiceNo: "",
            customerName: "",
            saleDate: "",
            saleStatus: "",
            quantityAllocated: "0.00",
            quantityReturned: "0.00",
            outsideQty: "0.00",
          },
        ];
      }

      return row.allocations.map((a) => {
        const allocated = Number(a.quantityAllocated || 0);
        const returned = Number(a.quantityReturned || 0);
        const outsideQty = Math.max(0, allocated - returned);
        return {
          batchNo: row.batchNo,
          productName: row.productName,
          variantLabel: row.variantLabel || "",
          purchaseDate: row.purchaseDate || "",
          expiryDate: row.expiryDate || "",
          totalQty: row.totalQty,
          remainingQty: row.remainingQty,
          netOutQty: netOutQty.toFixed(2),
          invoiceNo: a.invoiceNo || "",
          customerName: a.customerName || "",
          saleDate: a.saleDate,
          saleStatus: a.saleStatus || "",
          quantityAllocated: allocated.toFixed(2),
          quantityReturned: returned.toFixed(2),
          outsideQty: outsideQty.toFixed(2),
        };
      });
    });

    const csv = generateCSV(
      [
        "batchNo",
        "productName",
        "variantLabel",
        "purchaseDate",
        "expiryDate",
        "totalQty",
        "remainingQty",
        "netOutQty",
        "invoiceNo",
        "customerName",
        "saleDate",
        "saleStatus",
        "quantityAllocated",
        "quantityReturned",
        "outsideQty",
      ],
      flattened
    );
    downloadFile("batch-export.csv", csv);
  }

  return (
    <div className="space-y-4">

      {/* Info banner — explains batch tracking */}
      <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="text-xs text-foreground/80 leading-relaxed">
          <span className="font-semibold text-foreground">ব্যাচ ট্র্যাকিং কীভাবে কাজ করে?</span>{" "}
          পণ্যের settings-এ <span className="font-semibold">Batch tracking চালু</span> করলে প্রতিটি ক্রয়ে batch নম্বর ও মেয়াদ উত্তীর্ণের তারিখ (expiry) দেওয়া যায়।
          বিক্রির সময় system স্বয়ংক্রিয়ভাবে পুরনো batch থেকে আগে কাটে (FIFO)।
          নিচে দেখুন কোন batch থেকে কোন invoice-এ কত গেছে।
        </div>
      </div>

      {/* Alert badges */}
      {(expiredCnt > 0 || expiringSoonCnt > 0) && (
        <div className="flex flex-wrap gap-2">
          {expiredCnt > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-danger/30 bg-danger-soft px-3 py-1 text-xs font-semibold text-danger">
              ⚠ {expiredCnt}টি ব্যাচের মেয়াদ শেষ
            </span>
          )}
          {expiringSoonCnt > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning-soft/60 px-3 py-1 text-xs font-semibold text-warning">
              ↓ {expiringSoonCnt}টি ব্যাচের মেয়াদ শেষ হওয়ার পথে
            </span>
          )}
        </div>
      )}

      {/* Search bar */}
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ব্যাচ নম্বর বা পণ্যের নাম দিয়ে খুঁজুন..."
        className="h-11 w-full rounded-xl border border-border bg-card px-4 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/25"
      />

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Status tabs */}
        {(["all", "active", "depleted"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`h-9 rounded-full px-4 text-xs font-semibold transition-colors ${
              statusFilter === s
                ? "bg-primary text-white shadow-sm"
                : "border border-border bg-card text-foreground hover:bg-muted"
            }`}
          >
            {s === "all"
              ? `সব (${rows.length})`
              : s === "active"
                ? `চালু (${activeCnt})`
                : `শেষ (${depletedCnt})`}
          </button>
        ))}

        {/* Product filter */}
        <select
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value)}
          className="h-9 rounded-xl border border-border bg-card px-3 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
        >
          <option value="">সব পণ্য</option>
          {productOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {/* Clear filter */}
        {hasFilter && (
          <button
            type="button"
            onClick={() => { setQuery(""); setStatusFilter("all"); setProductFilter(""); }}
            className="inline-flex h-9 items-center gap-1 rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted"
          >
            <X className="h-3 w-3" />
            ফিল্টার মুছুন
          </button>
        )}

        {/* CSV export — pushed to right */}
        <button
          type="button"
          onClick={exportRows}
          className="ml-auto h-9 rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted"
        >
          CSV ডাউনলোড
        </button>
      </div>

      {/* Result count */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-muted-foreground">
          {filtered.length.toLocaleString("bn-BD")}টি ব্যাচ
        </span>
        {hasFilter && (
          <button
            type="button"
            onClick={() => { setQuery(""); setStatusFilter("all"); setProductFilter(""); }}
            className="text-xs font-semibold text-primary hover:underline"
          >
            ফিল্টার মুছুন
          </button>
        )}
      </div>

      {/* Table / list */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <p className="text-sm font-medium text-foreground">কোনো ব্যাচ পাওয়া যায়নি</p>
          <p className="mt-1 text-xs text-muted-foreground">
            ভিন্ন কীওয়ার্ড বা ফিল্টার দিয়ে চেষ্টা করুন
          </p>
          {hasFilter && (
            <button
              type="button"
              onClick={() => { setQuery(""); setStatusFilter("all"); setProductFilter(""); }}
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
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">ব্যাচ নম্বর</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">পণ্য</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">মোট পরিমাণ</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">অবশিষ্ট</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">বাইরে আছে</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">ইনভয়েস</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">ক্রয় তারিখ</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">মেয়াদ</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">অবস্থা</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">বিস্তারিত</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((r) => {
                  const pct =
                    Number(r.totalQty) > 0
                      ? Math.round((Number(r.remainingQty) / Number(r.totalQty)) * 100)
                      : 0;
                  const netOutQty = r.allocations.reduce((sum, a) => {
                    const allocated = Number(a.quantityAllocated || 0);
                    const returned = Number(a.quantityReturned || 0);
                    return sum + Math.max(0, allocated - returned);
                  }, 0);
                  const liveAllocations = r.allocations.filter((a) => {
                    const allocated = Number(a.quantityAllocated || 0);
                    const returned = Number(a.quantityReturned || 0);
                    return Math.max(0, allocated - returned) > 0.000001;
                  });
                  const invoicePreview = liveAllocations
                    .slice(0, 2)
                    .map((a) => a.invoiceNo || `#${a.saleId.slice(0, 6)}`)
                    .join(", ");
                  const isExpanded = expandedBatchId === r.id;
                  const expiryInfo = getExpiryInfo(r.expiryDate);

                  return (
                    <Fragment key={r.id}>
                      <tr className="border-b border-border/50 align-middle transition-colors hover:bg-muted/20">
                        <td className="px-4 py-3 font-mono font-semibold text-foreground">
                          {r.batchNo}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/dashboard/products/${r.productId}`}
                            className="font-medium text-foreground hover:text-primary"
                          >
                            {r.productName}
                          </Link>
                          {r.variantLabel && (
                            <p className="mt-0.5 text-xs text-muted-foreground">{r.variantLabel}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {Number(r.totalQty).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-semibold text-foreground">
                            {Number(r.remainingQty).toFixed(2)}
                          </span>
                          <span className="ml-1 text-xs text-muted-foreground">({pct}%)</span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-foreground">
                          {netOutQty.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {invoicePreview || "—"}
                          {liveAllocations.length > 2
                            ? ` +${liveAllocations.length - 2}`
                            : ""}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {r.purchaseDate ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${expiryInfo.badgeClass}`}
                          >
                            {expiryInfo.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                              r.isActive
                                ? "border-success/30 bg-success-soft text-success"
                                : "border-border bg-muted text-muted-foreground"
                            }`}
                          >
                            {r.isActive ? "চালু" : "শেষ"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedBatchId((cur) => (cur === r.id ? null : r.id))
                            }
                            className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-card px-3 text-[11px] font-semibold text-foreground hover:bg-muted"
                          >
                            {isExpanded ? (
                              <>লুকান <ChevronUp className="h-3 w-3" /></>
                            ) : (
                              <>কোথায় গেছে <ChevronDown className="h-3 w-3" /></>
                            )}
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="border-b border-border/50 bg-muted/10">
                          <td colSpan={10} className="px-4 py-4">
                            <div className="space-y-3">
                              <div className="flex flex-wrap gap-2 text-[11px] font-medium text-muted-foreground">
                                <span className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-1">
                                  মোট {r.allocations.length}টি বিক্রয়
                                </span>
                                <span className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-1">
                                  বাইরে আছে {netOutQty.toFixed(2)}
                                </span>
                              </div>
                              {r.allocations.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                                  এই ব্যাচ এখনো কোনো বিক্রয়ে ব্যবহার হয়নি।
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {r.allocations.map((a) => {
                                    const allocated = Number(a.quantityAllocated || 0);
                                    const returned = Number(a.quantityReturned || 0);
                                    const netQty = Math.max(0, allocated - returned);
                                    return (
                                      <div
                                        key={a.id}
                                        className="rounded-xl border border-border bg-card px-4 py-3"
                                      >
                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                          <div>
                                            <p className="text-sm font-semibold text-foreground">
                                              {a.invoiceNo || `বিক্রয় #${a.saleId.slice(0, 8)}`}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                              {a.customerName || "Walk-in customer"} · {a.saleDate}
                                            </p>
                                            <Link
                                              href={`/dashboard/sales/${a.saleId}/invoice`}
                                              className="mt-1 inline-flex text-[11px] font-semibold text-primary hover:underline"
                                            >
                                              ইনভয়েস খুলুন →
                                            </Link>
                                          </div>
                                          <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
                                            <span className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-1 text-foreground">
                                              গেছে {allocated.toFixed(2)}
                                            </span>
                                            <span className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-1 text-foreground">
                                              ফিরেছে {returned.toFixed(2)}
                                            </span>
                                            <span
                                              className={`inline-flex items-center rounded-full border px-2.5 py-1 ${
                                                netQty > 0.000001
                                                  ? "border-warning/30 bg-warning-soft/60 text-warning"
                                                  : "border-success/30 bg-success-soft text-success"
                                              }`}
                                            >
                                              বাইরে {netQty.toFixed(2)}
                                            </span>
                                            <span className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-1 text-muted-foreground">
                                              {(a.saleStatus || "COMPLETED").toUpperCase()}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="divide-y divide-border md:hidden">
            {paginatedRows.map((r) => {
              const pct =
                Number(r.totalQty) > 0
                  ? Math.round((Number(r.remainingQty) / Number(r.totalQty)) * 100)
                  : 0;
              const netOutQty = r.allocations.reduce((sum, a) => {
                const allocated = Number(a.quantityAllocated || 0);
                const returned = Number(a.quantityReturned || 0);
                return sum + Math.max(0, allocated - returned);
              }, 0);
              const isExpanded = expandedBatchId === r.id;
              const expiryInfo = getExpiryInfo(r.expiryDate);

              return (
                <div key={r.id} className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono font-bold text-foreground">{r.batchNo}</span>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                        r.isActive
                          ? "border-success/30 bg-success-soft text-success"
                          : "border-border bg-muted text-muted-foreground"
                      }`}
                    >
                      {r.isActive ? "চালু" : "শেষ"}
                    </span>
                  </div>

                  <Link
                    href={`/dashboard/products/${r.productId}`}
                    className="block text-sm font-semibold text-foreground hover:text-primary"
                  >
                    {r.productName}
                    {r.variantLabel && (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        ({r.variantLabel})
                      </span>
                    )}
                  </Link>

                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <span className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-1 text-muted-foreground">
                      অবশিষ্ট{" "}
                      <span className="ml-1 font-semibold text-foreground">
                        {Number(r.remainingQty).toFixed(2)}
                      </span>
                      <span className="ml-0.5 text-muted-foreground">({pct}%)</span>
                    </span>
                    <span className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-1 text-muted-foreground">
                      বাইরে{" "}
                      <span className="ml-1 font-semibold text-foreground">
                        {netOutQty.toFixed(2)}
                      </span>
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 font-semibold ${expiryInfo.badgeClass}`}
                    >
                      {expiryInfo.label}
                    </span>
                  </div>

                  {r.purchaseDate && (
                    <p className="text-xs text-muted-foreground">ক্রয়: {r.purchaseDate}</p>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      setExpandedBatchId((cur) => (cur === r.id ? null : r.id))
                    }
                    className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-card px-3 text-[11px] font-semibold text-foreground hover:bg-muted"
                  >
                    {isExpanded ? (
                      <>লুকান <ChevronUp className="h-3 w-3" /></>
                    ) : (
                      <>কোথায় গেছে দেখুন <ChevronDown className="h-3 w-3" /></>
                    )}
                  </button>

                  {isExpanded && (
                    <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
                      {r.allocations.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          এই ব্যাচ এখনো কোনো বিক্রয়ে ব্যবহার হয়নি।
                        </p>
                      ) : (
                        r.allocations.map((a) => {
                          const allocated = Number(a.quantityAllocated || 0);
                          const returned = Number(a.quantityReturned || 0);
                          const netQty = Math.max(0, allocated - returned);
                          return (
                            <div
                              key={a.id}
                              className="rounded-lg border border-border bg-card p-3"
                            >
                              <p className="text-sm font-semibold text-foreground">
                                {a.invoiceNo || `বিক্রয় #${a.saleId.slice(0, 8)}`}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {a.customerName || "Walk-in customer"} · {a.saleDate}
                              </p>
                              <Link
                                href={`/dashboard/sales/${a.saleId}/invoice`}
                                className="mt-1 inline-flex text-[11px] font-semibold text-primary hover:underline"
                              >
                                ইনভয়েস খুলুন →
                              </Link>
                              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                                <span className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-foreground">
                                  গেছে {allocated.toFixed(2)}
                                </span>
                                <span className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-foreground">
                                  ফিরেছে {returned.toFixed(2)}
                                </span>
                                <span
                                  className={`inline-flex items-center rounded-full border px-2 py-0.5 ${
                                    netQty > 0.000001
                                      ? "border-warning/30 bg-warning-soft/60 text-warning"
                                      : "border-success/30 bg-success-soft text-success"
                                  }`}
                                >
                                  বাইরে {netQty.toFixed(2)}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
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
        ব্যাচ tracking চালু করতে পণ্য edit করুন। ব্যাচ নম্বর যোগ করতে{" "}
        <Link
          href={`/dashboard/purchases/new?shopId=${shopId}`}
          className="font-semibold text-primary hover:underline"
        >
          নতুন ক্রয় করুন →
        </Link>
      </p>
    </div>
  );
}
