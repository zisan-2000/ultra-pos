// app/dashboard/products/page.tsx

import Link from "next/link";
import { getShopsByUser } from "@/app/actions/shops";
import { getProductsByShop } from "@/app/actions/products";

// Client component for shop switching
import { ShopSwitcherClient } from "./shop-switcher-client";

export default async function ProductsPage() {
  const shops = await getShopsByUser();

  // No shops yet → show CTA
  if (!shops || shops.length === 0) {
    return (
      <div>
        <h1 className="text-xl font-bold mb-4">Products</h1>
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

  // Default active shop = first shop
  const defaultShopId = shops[0].id;

  // Fetch products for the default shop (first render only)
  const products = await getProductsByShop(defaultShopId);

  return (
    <div>
      {/* Header section */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-xl font-bold">Products</h1>
          <p className="text-sm text-gray-600">
            Manage products for your selected shop.
          </p>
        </div>

        <div className="flex gap-2 items-center">
          {/* Client-side shop switcher */}
          <ShopSwitcherClient shops={shops} />

          <Link
            href="/dashboard/products/new"
            className="px-4 py-2 bg-black text-white rounded"
          >
            New Product
          </Link>
        </div>
      </div>

      {/* Products List */}
      {products.length === 0 ? (
        <p>No products found for the selected shop.</p>
      ) : (
        <div className="space-y-3">
          {products.map((product) => (
            <div
              key={product.id}
              className="border rounded p-3 flex justify-between items-center"
            >
              <div>
                <h2 className="font-semibold">{product.name}</h2>

                <p className="text-sm text-gray-600">
                  Price: {product.sellPrice} | Stock: {product.stockQty}
                </p>

                <p className="text-xs">
                  {product.isActive ? (
                    <span className="text-green-600">Active</span>
                  ) : (
                    <span className="text-red-600">Inactive</span>
                  )}
                </p>
              </div>

              <div className="flex gap-2">
                <Link
                  href={`/dashboard/products/${product.id}`}
                  className="px-3 py-1 border rounded"
                >
                  Edit
                </Link>

                <form
                  action={async () => {
                    "use server";
                    const { deleteProduct } = await import(
                      "@/app/actions/products"
                    );
                    await deleteProduct(product.id);
                  }}
                >
                  <button className="px-3 py-1 bg-red-500 text-white rounded text-sm">
                    Delete
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
