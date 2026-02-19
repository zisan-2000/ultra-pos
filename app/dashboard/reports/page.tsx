// app/dashboard/reports/page.tsx

import Link from "next/link";
import { cookies } from "next/headers";
import { getShopsByUser } from "@/app/actions/shops";
import {
  getSalesSummary,
  getExpenseSummary,
  getCashSummary,
  getProfitSummary,
} from "@/app/actions/reports";
import { requireUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/rbac";
import ReportsClient from "./components/ReportsClient";

type ReportsPageProps = {
  searchParams?: Promise<{ shopId?: string; from?: string; to?: string } | undefined>;
};

const SUMMARY_REPORT_PERMISSIONS = [
  "view_sales_report",
  "view_expense_report",
  "view_cashbook_report",
  "view_profit_report",
] as const;

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const [user, shops, resolvedSearch] = await Promise.all([
    requireUser(),
    getShopsByUser(),
    searchParams,
  ]);
  const canViewReportsSummary =
    hasPermission(user, "view_reports") ||
    SUMMARY_REPORT_PERMISSIONS.every((permission) =>
      hasPermission(user, permission)
    );

  if (!canViewReportsSummary) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">রিপোর্ট</h1>
        <p className="mb-2 text-danger font-semibold">অ্যাকসেস সীমাবদ্ধ</p>
        <p className="mb-6 text-muted-foreground">
          রিপোর্ট দেখার জন্য <code>view_reports</code> অথবা summary report permissions লাগবে।
        </p>
        <Link
          href="/dashboard"
          className="inline-block px-6 py-3 bg-primary-soft text-primary border border-primary/30 rounded-lg font-medium hover:bg-primary/15 hover:border-primary/40 transition-colors"
        >
          ড্যাশবোর্ডে ফিরুন
        </Link>
      </div>
    );
  }

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
  const rangeFrom = useDefaultRange
    ? dhakaDate
    : resolvedSearch?.from ?? dhakaDate;
  const rangeTo = useDefaultRange
    ? dhakaDate
    : resolvedSearch?.to ?? dhakaDate;

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
        summaryRange={{ from: rangeFrom, to: rangeTo }}
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
