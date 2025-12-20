// app/dashboard/cash/page.tsx

import Link from "next/link";
import { cookies } from "next/headers";
import { getShopsByUser } from "@/app/actions/shops";
import { getCashByShop } from "@/app/actions/cash";
import ShopSelectorClient from "./ShopSelectorClient";
import { CashListClient } from "./components/CashListClient";

type CashPageProps = {
  searchParams?: Promise<{ shopId?: string } | undefined>;
};

export default async function CashPage({ searchParams }: CashPageProps) {
  const shops = await getShopsByUser();
  const resolvedSearch = await searchParams;

  if (!shops || shops.length === 0) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-gray-900">ক্যাশ খাতা</h1>
        <p className="mb-6 text-gray-600">প্রথমে একটি দোকান তৈরি করুন।</p>
        <Link
          href="/dashboard/shops/new"
          className="inline-block px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
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
    resolvedSearch?.shopId &&
    shops.some((s) => s.id === resolvedSearch.shopId)
      ? resolvedSearch.shopId
      : cookieSelectedShopId ?? shops[0].id;

  const selectedShop = shops.find((s) => s.id === selectedShopId)!;

  const rows = await getCashByShop(selectedShopId);
  const serializableRows = rows.map((e) => ({
    id: e.id,
    shopId: e.shopId,
    entryType: (e.entryType as "IN" | "OUT") || "IN",
    amount: e.amount?.toString?.() ?? (e as any).amount ?? "0",
    reason: e.reason,
    createdAt: e.createdAt?.toISOString?.() ?? e.createdAt,
  }));

  const balance = rows.reduce((sum, e) => {
    const amt = Number(e.amount);
    return e.entryType === "IN" ? sum + amt : sum - amt;
  }, 0);

  return (
    <div className="space-y-6 section-gap">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">🏦</span>
              <h1 className="text-3xl font-bold text-gray-900 leading-tight">ক্যাশ খাতা</h1>
            </div>
            <p className="text-sm text-gray-500 mt-1 leading-snug">
              দোকান: <b>{selectedShop.name}</b>
            </p>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-2">
              <p className="text-lg text-gray-600 leading-snug">
                বর্তমান ব্যালেন্স: <span className="text-2xl font-bold text-green-700">{balance.toFixed(2)} ৳</span>
              </p>
            </div>
          </div>

          <div className="w-full lg:w-auto flex flex-col sm:flex-row sm:items-center gap-3">
            <ShopSelectorClient shops={shops} selectedShopId={selectedShopId} />

            <Link
              href={`/dashboard/cash/new?shopId=${selectedShopId}`}
              className="w-full sm:w-auto px-6 py-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg font-semibold hover:border-emerald-300 hover:bg-emerald-100 transition-colors text-center"
            >
              ➕ নতুন এন্ট্রি
            </Link>
          </div>
        </div>
      </div>

      <CashListClient shopId={selectedShopId} rows={serializableRows} />
    </div>
  );
}
