// app/dashboard/products/page.tsx

import Link from "next/link";
import { cookies } from "next/headers";
import { getShopsByUser } from "@/app/actions/shops";
import { getProductsByShopPaginated } from "@/app/actions/products";
import ProductsListClient from "./components/ProductsListClient";

type PageProps = {
  searchParams?: Promise<{
    shopId?: string;
    page?: string;
    q?: string;
    status?: string;
  }>;
};

const PAGE_SIZE = 12;

function parsePositiveInt(value?: string) {
  if (!value) return null;
  const num = Number.parseInt(value, 10);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function normalizeQuery(value?: string) {
  if (!value) return "";
  return value.toString().trim();
}

function normalizeStatus(value?: string) {
  if (value === "active" || value === "inactive") return value;
  return "all";
}

export default async function ProductsPage({ searchParams }: PageProps) {
  const shops = await getShopsByUser();

  if (!shops || shops.length === 0) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">কোন দোকান নেই</h1>
        <p className="mb-6 text-muted-foreground">আগে একটি দোকান তৈরি করুন</p>
        <Link
          href="/dashboard/shops/new"
          className="inline-block px-6 py-3 bg-primary-soft text-primary border border-primary/30 rounded-lg font-medium hover:bg-primary/15 hover:border-primary/40 transition-colors"
        >
          নতুন দোকান তৈরি করুন
        </Link>
      </div>
    );
  }

  const resolvedParams = await searchParams;
  const requestedShopId = resolvedParams?.shopId;

  const cookieStore = await cookies();
  const cookieShopId = cookieStore.get("activeShopId")?.value;

  const cookieSelectedShopId =
    cookieShopId && shops.some((s) => s.id === cookieShopId)
      ? cookieShopId
      : null;

  const shopIds = shops.map((s) => s.id);

  const urlSelectedShopId =
    requestedShopId && shopIds.includes(requestedShopId)
      ? requestedShopId
      : null;

  const activeShopId = urlSelectedShopId ?? cookieSelectedShopId ?? shops[0].id;

  const page = parsePositiveInt(resolvedParams?.page) ?? 1;
  const query = normalizeQuery(resolvedParams?.q);
  const status = normalizeStatus(resolvedParams?.status);

  const { items, totalCount, totalPages, page: currentPage, pageSize } =
    await getProductsByShopPaginated({
      shopId: activeShopId,
      page,
      pageSize: PAGE_SIZE,
      query,
      status,
    });

  return (
    <div className="space-y-6 section-gap">
      <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold text-foreground leading-tight">
              পণ্য তালিকা
            </h1>
          </div>
          <ProductsListClient
            shops={shops}
            activeShopId={activeShopId}
            serverProducts={items}
            page={currentPage}
            pageSize={pageSize}
            totalCount={totalCount}
            totalPages={totalPages}
            initialQuery={query}
            initialStatus={status}
          />
        </div>
      </div>
    </div>
  );
}
