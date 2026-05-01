"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useCart, type CartItem } from "@/hooks/use-cart";
import { useShallow } from "zustand/react/shallow";

export const PosMiniCartItem = memo(function PosMiniCartItem({
  item,
}: {
  item: CartItem;
}) {
  const { increase, decrease, remove, updatePrice, updateQty } = useCart(
    useShallow((s) => ({
      increase: s.increase,
      decrease: s.decrease,
      remove: s.remove,
      updatePrice: s.updatePrice,
      updateQty: s.updateQty,
    }))
  );

  const [priceInput, setPriceInput] = useState(() => String(item.unitPrice));
  const [qtyInput, setQtyInput] = useState(() => String(item.qty));
  const lockRef = useRef(false);

  useEffect(() => { setPriceInput(String(item.unitPrice)); }, [item.unitPrice]);
  useEffect(() => { setQtyInput(String(item.qty)); }, [item.qty]);

  const commitPrice = useCallback(() => {
    const parsed = parseFloat(priceInput);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setPriceInput(String(item.unitPrice));
    } else if (parsed !== item.unitPrice) {
      updatePrice(item.itemKey, parsed);
    }
  }, [priceInput, item.unitPrice, item.itemKey, updatePrice]);

  const commitQty = useCallback(() => {
    const parsed = parseFloat(qtyInput);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setQtyInput(String(item.qty));
    } else if (parsed !== item.qty) {
      updateQty(item.itemKey, parsed);
    }
  }, [qtyInput, item.qty, item.itemKey, updateQty]);

  const guard = useCallback((fn: () => void) => {
    if (lockRef.current) return;
    lockRef.current = true;
    fn();
    requestAnimationFrame(() => { lockRef.current = false; });
  }, []);

  const showUnit = item.baseUnit && item.baseUnit !== "pcs";

  return (
    <div className="rounded-xl border border-border/70 bg-background px-2.5 py-2 space-y-1.5">
      {/* Row 1: Name + unit badge + Remove */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="text-xs font-semibold text-foreground leading-snug">{item.name}</span>
          {showUnit && (
            <span className="inline-flex items-center rounded border border-primary/20 bg-primary/8 px-1 py-px text-[9px] font-semibold text-primary/70 leading-none">
              {item.baseUnit}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => guard(() => remove(item.itemKey))}
          aria-label="Remove"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] text-danger"
        >
          ✕
        </button>
      </div>

      {/* Row 2: Price + Qty */}
      <div className="flex items-center gap-1.5">
        {/* Price */}
        <div className="flex items-center gap-1">
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
            className="h-7 w-16 rounded-lg border border-border bg-card px-1.5 text-center text-xs font-semibold text-foreground outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
          />
        </div>

        {/* Qty */}
        <div className="flex flex-1 items-center justify-end gap-0.5">
          <button
            type="button"
            onClick={() => guard(() => decrease(item.itemKey))}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card text-sm font-semibold"
          >
            −
          </button>
          <input
            type="text"
            inputMode="decimal"
            value={qtyInput}
            onChange={(e) => setQtyInput(e.target.value)}
            onBlur={commitQty}
            onKeyDown={(e) => {
              if (e.key === "Enter") { commitQty(); (e.target as HTMLInputElement).blur(); }
            }}
            onFocus={(e) => e.target.select()}
            className="h-7 w-12 rounded-lg border border-border bg-card px-1 text-center text-xs font-semibold text-foreground outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
          />
          <button
            type="button"
            onClick={() => guard(() => increase(item.itemKey))}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card text-sm font-semibold"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
});
