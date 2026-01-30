// app/dashboard/purchases/pay/page.tsx

import Link from "next/link";
import { cookies } from "next/headers";
import { getShopsByUser } from "@/app/actions/shops";
import { getPurchasesByShopPaginated } from "@/app/actions/purchases";
import { getSuppliersByShop } from "@/app/actions/suppliers";
import PurchasePaymentClient from "./purchase-payment-client";

type PurchasePayPageProps = {
  searchParams?: Promise<{
    shopId?: string;
    supplierId?: string;
    purchaseId?: string;
  }>;
};

export default async function PurchasePayPage({
  searchParams,
}: PurchasePayPageProps) {
  const shops = await getShopsByUser();
  const resolvedSearch = await searchParams;

  if (!shops || shops.length === 0) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">
          বাকি পরিশোধ
        </h1>
        <p className="mb-6 text-muted-foreground">এখনও কোনো দোকান নেই।</p>
        <Link
          href="/dashboard/shops/new"
          className="inline-block px-6 py-3 bg-primary-soft text-primary border border-primary/30 rounded-lg font-medium hover:bg-primary/15 hover:border-primary/40 transition-colors"
        >
          প্রথম দোকান তৈরি করুন
        </Link>
      </div>
    );
  }

  const cookieStore = await cookies();
  const cookieShopId = cookieStore.get("activeShopId")?.value;
  const cookieSelectedShopId =
    cookieShopId && shops.some((s) => s.id === cookieShopId)
      ? cookieShopId
      : null;

  const selectedShopId =
    resolvedSearch?.shopId &&
    shops.some((s) => s.id === resolvedSearch.shopId)
      ? resolvedSearch.shopId
      : cookieSelectedShopId ?? shops[0].id;

  const suppliers = await getSuppliersByShop(selectedShopId);

  const purchases = await getPurchasesByShopPaginated({
    shopId: selectedShopId,
    page: 1,
    pageSize: 50,
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_16px_36px_rgba(15,23,42,0.08)]">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          এপি পেমেন্ট
        </p>
        <h1 className="text-2xl font-bold text-foreground leading-tight tracking-tight sm:text-3xl">
          বাকি পরিশোধ
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          সরবরাহকারী ও ক্রয় নির্বাচন করে পরিশোধ করুন।
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_12px_26px_rgba(15,23,42,0.08)]">
        <p className="text-xs font-semibold text-muted-foreground">দ্রুত কাজ</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={`/dashboard/purchases/new?shopId=${selectedShopId}`}
            className="inline-flex h-10 items-center justify-center rounded-full bg-primary-soft text-primary border border-primary/30 px-4 text-sm font-semibold hover:bg-primary/15 hover:border-primary/40 transition-colors"
          >
            ➕ নতুন ক্রয়
          </Link>
          <Link
            href={`/dashboard/purchases?shopId=${selectedShopId}`}
            className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
          >
            ক্রয় তালিকা
          </Link>
          <Link
            href={`/dashboard/suppliers?shopId=${selectedShopId}`}
            className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
          >
            সরবরাহকারী তালিকা
          </Link>
        </div>
      </div>

      <PurchasePaymentClient
        shopId={selectedShopId}
        suppliers={suppliers}
        purchases={purchases.items}
        defaultSupplierId={resolvedSearch?.supplierId ?? ""}
        defaultPurchaseId={resolvedSearch?.purchaseId ?? ""}
      />
    </div>
  );
}
