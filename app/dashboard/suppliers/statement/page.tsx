// app/dashboard/suppliers/statement/page.tsx

import Link from "next/link";
import { cookies } from "next/headers";
import { getShopsByUser } from "@/app/actions/shops";
import { getSuppliersByShop, getSupplierStatement } from "@/app/actions/suppliers";
import SupplierStatementClient from "./statement-client";
import { getDhakaDateString } from "@/lib/dhaka-date";

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
  const shops = await getShopsByUser();
  const resolvedSearch = await searchParams;

  if (!shops || shops.length === 0) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">সরবরাহকারী স্টেটমেন্ট</h1>
        <p className="mb-6 text-muted-foreground">এখনও কোনো দোকান নেই।</p>
        <Link
          href="/dashboard/shops/new"
          className="inline-block px-6 py-3 bg-primary-soft text-primary border border-primary/30 rounded-lg font-medium hover:bg-primary/15 hover:border-primary/40 transition-colors"
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
    <div className="space-y-4 sm:space-y-6">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_16px_36px_rgba(15,23,42,0.08)]">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          এপি স্টেটমেন্ট
        </p>
        <h1 className="text-2xl font-bold text-foreground leading-tight tracking-tight sm:text-3xl">
          সরবরাহকারী স্টেটমেন্ট
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          নির্দিষ্ট সরবরাহকারীর হিসাব ও বকেয়া বয়স দেখুন।
        </p>
      </div>

      <SupplierStatementClient
        shopId={selectedShopId}
        suppliers={suppliers}
        supplierId={selectedSupplierId}
        from={from}
        to={to}
        statement={statement}
      />
    </div>
  );
}
