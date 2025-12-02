// app/dashboard/sales/page.tsx

import Link from "next/link";
import { getShopsByUser } from "@/app/actions/shops";
import { getSalesByShop } from "@/app/actions/sales";
import ShopSelectorClient from "./ShopSelectorClient";

type SalesPageProps = {
  searchParams?: Promise<{ shopId?: string } | undefined>;
};

export default async function SalesPage({ searchParams }: SalesPageProps) {
  const shops = await getShopsByUser();
  const resolvedSearch = await searchParams;

  if (!shops || shops.length === 0) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-gray-900">বিক্রি তালিকা</h1>
        <p className="mb-6 text-gray-600">এখনও কোনো দোকান নেই।</p>
        <Link
          href="/dashboard/shops/new"
          className="inline-block px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
        >
          প্রথম দোকান তৈরি করুন
        </Link>
      </div>
    );
  }

  const selectedShopId =
    resolvedSearch?.shopId &&
    shops.some((s) => s.id === resolvedSearch.shopId)
      ? resolvedSearch.shopId
      : shops[0].id;

  const selectedShop = shops.find((s) => s.id === selectedShopId)!;

  const sales = await getSalesByShop(selectedShopId);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">বিক্রি তালিকা</h1>
          <p className="text-sm text-gray-500 mt-2">
            দোকান: <span className="font-semibold">{selectedShop.name}</span>
          </p>
        </div>

        <div className="flex gap-3 items-center w-full lg:w-auto">
          <ShopSelectorClient shops={shops} selectedShopId={selectedShopId} />

          <Link
            href={`/dashboard/sales/new?shopId=${selectedShopId}`}
            className="w-full lg:w-auto px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors text-center"
          >
            ➕ নতুন বিক্রি
          </Link>
        </div>
      </div>

      <div className="space-y-4">
        {sales.length === 0 ? (
          <p className="text-center text-gray-600 py-8 bg-white border border-slate-200 rounded-xl">
            এখনও কোনো বিক্রি নেই।
          </p>
        ) : (
          sales.map((s) => (
            <div
              key={s.id}
              className="bg-white border border-gray-200 rounded-lg p-6 flex justify-between items-center hover:shadow-md transition-shadow"
            >
              <div className="space-y-2">
                <p className="text-2xl font-bold text-gray-900">{s.totalAmount} ৳</p>
                <p className="text-base text-gray-600">
                  পেমেন্ট: {s.paymentMethod === "due" ? "ধার" : s.paymentMethod === "cash" ? "ক্যাশ" : s.paymentMethod}
                  {s.paymentMethod === "due" && s.customerName
                    ? ` • গ্রাহক: ${s.customerName}`
                    : ""}
                </p>
                {s.itemCount > 0 && (
                  <p className="text-sm text-gray-500">
                    পণ্য: {s.itemPreview || `${s.itemCount} টি`}
                  </p>
                )}
              </div>
              <p className="text-sm text-gray-500">
                {s.createdAt
                  ? new Date(s.createdAt as any).toLocaleString("bn-BD")
                  : ""}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
