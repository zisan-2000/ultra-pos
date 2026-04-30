"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useCart, type CartItem } from "@/hooks/use-cart";
import { useShallow } from "zustand/react/shallow";

export const PosMiniCartItem = memo(function PosMiniCartItem({
  item,
}: {
  item: CartItem;
}) {
  const { increase, decrease, remove, updatePrice } = useCart(
    useShallow((s) => ({
      increase: s.increase,
      decrease: s.decrease,
      remove: s.remove,
      updatePrice: s.updatePrice,
    }))
  );

  const [priceInput, setPriceInput] = useState(() => String(item.unitPrice));
  const lockRef = useRef(false);

  useEffect(() => {
    setPriceInput(String(item.unitPrice));
  }, [item.unitPrice]);

  const commitPrice = useCallback(() => {
    const parsed = parseFloat(priceInput);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setPriceInput(String(item.unitPrice));
    } else if (parsed !== item.unitPrice) {
      updatePrice(item.itemKey, parsed);
    }
  }, [priceInput, item.unitPrice, item.itemKey, updatePrice]);

  const guard = useCallback((fn: () => void) => {
    if (lockRef.current) return;
    lockRef.current = true;
    fn();
    requestAnimationFrame(() => { lockRef.current = false; });
  }, []);

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-background px-2.5 py-2">
      {/* Name */}
      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
        {item.name}
      </span>

      {/* Price */}
      <div className="flex shrink-0 items-center gap-1">
        <span className="text-[10px] text-muted-foreground">৳</span>
        <input
          type="text"
          inputMode="decimal"
          value={priceInput}
          onChange={(e) => setPriceInput(e.target.value)}
          onBlur={commitPrice}
          onKeyDown={(e) => {
            if (e.key === "Enter") { commitPrice(); (e.target as HTMLInputElement).blur(); }
          }}
          onFocus={(e) => e.target.select()}
          className="h-7 w-14 rounded-lg border border-border bg-card px-1.5 text-center text-xs font-semibold text-foreground outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
        />
      </div>

      {/* Qty */}
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={() => guard(() => decrease(item.itemKey))}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card text-sm font-semibold"
        >
          −
        </button>
        <span className="w-6 text-center text-xs font-bold">{item.qty}</span>
        <button
          type="button"
          onClick={() => guard(() => increase(item.itemKey))}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card text-sm font-semibold"
        >
          +
        </button>
      </div>

      {/* Remove */}
      <button
        type="button"
        onClick={() => guard(() => remove(item.itemKey))}
        aria-label="Remove"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] text-danger"
      >
        ✕
      </button>
    </div>
  );
});
