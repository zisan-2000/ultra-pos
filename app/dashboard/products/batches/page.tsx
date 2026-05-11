import Link from "next/link";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/rbac";
import { assertShopAccess } from "@/lib/shop-access";
import { getShopsByUser } from "@/app/actions/shops";
import { prisma } from "@/lib/prisma";
import BatchLookupClient from "./BatchLookupClient";

type Props = {
  searchParams?: Promise<{
    shopId?: string;
    query?: string;
    status?: string;
    productId?: string;
  }>;
};

export default async function BatchLookupPage({ searchParams }: Props) {
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
  const initialQuery = typeof resolvedSearch?.query === "string" ? resolvedSearch.query : "";
  const initialStatus = typeof resolvedSearch?.status === "string" ? resolvedSearch.status : "all";
  const initialProductId =
    typeof resolvedSearch?.productId === "string" ? resolvedSearch.productId : "";
  const selectedShopId =
    resolvedSearch?.shopId && shops.some((s) => s.id === resolvedSearch.shopId)
      ? resolvedSearch.shopId
      : cookieShopId && shops.some((s) => s.id === cookieShopId)
      ? cookieShopId
      : shops[0].id;

  const selectedShop = shops.find((s) => s.id === selectedShopId)!;

  await assertShopAccess(selectedShopId, user);

  const batches = await prisma.batch.findMany({
    where: { shopId: selectedShopId },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      batchNo: true,
      totalQty: true,
      remainingQty: true,
      isActive: true,
      createdAt: true,
      product: { select: { id: true, name: true } },
      variant: { select: { label: true } },
      purchaseItem: {
        select: {
          purchase: { select: { purchaseDate: true } },
        },
      },
      allocations: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          quantityAllocated: true,
          quantityReturned: true,
          createdAt: true,
          saleItem: {
            select: {
              id: true,
              sale: {
                select: {
                  id: true,
                  invoiceNo: true,
                  saleDate: true,
                  status: true,
                  customer: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  const rows = batches.map((b) => ({
    id: b.id,
    batchNo: b.batchNo,
    totalQty: b.totalQty.toString(),
    remainingQty: b.remainingQty.toString(),
    isActive: b.isActive,
    productId: b.product.id,
    productName: b.product.name,
    variantLabel: b.variant?.label ?? null,
    purchaseDate: b.purchaseItem?.purchase?.purchaseDate
      ? new Date(b.purchaseItem.purchase.purchaseDate).toISOString().slice(0, 10)
      : null,
    createdAt: b.createdAt.toISOString(),
    allocations: b.allocations.map((allocation) => ({
      id: allocation.id,
      invoiceNo: allocation.saleItem.sale.invoiceNo ?? null,
      saleId: allocation.saleItem.sale.id,
      customerName: allocation.saleItem.sale.customer?.name ?? null,
      saleDate: allocation.saleItem.sale.saleDate.toISOString().slice(0, 10),
      saleStatus: allocation.saleItem.sale.status ?? null,
      quantityAllocated: allocation.quantityAllocated.toString(),
      quantityReturned: allocation.quantityReturned.toString(),
      createdAt: allocation.createdAt.toISOString(),
    })),
  }));

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          পণ্য ট্র্যাকিং
        </p>
        <h1 className="text-2xl font-bold text-foreground leading-tight">
          Batch / Lot Recall
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          দোকান: <span className="font-semibold">{selectedShop.name}</span>{" "}
          — মোট {rows.length}টি batch নথিভুক্ত
        </p>
      </div>

      {/* Quick links */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <p className="text-xs font-semibold text-muted-foreground mb-3">দ্রুত কাজ</p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/dashboard/products?shopId=${selectedShopId}`}
            className="inline-flex h-9 items-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
          >
            পণ্য তালিকা
          </Link>
          <Link
            href={`/dashboard/purchases/new?shopId=${selectedShopId}`}
            className="inline-flex h-9 items-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
          >
            নতুন ক্রয় (Stock In)
          </Link>
        </div>
      </div>

      {/* Lookup client */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <BatchLookupClient
          rows={rows}
          shopId={selectedShopId}
          initialQuery={initialQuery}
          initialStatus={initialStatus}
          initialProductId={initialProductId}
        />
      </div>
    </div>
  );
}
