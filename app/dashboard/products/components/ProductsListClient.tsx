// app/dashboard/products/components/ProductsListClient.tsx

"use client";

import { useOnlineStatus } from "@/lib/sync/net-status";
import { db } from "@/lib/dexie/db";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ShopSwitcherClient } from "../shop-switcher-client";
import { useCurrentShop } from "@/hooks/use-current-shop";

type Shop = { id: string; name: string };
type Product = {
  id: string;
  name: string;
  category: string;
  baseUnit?: string;
  buyPrice?: string | null;
  sellPrice: string;
  stockQty: string;
  isActive: boolean;
};

type Props = {
  shops: Shop[];
  activeShopId: string;
  serverProducts: Product[];
};

export default function ProductsListClient({ shops, activeShopId, serverProducts }: Props) {
  const online = useOnlineStatus();
  const { setShop } = useCurrentShop();
  const [products, setProducts] = useState(serverProducts);

  // keep client store in sync with the server-selected shop (e.g., when navigating via URL)
  useEffect(() => {
    setShop(activeShopId);
  }, [activeShopId, setShop]);

  useEffect(() => {
    if (!online) {
      db.products.where("shopId").equals(activeShopId).toArray().then(setProducts);
    } else {
      setProducts(serverProducts);
    }
  }, [online, activeShopId, serverProducts]);

  const activeShopName = useMemo(
    () => shops.find((s) => s.id === activeShopId)?.name || "",
    [shops, activeShopId]
  );

  return (
    <div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">পণ্যের তালিকা</h1>
          <p className="text-base text-gray-600 mt-2">
            এই দোকানের সব পণ্য দেখুন এবং পরিচালনা করুন।
          </p>
          <p className="text-sm text-gray-500 mt-1">
            নির্বাচিত দোকান: <span className="font-semibold text-gray-900">{activeShopName}</span>
          </p>
        </div>

        <div className="w-full lg:w-auto flex flex-col sm:flex-row sm:items-center gap-3">
          <ShopSwitcherClient shops={shops} activeShopId={activeShopId} />
          <Link
            href={`/dashboard/products/new?shopId=${activeShopId}`}
            className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors text-center"
          >
            + নতুন পণ্য
          </Link>
        </div>
      </div>

      {products.length === 0 ? (
        <p className="text-center text-gray-600 py-8">এই দোকানে কোনও পণ্য নেই</p>
      ) : (
        <div className="space-y-4">
          {products.map((product) => (
            <div
              key={product.id}
              className="bg-white border border-gray-200 rounded-lg p-6 flex flex-col gap-4 md:flex-row md:justify-between md:items-center hover:shadow-md card-lift"
            >
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{product.name}</h2>
                <p className="text-sm text-gray-500 mt-1">Category: {product.category || "Uncategorized"}</p>
                <p className="text-base text-gray-600 mt-2">
                  দাম: {product.sellPrice} ৳ | স্টক: {product.stockQty}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  অবস্থা: {product.isActive ? "সক্রিয়" : "নিষ্ক্রিয়"}
                </p>
              </div>

              <div className="w-full md:w-auto grid grid-cols-2 gap-2 md:flex md:gap-2">
                <Link
                  href={`/dashboard/products/${product.id}`}
                  className="w-full md:w-auto px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors text-center"
                >
                  এডিট
                </Link>
                <button className="w-full md:w-auto px-4 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors">
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
