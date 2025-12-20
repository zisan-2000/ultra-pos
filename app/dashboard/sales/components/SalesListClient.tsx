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

type PageLink = { page: number; href: string | null };

type Props = {
  shopId: string;
  sales: SaleSummary[];
  page: number;
  pageLinks: PageLink[];
  prevHref: string | null;
  nextHref: string | null;
  showPagination: boolean;
  voidSaleAction: (formData: FormData) => Promise<void>;
};

function formatBanglaDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("bn-BD", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SalesListClient({
  shopId,
  sales,
  page,
  pageLinks,
  prevHref,
  nextHref,
  showPagination,
  voidSaleAction,
}: Props) {
  const online = useOnlineStatus();
  const [items, setItems] = useState<SaleSummary[]>(sales);
  const paymentLabels: Record<string, string> = {
    cash: "নগদ",
    bkash: "বিকাশ",
    nagad: "নগদ",
    card: "কার্ড",
    bank_transfer: "ব্যাংক ট্রান্সফার",
    due: "বকেয়া",
  };

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
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setItems(mapped);
      })
      .catch((err) => {
        console.error("Load offline sales failed", err);
      });
  }, [online, sales, shopId]);

  const renderedItems = useMemo(() => items, [items]);
  const renderPayment = (paymentMethod: string, customerName: string | null) => {
    const key = paymentMethod?.toLowerCase?.() || "cash";
    const label = paymentLabels[key] || paymentMethod || "অজানা";
    if (key === "due" && customerName) {
      return `বকেয়া | ক্রেতা: ${customerName}`;
    }
    return `পেমেন্টঃ ${label}`;
  };

  return (
    <div className="space-y-4">
      {renderedItems.length === 0 ? (
        <p className="text-center text-gray-600 py-8">
          {online ? "এখনও কোনো বিক্রি পাওয়া যায়নি" : "Offline: সর্বশেষ সিঙ্কের ডেটা লোড হচ্ছে না"}
        </p>
      ) : (
        renderedItems.map((s) => {
          const isVoided = (s.status || "").toUpperCase() === "VOIDED";
          const voidReason = s.voidReason || "";
          const createdAtStr = formatBanglaDate(s.createdAt);
          const totalStr = Number(s.totalAmount || 0).toFixed(2);
          const paymentText = renderPayment(s.paymentMethod, s.customerName);
          const paymentKey = s.paymentMethod?.toLowerCase?.() || "cash";
          const isDueSale = paymentKey === "due";
          const itemLine =
            s.itemPreview ||
            (s.itemCount > 0 ? `${s.itemCount} আইটেম` : "আইটেম পাওয়া যায়নি");
          const formId = `void-sale-${s.id}`;

          return (
            <div
              key={s.id}
              className={`bg-white rounded-xl p-5 flex justify-between items-start gap-4 shadow-sm hover:shadow-md card-lift border ${
                isVoided ? "border-gray-200" : "border-red-200 bg-red-50/60"
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-bold text-gray-900">{totalStr} ৳</p>
                  {isVoided && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
                      বাতিল করা হয়েছে
                    </span>
                  )}
                </div>
                <p className="text-base text-gray-600">{paymentText}</p>
                <p className="text-sm text-gray-500">আইটেমঃ {itemLine}</p>
                {isVoided && voidReason && (
                  <p className="text-xs text-red-600 mt-1">বাতিলের কারণঃ {voidReason}</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <p className="text-sm text-gray-500 text-right">{createdAtStr}</p>
                {!online && (
                  <p className="text-xs text-slate-400 text-right">
                    Offline view (read-only)
                  </p>
                )}
                {online ? (
                  isDueSale ? (
                    <div className="flex flex-col items-end gap-1 text-right">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-50 border border-amber-200 text-[11px] font-semibold text-amber-700">
                        ⚠️ ধার বিক্রি সরাসরি বাতিল করা যায় না
                      </span>
                      <span className="text-[11px] text-slate-500">
                        কাস্টমার লেজার থেকে অ্যাডজাস্ট করুন
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <form id={formId} action={voidSaleAction} />
                      <VoidSaleControls saleId={s.id} isVoided={isVoided} formId={formId} />
                    </div>
                  )
                ) : (
                  <p className="text-[11px] text-slate-400">অনলাইনে এলে বাতিল করা যাবে</p>
                )}
              </div>
            </div>
          );
        })
      )}

      {showPagination && online && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">পৃষ্ঠা {page}</p>
          <div className="flex flex-wrap items-center gap-2">
            {prevHref ? (
              <Link
                href={prevHref}
                className="px-3 py-1 text-sm rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                আগের
              </Link>
            ) : (
              <span className="px-3 py-1 text-sm rounded-md border border-slate-200 text-slate-400">
                আগের
              </span>
            )}

            {pageLinks.map(({ page: pageNumber, href }) => {
              if (pageNumber === page || !href) {
                return (
                  <span
                    key={pageNumber}
                    className="px-3 py-1 text-sm rounded-md border border-slate-200 bg-slate-100 text-slate-700"
                  >
                    {pageNumber}
                  </span>
                );
              }
              return (
                <Link
                  key={pageNumber}
                  href={href}
                  className="px-3 py-1 text-sm rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  {pageNumber}
                </Link>
              );
            })}

            {nextHref ? (
              <Link
                href={nextHref}
                className="px-3 py-1 text-sm rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                পরের
              </Link>
            ) : (
              <span className="px-3 py-1 text-sm rounded-md border border-slate-200 text-slate-400">
                পরের
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
