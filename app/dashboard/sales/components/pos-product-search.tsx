// app/dashboard/sales/components/PosProductSearch.tsx
"use client";

import { useState } from "react";
import { useCart } from "@/hooks/use-cart";

type PosProductSearchProps = {
  products: {
    id: string;
    name: string;
    sellPrice: string;
  }[];
};

export function PosProductSearch({ products }: PosProductSearchProps) {
  const [query, setQuery] = useState("");
  const add = useCart((s) => s.add);

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
            onClick={() =>
              add({
                productId: p.id,
                name: p.name,
                unitPrice: Number(p.sellPrice),
              })
            }
          >
            {p.name} — {p.sellPrice}
          </button>
        ))}

        {filtered.length === 0 && (
          <p className="text-sm text-gray-400">No products found</p>
        )}
      </div>
    </div>
  );
}
