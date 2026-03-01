// app/dashboard/sales/new/page.tsx

import { cookies } from "next/headers";
import { getShopsByUser } from "@/app/actions/shops";
import { getActiveProductsByShop } from "@/app/actions/products";
import { createSale } from "@/app/actions/sales";
import Link from "next/link";
import { PosPageClient } from "../PosPageClient";
import { requireUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/rbac";

type NewSalePageProps = {
  searchParams?: Promise<{ shopId?: string } | undefined>;
};

export default async function NewSalePage({ searchParams }: NewSalePageProps) {
  const [user, shops, resolvedSearch] = await Promise.all([
    requireUser(),
    getShopsByUser(),
    searchParams,
  ]);

  const canViewProducts = hasPermission(user, "view_products");
  const canCreateSale = hasPermission(user, "create_sale");
  const canCreateDueSale = hasPermission(user, "create_due_sale");
  const canViewCustomers = hasPermission(user, "view_customers");
  const canViewDuePage = hasPermission(user, "view_due_summary");
  const canUseBarcodeScanPermission = hasPermission(user, "use_pos_barcode_scan");

  if (!canViewProducts) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">নতুন বিক্রি</h1>
        <p className="mb-2 text-danger font-semibold">অ্যাকসেস সীমাবদ্ধ</p>
        <p className="mb-6 text-muted-foreground">
          এই পেজ ব্যবহারের জন্য <code>view_products</code> permission লাগবে।
        </p>
        <Link
          href="/dashboard/sales"
          className="inline-block px-6 py-3 bg-primary-soft text-primary border border-primary/30 rounded-lg font-medium hover:bg-primary/15 hover:border-primary/40 transition-colors"
        >
          বিক্রির তালিকায় ফিরুন
        </Link>
      </div>
    );
  }

  if (!shops || shops.length === 0) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">নতুন বিক্রি</h1>
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

  const selectedShop = shops.find((s) => s.id === selectedShopId)!;
  const canUseBarcodeScan =
    Boolean((selectedShop as any).barcodeFeatureEntitled) &&
    Boolean((selectedShop as any).barcodeScanEnabled) &&
    canUseBarcodeScanPermission;
  const products = await getActiveProductsByShop(selectedShopId);

  async function submitSale(formData: FormData) {
    "use server";

    const shopId = formData.get("shopId") as string;
    const paymentMethod = (formData.get("paymentMethod") as string) || "cash";
    const customerId = (formData.get("customerId") as string) || null;
    const paidNowStr = formData.get("paidNow") as string;
    const note = (formData.get("note") as string) || "";
    const cartJson = formData.get("cart") as string;

    if (!cartJson) {
      throw new Error("Cart is empty");
    }

    const items = JSON.parse(cartJson) as {
      productId: string;
      name: string;
      unitPrice: number;
      qty: number;
    }[];

    const result = await createSale({
      shopId,
      items,
      paymentMethod,
      customerId,
      paidNow: paidNowStr ? Number(paidNowStr) : 0,
      note,
    });

    return result;
  }

  return (
    <PosPageClient
      key={selectedShopId}
      products={products as any}
      customers={[] as any}
      shopName={selectedShop.name}
      shopId={selectedShopId}
      canCreateSale={canCreateSale}
      canCreateDueSale={canCreateDueSale}
      canViewCustomers={canViewCustomers}
      canViewDuePage={canViewDuePage}
      canUseBarcodeScan={canUseBarcodeScan}
      submitSale={submitSale}
    />
  );
}
