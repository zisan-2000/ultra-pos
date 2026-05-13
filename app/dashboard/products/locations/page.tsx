import Link from "next/link";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/rbac";
import { assertShopAccess } from "@/lib/shop-access";
import { getShopsByUser } from "@/app/actions/shops";
import { prisma } from "@/lib/prisma";
import LocationLookupClient from "./LocationLookupClient";
import { Breadcrumb } from "@/components/ui/breadcrumb";

type Props = {
  searchParams?: Promise<{
    shopId?: string;
    query?: string;
    productId?: string;
  }>;
};

export default async function ProductLocationPage({ searchParams }: Props) {
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

  const products = await prisma.product.findMany({
    where: {
      shopId: selectedShopId,
      isActive: true,
      OR: [
        { storageLocation: { not: null } },
        { variants: { some: { isActive: true, storageLocation: { not: null } } } },
      ],
    },
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      category: true,
      baseUnit: true,
      trackStock: true,
      stockQty: true,
      reorderPoint: true,
      storageLocation: true,
      sku: true,
      barcode: true,
      variants: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
        select: {
          id: true,
          label: true,
          stockQty: true,
          reorderPoint: true,
          storageLocation: true,
          sku: true,
          barcode: true,
        },
      },
    },
  });

  const rows = products.flatMap((product) => {
    const entries: Array<{
      id: string;
      productId: string;
      productName: string;
      category: string;
      baseUnit: string;
      trackStock: boolean;
      stockQty: string;
      reorderPoint: number | null;
      location: string;
      sku: string | null;
      barcode: string | null;
      variantId: string | null;
      variantLabel: string | null;
      source: "base" | "variant";
    }> = [];

    if (product.storageLocation) {
      entries.push({
        id: `${product.id}-base`,
        productId: product.id,
        productName: product.name,
        category: product.category,
        baseUnit: product.baseUnit ?? "pcs",
        trackStock: Boolean(product.trackStock),
        stockQty: product.stockQty.toString(),
        reorderPoint: product.reorderPoint ?? null,
        location: product.storageLocation,
        sku: product.sku ?? null,
        barcode: product.barcode ?? null,
        variantId: null,
        variantLabel: null,
        source: "base",
      });
    }

    for (const variant of product.variants) {
      if (!variant.storageLocation) continue;
      entries.push({
        id: variant.id,
        productId: product.id,
        productName: product.name,
        category: product.category,
        baseUnit: product.baseUnit ?? "pcs",
        trackStock: Boolean(product.trackStock),
        stockQty: variant.stockQty.toString(),
        reorderPoint: variant.reorderPoint ?? null,
        location: variant.storageLocation,
        sku: variant.sku ?? product.sku ?? null,
        barcode: variant.barcode ?? product.barcode ?? null,
        variantId: variant.id,
        variantLabel: variant.label,
        source: "variant",
      });
    }

    return entries;
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <Breadcrumb
        items={[
          { label: "হোম", href: "/dashboard" },
          { label: "পণ্য", href: `/dashboard/products?shopId=${selectedShopId}` },
          { label: "লোকেশন ট্র্যাকিং" },
        ]}
        className="mb-2"
      />
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          পণ্য ট্র্যাকিং
        </p>
        <h1 className="text-2xl font-bold leading-tight text-foreground">
          র্যাক / শেলফ / লোকেশন
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          দোকান: <span className="font-semibold">{selectedShop.name}</span> — মোট{" "}
          {rows.length}টি location row
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
            href={`/dashboard/reports?shopId=${selectedShopId}`}
            className="inline-flex h-9 items-center rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
          >
            রিপোর্ট
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <LocationLookupClient
          rows={rows}
          shopId={selectedShopId}
          initialQuery={initialQuery}
          initialProductId={initialProductId}
        />
      </div>
    </div>
  );
}
