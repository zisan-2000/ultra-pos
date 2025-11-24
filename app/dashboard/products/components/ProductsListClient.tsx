"use client";

import { useOnlineStatus } from "@/lib/sync/net-status";
import { db } from "@/lib/dexie/db";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ShopSwitcherClient } from "../shop-switcher-client";

export default function ProductsListClient({ shops, serverProducts }: any) {
  const online = useOnlineStatus();
  const [products, setProducts] = useState(serverProducts);

  const shopId = shops[0].id;

  useEffect(() => {
    if (!online) {
      db.products.where("shopId").equals(shopId).toArray().then(setProducts);
    }
  }, [online, shopId]);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-xl font-bold">Products</h1>
          <p className="text-sm text-gray-600">
            Manage products for this shop.
          </p>
        </div>

        <div className="flex gap-2 items-center">
          <ShopSwitcherClient shops={shops} />
          <Link
            href={`/dashboard/products/new?shopId=${shopId}`}
            className="px-4 py-2 bg-black text-white rounded"
          >
            New Product
          </Link>
        </div>
      </div>

      {products.length === 0 ? (
        <p>No products available.</p>
      ) : (
        <div className="space-y-3">
          {products.map((product: any) => (
            <div
              key={product.id}
              className="border rounded p-3 flex justify-between"
            >
              <div>
                <h2 className="font-semibold">{product.name}</h2>
                <p className="text-sm text-gray-600">
                  Price: {product.sellPrice} | Stock: {product.stockQty}
                </p>
                <p className="text-xs">
                  {product.isActive ? "Active" : "Inactive"}
                </p>
              </div>

              <Link
                href={`/dashboard/products/${product.id}`}
                className="px-3 py-1 border rounded"
              >
                Edit
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
