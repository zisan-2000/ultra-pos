// app/dashboard/products/new/page.tsx

import { getShopsByUser } from "@/app/actions/shops";
import ProductFormClient from "./ProductFormClient";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getBusinessTypeConfig } from "@/app/actions/business-types";

type PageProps = {
  searchParams?: Promise<{ shopId?: string }>;
};

export default async function NewProductPage({ searchParams }: PageProps) {
  const shops = await getShopsByUser();

  if (!shops || shops.length === 0) {
    redirect("/dashboard/shops/new");
  }

  const resolved = await searchParams;
  const requestedShopId = resolved?.shopId;
  const shopIds = shops.map((s) => s.id);
  const activeShop =
    requestedShopId && shopIds.includes(requestedShopId)
      ? shops.find((s) => s.id === requestedShopId)!
      : shops[0];

  const businessConfig = await getBusinessTypeConfig(activeShop.businessType ?? null);

  return (
    <Suspense fallback={<div>Loading product form...</div>}>
      <ProductFormClient shop={activeShop} businessConfig={businessConfig || undefined} />
    </Suspense>
  );
}
