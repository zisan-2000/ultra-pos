// app/dashboard/expenses/page.tsx

import Link from "next/link";
import { getShopsByUser } from "@/app/actions/shops";
import { getExpensesByShop } from "@/app/actions/expenses";
import ShopSelectorClient from "./ShopSelectorClient";

type ExpensePageProps = {
  searchParams?: Promise<{ shopId?: string } | undefined>;
};

export default async function ExpensesPage({
  searchParams,
}: ExpensePageProps) {
  const shops = await getShopsByUser();
  const resolvedSearch = await searchParams;

  if (!shops || shops.length === 0) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-gray-900">খরচের তালিকা</h1>
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

  const rows = await getExpensesByShop(selectedShopId);

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">খরচের তালিকা</h1>
          <p className="text-base text-gray-600 mt-2">
            আজ কী কী খরচ করলেন, লিখে রাখুন।
          </p>
          <p className="text-sm text-gray-500 mt-1">
            দোকান: <span className="font-semibold">{selectedShop.name}</span>
          </p>
        </div>

        <div className="flex gap-3">
          <ShopSelectorClient shops={shops} selectedShopId={selectedShopId} />

          <Link
            href={`/dashboard/expenses/new?shopId=${selectedShopId}`}
            className="px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
          >
            ➕ নতুন খরচ
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-center text-gray-600 py-8">এখনও কোনো খরচ নেই।</p>
      ) : (
        <div className="space-y-4">
          {rows.map((e) => (
            <div
              key={e.id}
              className="bg-white border border-gray-200 rounded-lg p-6 flex justify-between items-center hover:shadow-md transition-shadow"
            >
              <div>
                <p className="text-2xl font-bold text-gray-900">{e.amount} ৳</p>
                <p className="text-base text-gray-700 mt-2">{e.category}</p>
                <p className="text-sm text-gray-500 mt-1">তারিখ: {e.expenseDate}</p>
              </div>

              <div className="flex gap-2 items-center">
                <Link
                  href={`/dashboard/expenses/${e.id}`}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  এডিট
                </Link>

                <form
                  action={async () => {
                    "use server";
                    const { deleteExpense } = await import(
                      "@/app/actions/expenses"
                    );
                    await deleteExpense(e.id);
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
