// app/dashboard/sales/hooks/use-pos-serials.ts

"use client";

import { useState, useCallback } from "react";
import { useCart } from "@/hooks/use-cart";

export type SerialPickerTarget = {
  itemKey: string;
  productId: string;
  productName: string;
  variantId: string | null;
  qty: number;
};

export function usePosSerials(shopId: string) {
  const [serialPicker, setSerialPicker] = useState<SerialPickerTarget | null>(null);
  const [availableSerials, setAvailableSerials] = useState<{ id: string; serialNo: string }[]>([]);
  const [serialStockQty, setSerialStockQty] = useState<number | null>(null);
  const [serialInStockCount, setSerialInStockCount] = useState<number | null>(null);
  const [serialHasMismatch, setSerialHasMismatch] = useState(false);
  const [serialBlockingReason, setSerialBlockingReason] = useState<string | null>(null);
  const [serialPickerInput, setSerialPickerInput] = useState("");
  const [selectedSerials, setSelectedSerials] = useState<string[]>([]);
  const [serialsLoading, setSerialsLoading] = useState(false);

  const openSerialPicker = useCallback(
    async (
      itemKey: string,
      productId: string,
      productName: string,
      variantId: string | null,
      qty: number
    ) => {
      const currentItem = useCart
        .getState()
        .items.find((row) => row.itemKey === itemKey && row.shopId === shopId);
      const currentQty = Math.max(1, Math.round(Number(currentItem?.qty ?? qty)));
      const existingSerials = (currentItem?.serialNumbers ?? [])
        .map((serial) => String(serial || "").trim().toUpperCase())
        .filter(Boolean);

      setSerialPicker({ itemKey, productId, productName, variantId, qty: currentQty });
      setSelectedSerials(Array.from(new Set(existingSerials)));
      setSerialPickerInput("");
      setSerialStockQty(null);
      setSerialInStockCount(null);
      setSerialHasMismatch(false);
      setSerialBlockingReason(null);
      setSerialsLoading(true);

      try {
        const url = `/api/serials/available?shopId=${shopId}&productId=${productId}${variantId ? `&variantId=${variantId}` : ""}`;
        const res = await fetch(url);
        const data = await res.json();
        const serials = Array.isArray(data?.serials) ? data.serials : [];
        setAvailableSerials(serials);
        setSerialStockQty(
          Number.isFinite(Number(data?.stockQty)) ? Number(data.stockQty) : null
        );
        setSerialInStockCount(
          Number.isFinite(Number(data?.serialInStockCount))
            ? Number(data.serialInStockCount)
            : serials.length
        );
        setSerialHasMismatch(Boolean(data?.hasMismatch));
        setSerialBlockingReason(
          typeof data?.blockingReason === "string" && data.blockingReason.trim()
            ? data.blockingReason.trim()
            : null
        );
      } catch {
        setAvailableSerials([]);
        setSerialStockQty(null);
        setSerialInStockCount(null);
        setSerialHasMismatch(false);
        setSerialBlockingReason(null);
      } finally {
        setSerialsLoading(false);
      }
    },
    [shopId]
  );

  const confirmSerialPicker = useCallback(() => {
    if (!serialPicker) return;
    if (serialHasMismatch) return;
    const { setSerialNumbers, updateQty } = useCart.getState();
    const normalized = Array.from(
      new Set(
        selectedSerials
          .map((serial) => String(serial || "").trim().toUpperCase())
          .filter(Boolean)
      )
    );
    setSerialNumbers(serialPicker.itemKey, normalized);
    if (normalized.length > 0 && normalized.length !== serialPicker.qty) {
      updateQty(serialPicker.itemKey, normalized.length);
    }
    setSerialPicker(null);
  }, [serialHasMismatch, serialPicker, selectedSerials]);

  const addManualSerial = useCallback((value: string) => {
    const sn = value.trim().toUpperCase();
    if (!sn) return;
    setSelectedSerials((prev) => (prev.includes(sn) ? prev : [...prev, sn]));
    setSerialPickerInput("");
  }, []);

  const serialTargetQty = Math.max(serialPicker?.qty ?? 0, selectedSerials.length);

  return {
    serialPicker,
    setSerialPicker,
    availableSerials,
    serialStockQty,
    serialInStockCount,
    serialHasMismatch,
    serialBlockingReason,
    serialPickerInput,
    setSerialPickerInput,
    selectedSerials,
    setSelectedSerials,
    serialsLoading,
    serialTargetQty,
    openSerialPicker,
    confirmSerialPicker,
    addManualSerial,
  };
}
