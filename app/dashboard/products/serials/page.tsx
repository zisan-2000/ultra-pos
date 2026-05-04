import Link from "next/link";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/rbac";
import { assertShopAccess } from "@/lib/shop-access";
import { getShopsByUser } from "@/app/actions/shops";
import { prisma } from "@/lib/prisma";
import SerialLookupClient from "./SerialLookupClient";

type Props = {
  searchParams?: Promise<{ shopId?: string }>;
};

export default async function SerialLookupPage({ searchParams }: Props) {
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

  const selectedShop = shops.find((s) => s.id === selectedShopId)!;

  await assertShopAccess(selectedShopId, user);

  const serials = await prisma.serialNumber.findMany({
    where: { shopId: selectedShopId },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      serialNo: true,
      status: true,
      createdAt: true,
      product: { select: { id: true, name: true } },
      variant: { select: { label: true } },
      purchaseItem: {
        select: {
          purchase: { select: { purchaseDate: true } },
        },
      },
      saleItem: {
        select: {
          sale: {
            select: {
              invoiceNo: true,
              saleDate: true,
              totalAmount: true,
              customer: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  const rows = serials.map((s) => ({
    id: s.id,
    serialNo: s.serialNo,
    status: s.status as "IN_STOCK" | "SOLD" | "RETURNED" | "DAMAGED",
    productId: s.product.id,
    productName: s.product.name,
    variantLabel: s.variant?.label ?? null,
    purchaseDate: s.purchaseItem?.purchase?.purchaseDate
      ? new Date(s.purchaseItem.purchase.purchaseDate)
          .toISOString()
          .slice(0, 10)
      : null,
    saleDate: s.saleItem?.sale?.saleDate
      ? new Date(s.saleItem.sale.saleDate).toISOString().slice(0, 10)
      : null,
    invoiceNo: s.saleItem?.sale?.invoiceNo ?? null,
    customerName: s.saleItem?.sale?.customer?.name ?? null,
    saleAmount: s.saleItem?.sale?.totalAmount?.toString() ?? null,
    createdAt: s.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          পণ্য ট্র্যাকিং
        </p>
        <h1 className="text-2xl font-bold text-foreground leading-tight">
          Serial Number Lookup
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          দোকান: <span className="font-semibold">{selectedShop.name}</span>{" "}
          — মোট {rows.length}টি serial নথিভুক্ত
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
        <SerialLookupClient rows={rows} />
      </div>
    </div>
  );
}
