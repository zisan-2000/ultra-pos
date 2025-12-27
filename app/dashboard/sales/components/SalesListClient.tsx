// app/dashboard/sales/components/SalesListClient.tsx

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { db } from "@/lib/dexie/db";
import { VoidSaleControls } from "./VoidSaleControls";

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
  const online = useOnlineStatus();
  const [items, setItems] = useState<SaleSummary[]>(sales);

  // Seed Dexie when online; load from Dexie when offline.
  useEffect(() => {
    if (online) {
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
        console.warn("Persist cached sales failed", err);
      }
      return;
    }

    db.sales
      .where("shopId")
      .equals(shopId)
      .toArray()
      .then((rows) => {
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
          };
        });

        mapped.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setItems(mapped);
      })
      .catch((err) => {
        console.error("Load offline sales failed", err);
      });
  }, [online, sales, shopId]);

  const renderedItems = useMemo(() => items, [items]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {!online && (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-1 text-xs font-semibold text-orange-700 border border-orange-100">
              📡 Offline - শুধু দেখা যাবে
            </span>
          )}
          {page > 1 && prevHref && (
            <Link
              href={prevHref}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              ⬆️ নতুনগুলো
            </Link>
          )}
        </div>
        <span className="text-xs text-slate-500">পৃষ্ঠা {page}</span>
      </div>

      {renderedItems.length === 0 ? (
        <p className="text-center text-gray-600 py-10">
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
          const itemLine =
            s.itemPreview ||
            (s.itemCount > 0
              ? `${s.itemCount} আইটেম`
              : "কোন আইটেম সংযুক্ত নেই");
          const timeStr = formatTime(s.createdAt);
          const dateStr = formatDate(s.createdAt);
          const formId = `void-sale-${s.id}`;
          const statusPill = isVoided
            ? "bg-red-100 text-red-700 border-red-200"
            : "bg-emerald-50 text-emerald-700 border-emerald-100";
          const statusText = isVoided ? "❌ বাতিল" : "✅ পরিশোধিত";

          return (
            <div
              key={s.id}
              className={`rounded-2xl border bg-white p-4 shadow-sm hover:shadow-md transition card-lift ${
                isVoided ? "opacity-90 border-red-100" : "border-slate-100"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <p className="text-2xl font-bold text-gray-900">
                      ৳ {totalStr}
                    </p>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold border ${statusPill}`}
                    >
                      {statusText}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700 border border-slate-100">
                      {paymentText}
                    </span>
                    {s.customerName && (
                      <span className="text-xs text-slate-500">
                        👤 {s.customerName}
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-gray-600 flex items-center gap-2">
                    🧾 {itemLine}
                  </p>
                  {isVoided && voidReason && (
                    <p className="text-xs text-red-600 mt-1">
                      বাতিলের কারণ: {voidReason}
                    </p>
                  )}
                  {isDueSale && !isVoided && (
                    <p className="text-xs text-amber-600">
                      বাকির বিক্রি – কাস্টমার লেজারে পরিশোধ করুন
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2">
                  <div className="text-right text-xs text-slate-500">
                    <p className="font-semibold flex items-center gap-1 justify-end">
                      ⏱ {timeStr}
                    </p>
                    <p>{dateStr}</p>
                  </div>

                  {!online && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-1 text-[11px] font-semibold text-orange-700 border border-orange-100">
                      বাতিল করা যাবে না (Offline)
                    </span>
                  )}

                  {online ? (
                    isDueSale ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700 border border-amber-100">
                        বাকির বিল – বাতিল নয়
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <form id={formId} action={voidSaleAction} />
                        <VoidSaleControls
                          saleId={s.id}
                          isVoided={isVoided}
                          formId={formId}
                        />
                      </div>
                    )
                  ) : null}
                </div>
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
              className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition"
            >
              ⬇️ আরও দেখুন
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-400"
            >
              ⬇️ আরও দেখুন
            </button>
          )}
        </div>
      )}
    </div>
  );
}
