// app/dashboard/sales/new/page.tsx

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
      <div>
        <h1 className="text-xl font-bold mb-4">POS</h1>
        <p className="mb-4">You don&apos;t have any shop yet.</p>
        <Link
          href="/dashboard/shops/new"
          className="px-4 py-2 bg-black text-white rounded"
        >
          Create your first shop
        </Link>
      </div>
    );
  }

  const selectedShopId =
    resolvedSearch?.shopId &&
    shops.some((s) => s.id === resolvedSearch.shopId)
      ? resolvedSearch.shopId
      : shops[0].id;

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
      products={products as any}
      customers={customers as any}
      shopName={selectedShop.name}
      shopId={selectedShopId}
      submitSale={submitSale}
    />
  );
}
