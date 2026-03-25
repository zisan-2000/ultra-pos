// app/dashboard/sales/components/SalesListClient.tsx

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { useSyncStatus } from "@/lib/sync/sync-status";
import { db } from "@/lib/dexie/db";
import { VoidSaleControls } from "./VoidSaleControls";
import { handlePermissionError } from "@/lib/permission-toast";
import { reportEvents, type ReportEventData } from "@/lib/events/reportEvents";
import { useRealtimeStatus } from "@/lib/realtime/status";
import { usePageVisibility } from "@/lib/use-page-visibility";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";

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

function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("bn-BD", {
    month: "short",
    day: "numeric",
  });
}

function formatTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("bn-BD", {
    hour: "2-digit",
    minute: "2-digit",
  });
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
  const realtime = useRealtimeStatus();
  const isVisible = usePageVisibility();
  const { pendingCount, syncing, lastSyncAt } = useSyncStatus();
  const [items, setItems] = useState<SaleSummary[]>(sales);
  const serverSnapshotRef = useRef(sales);
  const refreshInFlightRef = useRef(false);
  const lastRefreshAtRef = useRef(0);
  const REFRESH_MIN_INTERVAL_MS = 2_000;
  const lastEventAtRef = useRef(0);
  const wasVisibleRef = useRef(isVisible);
  const pollIntervalMs = realtime.connected ? 60_000 : 10_000;
  const pollingEnabled = !realtime.connected;
  const EVENT_DEBOUNCE_MS = 800;

  useEffect(() => {
    if (serverSnapshotRef.current !== sales) {
      serverSnapshotRef.current = sales;
      refreshInFlightRef.current = false;
    }
  }, [sales]);

  useEffect(() => {
    if (!online || !lastSyncAt || syncing || pendingCount > 0) return;
    if (refreshInFlightRef.current) return;
    const now = Date.now();
    if (now - lastRefreshAtRef.current < REFRESH_MIN_INTERVAL_MS) return;
    lastRefreshAtRef.current = now;
    refreshInFlightRef.current = true;
    router.refresh();
  }, [online, lastSyncAt, syncing, pendingCount, router]);

  useEffect(() => {
    if (!online) return;

    const handleSaleUpdate = (event: ReportEventData) => {
      if (event.shopId !== shopId) return;
      if (event.metadata?.source === "ui") return;
      const now = event.timestamp ?? Date.now();
      if (now - lastEventAtRef.current < EVENT_DEBOUNCE_MS) return;
      if (refreshInFlightRef.current) return;
      if (now - lastRefreshAtRef.current < REFRESH_MIN_INTERVAL_MS) return;
      lastEventAtRef.current = now;
      lastRefreshAtRef.current = now;
      refreshInFlightRef.current = true;
      router.refresh();
    };

    const listenerId = reportEvents.addListener(
      "sale-update",
      handleSaleUpdate,
      { shopId, priority: 5 }
    );

    return () => {
      reportEvents.removeListener(listenerId);
    };
  }, [online, router, shopId]);

  useEffect(() => {
    if (!online || !isVisible || !pollingEnabled) return;
    const intervalId = setInterval(() => {
      const now = Date.now();
      if (now - lastEventAtRef.current < pollIntervalMs / 2) return;
      if (refreshInFlightRef.current) return;
      if (syncing || pendingCount > 0) return;
      if (now - lastRefreshAtRef.current < REFRESH_MIN_INTERVAL_MS) return;
      lastRefreshAtRef.current = now;
      refreshInFlightRef.current = true;
      router.refresh();
    }, pollIntervalMs);

    return () => clearInterval(intervalId);
  }, [
    online,
    isVisible,
    pollingEnabled,
    router,
    syncing,
    pendingCount,
    pollIntervalMs,
  ]);

  useEffect(() => {
    if (!online) return;
    if (wasVisibleRef.current === isVisible) return;
    wasVisibleRef.current = isVisible;
    if (!isVisible) return;
    const now = Date.now();
    if (refreshInFlightRef.current) return;
    if (syncing || pendingCount > 0) return;
    if (now - lastRefreshAtRef.current < REFRESH_MIN_INTERVAL_MS) return;
    lastEventAtRef.current = now;
    lastRefreshAtRef.current = now;
    refreshInFlightRef.current = true;
    router.refresh();
  }, [online, isVisible, router, syncing, pendingCount]);

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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {!online && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning border border-warning/30">
              📡 Offline - শুধু দেখা যাবে
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
        <span className="text-xs text-muted-foreground">পৃষ্ঠা {page}</span>
      </div>

      {renderedItems.length === 0 ? (
        <p className="text-center text-muted-foreground py-10">
          {online
            ? "এই তারিখে কোনো বিক্রি নেই"
            : "Offline: সর্বশেষ সিঙ্ককৃত বিক্রিগুলো দেখাচ্ছে"}
        </p>
      ) : (
        renderedItems.map((s) => {
          const isVoided = (s.status || "").toUpperCase() === "VOIDED";
          const voidReason = s.voidReason || "";
          const paymentKey = s.paymentMethod?.toLowerCase?.() || "cash";
          const paymentText =
            paymentLabels[paymentKey] || s.paymentMethod || "নগদ";
          const isDueSale = paymentKey === "due";
          const isPending = s.syncStatus === "new";
          const itemLine =
            s.itemPreview ||
            (s.itemCount > 0
              ? `${s.itemCount} আইটেম`
              : "কোন আইটেম সংযুক্ত নেই");
          const timeStr = formatTime(s.createdAt);
          const dateStr = formatDate(s.createdAt);
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
              <div className="space-y-1.5 p-2.5 sm:p-3">
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
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
                  <div className="text-left text-[11px] text-muted-foreground sm:text-xs sm:text-right">
                    <p className="font-semibold flex items-center gap-1 justify-start sm:justify-end">
                      ⏱ {timeStr}
                    </p>
                    <p>{dateStr}</p>
                  </div>
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
                      {(s.taxLabel || "VAT").trim()} {taxAmount.toFixed(2)} ৳
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
                <p className="text-[12px] text-muted-foreground flex items-center gap-1.5 leading-snug break-words line-clamp-1 sm:text-[13px] sm:line-clamp-2">
                  🧾 {itemLine}
                </p>
                {isVoided && voidReason && (
                  <p className="text-xs text-danger">
                    বাতিলের কারণ: {voidReason}
                  </p>
                )}
                {!isVoided && discountAmount > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Discount: ৳{discountAmount.toFixed(2)} কমেছে
                    {s.discountType === "percent" && s.discountValue
                      ? ` (${Number(s.discountValue).toFixed(2)}%)`
                      : ""}
                    {" "}· সাব-টোটাল ৳{subtotalAmount.toFixed(2)}
                  </p>
                ) : null}
                {!isVoided && taxAmount > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {(s.taxLabel || "VAT").trim()}: ৳{taxAmount.toFixed(2)}
                    {s.taxRate ? ` (${Number(s.taxRate).toFixed(2)}%)` : ""}
                    {" "}· taxable ৳{Number(s.taxableAmount ?? baseTotal).toFixed(2)}
                  </p>
                ) : null}
                {hasReturnFlow && (
                  <p className="text-xs text-muted-foreground">
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
                      Due Edit / Reissue
                    </Link>
                  ) : null}
                  {!online && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning border border-warning/30">
                      বাতিল করা যাবে না (Offline)
                    </span>
                  )}
                  {!online && isPending && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning border border-warning/30">
                      Pending sync
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

