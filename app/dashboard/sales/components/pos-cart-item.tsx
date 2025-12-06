// app/dashboard/sales/components/PosCartItem.tsx
"use client";

import { useState } from "react";
import { useCart, CartItem } from "@/hooks/use-cart";

export function PosCartItem({ item }: { item: CartItem }) {
  const { increase, decrease, remove } = useCart();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleIncrease = () => {
    if (isProcessing) return;
    setIsProcessing(true);
    increase(item.productId);
    setTimeout(() => setIsProcessing(false), 100);
  };

  const handleDecrease = () => {
    if (isProcessing) return;
    setIsProcessing(true);
    decrease(item.productId);
    setTimeout(() => setIsProcessing(false), 100);
  };

  const handleRemove = () => {
    if (isProcessing) return;
    setIsProcessing(true);
    remove(item.productId);
    setTimeout(() => setIsProcessing(false), 100);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 text-sm leading-snug">{item.name}</h3>
          <p className="text-xs text-gray-600 mt-1">
            {item.unitPrice} ৳ × {item.qty} = <span className="font-bold text-gray-900">{item.total} ৳</span>
          </p>
        </div>
        <button
          type="button"
          onClick={handleRemove}
          disabled={isProcessing}
          className="text-red-600 hover:text-red-800 font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ✕
        </button>
      </div>

      <div className="flex gap-2 items-center justify-center bg-gray-100 rounded-lg p-2">
        <button
          type="button"
          onClick={handleDecrease}
          disabled={isProcessing}
          className="w-8 h-8 flex items-center justify-center bg-white border border-gray-300 rounded hover:bg-gray-50 font-bold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          −
        </button>
        <span className="w-8 text-center font-bold text-gray-900 text-sm">{item.qty}</span>
        <button
          type="button"
          onClick={handleIncrease}
          disabled={isProcessing}
          className="w-8 h-8 flex items-center justify-center bg-white border border-gray-300 rounded hover:bg-gray-50 font-bold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          +
        </button>
      </div>
    </div>
  );
}
