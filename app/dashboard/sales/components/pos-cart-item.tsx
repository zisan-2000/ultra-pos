// app/dashboard/sales/components/PosCartItem.tsx
"use client";

import { useCart, CartItem } from "@/hooks/use-cart";

export function PosCartItem({ item }: { item: CartItem }) {
  const { increase, decrease, remove } = useCart();

  return (
    <div className="flex justify-between items-center border p-2 rounded mb-2">
      <div>
        <h3 className="font-medium">{item.name}</h3>
        <p className="text-sm text-gray-600">
          {item.unitPrice} × {item.qty} = {item.total}
        </p>
      </div>

      <div className="flex gap-2 items-center">
        <button
          type="button"
          onClick={() => decrease(item.productId)}
          className="px-2 py-1 border rounded"
        >
          -
        </button>
        <button
          type="button"
          onClick={() => increase(item.productId)}
          className="px-2 py-1 border rounded"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => remove(item.productId)}
          className="px-2 py-1 bg-red-500 text-white rounded"
        >
          ×
        </button>
      </div>
    </div>
  );
}
