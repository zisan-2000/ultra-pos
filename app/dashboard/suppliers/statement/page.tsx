// app/dashboard/suppliers/statement/page.tsx

import Link from "next/link";
import { cookies } from "next/headers";
import { getShopsByUser } from "@/app/actions/shops";
import { getSuppliersByShop, getSupplierStatement } from "@/app/actions/suppliers";
import SupplierStatementClient from "./statement-client";
import { getDhakaDateString } from "@/lib/dhaka-date";
import { requireUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/rbac";
import { resolveInventoryModuleEnabled } from "@/lib/accounting/cogs";

type SupplierStatementPageProps = {
  searchParams?: Promise<{
    shopId?: string;
    supplierId?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
};

export default async function SupplierStatementPage({
  searchParams,
}: SupplierStatementPageProps) {
  const [user, shops, resolvedSearch] = await Promise.all([
    requireUser(),
    getShopsByUser(),
    searchParams,
  ]);
  const canViewSuppliers = hasPermission(user, "view_suppliers");
  const canCreatePurchase = hasPermission(user, "create_purchase");
  const canCreatePurchasePayment = hasPermission(user, "create_purchase_payment");

  if (!canViewSuppliers) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">সরবরাহকারী স্টেটমেন্ট</h1>
        <p className="mb-2 text-danger font-semibold">অ্যাকসেস সীমাবদ্ধ</p>
        <p className="mb-6 text-muted-foreground">
          এই পেজ ব্যবহারের জন্য <code>view_suppliers</code> permission লাগবে।
        </p>
        <Link href="/dashboard" className="inline-block px-6 py-3 bg-primary-soft text-primary border border-primary/30 rounded-lg font-medium hover:bg-primary/15 hover:border-primary/40 transition-colors">
          ড্যাশবোর্ডে ফিরুন
        </Link>
      </div>
    );
  }

  if (!shops || shops.length === 0) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">সরবরাহকারী স্টেটমেন্ট</h1>
        <p className="mb-6 text-muted-foreground">এখনও কোনো দোকান নেই।</p>
        <Link href="/dashboard/shops/new" className="inline-block px-6 py-3 bg-primary-soft text-primary border border-primary/30 rounded-lg font-medium hover:bg-primary/15 hover:border-primary/40 transition-colors">
          প্রথম দোকান তৈরি করুন
        </Link>
      </div>
    );
  }

  const cookieStore = await cookies();
  const cookieShopId = cookieStore.get("activeShopId")?.value;
  const cookieSelectedShopId =
    cookieShopId && shops.some((s) => s.id === cookieShopId) ? cookieShopId : null;

  const selectedShopId =
    resolvedSearch?.shopId && shops.some((s) => s.id === resolvedSearch.shopId)
      ? resolvedSearch.shopId
      : cookieSelectedShopId ?? shops[0].id;
  const selectedShop = shops.find((s) => s.id === selectedShopId)!;
  const hasInventoryModule = resolveInventoryModuleEnabled(selectedShop);

  if (!hasInventoryModule) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">সরবরাহকারী স্টেটমেন্ট</h1>
        <p className="mb-2 text-warning font-semibold">মডিউল বন্ধ আছে</p>
        <p className="mb-6 text-muted-foreground">
          এই দোকানে <code>Purchases/Suppliers</code> module চালু না থাকায় statement দেখা যাবে না।
        </p>
        <Link href={`/dashboard/shops/${selectedShopId}`} className="inline-block px-6 py-3 bg-primary-soft text-primary border border-primary/30 rounded-lg font-medium hover:bg-primary/15 hover:border-primary/40 transition-colors">
          দোকানের সেটিংসে যান
        </Link>
      </div>
    );
  }

  const suppliers = await getSuppliersByShop(selectedShopId);
  const selectedSupplierId =
    resolvedSearch?.supplierId && suppliers.some((s) => s.id === resolvedSearch.supplierId)
      ? resolvedSearch.supplierId
      : suppliers[0]?.id ?? "";

  const today = getDhakaDateString();
  const from = resolvedSearch?.from ?? today;
  const to = resolvedSearch?.to ?? today;

  const page = Number(resolvedSearch?.page ?? 1);
  const statement = selectedSupplierId
    ? await getSupplierStatement({
        shopId: selectedShopId,
        supplierId: selectedSupplierId,
        from,
        to,
        page: Number.isFinite(page) && page > 0 ? page : 1,
        pageSize: 20,
      })
    : null;

  return (
    <div className="space-y-4 sm:space-y-5">

      {/* ── Hero card ── */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
        <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-primary-soft/50 via-card to-card" />
        <div className="pointer-events-none absolute -top-12 right-0 h-32 w-32 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative flex items-start justify-between gap-3 p-4">
          <div className="space-y-0.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              সরবরাহকারী বিশ্লেষণ
            </p>
            <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-3xl">
              সরবরাহকারী স্টেটমেন্ট
            </h1>
            <p className="text-xs text-muted-foreground">
              দোকান: <span className="font-semibold">{selectedShop.name}</span>
            </p>
          </div>
          <Link
            href={`/dashboard/suppliers?shopId=${selectedShopId}`}
            className="inline-flex h-9 shrink-0 items-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground shadow-sm hover:bg-muted transition-colors"
          >
            ← ফিরুন
          </Link>
        </div>
      </div>

      <SupplierStatementClient
        shopId={selectedShopId}
        suppliers={suppliers}
        supplierId={selectedSupplierId}
        from={from}
        to={to}
        statement={statement}
        canCreatePurchase={canCreatePurchase}
        canCreatePurchasePayment={canCreatePurchasePayment}
      />

    </div>
  );
}
