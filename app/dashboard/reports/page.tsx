// app/dashboard/reports/page.tsx

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
      <div>
        <h1 className="text-2xl font-bold mb-4">Reports</h1>
        <p>You need to create a shop first.</p>
      </div>
    );
  }

  const selectedShopId =
    resolvedSearch?.shopId &&
    shops.some((s) => s.id === resolvedSearch.shopId)
      ? resolvedSearch.shopId
      : shops[0].id;

  const selectedShop = shops.find((s) => s.id === selectedShopId)!;

  const [salesSummary, expenseSummary, cashSummary, profitSummary] =
    await Promise.all([
      getSalesSummary(selectedShopId),
      getExpenseSummary(selectedShopId),
      getCashSummary(selectedShopId),
      getProfitSummary(selectedShopId),
    ]);

  return (
    <div className="space-y-8">
      {/* HEADER + SHOP SELECTOR */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-sm text-gray-600">
            Shop: <span className="font-semibold">{selectedShop.name}</span>
          </p>
          <p className="text-xs text-gray-500">
            Ultra-simple, ultra-fast. Lists only—no charts to slow you down.
          </p>
        </div>

        <ShopSelectorClient shops={shops} selectedShopId={selectedShopId} />
      </div>

      {/* TOP SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Sales"
          value={`${salesSummary.totalAmount.toFixed(2)} ?`}
          subtitle={`${salesSummary.count} invoices`}
        />
        <StatCard
          title="Total Expenses"
          value={`${expenseSummary.totalAmount.toFixed(2)} ?`}
          subtitle={`${expenseSummary.count} records`}
        />
        <StatCard
          title="Cash Balance"
          value={`${cashSummary.balance.toFixed(2)} ?`}
          subtitle={`IN: ${cashSummary.totalIn.toFixed(
            2
          )} ? | OUT: ${cashSummary.totalOut.toFixed(2)} ?`}
        />
        <StatCard
          title="Net Profit"
          value={`${profitSummary.profit.toFixed(2)} ?`}
          subtitle={`Sales: ${profitSummary.salesTotal.toFixed(
            2
          )} ? | Expenses: ${profitSummary.expenseTotal.toFixed(2)} ?`}
        />
      </div>

      {/* PAYMENT + PROFIT SNAPSHOTS */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="border rounded-lg p-4 bg-white">
          <PaymentMethodReport shopId={selectedShopId} />
        </div>

        <div className="border rounded-lg p-4 bg-white">
          <ProfitTrendReport shopId={selectedShopId} />
        </div>
      </section>

      {/* INVENTORY & PRODUCT HIGHLIGHTS */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="border rounded-lg p-4 bg-white">
          <TopProductsReport shopId={selectedShopId} />
        </div>

        <div className="border rounded-lg p-4 bg-white">
          <LowStockReport shopId={selectedShopId} />
        </div>
      </section>

      {/* DETAILED REPORTS (LISTS ONLY) */}
      <section className="space-y-6">
        <h2 className="text-xl font-semibold">Detailed Lists</h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="border rounded-lg p-4 bg-white">
            <SalesReport shopId={selectedShopId} />
          </div>

          <div className="border rounded-lg p-4 bg-white">
            <ExpenseReport shopId={selectedShopId} />
          </div>

          <div className="border rounded-lg p-4 bg-white">
            <CashbookReport shopId={selectedShopId} />
          </div>
        </div>
      </section>
    </div>
  );
}
