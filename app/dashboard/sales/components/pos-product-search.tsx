// app/dashboard/sales/components/PosProductSearch.tsx
"use client";

import { useState } from "react";
import { useCart } from "@/hooks/use-cart";

type PosProductSearchProps = {
  products: {
    id: string;
    name: string;
    sellPrice: string;
    stockQty?: string | number;
  }[];
};

export function PosProductSearch({ products }: PosProductSearchProps) {
  const [query, setQuery] = useState("");
  const add = useCart((s) => s.add);
  const items = useCart((s) => s.items);

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="space-y-2">
      <input
        className="border p-2 w-full"
        placeholder="Search product..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="border rounded p-2 max-h-72 overflow-y-auto space-y-1">
        {filtered.map((p) => (
          <button
            key={p.id}
            type="button"
            className="block w-full text-left px-2 py-1 hover:bg-gray-100"
            onClick={() => {
              const stock = Number(p.stockQty ?? 0);
              const inCart = items.find((i) => i.productId === p.id)?.qty || 0;
              if (stock <= inCart) {
                const proceed = window.confirm(
                  stock <= 0
                    ? `Stock is 0 for ${p.name}. Sell anyway?`
                    : `Only ${stock} in stock for ${p.name}. Sell anyway?`
                );
                if (!proceed) return;
              }

              add({
                productId: p.id,
                name: p.name,
                unitPrice: Number(p.sellPrice),
              });
            }}
          >
            <div className="flex justify-between">
              <span>
                {p.name} - {p.sellPrice}
              </span>
              <span
                className={`text-xs ${
                  Number(p.stockQty ?? 0) <= 0
                    ? "text-red-600"
                    : Number(p.stockQty ?? 0) < 3
                    ? "text-orange-600"
                    : "text-gray-500"
                }`}
              >
                Stock: {Number(p.stockQty ?? 0).toFixed(0)}
              </span>
            </div>
          </button>
        ))}

        {filtered.length === 0 && (
          <p className="text-sm text-gray-400">No products found</p>
        )}
      </div>
    </div>
  );
}
