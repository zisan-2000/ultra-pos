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
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">পণ্য তালিকা</h1>
          <p className="text-base text-gray-600 mt-2">
            এই দোকানের সব পণ্য দেখুন এবং পরিচালনা করুন।
          </p>
        </div>

        <div className="flex gap-3 items-center">
          <ShopSwitcherClient shops={shops} />
          <Link
            href={`/dashboard/products/new?shopId=${shopId}`}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            ➕ নতুন পণ্য
          </Link>
        </div>
      </div>

      {products.length === 0 ? (
        <p className="text-center text-gray-600 py-8">কোনো পণ্য নেই।</p>
      ) : (
        <div className="space-y-4">
          {products.map((product: any) => (
            <div
              key={product.id}
              className="bg-white border border-gray-200 rounded-lg p-6 flex justify-between items-center hover:shadow-md transition-shadow"
            >
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{product.name}</h2>
                <p className="text-base text-gray-600 mt-2">
                  দাম: {product.sellPrice} ৳ | স্টক: {product.stockQty}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  অবস্থা: {product.isActive ? "সক্রিয়" : "নিষ্ক্রিয়"}
                </p>
              </div>

              <div className="flex gap-2">
                <Link
                  href={`/dashboard/products/${product.id}`}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  এডিট
                </Link>
                <button className="px-4 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors">
                  ডিলিট
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
