import Link from "next/link";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/rbac";
import { assertShopAccess } from "@/lib/shop-access";
import { getShopsByUser } from "@/app/actions/shops";
import { getStockAdjustmentsByShop } from "@/app/actions/stock-adjustments";
import AdjustmentHistoryClient from "./AdjustmentHistoryClient";
import { Breadcrumb } from "@/components/ui/breadcrumb";

type Props = {
  searchParams?: Promise<{ shopId?: string }>;
};

export default async function StockAdjustmentsPage({ searchParams }: Props) {
  const [user, shops, resolvedSearch] = await Promise.all([
    requireUser(),
    getShopsByUser(),
    searchParams,
  ]);

  if (!hasPermission(user, "view_products")) {
    return (
      <div className="text-center py-12">
        <p className="text-danger font-semibold">অ্যাকসেস সীমাবদ্ধ</p>
      </div>
    );
  }

  if (!shops || shops.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">কোনো দোকান নেই।</p>
      </div>
    );
  }

  const cookieStore = await cookies();
  const cookieShopId = cookieStore.get("activeShopId")?.value;
  const selectedShopId =
    resolvedSearch?.shopId && shops.some((s) => s.id === resolvedSearch.shopId)
      ? resolvedSearch.shopId
      : cookieShopId && shops.some((s) => s.id === cookieShopId)
      ? cookieShopId
      : shops[0].id;

  await assertShopAccess(selectedShopId, user);

  const rows = await getStockAdjustmentsByShop(selectedShopId, 500);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-6 space-y-6">
        <Breadcrumb
          items={[
            { label: "হোম", href: "/dashboard" },
            { label: "পণ্য", href: `/dashboard/products?shopId=${selectedShopId}` },
            { label: "স্টক সমন্বয়" },
          ]}
          className="mb-4"
        />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">স্টক সমন্বয় ইতিহাস</h1>
            <p className="text-sm text-muted-foreground mt-1">
              স্টক পরিবর্তনের পূর্ণ লগ — শেষ ৫০০টি এন্ট্রি
            </p>
          </div>
          <Link
            href="/dashboard/products"
            className="text-sm text-primary hover:underline"
          >
            ← পণ্য তালিকায় ফিরুন
          </Link>
        </div>

        <AdjustmentHistoryClient rows={rows} />
      </div>
    </div>
  );
}
