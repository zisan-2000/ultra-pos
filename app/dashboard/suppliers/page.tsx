// app/dashboard/suppliers/page.tsx

import Link from "next/link";
import { cookies } from "next/headers";
import { getShopsByUser } from "@/app/actions/shops";
import { getSuppliersByShop } from "@/app/actions/suppliers";
import ShopSelectorClient from "../purchases/ShopSelectorClient";
import SuppliersClient from "./suppliers-client";

type SuppliersPageProps = {
  searchParams?: Promise<{ shopId?: string }>;
};

export default async function SuppliersPage({ searchParams }: SuppliersPageProps) {
  const shops = await getShopsByUser();
  const resolvedSearch = await searchParams;

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
  const suppliers = await getSuppliersByShop(selectedShopId);

  return (
    <div className="space-y-4 sm:space-y-5 section-gap">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_16px_36px_rgba(15,23,42,0.08)] animate-fade-in">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-soft/50 via-card to-card" />
        <div className="pointer-events-none absolute -top-16 right-0 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative space-y-3 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                এপি লেজার
              </p>
              <h1 className="text-2xl font-bold text-foreground leading-tight tracking-tight sm:text-3xl">
                সরবরাহকারী তালিকা
              </h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1 min-w-0">
                দোকান:
                <span className="truncate font-semibold text-foreground">
                  {selectedShop.name}
                </span>
              </p>
            </div>
            <div className="w-full sm:w-auto">
              <ShopSelectorClient
                shops={shops}
                selectedShopId={selectedShopId}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_12px_26px_rgba(15,23,42,0.08)]">
        <p className="text-xs font-semibold text-muted-foreground">দ্রুত কাজ</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={`/dashboard/purchases/new?shopId=${selectedShopId}`}
            className="inline-flex h-10 items-center justify-center rounded-full bg-primary-soft text-primary border border-primary/30 px-4 text-sm font-semibold shadow-sm hover:bg-primary/15 hover:border-primary/40 transition-colors"
          >
            ➕ নতুন ক্রয়
          </Link>
          <Link
            href={`/dashboard/purchases/pay?shopId=${selectedShopId}`}
            className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
          >
            বাকি পরিশোধ
          </Link>
          <Link
            href={`/dashboard/purchases?shopId=${selectedShopId}`}
            className="inline-flex h-10 items-center justify-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
          >
            ক্রয় তালিকা
          </Link>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          স্টেটমেন্ট দেখতে যে কোনো সরবরাহকারীর কার্ডে “স্টেটমেন্ট” চাপুন।
        </p>
      </div>

      <SuppliersClient shopId={selectedShopId} suppliers={suppliers} />
    </div>
  );
}
