// app/dashboard/sales/PosPageClient.tsx
"use client";

import { useState } from "react";
import { PosProductSearch } from "./components/PosProductSearch";
import { PosCartItem } from "./components/PosCartItem";
import { useCart } from "@/hooks/use-cart";

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

  async function handleAction(formData: FormData) {
    if (items.length === 0) {
      return;
    }

    formData.set("shopId", shopId);
    formData.set("paymentMethod", paymentMethod);
    formData.set("note", note);
    formData.set("cart", JSON.stringify(items));
    formData.set("totalAmount", totalAmount().toString());

    await submitSale(formData);
    clear();
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      {/* Left: Products */}
      <div className="col-span-2">
        <div className="mb-3">
          <h1 className="text-xl font-bold">POS</h1>
          <p className="text-sm text-gray-600">
            Shop: <span className="font-semibold">{shopName}</span>
          </p>
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

        <form action={handleAction} className="space-y-2">
          <button
            type="submit"
            disabled={items.length === 0}
            className="w-full bg-black text-white p-3 rounded disabled:bg-gray-400"
          >
            Complete Sale
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
