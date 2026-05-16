import Link from "next/link";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/rbac";
import { assertShopAccess } from "@/lib/shop-access";
import { getShopsByUser } from "@/app/actions/shops";
import { prisma } from "@/lib/prisma";
import RemnantLookupClient from "./RemnantLookupClient";
import { Breadcrumb } from "@/components/ui/breadcrumb";

type Props = {
  searchParams?: Promise<{
    shopId?: string;
    query?: string;
    status?: string;
    productId?: string;
    variantId?: string;
  }>;
};

export default async function RemnantLookupPage({ searchParams }: Props) {
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
  const initialStatus =
    typeof resolvedSearch?.status === "string" ? resolvedSearch.status : "active";
  const initialProductId =
    typeof resolvedSearch?.productId === "string" ? resolvedSearch.productId : "";
  const initialVariantId =
    typeof resolvedSearch?.variantId === "string" ? resolvedSearch.variantId : "";
  const selectedShopId =
    resolvedSearch?.shopId && shops.some((s) => s.id === resolvedSearch.shopId)
      ? resolvedSearch.shopId
      : cookieShopId && shops.some((s) => s.id === cookieShopId)
        ? cookieShopId
        : shops[0].id;

  const selectedShop = shops.find((s) => s.id === selectedShopId)!;
  await assertShopAccess(selectedShopId, user);

  const remnants = await prisma.remnantPiece.findMany({
    where: { shopId: selectedShopId },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }, { createdAt: "desc" }],
    take: 500,
    select: {
      id: true,
      originalLength: true,
      remainingLength: true,
      source: true,
      sourceRef: true,
      status: true,
      note: true,
      createdAt: true,
      updatedAt: true,
      product: { select: { id: true, name: true, baseUnit: true } },
      variant: { select: { id: true, label: true } },
      consumedSaleItem: {
        select: {
          id: true,
          sale: {
            select: {
              id: true,
              invoiceNo: true,
              saleDate: true,
              customer: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  const sourceSaleItemIds = Array.from(
    new Set(
      remnants
        .filter(
          (row) =>
            Boolean(row.sourceRef) &&
            (row.source === "CUT_SALE" ||
              row.source === "SALE_RETURN" ||
              row.source === "SALE_VOID")
        )
        .map((row) => String(row.sourceRef))
    )
  );

  const sourceSaleItems =
    sourceSaleItemIds.length > 0
      ? await prisma.saleItem.findMany({
          where: { id: { in: sourceSaleItemIds } },
          select: {
            id: true,
            sale: {
              select: {
                id: true,
                invoiceNo: true,
                saleDate: true,
                customer: { select: { name: true } },
              },
            },
          },
        })
      : [];

  const productIds = Array.from(new Set(remnants.map((row) => row.product.id)));
  const productSummaries =
    productIds.length > 0
      ? await prisma.product.findMany({
          where: {
            shopId: selectedShopId,
            id: { in: productIds },
          },
          select: {
            id: true,
            name: true,
            baseUnit: true,
            stockQty: true,
            variants: {
              where: { isActive: true },
              select: {
                id: true,
                label: true,
                stockQty: true,
              },
              orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
            },
          },
        })
      : [];

  const sourceSaleItemMap = new Map(
    sourceSaleItems.map((row) => [
      row.id,
      {
        saleId: row.sale.id,
        invoiceNo: row.sale.invoiceNo ?? null,
        saleDate: row.sale.saleDate
          ? row.sale.saleDate.toISOString().slice(0, 10)
          : null,
        customerName: row.sale.customer?.name ?? null,
      },
    ])
  );

  const rows = remnants.map((row) => {
    const sourceSaleMeta = row.sourceRef
      ? sourceSaleItemMap.get(String(row.sourceRef)) ?? null
      : null;
    return {
      id: row.id,
      productId: row.product.id,
      productName: row.product.name,
      baseUnit: row.product.baseUnit ?? "pcs",
      variantId: row.variant?.id ?? null,
      variantLabel: row.variant?.label ?? null,
      originalLength: row.originalLength.toString(),
      remainingLength: row.remainingLength.toString(),
      consumedLength: row.originalLength.sub(row.remainingLength).toString(),
      source: row.source,
      sourceRef: row.sourceRef ?? null,
      status: row.status,
      note: row.note ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      saleId: row.consumedSaleItem?.sale.id ?? sourceSaleMeta?.saleId ?? null,
      invoiceNo: row.consumedSaleItem?.sale.invoiceNo ?? sourceSaleMeta?.invoiceNo ?? null,
      customerName:
        row.consumedSaleItem?.sale.customer?.name ?? sourceSaleMeta?.customerName ?? null,
      saleDate: row.consumedSaleItem?.sale.saleDate
        ? row.consumedSaleItem.sale.saleDate.toISOString().slice(0, 10)
        : sourceSaleMeta?.saleDate ?? null,
    };
  });

  return (
    <div className="space-y-5">
      <Breadcrumb
        items={[
          { label: "হোম", href: "/dashboard" },
          { label: "পণ্য", href: `/dashboard/products?shopId=${selectedShopId}` },
          { label: "কাটা বাকি অংশ" },
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
            কাটা বাকি অংশ / Remnant
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-semibold">{selectedShop.name}</span> — মোট{" "}
            {rows.length}টি cut piece নথিভুক্ত
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
            href={`/dashboard/sales/new?shopId=${selectedShopId}`}
            className="inline-flex h-9 items-center rounded-full border border-primary/30 bg-primary-soft/60 px-4 text-sm font-semibold text-primary hover:bg-primary/15"
          >
            ✂️ কাট সেল দিন
          </Link>
          <Link
            href={`/dashboard/purchases?shopId=${selectedShopId}`}
            className="inline-flex h-9 items-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
          >
            ক্রয় তালিকা
          </Link>
        </div>
      </div>

      {/* Lookup client */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <RemnantLookupClient
          rows={rows}
          shopId={selectedShopId}
          productSummaries={productSummaries.map((product) => ({
            id: product.id,
            name: product.name,
            baseUnit: product.baseUnit ?? "pcs",
            stockQty: product.stockQty.toString(),
            variants: product.variants.map((variant) => ({
              id: variant.id,
              label: variant.label,
              stockQty: variant.stockQty.toString(),
            })),
          }))}
          initialQuery={initialQuery}
          initialStatus={initialStatus}
          initialProductId={initialProductId}
          initialVariantId={initialVariantId}
        />
      </div>
    </div>
  );
}
