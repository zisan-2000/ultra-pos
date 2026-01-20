// app/dashboard/reports/page.tsx

import { cookies } from "next/headers";
import { getShopsByUser } from "@/app/actions/shops";
import {
  getSalesSummary,
  getExpenseSummary,
  getCashSummary,
  getProfitSummary,
} from "@/app/actions/reports";
import ReportsClient from "./components/ReportsClient";

type ReportsPageProps = {
  searchParams?: Promise<{ shopId?: string; from?: string; to?: string } | undefined>;
};

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const shops = await getShopsByUser();
  const resolvedSearch = await searchParams;

  if (!shops || shops.length === 0) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">কোন দোকান নেই</h1>
        <p className="text-muted-foreground">রিপোর্ট দেখতে দোকান যুক্ত করুন</p>
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

  const dhakaDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const useDefaultRange = !resolvedSearch?.from && !resolvedSearch?.to;
  const rangeFrom = useDefaultRange ? dhakaDate : resolvedSearch?.from;
  const rangeTo = useDefaultRange ? dhakaDate : resolvedSearch?.to;

  const [salesSummary, expenseSummary, cashSummary, profitSummary] =
    await Promise.all([
      getSalesSummary(selectedShopId, rangeFrom, rangeTo),
      getExpenseSummary(selectedShopId, rangeFrom, rangeTo),
      getCashSummary(selectedShopId, rangeFrom, rangeTo),
      getProfitSummary(selectedShopId, rangeFrom, rangeTo),
    ]);
  return (
    <div className="section-gap">
      <ReportsClient
        shopId={selectedShopId}
        shopName={selectedShop.name}
        shops={shops}
        summary={{
          sales: salesSummary,
          expense: expenseSummary,
          cash: cashSummary,
          profit: profitSummary,
        }}
      />
    </div>
  );
}
