import Link from "next/link";
import { getShopsByUser } from "@/app/actions/shops";
import { getProductsByShop } from "@/app/actions/products";
import ProductsListClient from "./components/ProductsListClient";

export default async function ProductsPage() {
  const shops = await getShopsByUser();

  if (!shops || shops.length === 0) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-gray-900">পণ্য তালিকা</h1>
        <p className="mb-6 text-gray-600">এখনও কোনো দোকান নেই।</p>
        <Link
          href="/dashboard/shops/new"
          className="inline-block px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
        >
          দোকান তৈরি করুন
        </Link>
      </div>
    );
  }

  const defaultShopId = shops[0].id;

  const onlineProducts = await getProductsByShop(defaultShopId);

  return <ProductsListClient shops={shops} serverProducts={onlineProducts} />;
}
