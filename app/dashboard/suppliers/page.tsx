// app/dashboard/suppliers/page.tsx

import Link from "next/link";
import { cookies } from "next/headers";
import { getShopsByUser } from "@/app/actions/shops";
import { getSuppliersByShop } from "@/app/actions/suppliers";
import ShopSelectorClient from "../purchases/ShopSelectorClient";
import SuppliersClient from "./suppliers-client";
import DashboardManualRefresh from "@/components/dashboard-manual-refresh";
import { requireUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/rbac";
import { resolveInventoryModuleEnabled } from "@/lib/accounting/cogs";

type SuppliersPageProps = {
  searchParams?: Promise<{ shopId?: string }>;
};

export default async function SuppliersPage({ searchParams }: SuppliersPageProps) {
  const [user, shops, resolvedSearch] = await Promise.all([
    requireUser(),
    getShopsByUser(),
    searchParams,
  ]);
  const canViewSuppliers = hasPermission(user, "view_suppliers");
  const canCreatePurchase = hasPermission(user, "create_purchase");
  const canCreatePurchasePayment = hasPermission(user, "create_purchase_payment");

  if (!canViewSuppliers) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">সরবরাহকারী</h1>
        <p className="mb-2 text-danger font-semibold">অ্যাকসেস সীমাবদ্ধ</p>
        <p className="mb-6 text-muted-foreground">
          এই পেজ ব্যবহারের জন্য <code>view_suppliers</code> permission লাগবে।
        </p>
        <Link
          href="/dashboard"
          className="inline-block px-6 py-3 bg-primary-soft text-primary border border-primary/30 rounded-lg font-medium hover:bg-primary/15 hover:border-primary/40 transition-colors"
        >
          ড্যাশবোর্ডে ফিরুন
        </Link>
      </div>
    );
  }

  if (!shops || shops.length === 0) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">
          সরবরাহকারী
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

  const selectedShop = shops.find((s) => s.id === selectedShopId)!;
  const hasInventoryModule = resolveInventoryModuleEnabled(selectedShop);
  if (!hasInventoryModule) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">সরবরাহকারী</h1>
        <p className="mb-2 text-warning font-semibold">মডিউল বন্ধ আছে</p>
        <p className="mb-6 text-muted-foreground">
          এই দোকানে <code>Purchases/Suppliers</code> module এখনো চালু করা হয়নি।
        </p>
        <Link
          href={`/dashboard/shops/${selectedShopId}`}
          className="inline-block px-6 py-3 bg-primary-soft text-primary border border-primary/30 rounded-lg font-medium hover:bg-primary/15 hover:border-primary/40 transition-colors"
        >
          দোকানের সেটিংসে যান
        </Link>
      </div>
    );
  }
  const suppliers = await getSuppliersByShop(selectedShopId);

  return (
    <div className="space-y-4 sm:space-y-5 section-gap">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_16px_36px_rgba(15,23,42,0.08)] animate-fade-in">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-soft/60 via-card to-card" />
        <div className="pointer-events-none absolute -top-16 right-0 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                সরবরাহকারী
              </p>
              <p className="text-3xl font-bold tabular-nums leading-tight text-foreground sm:text-4xl">
                {suppliers.length.toLocaleString("bn-BD")}
              </p>
              <p className="text-xs text-muted-foreground">{selectedShop.name}</p>
            </div>
            <div className="flex items-center gap-2">
              <DashboardManualRefresh label="রিফ্রেশ" className="h-9 px-3 text-xs" />
            </div>
          </div>
          <ShopSelectorClient shops={shops} selectedShopId={selectedShopId} />
        </div>
      </div>

      <SuppliersClient shopId={selectedShopId} suppliers={suppliers} />
    </div>
  );
}
