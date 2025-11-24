// app/dashboard/reports/page.tsx

import { getShopsByUser } from "@/app/actions/shops";
import {
  getSalesSummary,
  getExpenseSummary,
  getCashSummary,
  getProfitSummary,
} from "@/app/actions/reports";
import { StatCard } from "./components/StatCard";
import ProfitTrendReport from "./components/ProfitTrendReport";
import PaymentMethodReport from "./components/PaymentMethodReport";
import TopProductsReport from "./components/TopProductsReport";
import LowStockReport from "./components/LowStockReport";

type ReportsPageProps = {
  searchParams?: {
    shopId?: string;
  };
};

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const shops = await getShopsByUser();

  if (!shops || shops.length === 0) {
    return (
      <div>
        <h1 className="text-xl font-bold mb-4">Reports</h1>
        <p>You need to create a shop first.</p>
      </div>
    );
  }

  const selectedShopId =
    searchParams?.shopId && shops.some((s) => s.id === searchParams.shopId)
      ? searchParams.shopId
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-sm text-gray-600">
            Shop: <span className="font-semibold">{selectedShop.name}</span>
          </p>
        </div>

        <select
          className="border px-2 py-1"
          defaultValue={selectedShopId}
          onChange={(e) => {
            window.location.href = `/dashboard/reports?shopId=${e.target.value}`;
          }}
        >
          {shops.map((shop) => (
            <option key={shop.id} value={shop.id}>
              {shop.name}
            </option>
          ))}
        </select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Sales"
          value={`${salesSummary.totalAmount.toFixed(2)} ৳`}
          subtitle={`${salesSummary.count} invoices`}
        />
        <StatCard
          title="Total Expenses"
          value={`${expenseSummary.totalAmount.toFixed(2)} ৳`}
          subtitle={`${expenseSummary.count} records`}
        />
        <StatCard
          title="Cash Balance"
          value={`${cashSummary.balance.toFixed(2)} ৳`}
          subtitle={`IN: ${cashSummary.totalIn.toFixed(
            2
          )} ৳ | OUT: ${cashSummary.totalOut.toFixed(2)} ৳`}
        />
        <StatCard
          title="Net Profit"
          value={`${profitSummary.profit.toFixed(2)} ৳`}
          subtitle={`Sales: ${profitSummary.salesTotal.toFixed(
            2
          )} ৳ | Expenses: ${profitSummary.expenseTotal.toFixed(2)} ৳`}
        />
      </div>

      <ProfitTrendReport shopId={selectedShopId} />

      <PaymentMethodReport shopId={selectedShopId} />

      <TopProductsReport shopId={selectedShopId} />

      <LowStockReport shopId={selectedShopId} />
    </div>
  );
}
