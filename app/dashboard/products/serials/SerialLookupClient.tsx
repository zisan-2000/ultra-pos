"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronUp,
  Info,
  X,
  ArrowRight,
  Hash,
  ShieldCheck,
  Search,
  Lock,
  Pencil,
} from "lucide-react";
import { updateSerialRecord } from "@/app/actions/serials";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UnifiedPagination } from "@/components/pagination/UnifiedPagination";

type SerialRow = {
  id: string;
  serialNo: string;
  status: "IN_STOCK" | "SOLD" | "RETURNED" | "DAMAGED";
  productName: string;
  productId: string;
  variantLabel?: string | null;
  purchaseDate?: string | null;
  saleId?: string | null;
  saleDate?: string | null;
  invoiceNo?: string | null;
  customerName?: string | null;
  saleAmount?: string | null;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
};

type StatusKey = SerialRow["status"];

const PAGE_SIZE = 20;
const MAX_PAGE_BUTTONS = 5;

const STATUS_META: Record<
  StatusKey,
  {
    label: string;
    icon: string;
    badgeCls: string;
    rowTint: string;
    dotCls: string;
  }
> = {
  IN_STOCK: {
    label: "স্টকে আছে",
    icon: "📦",
    badgeCls: "border-success/30 bg-success-soft text-success",
    rowTint: "bg-success-soft/10 hover:bg-success-soft/20",
    dotCls: "bg-success",
  },
  SOLD: {
    label: "বিক্রি হয়েছে",
    icon: "✓",
    badgeCls: "border-primary/30 bg-primary-soft text-primary",
    rowTint: "hover:bg-muted/20",
    dotCls: "bg-primary",
  },
  RETURNED: {
    label: "ফেরত",
    icon: "↩️",
    badgeCls: "border-warning/30 bg-warning-soft text-warning",
    rowTint: "bg-warning-soft/10 hover:bg-warning-soft/20",
    dotCls: "bg-warning",
  },
  DAMAGED: {
    label: "নষ্ট",
    icon: "✖️",
    badgeCls: "border-danger/30 bg-danger-soft text-danger",
    rowTint: "bg-danger-soft/10 hover:bg-danger-soft/20",
    dotCls: "bg-danger",
  },
};

const STATUS_ORDER: StatusKey[] = ["IN_STOCK", "SOLD", "RETURNED", "DAMAGED"];

function formatCount(value: number) {
  return value.toLocaleString("bn-BD");
}

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
  const [showGuide, setShowGuide] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const tableRef = useRef<HTMLDivElement>(null);

  // Edit modal state
  const [editing, setEditing] = useState<SerialRow | null>(null);
  const [editSerialNo, setEditSerialNo] = useState("");
  const [editStatus, setEditStatus] = useState<StatusKey>("IN_STOCK");
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

  // Reset to page 1 when filter changes
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
    const end = Math.min(totalPages, start + MAX_PAGE_BUTTONS - 1);
    start = Math.max(1, end - MAX_PAGE_BUTTONS + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [safePage, totalPages]);

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

  // Status counts (full dataset)
  const statusCounts = useMemo(() => {
    const counts: Record<StatusKey, number> = {
      IN_STOCK: 0,
      SOLD: 0,
      RETURNED: 0,
      DAMAGED: 0,
    };
    for (const r of localRows) counts[r.status] += 1;
    return counts;
  }, [localRows]);

  // Sale revenue from sold serials
  const totalSoldValue = useMemo(
    () =>
      localRows
        .filter((r) => r.status === "SOLD")
        .reduce((sum, r) => sum + Number(r.saleAmount || 0), 0),
    [localRows]
  );

  const hasFilter = Boolean(
    query || statusFilter !== "all" || productFilter
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
  }

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
      {/* === Top stats strip (always visible) === */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <div className="rounded-2xl border border-success/20 bg-success-soft/40 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-success/80">
            স্টকে আছে
          </p>
          <p className="mt-1 text-xl font-extrabold text-success leading-tight">
            {formatCount(statusCounts.IN_STOCK)}
          </p>
          <p className="mt-0.5 text-[11px] text-success/80">
            বিক্রির জন্য ready
          </p>
        </div>
        <div className="rounded-2xl border border-primary/20 bg-primary-soft/40 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/80">
            বিক্রি হয়েছে
          </p>
          <p className="mt-1 text-xl font-extrabold text-primary leading-tight">
            {formatCount(statusCounts.SOLD)}
          </p>
          <p className="mt-0.5 text-[11px] text-primary/80">
            {totalSoldValue > 0
              ? `৳ ${totalSoldValue.toLocaleString("bn-BD")}`
              : "মোট বিক্রয়"}
          </p>
        </div>
        <div className="rounded-2xl border border-warning/20 bg-warning-soft/40 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-warning/80">
            ফেরত
          </p>
          <p className="mt-1 text-xl font-extrabold text-warning leading-tight">
            {formatCount(statusCounts.RETURNED)}
          </p>
          <p className="mt-0.5 text-[11px] text-warning/80">
            customer returned
          </p>
        </div>
        <div className="rounded-2xl border border-danger/20 bg-danger-soft/40 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-danger/80">
            নষ্ট
          </p>
          <p className="mt-1 text-xl font-extrabold text-danger leading-tight">
            {formatCount(statusCounts.DAMAGED)}
          </p>
          <p className="mt-0.5 text-[11px] text-danger/80">
            write-off
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
              Serial / Warranty tracking কী এবং কীভাবে কাজ করে?
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
              <span className="font-semibold">Serial number</span> = প্রতিটা item-এর unique
              identifier (যেমন Mobile-এর IMEI, Motor-এর serial)। এতে কোন piece কখন কেনা
              হয়েছে, কাকে বিক্রি হয়েছে, warranty কতদিন বাকি — সব track রাখা যায়।
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-card p-3">
                <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-base">
                  1️⃣
                </div>
                <p className="font-semibold text-foreground">ক্রয়ের সময় input</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Purchase page এ পণ্য add করার সময় serial number লিখুন।
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-3">
                <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-base">
                  2️⃣
                </div>
                <p className="font-semibold text-foreground">বিক্রির সময় match</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  POS-এ পণ্য বিক্রির সময় কোন serial যাচ্ছে select করুন।
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-3">
                <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-base">
                  3️⃣
                </div>
                <p className="font-semibold text-foreground">Warranty claim</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Customer warranty নিয়ে এলে serial দিয়ে invoice & date খুঁজে বের করুন।
                </p>
              </div>
            </div>
            <p className="text-[11px] italic text-muted-foreground">
              পণ্য edit করে "Serial tracking" চালু করুন। তারপর সব নতুন ক্রয় automatically
              serial input চাইবে।
            </p>
          </div>
        )}
      </div>

      {/* === Filter bar === */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_220px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Serial number, পণ্য, কাস্টমার, ইনভয়েস দিয়ে খুঁজুন..."
            className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/25"
          />
        </div>
        <select
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value)}
          className="h-11 rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
        >
          <option value="">সব পণ্য</option>
          {productOptions.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
      </div>

      {/* Status pills + clear */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          onClick={() => setStatusFilter("all")}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold transition-colors ${
            statusFilter === "all"
              ? "bg-primary text-primary-foreground"
              : "border border-border bg-card text-foreground hover:bg-muted"
          }`}
        >
          সব
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] ${
              statusFilter === "all"
                ? "bg-white/25"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {formatCount(localRows.length)}
          </span>
        </button>
        {STATUS_ORDER.map((s) => {
          const meta = STATUS_META[s];
          const isActive = statusFilter === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold transition-colors ${
                isActive
                  ? `${meta.badgeCls} border`
                  : "border border-border bg-card text-foreground hover:bg-muted"
              }`}
            >
              <span aria-hidden>{meta.icon}</span>
              {meta.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                  isActive
                    ? "bg-white/30 dark:bg-black/15"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {formatCount(statusCounts[s])}
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
        {activeProductLabel && (
          <span className="ml-auto text-muted-foreground">
            বাছাই: <span className="font-semibold text-foreground">{activeProductLabel}</span>
          </span>
        )}
      </div>

      {/* Result count */}
      <p className="text-xs text-muted-foreground">
        {formatCount(filtered.length)}টি ফলাফল
        {hasFilter && localRows.length !== filtered.length
          ? ` (মোট ${formatCount(localRows.length)}-এর মধ্যে)`
          : ""}
      </p>

      {/* === Empty state === */}
      {filtered.length === 0 ? (
        localRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/10 p-8 text-center">
            <div className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft/60">
              <ShieldCheck className="h-6 w-6 text-primary" />
            </div>
            <p className="text-base font-semibold text-foreground">
              এখনো কোনো serial number নথিভুক্ত নেই
            </p>
            <p className="mx-auto mt-1 max-w-md text-xs leading-6 text-muted-foreground">
              পণ্যের "Serial tracking" চালু করুন, তারপর ক্রয়ের সময় serial input করলে এখানে
              automatically চলে আসবে। Mobile, motor, electronics-এর warranty management-এর
              জন্য খুবই কাজের।
            </p>
            <div className="mt-4 inline-flex flex-wrap items-center justify-center gap-2">
              <Link
                href={`/dashboard/products?shopId=${shopId}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                <ShieldCheck className="h-4 w-4" />
                পণ্য edit করে চালু করুন
              </Link>
              <Link
                href={`/dashboard/purchases/new?shopId=${shopId}`}
                className="inline-flex h-9 items-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
              >
                নতুন ক্রয় দিন
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
                    Serial / পণ্য
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    অবস্থা
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    ক্রয় → বিক্রয়
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    কাস্টমার / ইনভয়েস
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    বিক্রয়মূল্য
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((r) => {
                  const meta = STATUS_META[r.status];
                  return (
                    <tr
                      key={r.id}
                      className={`border-b border-border/50 align-top transition-colors ${meta.rowTint}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Hash className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                          <span className="font-mono font-bold text-foreground">
                            {r.serialNo}
                          </span>
                        </div>
                        <Link
                          href={`/dashboard/products/${r.productId}`}
                          className="mt-1 block text-xs font-medium text-foreground hover:text-primary"
                        >
                          {r.productName}
                        </Link>
                        {r.variantLabel && (
                          <p className="text-[11px] text-muted-foreground">
                            {r.variantLabel}
                          </p>
                        )}
                        {r.note && (
                          <p className="mt-1 text-[11px] italic text-muted-foreground line-clamp-2">
                            📝 {r.note}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${meta.badgeCls}`}
                        >
                          {r.status === "IN_STOCK" && (
                            <span className={`h-1.5 w-1.5 rounded-full ${meta.dotCls} animate-pulse`} />
                          )}
                          <span aria-hidden>{meta.icon}</span>
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-middle text-xs">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {r.purchaseDate ?? "—"}
                          </span>
                          <span className="text-muted-foreground/60">→</span>
                          <span
                            className={
                              r.saleDate
                                ? "font-medium text-foreground"
                                : "italic text-muted-foreground/70"
                            }
                          >
                            {r.saleDate ?? "এখনো না"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle text-xs">
                        {r.customerName || r.invoiceNo ? (
                          <>
                            {r.customerName && (
                              <p className="font-semibold text-foreground">
                                {r.customerName}
                              </p>
                            )}
                            {r.saleId && r.invoiceNo ? (
                              <Link
                                href={`/dashboard/sales/${r.saleId}/invoice`}
                                className="mt-0.5 inline-flex items-center gap-1 text-primary hover:underline"
                              >
                                {r.invoiceNo}
                                <ArrowRight className="h-3 w-3" />
                              </Link>
                            ) : r.invoiceNo ? (
                              <p className="mt-0.5 text-muted-foreground">{r.invoiceNo}</p>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-middle text-right">
                        {r.saleAmount ? (
                          <span className="font-bold text-foreground">
                            ৳ {Number(r.saleAmount).toLocaleString("bn-BD")}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-middle text-right">
                        <button
                          type="button"
                          onClick={() => openEditor(r)}
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted"
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* === Mobile cards === */}
          <div className="divide-y divide-border md:hidden">
            {paginatedRows.map((r) => {
              const meta = STATUS_META[r.status];
              return (
                <div
                  key={r.id}
                  className={`space-y-2.5 p-4 ${
                    r.status === "IN_STOCK"
                      ? "bg-success-soft/10"
                      : r.status === "RETURNED"
                        ? "bg-warning-soft/10"
                        : r.status === "DAMAGED"
                          ? "bg-danger-soft/10"
                          : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Hash className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                        <span className="truncate font-mono font-bold text-foreground">
                          {r.serialNo}
                        </span>
                      </div>
                      <Link
                        href={`/dashboard/products/${r.productId}`}
                        className="mt-1 block truncate text-sm font-semibold text-foreground hover:text-primary"
                      >
                        {r.productName}
                      </Link>
                      {r.variantLabel && (
                        <p className="text-[11px] text-muted-foreground">
                          {r.variantLabel}
                        </p>
                      )}
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${meta.badgeCls}`}
                    >
                      {r.status === "IN_STOCK" && (
                        <span className={`h-1.5 w-1.5 rounded-full ${meta.dotCls} animate-pulse`} />
                      )}
                      <span aria-hidden>{meta.icon}</span>
                      {meta.label}
                    </span>
                  </div>

                  {(r.purchaseDate || r.saleDate) && (
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {r.purchaseDate ?? "—"}
                      </span>
                      <span>→</span>
                      <span
                        className={
                          r.saleDate
                            ? "font-medium text-foreground"
                            : "italic"
                        }
                      >
                        {r.saleDate ?? "এখনো না"}
                      </span>
                    </div>
                  )}

                  {(r.customerName || r.invoiceNo) && (
                    <div className="rounded-xl border border-border bg-card/60 p-2.5 text-xs">
                      {r.customerName && (
                        <p className="font-semibold text-foreground">
                          {r.customerName}
                        </p>
                      )}
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        {r.saleId && r.invoiceNo ? (
                          <Link
                            href={`/dashboard/sales/${r.saleId}/invoice`}
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            {r.invoiceNo}
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">
                            {r.invoiceNo || "—"}
                          </span>
                        )}
                        {r.saleAmount && (
                          <span className="font-bold text-foreground">
                            ৳ {Number(r.saleAmount).toLocaleString("bn-BD")}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {r.note && (
                    <p className="text-[11px] italic text-muted-foreground line-clamp-2">
                      📝 {r.note}
                    </p>
                  )}

                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => openEditor(r)}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit / Mark
                    </button>
                  </div>
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
        Serial tracking চালু করতে পণ্য edit করুন। ক্রয়ের সময় serial input হলে এখানে চলে
        আসবে।
        <Link
          href={`/dashboard/purchases/new?shopId=${shopId}`}
          className="ml-2 font-semibold text-primary hover:underline"
        >
          নতুন ক্রয় →
        </Link>
      </p>

      {/* === Edit dialog === */}
      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-primary" />
              Serial Management
            </DialogTitle>
            <DialogDescription>
              {editing?.productName}
              {editing?.variantLabel ? ` · ${editing.variantLabel}` : ""}
            </DialogDescription>
          </DialogHeader>

          {editing ? (
            <div className="space-y-3">
              {soldLocked && (
                <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-soft/60 px-3 py-2.5 text-xs text-warning">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-semibold">SOLD serial locked</p>
                    <p className="mt-0.5 text-warning/90">
                      Serial number ও status পরিবর্তন করতে sale return বা void flow ব্যবহার
                      করুন। শুধু note edit করা যাবে।
                    </p>
                  </div>
                </div>
              )}

              <label className="block space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">Serial No</span>
                <div className="relative">
                  <Hash className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={editSerialNo}
                    onChange={(e) => setEditSerialNo(e.target.value.toUpperCase())}
                    disabled={soldLocked}
                    className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 font-mono text-sm uppercase focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-muted/40 disabled:text-muted-foreground"
                  />
                </div>
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">Status</span>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as StatusKey)}
                  disabled={soldLocked}
                  className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-muted/40 disabled:text-muted-foreground"
                >
                  <option value="IN_STOCK">📦 স্টকে আছে</option>
                  {editing?.status === "SOLD" ? (
                    <option value="SOLD">✓ বিক্রি হয়েছে</option>
                  ) : null}
                  <option value="RETURNED">↩️ ফেরত</option>
                  <option value="DAMAGED">✖️ নষ্ট</option>
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">Note</span>
                <textarea
                  rows={3}
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="ম্যানুয়াল নোট লিখুন (যেমন: warranty card #, damage reason)"
                />
              </label>

              {editError && (
                <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
                  {editError}
                </p>
              )}

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
                        setEditError(
                          err instanceof Error ? err.message : "আপডেট ব্যর্থ হয়েছে"
                        );
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
