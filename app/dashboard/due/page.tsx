// app/dashboard/due/page.tsx

import Link from "next/link";
import { cookies } from "next/headers";
import { getShopsByUser } from "@/app/actions/shops";
import { getCustomersByShop } from "@/app/actions/customers";
import DuePageClient from "./DuePageClient";
import DueShopSelector from "./ShopSelector";

type DuePageProps = {
  searchParams?: Promise<{ shopId?: string } | undefined>;
};

export default async function DuePage({ searchParams }: DuePageProps) {
  const shops = await getShopsByUser();
  const resolvedSearch = await searchParams;

  if (!shops || shops.length === 0) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">ধার / বাকি</h1>
        <p className="mb-6 text-muted-foreground">প্রথমে একটি দোকান তৈরি করুন।</p>
        <Link
          href="/dashboard/shops/new"
          className="inline-block px-6 py-3 bg-primary-soft text-primary border border-primary/30 rounded-lg font-medium hover:bg-primary/15 hover:border-primary/40 transition-colors"
        >
          দোকান তৈরি করুন
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
    resolvedSearch?.shopId && shops.some((s) => s.id === resolvedSearch.shopId)
      ? resolvedSearch.shopId
      : cookieSelectedShopId ?? shops[0].id;

  const selectedShop = shops.find((s) => s.id === selectedShopId)!;

  const customers = await getCustomersByShop(selectedShopId);

  return (
    <div className="space-y-4 sm:space-y-5 section-gap">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_16px_36px_rgba(15,23,42,0.08)] animate-fade-in">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-soft/60 via-card to-card" />
        <div className="pointer-events-none absolute -top-16 right-0 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative space-y-3 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                বাকি
              </p>
              <h1 className="text-2xl font-bold text-foreground leading-tight tracking-tight sm:text-3xl">
                ধার / বাকি
              </h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1 min-w-0">
                দোকান:
                <span className="truncate font-semibold text-foreground">
                  {selectedShop.name}
                </span>
              </p>
            </div>
            <p className="text-sm text-muted-foreground sm:max-w-[240px]">
              গ্রাহকের বাকি ট্র্যাক করুন, পেমেন্ট নিন এবং হিসাব পরিষ্কার রাখুন।
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="w-full sm:w-auto">
              <DueShopSelector shops={shops} selectedShopId={selectedShopId} />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex h-7 items-center gap-1 rounded-full bg-card/80 px-3 font-semibold text-foreground border border-border">
                লাইভ সিঙ্ক
              </span>
              <span className="inline-flex h-7 items-center gap-1 rounded-full bg-card/80 px-3 font-semibold text-muted-foreground border border-border">
                অফলাইন ব্যাকআপ
              </span>
              <span className="inline-flex h-7 items-center gap-1 rounded-full bg-card/80 px-3 font-semibold text-muted-foreground border border-border">
                দ্রুত পেমেন্ট
              </span>
            </div>
          </div>
        </div>
      </div>

      <DuePageClient
        key={selectedShopId}
        shopId={selectedShopId}
        shopName={selectedShop.name}
        initialCustomers={customers as any}
      />
    </div>
  );
}


