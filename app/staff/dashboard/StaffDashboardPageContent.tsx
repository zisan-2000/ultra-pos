import { cookies } from "next/headers";
import { getShopsByUser } from "@/app/actions/shops";
import { requireUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/rbac";
import { getTodaySummaryForShop } from "@/lib/reports/today-summary";
import StaffDashboardClient from "./StaffDashboardClient";

type DashboardPageProps = {
  searchParams?: Promise<{ shopId?: string } | undefined>;
};

type QuickAction = {
  href: string;
  label: string;
  description: string;
  icon: string;
};

export default async function StaffDashboardPageContent({
  searchParams,
}: DashboardPageProps) {
  const user = await requireUser();
  const shops = await getShopsByUser();

  if (!shops || shops.length === 0) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-foreground">স্টাফ ড্যাশবোর্ড</h1>
        <p className="mt-4 text-muted-foreground">
          এখনো কোনো assigned shop পাওয়া যায়নি।
        </p>
      </div>
    );
  }

  const resolvedSearch = await searchParams;
  const cookieStore = await cookies();
  const cookieShopId = cookieStore.get("activeShopId")?.value;

  const cookieSelectedShopId =
    cookieShopId && shops.some((shop) => shop.id === cookieShopId)
      ? cookieShopId
      : null;

  const selectedShopId =
    resolvedSearch?.shopId && shops.some((shop) => shop.id === resolvedSearch.shopId)
      ? resolvedSearch.shopId
      : cookieSelectedShopId ?? shops[0].id;

  const selectedShop = shops.find((shop) => shop.id === selectedShopId) ?? shops[0];
  const canViewSummary = hasPermission(user, "view_dashboard_summary");

  const summary = canViewSummary
    ? await getTodaySummaryForShop(selectedShopId, user)
    : {
        sales: { total: 0, count: 0 },
        expenses: { total: 0, count: 0, cogs: 0 },
        profit: 0,
        cash: { in: 0, out: 0, balance: 0, count: 0 },
      };

  const quickActions: QuickAction[] = [];
  const addQuickAction = (
    permission: string,
    href: string,
    label: string,
    description: string,
    icon: string,
  ) => {
    if (hasPermission(user, permission)) {
      quickActions.push({ href: `${href}?shopId=${selectedShopId}`, label, description, icon });
    }
  };

  addQuickAction("create_sale", "/dashboard/sales/new", "নতুন বিক্রি", "দ্রুত POS শুরু করুন", "⚡");
  addQuickAction("view_sales", "/dashboard/sales", "বিক্রির তালিকা", "আজকের বিক্রি দেখুন", "🧾");
  addQuickAction("view_due_summary", "/dashboard/due", "ধার / পাওনা", "বাকি ম্যানেজ করুন", "🤝");
  addQuickAction("create_expense", "/dashboard/expenses/new", "খরচ যোগ", "নতুন খরচ লিখুন", "💸");
  addQuickAction("view_cashbook", "/dashboard/cash", "ক্যাশবুক", "লেনদেন মিলিয়ে নিন", "💵");
  addQuickAction("view_products", "/dashboard/products", "পণ্য", "স্টক ও পণ্য দেখুন", "📦");

  if (
    Boolean((selectedShop as any).queueTokenEntitled) &&
    Boolean(selectedShop.queueTokenEnabled) &&
    hasPermission(user, "view_queue_board")
  ) {
    quickActions.push({
      href: `/dashboard/queue?shopId=${selectedShopId}`,
      label: "টোকেন",
      description: "চলমান queue দেখুন",
      icon: "🎟",
    });
  }

  return (
    <StaffDashboardClient
      userId={user.id}
      initialData={{
        shopId: selectedShopId,
        shopName: selectedShop.name,
        canViewSummary,
        summary,
        quickActions,
      }}
    />
  );
}
