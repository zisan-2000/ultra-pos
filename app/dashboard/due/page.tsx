// app/dashboard/due/page.tsx

import { cookies } from "next/headers";
import { getShopsByUser } from "@/app/actions/shops";
import { getCustomersByShop, getDueSummary } from "@/app/actions/customers";
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
        <h1 className="text-2xl font-bold mb-4 text-gray-900">ধার / বাকি</h1>
        <p className="text-gray-600">প্রথমে একটি দোকান তৈরি করুন।</p>
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

  const [customers, summary] = await Promise.all([
    getCustomersByShop(selectedShopId),
    getDueSummary(selectedShopId),
  ]);

  return (
    <div className="space-y-6 section-gap">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              🤝
            </span>
            <h1 className="text-3xl font-bold text-gray-900 leading-tight">
              ধার / বাকি
            </h1>
          </div>
          <p className="text-sm text-gray-500 mt-2 leading-snug">
            দোকান: <span className="font-semibold">{selectedShop.name}</span>
          </p>
          <p className="text-base text-gray-600 mt-2 leading-snug">
            গ্রাহকদের ধার-বাকি লিখে রাখুন এবং পেমেন্ট নিন।
          </p>
        </div>

        <DueShopSelector shops={shops} selectedShopId={selectedShopId} />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <DuePageClient
          key={selectedShopId}
          shopId={selectedShopId}
          shopName={selectedShop.name}
          initialCustomers={customers as any}
          initialSummary={summary as any}
        />
      </div>
    </div>
  );
}
