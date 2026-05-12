"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { generateCSV } from "@/lib/utils/csv";
import { downloadFile } from "@/lib/utils/download";

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

function getExpiryInfo(expiryDate?: string | null) {
  if (!expiryDate) {
    return {
      label: "Expiry নেই",
      className: "border-border bg-muted text-muted-foreground",
      textClass: "text-muted-foreground",
    };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(`${expiryDate}T00:00:00`);
  const days = Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
  if (days < 0) {
    return {
      label: `${expiryDate} · expired`,
      className: "border-red-200 bg-red-50 text-red-700",
      textClass: "text-red-700",
    };
  }
  if (days <= 30) {
    return {
      label: `${expiryDate} · ${days} দিন`,
      className: "border-amber-200 bg-amber-50 text-amber-700",
      textClass: "text-amber-700",
    };
  }
  return {
    label: `${expiryDate} · ${days} দিন`,
    className: "border-green-200 bg-green-50 text-green-700",
    textClass: "text-green-700",
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

  const activeProductLabel = useMemo(() => {
    if (!productFilter) return null;
    return productOptions.find((row) => row.id === productFilter)?.name ?? null;
  }, [productFilter, productOptions]);

  const activeCnt = rows.filter((r) => r.isActive).length;
  const depletedCnt = rows.filter((r) => !r.isActive).length;

  function exportRows() {
    const flattened = filtered.flatMap((row) => {
      const netOutQty = row.allocations.reduce((sum, allocation) => {
        const allocated = Number(allocation.quantityAllocated || 0);
        const returned = Number(allocation.quantityReturned || 0);
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

      return row.allocations.map((allocation) => {
        const allocated = Number(allocation.quantityAllocated || 0);
        const returned = Number(allocation.quantityReturned || 0);
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
          invoiceNo: allocation.invoiceNo || "",
          customerName: allocation.customerName || "",
          saleDate: allocation.saleDate,
          saleStatus: allocation.saleStatus || "",
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
    downloadFile("batch-recall-export.csv", csv);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Batch নম্বর বা পণ্য নাম দিয়ে খুঁজুন..."
          className="flex-1 h-11 rounded-xl border border-border bg-card px-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={exportRows}
            className="h-9 rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted"
          >
            CSV export
          </button>
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
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {activeProductLabel ? (
            <span>
              এখন দেখাচ্ছে: <span className="font-semibold text-foreground">{activeProductLabel}</span>
            </span>
          ) : null}
          <Link
            href={`/dashboard/products?shopId=${shopId}`}
            className="font-semibold text-primary hover:underline"
          >
            পণ্য তালিকায় ফিরুন
          </Link>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length}টি ফলাফল</p>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">কোনো batch পাওয়া যায়নি</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Batch No</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">পণ্য</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">মোট পরিমাণ</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">অবশিষ্ট</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">কাস্টমারের কাছে</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">ইনভয়েস</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">ক্রয় তারিখ</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Expiry</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">অবস্থা</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">ট্রেস</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const pct = Number(r.totalQty) > 0
                    ? Math.round((Number(r.remainingQty) / Number(r.totalQty)) * 100)
                    : 0;
                  const netOutQty = r.allocations.reduce((sum, allocation) => {
                    const allocated = Number(allocation.quantityAllocated || 0);
                    const returned = Number(allocation.quantityReturned || 0);
                    return sum + Math.max(0, allocated - returned);
                  }, 0);
                  const liveAllocations = r.allocations.filter((allocation) => {
                    const allocated = Number(allocation.quantityAllocated || 0);
                    const returned = Number(allocation.quantityReturned || 0);
                    return Math.max(0, allocated - returned) > 0.000001;
                  });
                  const invoicePreview = liveAllocations
                    .slice(0, 2)
                    .map((allocation) => allocation.invoiceNo || `Sale ${allocation.saleId.slice(0, 6)}`)
                    .join(", ");
                  const isExpanded = expandedBatchId === r.id;
                  const expiryInfo = getExpiryInfo(r.expiryDate);
                  return (
                    <Fragment key={r.id}>
                      <tr className="border-b border-border/50 hover:bg-muted/20 transition-colors">
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
                        <td className="px-4 py-3 text-right font-semibold text-foreground">
                          {netOutQty.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {invoicePreview || "—"}
                          {liveAllocations.length > 2 ? ` +${liveAllocations.length - 2}` : ""}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{r.purchaseDate ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${expiryInfo.className}`}>
                            {expiryInfo.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                            r.isActive
                              ? "bg-green-50 text-green-700 border-green-200"
                              : "bg-muted text-muted-foreground border-border"
                          }`}>
                            {r.isActive ? "চালু" : "শেষ"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setExpandedBatchId((current) => current === r.id ? null : r.id)}
                            className="inline-flex h-8 items-center rounded-full border border-border bg-card px-3 text-[11px] font-semibold text-foreground hover:bg-muted"
                          >
                            {isExpanded ? "লুকান" : "ট্রেস"}
                          </button>
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr className="border-b border-border/50 bg-muted/10">
                          <td colSpan={10} className="px-4 py-4">
                            <div className="space-y-3">
                              <div className="flex flex-wrap gap-2 text-[11px] font-medium text-muted-foreground">
                                <span className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-1">
                                  মোট trace {r.allocations.length}টি
                                </span>
                                <span className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-1">
                                  কাস্টমারের কাছে {netOutQty.toFixed(2)}
                                </span>
                              </div>
                              {r.allocations.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                                  এই batch এখনো কোনো sale-এ যায়নি।
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {r.allocations.map((allocation) => {
                                    const allocated = Number(allocation.quantityAllocated || 0);
                                    const returned = Number(allocation.quantityReturned || 0);
                                    const netQty = Math.max(0, allocated - returned);
                                    return (
                                      <div
                                        key={allocation.id}
                                        className="rounded-xl border border-border bg-card px-4 py-3"
                                      >
                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                          <div>
                                            <p className="text-sm font-semibold text-foreground">
                                              {allocation.invoiceNo || `Sale ${allocation.saleId.slice(0, 8)}`}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                              {allocation.customerName || "Walk-in customer"} · {allocation.saleDate}
                                            </p>
                                            <Link
                                              href={`/dashboard/sales/${allocation.saleId}/invoice`}
                                              className="mt-1 inline-flex text-[11px] font-semibold text-primary hover:underline"
                                            >
                                              ইনভয়েস খুলুন
                                            </Link>
                                          </div>
                                          <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
                                            <span className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-1 text-foreground">
                                              গেছে {allocated.toFixed(2)}
                                            </span>
                                            <span className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-1 text-foreground">
                                              ফিরেছে {returned.toFixed(2)}
                                            </span>
                                            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 ${
                                              netQty > 0.000001
                                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                                : "border-green-200 bg-green-50 text-green-700"
                                            }`}>
                                              বাইরে আছে {netQty.toFixed(2)}
                                            </span>
                                            <span className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-1 text-muted-foreground">
                                              {(allocation.saleStatus || "COMPLETED").toUpperCase()}
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
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="md:hidden divide-y divide-border">
            {filtered.map((r) => {
              const pct = Number(r.totalQty) > 0
                ? Math.round((Number(r.remainingQty) / Number(r.totalQty)) * 100)
                : 0;
              const netOutQty = r.allocations.reduce((sum, allocation) => {
                const allocated = Number(allocation.quantityAllocated || 0);
                const returned = Number(allocation.quantityReturned || 0);
                return sum + Math.max(0, allocated - returned);
              }, 0);
              const isExpanded = expandedBatchId === r.id;
              const expiryInfo = getExpiryInfo(r.expiryDate);
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
                  <p className="text-xs text-muted-foreground">
                    কাস্টমারের কাছে: <span className="font-semibold text-foreground">{netOutQty.toFixed(2)}</span>
                  </p>
                  {r.purchaseDate && (
                    <p className="text-xs text-muted-foreground">ক্রয়: {r.purchaseDate}</p>
                  )}
                  <p className="text-xs">
                    Expiry: <span className={`font-semibold ${expiryInfo.textClass}`}>{expiryInfo.label}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => setExpandedBatchId((current) => current === r.id ? null : r.id)}
                    className="mt-2 inline-flex h-8 items-center rounded-full border border-border bg-card px-3 text-[11px] font-semibold text-foreground hover:bg-muted"
                  >
                    {isExpanded ? "ট্রেস লুকান" : "কোথায় গেছে দেখুন"}
                  </button>
                  {isExpanded ? (
                    <div className="mt-2 space-y-2 rounded-xl border border-border bg-muted/20 p-3">
                      {r.allocations.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          এই batch এখনো কোনো sale-এ যায়নি।
                        </p>
                      ) : (
                        r.allocations.map((allocation) => {
                          const allocated = Number(allocation.quantityAllocated || 0);
                          const returned = Number(allocation.quantityReturned || 0);
                          const netQty = Math.max(0, allocated - returned);
                          return (
                            <div key={allocation.id} className="rounded-lg border border-border bg-card p-3">
                              <p className="text-sm font-semibold text-foreground">
                                {allocation.invoiceNo || `Sale ${allocation.saleId.slice(0, 8)}`}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {allocation.customerName || "Walk-in customer"} · {allocation.saleDate}
                              </p>
                              <Link
                                href={`/dashboard/sales/${allocation.saleId}/invoice`}
                                className="mt-1 inline-flex text-[11px] font-semibold text-primary hover:underline"
                              >
                                ইনভয়েস খুলুন
                              </Link>
                              <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold">
                                <span className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-foreground">
                                  গেছে {allocated.toFixed(2)}
                                </span>
                                <span className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-foreground">
                                  ফিরেছে {returned.toFixed(2)}
                                </span>
                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 ${
                                  netQty > 0.000001
                                    ? "border-amber-200 bg-amber-50 text-amber-700"
                                    : "border-green-200 bg-green-50 text-green-700"
                                }`}>
                                  বাইরে আছে {netQty.toFixed(2)}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
