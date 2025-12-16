// app/dashboard/reports/page.tsx

import { cookies } from "next/headers";
import { getShopsByUser } from "@/app/actions/shops";
import {
  getSalesSummary,
  getExpenseSummary,
  getCashSummary,
  getProfitSummary,
} from "@/app/actions/reports";

import { StatCard } from "./components/StatCard";
import SalesReport from "./components/SalesReport";
import ExpenseReport from "./components/ExpenseReport";
import CashbookReport from "./components/CashbookReport";
import ProfitTrendReport from "./components/ProfitTrendReport";
import PaymentMethodReport from "./components/PaymentMethodReport";
import TopProductsReport from "./components/TopProductsReport";
import LowStockReport from "./components/LowStockReport";
import ShopSelectorClient from "./ShopSelectorClient";

type ReportsPageProps = {
  searchParams?: Promise<{ shopId?: string } | undefined>;
};

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const shops = await getShopsByUser();
  const resolvedSearch = await searchParams;

  if (!shops || shops.length === 0) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-gray-900">রিপোর্ট</h1>
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
    resolvedSearch?.shopId &&
    shops.some((s) => s.id === resolvedSearch.shopId)
      ? resolvedSearch.shopId
      : cookieSelectedShopId ?? shops[0].id;

  const selectedShop = shops.find((s) => s.id === selectedShopId)!;

  const [salesSummary, expenseSummary, cashSummary, profitSummary] =
    await Promise.all([
      getSalesSummary(selectedShopId),
      getExpenseSummary(selectedShopId),
      getCashSummary(selectedShopId),
      getProfitSummary(selectedShopId),
    ]);

  return (
    <div className="space-y-6 section-gap">
      {/* HEADER + SHOP SELECTOR */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 leading-tight">সব রিপোর্ট এক জায়গায়</h1>
          <p className="text-sm text-gray-500 mt-2 leading-snug">
            দোকান: <span className="font-semibold">{selectedShop.name}</span>
          </p>
          <p className="text-base text-gray-600 mt-2 leading-snug">
            দিন, মাস বা পুরা সময়ের হিসাব দেখুন।
          </p>
        </div>

        <ShopSelectorClient shops={shops} selectedShopId={selectedShopId} />
      </div>

      {/* TOP SUMMARY CARDS */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StatCard
            title="মোট বিক্রি"
            value={`${salesSummary.totalAmount.toFixed(2)} ৳`}
            subtitle={`নেট: ${salesSummary.completedCount ?? salesSummary.count} টি বিল` +
              (typeof salesSummary.voidedCount === "number" && salesSummary.voidedCount > 0
                ? ` (বাতিল: ${salesSummary.voidedCount} টি বিল)`
                : "")}
            icon="💰"
          />
          <StatCard
            title="মোট খরচ"
            value={`${expenseSummary.totalAmount.toFixed(2)} ৳`}
            subtitle={`${expenseSummary.count} টি রেকর্ড`}
            icon="💸"
          />
          <StatCard
            title="ক্যাশ ব্যালেন্স"
            value={`${cashSummary.balance.toFixed(2)} ৳`}
            subtitle={`ঢুকেছে: ${cashSummary.totalIn.toFixed(
              2
            )} ৳ | বের হয়েছে: ${cashSummary.totalOut.toFixed(2)} ৳`}
            icon="🏦"
          />
          <StatCard
            title="মোট লাভ"
            value={`${profitSummary.profit.toFixed(2)} ৳`}
            subtitle={`বিক্রি: ${profitSummary.salesTotal.toFixed(
              2
            )} ৳ | খরচ: ${profitSummary.expenseTotal.toFixed(2)} ৳`}
            icon="📈"
          />
        </div>
      </div>

      {/* DETAILED REPORTS - 7 REPORTS */}
      <section className="space-y-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <h2 className="text-2xl font-bold text-gray-900">সব রিপোর্ট</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="border border-gray-200 rounded-lg p-6 bg-white shadow-sm">
            <SalesReport shopId={selectedShopId} />
          </div>

          <div className="border border-gray-200 rounded-lg p-6 bg-white shadow-sm">
            <ExpenseReport shopId={selectedShopId} />
          </div>

          <div className="border border-gray-200 rounded-lg p-6 bg-white shadow-sm">
            <CashbookReport shopId={selectedShopId} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="border border-gray-200 rounded-lg p-6 bg-white shadow-sm">
            <PaymentMethodReport shopId={selectedShopId} />
          </div>

          <div className="border border-gray-200 rounded-lg p-6 bg-white shadow-sm">
            <ProfitTrendReport shopId={selectedShopId} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="border border-gray-200 rounded-lg p-6 bg-white shadow-sm">
            <TopProductsReport shopId={selectedShopId} />
          </div>

          <div className="border border-gray-200 rounded-lg p-6 bg-white shadow-sm">
            <LowStockReport shopId={selectedShopId} />
          </div>
        </div>
      </section>
    </div>
  );
}
