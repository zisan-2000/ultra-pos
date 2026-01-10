// app/dashboard/sales/components/PosCartItem.tsx
"use client";

import { memo, useCallback, useRef } from "react";
import { useCart, CartItem } from "@/hooks/use-cart";

export const PosCartItem = memo(function PosCartItem({
  item,
}: {
  item: CartItem;
}) {
  const increase = useCart((s) => s.increase);
  const decrease = useCart((s) => s.decrease);
  const remove = useCart((s) => s.remove);
  const lockRef = useRef(false);

  const runOncePerFrame = useCallback((action: () => void) => {
    if (lockRef.current) return;
    lockRef.current = true;
    action();
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        lockRef.current = false;
      });
    } else {
      setTimeout(() => {
        lockRef.current = false;
      }, 16);
    }
  }, []);

  const handleIncrease = useCallback(() => {
    runOncePerFrame(() => increase(item.productId));
  }, [increase, item.productId, runOncePerFrame]);

  const handleDecrease = useCallback(() => {
    runOncePerFrame(() => decrease(item.productId));
  }, [decrease, item.productId, runOncePerFrame]);

  const handleRemove = useCallback(() => {
    runOncePerFrame(() => remove(item.productId));
  }, [remove, item.productId, runOncePerFrame]);

  return (
    <div className="bg-card border border-border rounded-lg p-3 space-y-2 text-foreground">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <h3 className="font-semibold text-foreground text-sm leading-snug">{item.name}</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {item.unitPrice} ৳ × {item.qty} = <span className="font-bold text-foreground">{item.total} ৳</span>
          </p>
        </div>
        <button
          type="button"
          onClick={handleRemove}
          className="text-destructive hover:text-destructive/80 font-bold text-lg"
        >
          ✕
        </button>
      </div>

      <div className="flex gap-2 items-center justify-center bg-muted rounded-lg p-2">
        <button
          type="button"
          onClick={handleDecrease}
          className="w-8 h-8 flex items-center justify-center bg-card border border-border rounded hover:bg-muted/60 font-bold"
        >
          −
        </button>
        <span className="w-8 text-center font-bold text-foreground text-sm">{item.qty}</span>
        <button
          type="button"
          onClick={handleIncrease}
          className="w-8 h-8 flex items-center justify-center bg-card border border-border rounded hover:bg-muted/60 font-bold"
        >
          +
        </button>
      </div>
    </div>
  );
});
