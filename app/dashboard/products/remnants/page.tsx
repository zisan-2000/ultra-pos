import Link from "next/link";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/rbac";
import { assertShopAccess } from "@/lib/shop-access";
import { getShopsByUser } from "@/app/actions/shops";
import { prisma } from "@/lib/prisma";
import RemnantLookupClient from "./RemnantLookupClient";

type Props = {
  searchParams?: Promise<{ shopId?: string }>;
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
      variant: { select: { label: true } },
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

  const rows = remnants.map((row) => ({
    id: row.id,
    productId: row.product.id,
    productName: row.product.name,
    baseUnit: row.product.baseUnit ?? "pcs",
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
    invoiceNo: row.consumedSaleItem?.sale.invoiceNo ?? null,
    customerName: row.consumedSaleItem?.sale.customer?.name ?? null,
    saleDate: row.consumedSaleItem?.sale.saleDate
      ? row.consumedSaleItem.sale.saleDate.toISOString().slice(0, 10)
      : null,
  }));

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          পণ্য ট্র্যাকিং
        </p>
        <h1 className="text-2xl font-bold leading-tight text-foreground">
          Cut-Length Remnant Lookup
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          দোকান: <span className="font-semibold">{selectedShop.name}</span> — মোট{" "}
          {rows.length}টি remnant/history row
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <p className="mb-3 text-xs font-semibold text-muted-foreground">দ্রুত কাজ</p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/dashboard/products?shopId=${selectedShopId}`}
            className="inline-flex h-9 items-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
          >
            পণ্য তালিকা
          </Link>
          <Link
            href={`/dashboard/sales/new?shopId=${selectedShopId}`}
            className="inline-flex h-9 items-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
          >
            কাট সেল দিন
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <RemnantLookupClient rows={rows} />
      </div>
    </div>
  );
}
