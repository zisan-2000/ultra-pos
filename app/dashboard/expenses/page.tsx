// app/dashboard/expenses/page.tsx

import Link from "next/link";
import { cookies } from "next/headers";
import { getShopsByUser } from "@/app/actions/shops";
import { getExpensesByShop } from "@/app/actions/expenses";

import ShopSelectorClient from "./ShopSelectorClient";
import { ExpensesListClient } from "./components/ExpensesListClient";

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

  const rows = await getExpensesByShop(selectedShopId);
  const serializableRows = rows.map((e) => ({
    id: e.id,
    shopId: e.shopId,
    amount: e.amount?.toString?.() ?? (e as any).amount ?? "0",
    category: e.category,
    note: e.note,
    expenseDate: e.expenseDate?.toISOString?.() ?? e.expenseDate,
    createdAt: e.createdAt?.toISOString?.() ?? e.createdAt,
  }));

  return (
    <div className="space-y-4 section-gap">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              💸
            </span>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 leading-tight">
                খরচ
              </h1>
              <p className="text-sm text-gray-500 leading-snug">
                দোকান: <span className="font-semibold">{selectedShop.name}</span>
              </p>
            </div>
          </div>
          <p className="text-sm text-gray-600 leading-snug">
            আজ কত খরচ হলো, দ্রুত দেখুন ও নিয়ন্ত্রণ করুন।
          </p>
        </div>

        <div className="w-full lg:w-auto flex flex-col sm:flex-row sm:items-center gap-3">
          <ShopSelectorClient shops={shops} selectedShopId={selectedShopId} />

          <Link
            href={`/dashboard/expenses/new?shopId=${selectedShopId}`}
            className="w-full sm:w-auto px-6 py-3 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition-colors text-center pressable"
          >
            + নতুন খরচ
          </Link>
        </div>
      </div>

      <ExpensesListClient shopId={selectedShopId} expenses={serializableRows} />
    </div>
  );
}
