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

type SaleSummary = {
  id: string;
  totalAmount: string;
  paymentMethod: string;
  status?: string | null;
  voidReason?: string | null;
  createdAt: string; // ISO string
  itemCount: number;
  itemPreview: string;
  customerName: string | null;
  syncStatus?: "new" | "synced";
};

type Props = {
  shopId: string;
  sales: SaleSummary[];
  page: number;
  prevHref: string | null;
  nextHref: string | null;
  hasMore: boolean;
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

export default function SalesListClient({
  shopId,
  sales,
  page,
  prevHref,
  nextHref,
  hasMore,
  voidSaleAction,
}: Props) {
  const router = useRouter();
  const online = useOnlineStatus();
  const { pendingCount, syncing, lastSyncAt } = useSyncStatus();
  const [items, setItems] = useState<SaleSummary[]>(sales);
  const serverSnapshotRef = useRef(sales);
  const refreshInFlightRef = useRef(false);
  const lastRefreshAtRef = useRef(0);
  const REFRESH_MIN_INTERVAL_MS = 15_000;
  const lastEventAtRef = useRef(0);
  const POLL_INTERVAL_MS = 15_000;
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
    if (!online) return;
    const intervalId = setInterval(() => {
      const now = Date.now();
      if (now - lastEventAtRef.current < POLL_INTERVAL_MS / 2) return;
      if (refreshInFlightRef.current) return;
      if (syncing || pendingCount > 0) return;
      if (now - lastRefreshAtRef.current < REFRESH_MIN_INTERVAL_MS) return;
      lastRefreshAtRef.current = now;
      refreshInFlightRef.current = true;
      router.refresh();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [online, router, syncing, pendingCount]);

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
            const cached = localStorage.getItem(`cachedSales:${shopId}`);
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
            totalAmount: r.totalAmount,
            paymentMethod: payment,
            status: (r as any).status ?? "COMPLETED",
            voidReason: (r as any).voidReason ?? null,
            createdAt: created,
            itemCount,
            itemPreview,
            customerName: (r as any).customerName ?? null,
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

      setItems(sales);
      const rows = sales.map((s) => ({
        tempId: s.id,
        id: s.id,
        shopId,
        items: [],
        paymentMethod: s.paymentMethod,
        customerId: null,
        note: "",
        totalAmount: s.totalAmount,
        createdAt: new Date(s.createdAt).getTime(),
        syncStatus: "synced" as const,
        itemCount: s.itemCount,
        itemPreview: s.itemPreview,
        customerName: s.customerName,
        status: s.status ?? "COMPLETED",
        voidReason: s.voidReason ?? null,
      }));
      db.sales.bulkPut(rows).catch((err) => {
        console.error("Seed Dexie sales failed", err);
      });
      try {
        localStorage.setItem(`cachedSales:${shopId}`, JSON.stringify(sales));
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
          const totalStr = Number(s.totalAmount || 0).toFixed(2);
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
          const statusPill = isVoided
            ? "bg-danger-soft text-danger border-danger/30"
            : "bg-success-soft text-success border-success/30";
          const statusText = isVoided ? "❌ বাতিল" : "✅ পরিশোধিত";
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
                    <p className="text-lg font-bold text-foreground sm:text-xl">
                      ৳ {totalStr}
                    </p>
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
                {isDueSale && !isVoided && (
                  <p className="text-xs text-warning">
                    বাকির বিক্রি – কাস্টমার লেজারে পরিশোধ করুন
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 bg-muted/40 px-3 py-1.5 sm:px-4 sm:py-2">
                <div className="flex flex-wrap items-center gap-2">
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
                      বাকির বিল – বাতিল নয়
                    </span>
                  )}
                </div>
                {online && !isDueSale ? (
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

