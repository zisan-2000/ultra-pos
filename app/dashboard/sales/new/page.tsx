// app/dashboard/sales/new/page.tsx

import { cookies } from "next/headers";
import { getShopsByUser } from "@/app/actions/shops";
import { getActiveProductsByShop } from "@/app/actions/products";
import { createSale } from "@/app/actions/sales";
import { getCustomersByShop } from "@/app/actions/customers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PosPageClient } from "../PosPageClient";

type NewSalePageProps = {
  searchParams?: Promise<{ shopId?: string } | undefined>;
};

export default async function NewSalePage({ searchParams }: NewSalePageProps) {
  const shops = await getShopsByUser();
  const resolvedSearch = await searchParams;

  if (!shops || shops.length === 0) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-gray-900">নতুন বিক্রি</h1>
        <p className="mb-6 text-gray-600">এখনও কোনো দোকান নেই।</p>
        <Link
          href="/dashboard/shops/new"
          className="inline-block px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
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
  const products = await getActiveProductsByShop(selectedShopId);
  const customers = await getCustomersByShop(selectedShopId);

  async function submitSale(formData: FormData) {
    "use server";

    const shopId = formData.get("shopId") as string;
    const paymentMethod = (formData.get("paymentMethod") as string) || "cash";
    const customerId = (formData.get("customerId") as string) || null;
    const paidNowStr = formData.get("paidNow") as string;
    const note = (formData.get("note") as string) || "";
    const cartJson = formData.get("cart") as string;
    const totalAmountStr = (formData.get("totalAmount") as string) || "0";

    if (!cartJson) {
      throw new Error("Cart is empty");
    }

    const items = JSON.parse(cartJson) as {
      productId: string;
      name: string;
      unitPrice: number;
      qty: number;
    }[];

    await createSale({
      shopId,
      items,
      paymentMethod,
      customerId,
      paidNow: paidNowStr ? Number(paidNowStr) : 0,
      note,
    });

    redirect(`/dashboard/sales?shopId=${shopId}`);
  }

  return (
    <PosPageClient
      key={selectedShopId}
      products={products as any}
      customers={customers as any}
      shopName={selectedShop.name}
      shopId={selectedShopId}
      submitSale={submitSale}
    />
  );
}
