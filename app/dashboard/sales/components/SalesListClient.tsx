// app/dashboard/sales/components/SalesListClient.tsx

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { useSyncStatus } from "@/lib/sync/sync-status";
import { db } from "@/lib/dexie/db";
import RefreshIconButton from "@/components/ui/refresh-icon-button";
import { VoidSaleControls } from "./VoidSaleControls";
import { handlePermissionError } from "@/lib/permission-toast";
import { reportEvents, type ReportEventData } from "@/lib/events/reportEvents";
import { useSmartPolling } from "@/lib/polling/use-smart-polling";
import { usePageVisibility } from "@/lib/use-page-visibility";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";
import { getDhakaDateString } from "@/lib/reporting-range";

type SaleSummary = {
  id: string;
  subtotalAmount?: string | null;
  discountType?: string | null;
  discountValue?: string | null;
  discountAmount?: string | null;
  taxableAmount?: string | null;
  taxLabel?: string | null;
  taxRate?: string | null;
  taxAmount?: string | null;
  totalAmount: string;
  paymentMethod: string;
  invoiceNo?: string | null;
  status?: string | null;
  voidReason?: string | null;
  createdAt: string; // ISO string
  itemCount: number;
  itemPreview: string;
  itemPreviewFull?: string;
  customerName: string | null;
  returnCount?: number;
  refundCount?: number;
  exchangeCount?: number;
  returnNetAmount?: string | null;
  lastReturnAt?: string | null;
  latestReturnedPreview?: string | null;
  latestExchangePreview?: string | null;
  syncStatus?: "new" | "synced";
};

type Props = {
  shopId: string;
  sales: SaleSummary[];
  page: number;
  prevHref: string | null;
  nextHref: string | null;
  hasMore: boolean;
  canVoidSale: boolean;
  canEditDueSale: boolean;
  canReturnSale: boolean;
  voidSaleAction: (formData: FormData) => Promise<void>;
};

const paymentLabels: Record<string, string> = {
  cash: "💵 ক্যাশ",
  bkash: "📱 বিকাশ",
  nagad: "📲 নগদ",
  card: "💳 কার্ড",
  bank_transfer: "🏦 ব্যাংক",
  due: "🧾 বাকিতে",
};

function formatTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("bn-BD", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTaxLabel(label?: string | null) {
  const normalized = String(label || "").trim();
  if (!normalized) return "ভ্যাট";
  if (normalized.toLowerCase() === "vat") return "ভ্যাট";
  return normalized;
}

function scheduleStateUpdate(fn: () => void) {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(fn);
    return;
  }
  Promise.resolve().then(fn);
}

export default function SalesListClient({
  shopId,
  sales,
  page,
  prevHref,
  nextHref,
  hasMore,
  canVoidSale,
  canEditDueSale,
  canReturnSale,
  voidSaleAction,
}: Props) {
  const router = useRouter();
  const online = useOnlineStatus();
  const isVisible = usePageVisibility();
  const { pendingCount, syncing, lastSyncAt } = useSyncStatus();
  const [items, setItems] = useState<SaleSummary[]>(sales);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const serverSnapshotRef = useRef(sales);
  const refreshInFlightRef = useRef(false);

  useEffect(() => {
    if (serverSnapshotRef.current !== sales) {
      serverSnapshotRef.current = sales;
      refreshInFlightRef.current = false;
    }
  }, [sales]);

  const { triggerRefresh } = useSmartPolling({
    profile: "salesList",
    enabled: Boolean(shopId),
    online,
    isVisible,
    blocked: syncing || pendingCount > 0,
    syncToken: lastSyncAt,
    canRefresh: () => !refreshInFlightRef.current,
    markRefreshStarted: () => {
      refreshInFlightRef.current = true;
    },
    onRefresh: () => {
      router.refresh();
    },
  });

  useEffect(() => {
    if (!online) return;

    const handleSaleUpdate = (event: ReportEventData) => {
      if (event.shopId !== shopId) return;
      if (event.metadata?.source === "ui") return;
      triggerRefresh("event", { at: event.timestamp ?? Date.now() });
    };

    const listenerId = reportEvents.addListener(
      "sale-update",
      handleSaleUpdate,
      { shopId, priority: 5 }
    );

    return () => {
      reportEvents.removeListener(listenerId);
    };
  }, [online, shopId, triggerRefresh]);

  const handleManualRefresh = () => {
    setManualRefreshing(true);
    triggerRefresh("manual", { force: true });
    setTimeout(() => setManualRefreshing(false), 1800);
  };

  // Seed Dexie when online; load from Dexie when offline.
  useEffect(() => {
    let cancelled = false;

    const loadFromDexie = async () => {
      try {
        const rows = await db.sales.where("shopId").equals(shopId).toArray();
        if (cancelled) return;
        if (!rows || rows.length === 0) {
          // Fallback to cached server copy
          try {
            const cached = safeLocalStorageGet(`cachedSales:${shopId}`);
            if (cached) {
              const parsed = JSON.parse(cached) as SaleSummary[];
              setItems(parsed || []);
            }
          } catch {
            setItems([]);
          }
          return;
        }

        const mapped: SaleSummary[] = rows.map((r) => {
          const created =
            typeof r.createdAt === "number"
              ? new Date(r.createdAt).toISOString()
              : typeof r.createdAt === "string"
              ? r.createdAt
              : new Date().toISOString();
          const payment = (r as any).paymentMethod || "cash";
          const itemPreview =
            (r as any).itemPreview ||
            (Array.isArray(r.items) && r.items.length > 0
              ? r.items
                  .map((it: any) => {
                    const name = it?.name || "";
                    const qty = Number(it?.qty || 0);
                    return qty > 0 ? `${name} x${qty}` : name;
                  })
                  .filter(Boolean)
                  .slice(0, 5)
                  .join(", ")
              : "");
          const itemPreviewFull =
            (r as any).itemPreviewFull ||
            (Array.isArray(r.items) && r.items.length > 0
              ? r.items
                  .map((it: any) => {
                    const name = it?.name || "";
                    const qty = Number(it?.qty || 0);
                    return qty > 0 ? `${name} x${qty}` : name;
                  })
                  .filter(Boolean)
                  .join(", ")
              : itemPreview);
          const itemCount =
            (r as any).itemCount ??
            (Array.isArray(r.items) ? r.items.length : 0);
          return {
            id: (r as any).id || r.tempId,
            subtotalAmount: (r as any).subtotalAmount ?? null,
            discountType: (r as any).discountType ?? null,
            discountValue: (r as any).discountValue ?? null,
            discountAmount: (r as any).discountAmount ?? "0.00",
            taxableAmount: (r as any).taxableAmount ?? null,
            taxLabel: (r as any).taxLabel ?? null,
            taxRate: (r as any).taxRate ?? null,
            taxAmount: (r as any).taxAmount ?? "0.00",
            totalAmount: r.totalAmount,
            paymentMethod: payment,
            invoiceNo: (r as any).invoiceNo ?? null,
            status: (r as any).status ?? "COMPLETED",
            voidReason: (r as any).voidReason ?? null,
            createdAt: created,
            itemCount,
            itemPreview,
            itemPreviewFull,
            customerName: (r as any).customerName ?? null,
            returnCount: Number((r as any).returnCount ?? 0),
            refundCount: Number((r as any).refundCount ?? 0),
            exchangeCount: Number((r as any).exchangeCount ?? 0),
            returnNetAmount: (r as any).returnNetAmount ?? "0.00",
            lastReturnAt: (r as any).lastReturnAt ?? null,
            latestReturnedPreview: (r as any).latestReturnedPreview ?? null,
            latestExchangePreview: (r as any).latestExchangePreview ?? null,
            syncStatus: (r as any).syncStatus ?? "synced",
          };
        });

        mapped.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setItems(mapped);
      } catch (err) {
        handlePermissionError(err);
        console.error("Load offline sales failed", err);
      }
    };

    if (online) {
      if (syncing || pendingCount > 0 || refreshInFlightRef.current) {
        loadFromDexie();
        return () => {
          cancelled = true;
        };
      }

      scheduleStateUpdate(() => {
        if (cancelled) return;
        setItems(sales);
      });
      const rows = sales.map((s) => ({
        tempId: s.id,
        id: s.id,
        shopId,
        items: [],
        paymentMethod: s.paymentMethod,
        invoiceNo: s.invoiceNo ?? null,
        customerId: null,
        note: "",
        subtotalAmount: s.subtotalAmount ?? undefined,
        discountType: s.discountType ?? null,
        discountValue: s.discountValue ?? null,
        discountAmount: s.discountAmount ?? "0.00",
        totalAmount: s.totalAmount,
        createdAt: new Date(s.createdAt).getTime(),
        syncStatus: "synced" as const,
        itemCount: s.itemCount,
        itemPreview: s.itemPreview,
        itemPreviewFull: (s as any).itemPreviewFull ?? s.itemPreview,
        customerName: s.customerName,
        status: s.status ?? "COMPLETED",
        voidReason: s.voidReason ?? null,
        returnCount: Number(s.returnCount ?? 0),
        refundCount: Number(s.refundCount ?? 0),
        exchangeCount: Number(s.exchangeCount ?? 0),
        returnNetAmount: s.returnNetAmount ?? "0.00",
        lastReturnAt: s.lastReturnAt ?? null,
        latestReturnedPreview: s.latestReturnedPreview ?? null,
        latestExchangePreview: s.latestExchangePreview ?? null,
      }));
      db.sales.bulkPut(rows).catch((err) => {
        console.error("Seed Dexie sales failed", err);
      });
      try {
        safeLocalStorageSet(`cachedSales:${shopId}`, JSON.stringify(sales));
      } catch (err) {
        handlePermissionError(err);
        console.warn("Persist cached sales failed", err);
      }
      return () => {
        cancelled = true;
      };
    }

    loadFromDexie();
    return () => {
      cancelled = true;
    };
  }, [online, sales, shopId, pendingCount, syncing]);

  const renderedItems = useMemo(() => items, [items]);

  const grouped = useMemo(() => {
    const groups: Record<string, SaleSummary[]> = {};
    renderedItems
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .forEach((s) => {
        const key = getDhakaDateString(new Date(s.createdAt));
        groups[key] = groups[key] || [];
        groups[key].push(s);
      });
    return groups;
  }, [renderedItems]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {!online && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning border border-warning/30">
              📡 অফলাইন - শুধু দেখা যাবে
            </span>
          )}
          {page > 1 && prevHref && (
            <Link
              href={prevHref}
              className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground hover:bg-muted"
            >
              ⬆️ নতুনগুলো
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2">
          <RefreshIconButton
            onClick={handleManualRefresh}
            loading={manualRefreshing}
            label="রিফ্রেশ"
            className="h-8 px-2.5 text-xs"
          />
          <span className="text-xs text-muted-foreground">পৃষ্ঠা {page}</span>
        </div>
      </div>

      {renderedItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-card/60 px-6 py-12 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-primary/15 bg-primary-soft/60 text-3xl shadow-[0_1px_0_rgba(0,0,0,0.03)]">
            🧾
          </div>
          <p className="text-lg font-semibold text-foreground">
            {online ? "এই তারিখে কোনো বিক্রি নেই" : "অফলাইনে বিক্রির তালিকা দেখছেন"}
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            {online
              ? "তারিখ বা ফিল্টার বদলে আবার দেখুন।"
              : "সর্বশেষ সিঙ্ককৃত বিক্রিগুলো পাওয়া গেলে এখানে দেখাবে।"}
          </p>
        </div>
      ) : (
        Object.keys(grouped)
          .sort((a, b) => (a > b ? -1 : 1))
          .map((dateKey) => {
            const friendly = new Date(dateKey).toLocaleDateString("bn-BD");
            const entries = grouped[dateKey];
            return (
              <div key={dateKey} className="space-y-3">
                <div className="flex items-center gap-3 px-1">
                  <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground">
                    {friendly}
                  </p>
                  <div className="flex-1 h-px bg-border/60" />
                  <span className="inline-flex h-6 items-center rounded-full border border-border/70 bg-card px-2.5 text-[10px] font-semibold text-muted-foreground">
                    {entries.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {entries.map((s) => {
          const isVoided = (s.status || "").toUpperCase() === "VOIDED";
          const voidReason = s.voidReason || "";
          const paymentKey = s.paymentMethod?.toLowerCase?.() || "cash";
          const paymentText =
            paymentLabels[paymentKey] || s.paymentMethod || "নগদ";
          const isDueSale = paymentKey === "due";
          const isPending = s.syncStatus === "new";
          const isExpanded = Boolean(expandedItems[s.id]);
          const collapsedPreview = s.itemPreview || "";
          const fullPreview = s.itemPreviewFull || collapsedPreview;
          const moreMatch = collapsedPreview.match(/^(.*)\s\+(\d+)\s(?:আরও|more)$/);
          const hasExpandableMore =
            Boolean(moreMatch) &&
            Boolean(fullPreview) &&
            fullPreview !== collapsedPreview;
          const itemLine =
            (isExpanded
              ? fullPreview
              : hasExpandableMore
              ? (moreMatch?.[1] ?? collapsedPreview)
              : collapsedPreview) ||
            (s.itemCount > 0
              ? `${s.itemCount} আইটেম`
              : "কোন আইটেম সংযুক্ত নেই");
          const timeStr = formatTime(s.createdAt);
          const formId = `void-sale-${s.id}`;
          const returnCount = Number(s.returnCount ?? 0);
          const refundCount = Number(s.refundCount ?? 0);
          const exchangeCount = Number(s.exchangeCount ?? 0);
          const hasReturnFlow = !isVoided && returnCount > 0;
          const hasRefundFlow = refundCount > 0;
          const hasExchangeFlow = exchangeCount > 0;
          const flowLabel =
            hasRefundFlow && hasExchangeFlow
              ? `${refundCount} রিটার্ন, ${exchangeCount} এক্সচেঞ্জ`
              : hasExchangeFlow
              ? `${exchangeCount} এক্সচেঞ্জ`
              : hasRefundFlow
              ? `${refundCount} রিটার্ন`
              : `${returnCount} রিটার্ন/এক্সচেঞ্জ`;
          const returnNet = Number(s.returnNetAmount ?? 0);
          const latestReturnedPreview = s.latestReturnedPreview ?? null;
          const latestExchangePreview = s.latestExchangePreview ?? null;
          const baseTotal = Number(s.totalAmount ?? 0);
          const discountAmount = Number(s.discountAmount ?? 0);
          const taxAmount = Number(s.taxAmount ?? 0);
          const subtotalAmount = Number(
            s.subtotalAmount ?? baseTotal + discountAmount
          );
          const baseTotalStr = baseTotal.toFixed(2);
          const adjustedTotal = baseTotal + returnNet;
          const displayTotal = hasReturnFlow ? adjustedTotal : baseTotal;
          const displayTotalStr = displayTotal.toFixed(2);
          const returnNetText = Math.abs(returnNet).toFixed(2);
          const hasExchangeDetail = Boolean(
            latestReturnedPreview || latestExchangePreview
          );
          const compactMetaChips = [
            !isVoided && discountAmount > 0
              ? `ছাড় ৳${discountAmount.toFixed(2)}${
                  s.discountType === "percent" && s.discountValue
                    ? ` (${Number(s.discountValue).toFixed(2)}%)`
                    : ""
                }`
              : null,
            !isVoided && discountAmount > 0
              ? `সাব-টোটাল ৳${subtotalAmount.toFixed(2)}`
              : null,
            !isVoided && taxAmount > 0
              ? `${formatTaxLabel(s.taxLabel)} ৳${taxAmount.toFixed(2)}${
                  s.taxRate ? ` (${Number(s.taxRate).toFixed(2)}%)` : ""
                }`
              : null,
            !isVoided && taxAmount > 0
              ? `করযোগ্য ৳${Number(s.taxableAmount ?? baseTotal).toFixed(2)}`
              : null,
          ].filter((value): value is string => Boolean(value));
          const statusPill = isVoided
            ? "bg-danger-soft text-danger border-danger/30"
            : hasRefundFlow && hasExchangeFlow
            ? "bg-warning-soft text-warning border-warning/30"
            : hasExchangeFlow
            ? "bg-primary-soft text-primary border-primary/30"
            : hasRefundFlow
            ? "bg-warning-soft text-warning border-warning/30"
            : "bg-success-soft text-success border-success/30";
          const statusText = isVoided
            ? "❌ বাতিল"
            : hasRefundFlow && hasExchangeFlow
            ? "↩️ রিটার্ন+এক্সচেঞ্জ"
            : hasExchangeFlow
            ? "🔁 এক্সচেঞ্জ"
            : hasRefundFlow
            ? "↩️ রিটার্ন"
            : "✅ পরিশোধিত";
          const accentBorder = isVoided
            ? "border-l-4 border-l-danger/60"
            : "border-l-4 border-l-success/60";

          return (
            <div
              key={s.id}
              className={`rounded-2xl border bg-card shadow-sm transition card-lift overflow-hidden hover:shadow-md ${accentBorder} ${
                isVoided ? "opacity-90 border-danger/30" : "border-border"
              }`}
            >
              <div className="space-y-2 p-3 sm:p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-1.5">
                    <div>
                      <p className="text-lg font-bold text-foreground sm:text-xl">
                        ৳ {displayTotalStr}
                      </p>
                      {hasReturnFlow && (
                        <p className="text-[11px] text-muted-foreground">
                          মূল বিল: ৳ {baseTotalStr}
                        </p>
                      )}
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border shadow-[0_1px_0_rgba(0,0,0,0.04)] ${statusPill}`}
                    >
                      {statusText}
                    </span>
                  </div>
                  {timeStr ? (
                    <span className="text-[11px] font-semibold text-muted-foreground whitespace-nowrap">
                      ⏱ {timeStr}
                    </span>
                  ) : null}
                </div>

                <p className="text-[12px] text-muted-foreground flex flex-wrap items-center gap-2 sm:text-sm">
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-foreground border border-border">
                    {paymentText}
                  </span>
                  {hasReturnFlow && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning border border-warning/30">
                      ↩️ {flowLabel}
                    </span>
                  )}
                  {!isVoided && discountAmount > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success border border-success/30">
                      ছাড় {discountAmount.toFixed(2)} ৳
                    </span>
                  ) : null}
                  {!isVoided && taxAmount > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary border border-primary/30">
                      {formatTaxLabel(s.taxLabel)} {taxAmount.toFixed(2)} ৳
                    </span>
                  ) : null}
                  {s.invoiceNo && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary border border-primary/30">
                      ইনভয়েস: {s.invoiceNo}
                    </span>
                  )}
                  {s.customerName && (
                    <span className="text-xs text-muted-foreground">
                      👤 {s.customerName}
                    </span>
                  )}
                </p>
                <div className="text-[12px] text-muted-foreground leading-snug break-words sm:text-[13px]">
                  <span>🧾 {itemLine}</span>
                  {hasExpandableMore ? (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedItems((current) => ({
                          ...current,
                          [s.id]: !current[s.id],
                        }))
                      }
                      className="ml-2 inline-flex items-center rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary-soft"
                    >
                      {isExpanded ? "কম দেখুন" : `+${moreMatch?.[2]} আরও`}
                    </button>
                  ) : null}
                </div>
                {compactMetaChips.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {compactMetaChips.map((chip) => (
                      <span
                        key={chip}
                        className="inline-flex items-center rounded-full border border-border/70 bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                ) : null}
                {isVoided && voidReason && (
                  <p className="text-xs text-danger">
                    বাতিলের কারণ: {voidReason}
                  </p>
                )}
                {hasReturnFlow && (
                  <p className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    {hasRefundFlow && hasExchangeFlow
                      ? `রিটার্ন+এক্সচেঞ্জ সমন্বয়: ${
                          returnNet > 0
                            ? `+৳${returnNetText}`
                            : returnNet < 0
                            ? `-৳${returnNetText}`
                            : "৳0.00"
                        } (চূড়ান্ত ৳${adjustedTotal.toFixed(2)})`
                      : hasExchangeFlow
                      ? `এক্সচেঞ্জ সমন্বয়: ${
                          returnNet > 0
                            ? `+৳${returnNetText}`
                            : returnNet < 0
                            ? `-৳${returnNetText}`
                            : "৳0.00"
                        } (চূড়ান্ত ৳${adjustedTotal.toFixed(2)})`
                      : hasRefundFlow
                      ? `রিটার্ন সমন্বয়: ${
                          returnNet > 0
                            ? `+৳${returnNetText}`
                            : returnNet < 0
                            ? `-৳${returnNetText}`
                            : "৳0.00"
                        } (চূড়ান্ত ৳${adjustedTotal.toFixed(2)})`
                      : `নেট সমন্বয়: ৳0.00 (চূড়ান্ত ৳${adjustedTotal.toFixed(2)})`}
                  </p>
                )}
                {hasReturnFlow && hasExchangeDetail && (
                  <p className="text-xs text-muted-foreground">
                    {latestReturnedPreview && latestExchangePreview
                      ? `🔄 বদল: ${latestReturnedPreview} → ${latestExchangePreview}`
                      : latestReturnedPreview
                      ? `↩️ ফেরত: ${latestReturnedPreview}`
                      : `🔁 এক্সচেঞ্জ: ${latestExchangePreview}`}
                  </p>
                )}
                {isDueSale && !isVoided && (
                  <p className="text-xs text-warning">
                    বাকির বিক্রি - পরিশোধ/বাতিলের আগে কাস্টমার হিসাব মিলিয়ে নিন
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 bg-muted/40 px-3 py-1.5 sm:px-4 sm:py-2">
                <div className="flex flex-wrap items-center gap-2">
                  {online && s.invoiceNo ? (
                    <Link
                      href={`/dashboard/sales/${s.id}/invoice`}
                      className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary border border-primary/30 hover:bg-primary/15"
                    >
                      ইনভয়েস দেখুন
                    </Link>
                  ) : null}
                  {online && !isVoided && canReturnSale ? (
                    <Link
                      href={`/dashboard/sales/${s.id}/return`}
                      className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-3 py-1 text-xs font-semibold text-warning border border-warning/30 hover:bg-warning/15"
                    >
                      রিটার্ন / এক্সচেঞ্জ
                    </Link>
                  ) : null}
                  {online && isDueSale && !isVoided && canEditDueSale ? (
                    <Link
                      href={`/dashboard/sales/${s.id}/edit`}
                      className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary border border-primary/30 hover:bg-primary/15"
                    >
                      বাকির বিল সম্পাদনা
                    </Link>
                  ) : null}
                  {isPending && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary border border-primary/30 shadow-sm">
                      ⏳ সিঙ্ক বাকি
                      {!online ? " · অফলাইন" : ""}
                    </span>
                  )}
                  {!online && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning border border-warning/30">
                      বাতিল করা যাবে না (অফলাইন)
                    </span>
                  )}
                  {online && isDueSale && !isVoided && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-3 py-1 text-xs font-semibold text-warning border border-warning/30">
                      বাকির বিল - বাতিলে due/cash সমন্বয় হবে
                    </span>
                  )}
                </div>
                {online && canVoidSale ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <form id={formId} action={voidSaleAction} />
                    <VoidSaleControls
                      saleId={s.id}
                      isVoided={isVoided}
                      formId={formId}
                    />
                  </div>
                ) : null}
              </div>
            </div>
            );
          })}
                </div>
              </div>
            );
          })
      )}

      {hasMore && (
        <div className="flex justify-center pt-2">
          {online && nextHref ? (
            <Link
              href={nextHref}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft text-primary border border-primary/30 px-4 py-2 text-sm font-semibold shadow-sm hover:bg-primary/15 hover:border-primary/40 transition"
            >
              ⬇️ আরও দেখুন
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="inline-flex items-center gap-1.5 rounded-full bg-muted px-4 py-2 text-sm font-semibold text-muted-foreground"
            >
              ⬇️ আরও দেখুন
            </button>
          )}
        </div>
      )}
    </div>
  );
}

