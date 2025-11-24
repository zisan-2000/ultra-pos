import Link from "next/link";
import { getShopsByUser } from "@/app/actions/shops";
import { getProductsByShop } from "@/app/actions/products";
import ProductsListClient from "./components/ProductsListClient";

export default async function ProductsPage() {
  const shops = await getShopsByUser();

  if (!shops || shops.length === 0) {
    return (
      <div>
        <h1 className="text-xl font-bold mb-4">Products</h1>
        <p className="mb-4">You don’t have any shop yet.</p>
        <Link
          href="/dashboard/shops/new"
          className="px-4 py-2 bg-black text-white rounded"
        >
          Create Shop
        </Link>
      </div>
    );
  }

  const defaultShopId = shops[0].id;

  const onlineProducts = await getProductsByShop(defaultShopId);

  return <ProductsListClient shops={shops} serverProducts={onlineProducts} />;
}
