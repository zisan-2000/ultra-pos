// app/dashboard/sales/components/PosProductSearch.tsx
"use client";

import { useState } from "react";
import { useCart } from "@/hooks/use-cart";

type PosProductSearchProps = {
  shopId: string;
  products: {
    id: string;
    name: string;
    sellPrice: string;
    stockQty?: string | number;
  }[];
};

export function PosProductSearch({ products, shopId }: PosProductSearchProps) {
  const [query, setQuery] = useState("");
  const add = useCart((s) => s.add);
  const items = useCart((s) => s.items);

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <input
        className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
        placeholder="পণ্য খুঁজুন (নাম/কোড)..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <p className="text-center text-gray-500 py-8">এই নামে কোনো পণ্য নেই</p>
        ) : (
          filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              className="block w-full text-left bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-green-300 transition-all"
              onClick={() => {
                const stock = Number(p.stockQty ?? 0);
                const inCart = items.find((i) => i.productId === p.id)?.qty || 0;
                if (stock <= inCart) {
                  const proceed = window.confirm(
                    stock <= 0
                      ? `${p.name}-এর স্টক নেই। তবুও যোগ করবেন?`
                      : `${p.name}-এর স্টক ${stock} টি আছে। তবুও যোগ করবেন?`
                  );
                  if (!proceed) return;
                }

                add({
                  shopId,
                  productId: p.id,
                  name: p.name,
                  unitPrice: Number(p.sellPrice),
                });
              }}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 text-base">{p.name}</h3>
                  <p className="text-lg font-bold text-green-600 mt-1">
                    দাম: {p.sellPrice} ৳
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                      Number(p.stockQty ?? 0) <= 0
                        ? "bg-red-100 text-red-700"
                        : Number(p.stockQty ?? 0) < 3
                        ? "bg-orange-100 text-orange-700"
                        : "bg-green-100 text-green-700"
                    }`}
                  >
                    স্টক: {Number(p.stockQty ?? 0).toFixed(0)}
                  </span>
                  <p className="text-sm text-gray-500 mt-2">+ যোগ করতে ট্যাপ করুন</p>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
