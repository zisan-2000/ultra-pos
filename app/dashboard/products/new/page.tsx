// app/dashboard/products/new/page.tsx

import { getShopsByUser } from "@/app/actions/shops";
import ProductFormClient from "./ProductFormClient";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getBusinessTypeConfig } from "@/app/actions/business-types";
import Link from "next/link";
import { requireUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/rbac";

type PageProps = {
  searchParams?: Promise<{ shopId?: string }>;
};

export default async function NewProductPage({ searchParams }: PageProps) {
  const [user, shops, resolved] = await Promise.all([
    requireUser(),
    getShopsByUser(),
    searchParams,
  ]);
  const canCreateProduct = hasPermission(user, "create_product");
  const canUseBarcodeScanPermission = hasPermission(user, "use_pos_barcode_scan");
  const backHref = resolved?.shopId
    ? `/dashboard/products?shopId=${resolved.shopId}`
    : "/dashboard/products";

  if (!canCreateProduct) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">নতুন পণ্য</h1>
        <p className="mb-2 text-danger font-semibold">অ্যাকসেস সীমাবদ্ধ</p>
        <p className="mb-6 text-muted-foreground">
          নতুন পণ্য যোগ করতে <code>create_product</code> permission লাগবে।
        </p>
        <Link
          href={backHref}
          className="inline-block px-6 py-3 bg-primary-soft text-primary border border-primary/30 rounded-lg font-medium hover:bg-primary/15 hover:border-primary/40 transition-colors"
        >
          পণ্য তালিকায় ফিরুন
        </Link>
      </div>
    );
  }

  if (!shops || shops.length === 0) {
    redirect("/dashboard/shops/new");
  }

  const requestedShopId = resolved?.shopId;
  const shopIds = shops.map((s) => s.id);
  const activeShop =
    requestedShopId && shopIds.includes(requestedShopId)
      ? shops.find((s) => s.id === requestedShopId)!
      : shops[0];

  const businessConfig = await getBusinessTypeConfig(activeShop.businessType ?? null);
  const canUseBarcodeScan =
    Boolean((activeShop as any).barcodeFeatureEntitled) &&
    Boolean((activeShop as any).barcodeScanEnabled) &&
    canUseBarcodeScanPermission;

  return (
    <Suspense fallback={<div>Loading product form...</div>}>
      <ProductFormClient
        shop={activeShop}
        businessConfig={businessConfig || undefined}
        canUseBarcodeScan={canUseBarcodeScan}
      />
    </Suspense>
  );
}
