// app/dashboard/sales/components/PosCartItem.tsx
"use client";

import { useCart, CartItem } from "@/hooks/use-cart";

export function PosCartItem({ item }: { item: CartItem }) {
  const { increase, decrease, remove } = useCart();

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 text-base">{item.name}</h3>
          <p className="text-sm text-gray-600 mt-1">
            {item.unitPrice} ৳ × {item.qty} = <span className="font-bold text-gray-900">{item.total} ৳</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => remove(item.productId)}
          className="text-red-600 hover:text-red-800 font-bold text-lg"
        >
          ✕
        </button>
      </div>

      <div className="flex gap-2 items-center justify-center bg-gray-100 rounded-lg p-2">
        <button
          type="button"
          onClick={() => decrease(item.productId)}
          className="w-8 h-8 flex items-center justify-center bg-white border border-gray-300 rounded hover:bg-gray-50 font-bold"
        >
          −
        </button>
        <span className="w-8 text-center font-bold text-gray-900">{item.qty}</span>
        <button
          type="button"
          onClick={() => increase(item.productId)}
          className="w-8 h-8 flex items-center justify-center bg-white border border-gray-300 rounded hover:bg-gray-50 font-bold"
        >
          +
        </button>
      </div>
    </div>
  );
}
