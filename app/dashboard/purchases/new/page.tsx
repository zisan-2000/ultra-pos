// app/dashboard/purchases/new/page.tsx

import Link from "next/link";
import { cookies } from "next/headers";
import { getShopsByUser } from "@/app/actions/shops";
import { getProductsByShop } from "@/app/actions/products";
import { getSuppliersByShop } from "@/app/actions/suppliers";
import PurchaseFormClient from "./PurchaseFormClient";
import { requireUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/rbac";
import { resolveInventoryModuleEnabled } from "@/lib/accounting/cogs";

type PurchaseNewPageProps = {
  searchParams?: Promise<{ shopId?: string }>;
};

export default async function PurchaseNewPage({
  searchParams,
}: PurchaseNewPageProps) {
  const [user, shops, resolvedSearch] = await Promise.all([
    requireUser(),
    getShopsByUser(),
    searchParams,
  ]);
  const canCreatePurchase = hasPermission(user, "create_purchase");
  const canViewProducts = hasPermission(user, "view_products");
  const canViewSuppliers = hasPermission(user, "view_suppliers");

  if (!canCreatePurchase) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">নতুন পণ্য ক্রয়</h1>
        <p className="mb-2 text-danger font-semibold">অ্যাকসেস সীমাবদ্ধ</p>
        <p className="mb-6 text-muted-foreground">
          নতুন ক্রয় যোগ করতে <code>create_purchase</code> permission লাগবে।
        </p>
        <Link
          href="/dashboard/purchases"
          className="inline-block px-6 py-3 bg-primary-soft text-primary border border-primary/30 rounded-lg font-medium hover:bg-primary/15 hover:border-primary/40 transition-colors"
        >
          ক্রয় তালিকায় ফিরুন
        </Link>
      </div>
    );
  }

  if (!canViewProducts || !canViewSuppliers) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">নতুন পণ্য ক্রয়</h1>
        <p className="mb-2 text-danger font-semibold">অ্যাকসেস অসম্পূর্ণ</p>
        <p className="mb-6 text-muted-foreground">
          এই ফর্ম ব্যবহার করতে <code>view_products</code> এবং <code>view_suppliers</code>{" "}
          permission লাগবে।
        </p>
        <Link
          href="/dashboard/purchases"
          className="inline-block px-6 py-3 bg-primary-soft text-primary border border-primary/30 rounded-lg font-medium hover:bg-primary/15 hover:border-primary/40 transition-colors"
        >
          ক্রয় তালিকায় ফিরুন
        </Link>
      </div>
    );
  }

  if (!shops || shops.length === 0) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">
          পণ্য ক্রয় যোগ
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
        <h1 className="text-2xl font-bold mb-4 text-foreground">নতুন পণ্য ক্রয়</h1>
        <p className="mb-2 text-warning font-semibold">মডিউল বন্ধ আছে</p>
        <p className="mb-6 text-muted-foreground">
          এই দোকানে <code>Purchases/Suppliers</code> module চালু না থাকায় নতুন ক্রয় যোগ করা যাবে না।
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
  const [products, suppliers] = await Promise.all([
    getProductsByShop(selectedShopId),
    getSuppliersByShop(selectedShopId),
  ]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-soft/50 via-card to-card" />
        <div className="pointer-events-none absolute -top-12 right-0 h-32 w-32 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative flex items-start justify-between gap-3 p-4">
          <div className="space-y-0.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              স্টক ইন
            </p>
            <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-3xl">
              নতুন পণ্য ক্রয়
            </h1>
            <p className="text-xs text-muted-foreground">
              দোকান: <span className="font-semibold">{selectedShop.name}</span>
            </p>
          </div>
          <Link
            href={`/dashboard/purchases?shopId=${selectedShopId}`}
            className="inline-flex h-9 shrink-0 items-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground shadow-sm hover:bg-muted transition-colors"
          >
            ← ফিরে যান
          </Link>
        </div>
      </div>

      <PurchaseFormClient
        shopId={selectedShopId}
        shopName={selectedShop.name}
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          baseUnit: p.baseUnit || "pcs",
          buyPrice: p.buyPrice?.toString?.() ?? null,
          stockQty: p.stockQty?.toString?.() ?? null,
          trackStock: p.trackStock,
          trackSerialNumbers: Boolean((p as any).trackSerialNumbers),
          trackBatch: Boolean((p as any).trackBatch),
          variants: (p.variants ?? [])
            .filter((v: any) => v.isActive !== false)
            .map((v: any) => ({
              id: v.id,
              label: v.label,
              buyPrice: v.buyPrice?.toString?.() ?? null,
              stockQty: v.stockQty?.toString?.() ?? "0",
            })),
          unitConversions: (p.unitConversions ?? [])
            .filter((conversion: any) => conversion.isActive !== false)
            .map((conversion: any) => ({
              id: conversion.id,
              label: conversion.label,
              baseUnitQuantity:
                conversion.baseUnitQuantity?.toString?.() ??
                String(conversion.baseUnitQuantity ?? "0"),
            })),
        }))}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
      />
    </div>
  );
}
