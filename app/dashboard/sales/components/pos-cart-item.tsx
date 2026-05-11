// app/dashboard/sales/components/PosCartItem.tsx
"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useCart, CartItem } from "@/hooks/use-cart";
import { useShallow } from "zustand/react/shallow";

export const PosCartItem = memo(function PosCartItem({
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
  const lockRef = useRef(false);
  const [priceInput, setPriceInput] = useState(() => String(item.unitPrice));
  const [qtyInput, setQtyInput] = useState(() => String(item.qty));

  useEffect(() => { setPriceInput(String(item.unitPrice)); }, [item.unitPrice]);
  useEffect(() => { setQtyInput(String(item.qty)); }, [item.qty]);

  const commitPrice = useCallback(() => {
    const parsed = parseFloat(priceInput);
    if (!Number.isFinite(parsed) || parsed <= 0) {
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

  const runOncePerFrame = useCallback((action: () => void) => {
    if (lockRef.current) return;
    lockRef.current = true;
    action();
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => { lockRef.current = false; });
    } else {
      setTimeout(() => { lockRef.current = false; }, 16);
    }
  }, []);

  const handleIncrease = useCallback(() => {
    runOncePerFrame(() => increase(item.itemKey));
  }, [increase, item.itemKey, runOncePerFrame]);

  const handleDecrease = useCallback(() => {
    runOncePerFrame(() => decrease(item.itemKey));
  }, [decrease, item.itemKey, runOncePerFrame]);

  const handleRemove = useCallback(() => {
    runOncePerFrame(() => remove(item.itemKey));
  }, [remove, item.itemKey, runOncePerFrame]);

  const showUnit = item.baseUnit && item.baseUnit !== "pcs";
  const isDiscounted = item.originalPrice > item.unitPrice;
  const serialized = item.trackSerialNumbers === true;

  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-sm text-foreground space-y-2.5">
      {/* Row 1: Name + Unit badge + Remove */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-1 min-w-0 items-start gap-1.5">
          <h3 className="text-sm font-semibold leading-snug">{item.name}</h3>
          {showUnit && (
            <span className="shrink-0 mt-0.5 inline-flex items-center rounded-md border border-primary/20 bg-primary/8 px-1.5 py-0.5 text-[10px] font-semibold text-primary/70 leading-none">
              {item.baseUnit}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleRemove}
          aria-label="Remove item"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-danger/30 bg-danger-soft text-danger text-xs font-semibold"
        >
          ✕
        </button>
      </div>

      {/* Row 2: Price input + Qty controls */}
      <div className="flex items-center gap-2">
        {/* Price input */}
        <div className="flex flex-col items-start gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">৳</span>
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
              className="h-8 w-16 sm:w-20 rounded-lg border border-border bg-background px-2 text-center text-sm font-semibold text-foreground outline-none transition focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
            />
          </div>
          {isDiscounted && (
            <span className="pl-4 text-[10px] text-muted-foreground/60 line-through leading-none">
              ৳{item.originalPrice}
            </span>
          )}
        </div>

        {/* Qty controls */}
        <div className="flex flex-1 items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={handleDecrease}
            disabled={serialized}
            className="flex h-8 w-9 items-center justify-center rounded-lg border border-border bg-muted/60 text-sm font-semibold hover:bg-muted"
          >
            −
          </button>
          <input
            type="text"
            inputMode="decimal"
            value={qtyInput}
            onChange={(e) => setQtyInput(e.target.value)}
            onBlur={serialized ? undefined : commitQty}
            onKeyDown={(e) => {
              if (!serialized && e.key === "Enter") { commitQty(); (e.target as HTMLInputElement).blur(); }
            }}
            onFocus={(e) => e.target.select()}
            readOnly={serialized}
            className="h-8 w-14 rounded-lg border border-border bg-background px-1 text-center text-sm font-semibold text-foreground outline-none transition focus:border-primary/40 focus:ring-1 focus:ring-primary/20 read-only:bg-muted/40"
          />
          <button
            type="button"
            onClick={handleIncrease}
            disabled={serialized}
            className="flex h-8 w-9 items-center justify-center rounded-lg border border-border bg-muted/60 text-sm font-semibold hover:bg-muted"
          >
            +
          </button>
        </div>
      </div>

      {/* Row 3: Line total */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        {isDiscounted ? (
          <span className="inline-flex items-center rounded-full border border-success/30 bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-success leading-none">
            -৳{(item.originalPrice - item.unitPrice).toFixed(2)} ছাড়
          </span>
        ) : (
          <span />
        )}
        <span>
          {item.unitPrice} × {item.qty}{showUnit ? ` ${item.baseUnit}` : ""} ={" "}
          <span className="ml-1 text-sm font-bold text-foreground">{item.total} ৳</span>
        </span>
      </div>

      {/* Serial numbers badge */}
      {item.serialNumbers && item.serialNumbers.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {item.serialNumbers.map((sn) => (
            <span
              key={sn}
              className="inline-flex items-center rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-semibold px-2 py-0.5"
            >
              SN: {sn}
            </span>
          ))}
        </div>
      )}
      {serialized ? (
        <p className="text-[10px] font-medium text-muted-foreground">
          Qty serial picker থেকেই নিয়ন্ত্রণ করুন।
        </p>
      ) : null}
    </div>
  );
});
