import Link from "next/link";
import { getShopsByUser } from "@/app/actions/shops";
import { getProductsByShop } from "@/app/actions/products";
import ProductsListClient from "./components/ProductsListClient";

type PageProps = {
  searchParams?: Promise<{ shopId?: string }>;
};

export default async function ProductsPage({ searchParams }: PageProps) {
  const shops = await getShopsByUser();

  if (!shops || shops.length === 0) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-gray-900">কোন দোকান নেই</h1>
        <p className="mb-6 text-gray-600">আগে একটি দোকান তৈরি করুন</p>
        <Link
          href="/dashboard/shops/new"
          className="inline-block px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
        >
          নতুন দোকান তৈরি করুন
        </Link>
      </div>
    );
  }

  const resolvedParams = await searchParams;
  const requestedShopId = resolvedParams?.shopId;
  const shopIds = shops.map((s) => s.id);
  const activeShopId = shopIds.includes(requestedShopId || "") ? (requestedShopId as string) : shops[0].id;

  const onlineProducts = await getProductsByShop(activeShopId);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <ProductsListClient
          shops={shops}
          activeShopId={activeShopId}
          serverProducts={onlineProducts}
        />
      </div>
    </div>
  );
}
