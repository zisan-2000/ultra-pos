import Link from "next/link";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/rbac";
import { assertShopAccess } from "@/lib/shop-access";
import { getShopsByUser } from "@/app/actions/shops";
import { prisma } from "@/lib/prisma";
import SerialLookupClient from "./SerialLookupClient";
import { Breadcrumb } from "@/components/ui/breadcrumb";

type Props = {
  searchParams?: Promise<{
    shopId?: string;
    query?: string;
    status?: string;
    productId?: string;
  }>;
};

export default async function SerialLookupPage({ searchParams }: Props) {
  const [user, shops, resolvedSearch] = await Promise.all([
    requireUser(),
    getShopsByUser(),
    searchParams,
  ]);

  if (!hasPermission(user, "view_products")) {
    return (
      <div className="py-12 text-center">
        <p className="font-semibold text-danger">অ্যাকসেস সীমাবদ্ধ</p>
      </div>
    );
  }

  if (!shops || shops.length === 0) {
    return (
      <div className="py-12 text-center">
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

  const serials = await prisma.serialNumber.findMany({
    where: { shopId: selectedShopId },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      serialNo: true,
      status: true,
      note: true,
      createdAt: true,
      updatedAt: true,
      product: {
        select: {
          id: true,
          name: true,
          variants: {
            where: { isActive: true },
            select: { id: true },
            take: 1,
          },
        },
      },
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
              id: true,
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
    variantLabel:
      s.variant?.label ??
      ((s.product.variants?.length ?? 0) > 0 ? "পুরনো base stock" : null),
    purchaseDate: s.purchaseItem?.purchase?.purchaseDate
      ? new Date(s.purchaseItem.purchase.purchaseDate)
          .toISOString()
          .slice(0, 10)
      : null,
    saleId: s.saleItem?.sale?.id ?? null,
    saleDate: s.saleItem?.sale?.saleDate
      ? new Date(s.saleItem.sale.saleDate).toISOString().slice(0, 10)
      : null,
    invoiceNo: s.saleItem?.sale?.invoiceNo ?? null,
    customerName: s.saleItem?.sale?.customer?.name ?? null,
    saleAmount: s.saleItem?.sale?.totalAmount?.toString() ?? null,
    note: s.note ?? null,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }));

  return (
    <div className="space-y-5">
      <Breadcrumb
        items={[
          { label: "হোম", href: "/dashboard" },
          { label: "পণ্য", href: `/dashboard/products?shopId=${selectedShopId}` },
          { label: "সিরিয়াল নম্বর" },
        ]}
        className="mb-1"
      />

      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            পণ্য ট্র্যাকিং
          </p>
          <h1 className="text-2xl font-bold leading-tight text-foreground">
            Serial / Warranty Tracking
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-semibold">{selectedShop.name}</span> — মোট{" "}
            {rows.length}টি serial নথিভুক্ত
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/dashboard/products?shopId=${selectedShopId}`}
            className="inline-flex h-9 items-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
          >
            পণ্য তালিকা
          </Link>
          <Link
            href={`/dashboard/purchases/new?shopId=${selectedShopId}`}
            className="inline-flex h-9 items-center rounded-full border border-primary/30 bg-primary-soft/60 px-4 text-sm font-semibold text-primary hover:bg-primary/15"
          >
            🔒 নতুন ক্রয় (Stock In)
          </Link>
          <Link
            href={`/dashboard/sales?shopId=${selectedShopId}`}
            className="inline-flex h-9 items-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
          >
            বিক্রয় তালিকা
          </Link>
        </div>
      </div>

      {/* Lookup client */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <SerialLookupClient
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
