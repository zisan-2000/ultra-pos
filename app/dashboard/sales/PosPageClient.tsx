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
    stockQty?: string | number;
  }[];
  customers: {
    id: string;
    name: string;
    phone: string | null;
    totalDue: string;
  }[];
  shopName: string;
  shopId: string;
  submitSale: (formData: FormData) => Promise<void>;
};

export function PosPageClient({
  products,
  customers,
  shopName,
  shopId,
  submitSale,
}: PosPageClientProps) {
  const { items, totalAmount, clear } = useCart();
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [customerId, setCustomerId] = useState<string>("");
  const [paidNow, setPaidNow] = useState<string>("");
  const [note, setNote] = useState("");
  const online = useOnlineStatus();

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (items.length === 0) return;

    if (paymentMethod === "due" && !customerId) {
      alert("Select a customer for due sale.");
      return;
    }

    const totalVal = totalAmount();
    const paidNowNumber = Math.min(
      Math.max(Number(paidNow || 0), 0),
      totalVal
    );

    // Online case - use server action
    if (online) {
      const formData = new FormData(e.currentTarget);

      formData.set("shopId", shopId);
      formData.set("paymentMethod", paymentMethod);
      formData.set("customerId", customerId);
      formData.set("paidNow", paidNowNumber.toString());
      formData.set("note", note);
      formData.set("cart", JSON.stringify(items));
      formData.set("totalAmount", totalAmount().toString());

      await submitSale(formData);
      clear();
      setPaidNow("");
      return;
    }

    if (paymentMethod === "due") {
      alert("Due sales require internet so ledger stays accurate.");
      return;
    }

    // Offline case - save to Dexie + queue
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
      customerId: null,
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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-screen overflow-hidden">
      {/* Left: Products */}
      <div className="lg:col-span-2 flex flex-col overflow-hidden">
        <div className="mb-6 pb-4 border-b border-slate-200">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">নতুন বিক্রি</h1>
              <p className="text-base text-slate-600 mt-2">
                দোকান: <span className="font-semibold">{shopName}</span>
              </p>
            </div>

            <span
              className={`text-sm px-4 py-2 rounded-full font-medium ${
                online ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
              }`}
            >
              {online ? "অনলাইন" : "অফলাইন"}
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <PosProductSearch products={products} />
        </div>
      </div>

      {/* Right: Cart */}
      <div className="lg:col-span-1 bg-slate-50 rounded-lg p-6 flex flex-col overflow-hidden border border-slate-200">
        <h2 className="text-2xl font-bold text-slate-900 mb-6">বর্তমান বিল</h2>

        <div className="flex-1 overflow-y-auto mb-6 space-y-3 pr-2">
          {items.length === 0 ? (
            <p className="text-center text-slate-500 py-8">বিল খালি আছে</p>
          ) : (
            items.map((i) => <PosCartItem key={i.productId} item={i} />)
          )}
        </div>

        {/* Summary Section */}
        <div className="border-t border-slate-300 pt-4 space-y-4">
          <div className="bg-white rounded-lg p-4">
            <p className="text-sm text-slate-600 mb-1">মোট পরিমাণ</p>
            <p className="text-3xl font-bold text-slate-900">
              {totalAmount().toFixed(2)} ৳
            </p>
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <label className="text-base font-medium text-slate-900">পেমেন্ট পদ্ধতি</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: "cash", label: "ক্যাশ" },
                { value: "bkash", label: "বিকাশ" },
                { value: "due", label: "ধার" },
              ].map((method) => (
                <button
                  key={method.value}
                  onClick={() => setPaymentMethod(method.value)}
                  className={`py-3 px-3 rounded-lg font-medium text-base transition-colors ${
                    paymentMethod === method.value
                      ? "bg-blue-600 text-white"
                      : "bg-white text-slate-900 border border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {method.label}
                </button>
              ))}
            </div>
          </div>

          {/* Customer Selection for Due */}
          {paymentMethod === "due" && (
            <div className="space-y-2">
              <label className="text-base font-medium text-slate-900">গ্রাহক বাছাই করুন</label>
              <select
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-base"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">-- গ্রাহক বাছাই করুন --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} - বাকি: {Number(c.totalDue || 0).toFixed(2)} ৳
                  </option>
                ))}
              </select>
              <a
                className="text-sm text-blue-600 hover:underline"
                href={`/dashboard/due?shopId=${shopId}`}
              >
                নতুন গ্রাহক যোগ করুন
              </a>
            </div>
          )}
        </div>

        {/* Complete Sale Button */}
        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <button
            type="submit"
            disabled={items.length === 0}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-400 text-white font-bold py-4 px-4 rounded-lg text-lg transition-colors"
          >
            ✓ বিল সম্পন্ন করুন
          </button>

          <button
            type="button"
            onClick={() => clear()}
            className="w-full border border-slate-200 text-slate-900 font-medium py-3 px-4 rounded-lg text-base hover:bg-slate-100 transition-colors"
          >
            বিল পরিষ্কার করুন
          </button>
        </form>
      </div>
    </div>
  );
}
