// app/dashboard/sales/PosPageClient.tsx
"use client";

import { useState, FormEvent } from "react";
import { PosProductSearch } from "./components/pos-product-search";
import { PosCartItem } from "./components/pos-cart-item";
import { useCart } from "@/hooks/use-cart";

import { useOnlineStatus } from "@/lib/sync/net-status";
import { db } from "@/lib/dexie/db";
import { queueAdd } from "@/lib/sync/queue";

type PosPageClientProps = {
  products: {
    id: string;
    name: string;
    sellPrice: string;
  }[];
  shopName: string;
  shopId: string;
  submitSale: (formData: FormData) => Promise<void>;
};

export function PosPageClient({
  products,
  shopName,
  shopId,
  submitSale,
}: PosPageClientProps) {
  const { items, totalAmount, clear } = useCart();
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [note, setNote] = useState("");
  const online = useOnlineStatus();

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (items.length === 0) return;

    // Online case → use server action
    if (online) {
      const formData = new FormData(e.currentTarget);

      formData.set("shopId", shopId);
      formData.set("paymentMethod", paymentMethod);
      formData.set("note", note);
      formData.set("cart", JSON.stringify(items));
      formData.set("totalAmount", totalAmount().toString());

      await submitSale(formData);
      clear();
      return;
    }

    // Offline case → save to Dexie + queue
    const salePayload = {
      tempId: crypto.randomUUID(),
      shopId,
      items: items.map((i) => ({
        productId: i.productId,
        name: i.name,
        unitPrice: i.unitPrice,
        qty: i.qty,
      })),
      paymentMethod,
      note,
      totalAmount: totalAmount().toFixed(2),
      createdAt: Date.now(),
      syncStatus: "new" as const,
    };

    await db.sales.put(salePayload);
    await queueAdd("sale", "create", salePayload);

    alert(
      "Sale stored offline. It will sync automatically when you're online."
    );
    clear();
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      {/* Left: Products */}
      <div className="col-span-2">
        <div className="mb-3 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold">POS</h1>
            <p className="text-sm text-gray-600">
              Shop: <span className="font-semibold">{shopName}</span>
            </p>
          </div>

          <span
            className={`text-xs px-2 py-1 rounded ${
              online ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
            }`}
          >
            {online ? "Online" : "Offline"}
          </span>
        </div>

        <PosProductSearch products={products} />
      </div>

      {/* Right: Cart */}
      <div>
        <h2 className="text-lg font-bold mb-3">Cart</h2>

        <div className="max-h-80 overflow-y-auto mb-3">
          {items.length === 0 ? (
            <p className="text-sm text-gray-500">Cart is empty.</p>
          ) : (
            items.map((i) => <PosCartItem key={i.productId} item={i} />)
          )}
        </div>

        <div className="space-y-2 mb-4">
          <div className="font-semibold">
            Total: {totalAmount().toFixed(2)} ৳
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Payment method</label>
            <select
              className="border px-2 py-1 w-full"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="bkash">bKash</option>
              <option value="nagad">Nagad</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Note (optional)</label>
            <textarea
              className="border w-full p-2 text-sm"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-2">
          <button
            type="submit"
            disabled={items.length === 0}
            className="w-full bg-black text-white p-3 rounded disabled:bg-gray-400"
          >
            {online ? "Complete Sale" : "Save Sale Offline"}
          </button>

          <button
            type="button"
            onClick={() => clear()}
            className="w-full border p-2 rounded text-sm"
          >
            Clear Cart
          </button>
        </form>
      </div>
    </div>
  );
}
