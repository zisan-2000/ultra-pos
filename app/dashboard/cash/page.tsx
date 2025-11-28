// app/dashboard/cash/page.tsx

import Link from "next/link";
import { getShopsByUser } from "@/app/actions/shops";
import { getCashByShop } from "@/app/actions/cash";
import ShopSelectorClient from "./ShopSelectorClient";

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

  const selectedShopId =
    resolvedSearch?.shopId &&
    shops.some((s) => s.id === resolvedSearch.shopId)
      ? resolvedSearch.shopId
      : shops[0].id;

  const selectedShop = shops.find((s) => s.id === selectedShopId)!;

  const rows = await getCashByShop(selectedShopId);

  const balance = rows.reduce((sum, e) => {
    const amt = Number(e.amount);
    return e.entryType === "IN" ? sum + amt : sum - amt;
  }, 0);

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">ক্যাশ খাতা</h1>
          <p className="text-sm text-gray-500 mt-2">
            দোকান: <b>{selectedShop.name}</b>
          </p>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-4">
            <p className="text-lg text-gray-600">
              বর্তমান ব্যালেন্স: <span className="text-2xl font-bold text-green-700">{balance.toFixed(2)} ৳</span>
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <ShopSelectorClient shops={shops} selectedShopId={selectedShopId} />

          <Link
            href={`/dashboard/cash/new?shopId=${selectedShopId}`}
            className="px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
          >
            ➕ নতুন এন্ট্রি
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-center text-gray-600 py-8">এখনও কোনো এন্ট্রি নেই।</p>
      ) : (
        <div className="space-y-4">
          {rows.map((e) => (
            <div
              key={e.id}
              className="bg-white border border-gray-200 rounded-lg p-6 flex justify-between items-center hover:shadow-md transition-shadow"
            >
              <div>
                <p className={`text-2xl font-bold ${
                  e.entryType === "IN" ? "text-green-600" : "text-red-600"
                }`}>
                  {e.entryType === "IN" ? "+" : "-"}{e.amount} ৳
                </p>
                <p className="text-base text-gray-700 mt-2">{e.reason}</p>
              </div>

              <div className="flex gap-2">
                <Link
                  href={`/dashboard/cash/${e.id}`}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  এডিট
                </Link>

                <form
                  action={async () => {
                    "use server";
                    const { deleteCashEntry } = await import(
                      "@/app/actions/cash"
                    );
                    await deleteCashEntry(e.id);
                  }}
                >
                  <button className="px-4 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors">
                    ডিলিট
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
