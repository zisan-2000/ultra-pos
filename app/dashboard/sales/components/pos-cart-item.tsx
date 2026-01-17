// app/dashboard/sales/components/PosCartItem.tsx
"use client";

import { memo, useCallback, useRef } from "react";
import { useCart, CartItem } from "@/hooks/use-cart";
import { useShallow } from "zustand/react/shallow";

export const PosCartItem = memo(function PosCartItem({
  item,
}: {
  item: CartItem;
}) {
  const { increase, decrease, remove } = useCart(
    useShallow((s) => ({
      increase: s.increase,
      decrease: s.decrease,
      remove: s.remove,
    }))
  );
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
    <div className="bg-card border border-border rounded-2xl p-3 shadow-sm space-y-3 text-foreground">
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
          aria-label="Remove item"
          className="h-8 w-8 rounded-full border border-danger/30 bg-danger-soft text-danger flex items-center justify-center text-sm font-semibold"
        >
          ✕
        </button>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-border bg-muted/60 p-2">
        <button
          type="button"
          onClick={handleDecrease}
          className="h-8 w-10 flex items-center justify-center rounded-lg border border-border bg-card text-sm font-semibold hover:bg-muted"
        >
          −
        </button>
        <span className="w-10 text-center font-semibold text-foreground text-sm">{item.qty}</span>
        <button
          type="button"
          onClick={handleIncrease}
          className="h-8 w-10 flex items-center justify-center rounded-lg border border-border bg-card text-sm font-semibold hover:bg-muted"
        >
          +
        </button>
      </div>
    </div>
  );
});
