// app/dashboard/sales/PosPageClient.tsx

"use client";

import {
  useState,
  FormEvent,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
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
    sellPrice: string | number;
    stockQty?: string | number;
    category?: string | null;
    trackStock?: boolean | null;
  }[];
  customers: {
    id: string;
    name: string;
    phone: string | null;
    totalDue: string | number;
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
  const { totalAmount, clear, setShop: setCartShop } = useCart();
  const cartItems = useCart((s) => s.items);
  const cartShopId = useCart((s) => s.currentShopId);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [barFlash, setBarFlash] = useState(false);
  const cartPanelRef = useRef<HTMLDivElement | null>(null);
  const submitButtonRef = useRef<HTMLButtonElement | null>(null);
  const items = useMemo(
    () => (cartShopId === shopId ? cartItems : []),
    [cartItems, cartShopId, shopId]
  );
  const safeTotalAmount = useMemo(
    () =>
      cartShopId === shopId
        ? totalAmount()
        : items.reduce((sum, i) => sum + i.total, 0),
    [cartShopId, shopId, totalAmount, items]
  );

  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [customerId, setCustomerId] = useState<string>("");
  const [paidNow, setPaidNow] = useState<string>("");
  const [note, setNote] = useState("");
  const online = useOnlineStatus();
  const isDue = paymentMethod === "due";
  const paymentOptions = [
    { value: "cash", label: "ক্যাশ" },
    { value: "bkash", label: "বিকাশ" },
    { value: "nagad", label: "নগদ" },
    { value: "card", label: "কার্ড" },
    { value: "bank_transfer", label: "ব্যাংক ট্রান্সফার" },
    { value: "due", label: "ধার" },
  ];

  // Keep cart tied to the currently selected shop; reset when shop changes
  useEffect(() => {
    setCartShop(shopId);
  }, [shopId, setCartShop]);

  // Clear partial payment when switching away from due
  useEffect(() => {
    if (!isDue) {
      setPaidNow("");
    }
  }, [isDue]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (items.length === 0) return;

    if (paymentMethod === "due" && !customerId) {
      alert("Select a customer for due sale.");
      return;
    }

    const totalVal = safeTotalAmount as number;
    const paidNowNumber = isDue
      ? Math.min(Math.max(Number(paidNow || 0), 0), totalVal)
      : 0;

    // Online case - use server action
    if (online) {
      const formData = new FormData(e.currentTarget);

      formData.set("shopId", shopId);
      formData.set("paymentMethod", paymentMethod);
      formData.set("customerId", customerId);
      formData.set("paidNow", paidNowNumber.toString());
      formData.set("note", note);
      formData.set("cart", JSON.stringify(items));
      formData.set("totalAmount", safeTotalAmount.toString());

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
      totalAmount: safeTotalAmount.toFixed(2),
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

  const itemCount = useMemo(
    () => items.reduce((sum, i) => sum + i.qty, 0),
    [items]
  );

  const scrollToCart = () => {
    if (cartPanelRef.current) {
      cartPanelRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  const handleSellFromBar = () => {
    submitButtonRef.current?.click();
  };

  const handleClearFromBar = () => {
    clear();
    setPaidNow("");
  };

  useEffect(() => {
    if (items.length === 0) return;
    setBarFlash(true);
    const t = setTimeout(() => setBarFlash(false), 240);
    return () => clearTimeout(t);
  }, [items.length]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Products */}
      <div className="lg:col-span-2 flex flex-col gap-6">
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
                online
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {online ? "অনলাইন" : "অফলাইন"}
            </span>
          </div>
        </div>

        <div className="flex-1">
          <PosProductSearch products={products} shopId={shopId} />
        </div>
      </div>

      {/* Right: Cart */}
      <div
        ref={cartPanelRef}
        className="lg:col-span-1 bg-slate-50 rounded-lg p-6 flex flex-col gap-4 border border-slate-200"
      >
        <h2 className="text-2xl font-bold text-slate-900 mb-6">বর্তমান বিল</h2>

        <div className="mb-6 space-y-3">
          {items.length === 0 ? (
            <p className="text-center text-slate-500 py-8">কিছু যোগ করা হয়নি</p>
          ) : (
            items.map((i) => <PosCartItem key={i.productId} item={i} />)
          )}
        </div>

        {/* Summary Section */}
        <div className="border-t border-slate-300 pt-4 space-y-4">
          <div className="bg-white rounded-lg p-4">
            <p className="text-sm text-slate-600 mb-1">মোট পরিমাণ</p>
            <p className="text-3xl font-bold text-slate-900">
              {(safeTotalAmount as number).toFixed(2)} ৳
            </p>
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <label className="text-base font-medium text-slate-900">
              পেমেন্ট পদ্ধতি
            </label>
            <select
              className="w-full border border-slate-200 rounded-lg px-3 py-3 text-base"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              {paymentOptions.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
          </div>

          {/* Customer Selection for Due */}
          {isDue && (
            <div className="space-y-2">
              <label className="text-base font-medium text-slate-900">
                গ্রাহক নির্বাচন করুন
              </label>
              <select
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-base"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">-- একজন গ্রাহক নির্বাচন করুন --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} - বকেয়া: {Number(c.totalDue || 0).toFixed(2)} ৳
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

          {/* Partial payment - only for due */}
          {isDue && (
            <div className="space-y-2">
              <label className="text-base font-medium text-slate-900">
                এখন পরিশোধ (আংশিক হলে)
              </label>
              <input
                type="number"
                min="0"
                max={safeTotalAmount}
                step="0.01"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-base"
                placeholder="যেমন: 100 (আংশিক পরিশোধের জন্য)"
                value={paidNow}
                onChange={(e) => setPaidNow(e.target.value)}
              />
              <p className="text-sm text-slate-500">
                মোট {safeTotalAmount.toFixed(2)} ৳ | আংশিক দিলে বাকি ধার হিসেবে
                থাকবে।
              </p>
            </div>
          )}

          {/* Note */}
          <div className="space-y-2">
            <label className="text-base font-medium text-slate-900">
              নোট (ঐচ্ছিক)
            </label>
            <textarea
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-base"
              rows={3}
              placeholder="অতিরিক্ত তথ্য লিখুন..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        {/* Complete Sale Button */}
        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <button
            type="submit"
            disabled={items.length === 0}
            ref={submitButtonRef}
            className="w-full bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold py-4 px-4 rounded-lg text-lg transition-colors hover:border-emerald-300 hover:bg-emerald-100 disabled:bg-slate-200 disabled:text-slate-500"
          >
            ✓ বিল সম্পন্ন করুন
          </button>

          <button
            type="button"
            onClick={() => clear()}
            className="w-full border border-slate-200 text-slate-900 font-medium py-3 px-4 rounded-lg text-base hover:bg-slate-100 transition-colors"
          >
            কার্ট পরিষ্কার করুন
          </button>
        </form>
      </div>
      {/* Sticky mini-bill for mobile */}
      {items.length > 0 && (
        <div className="lg:hidden fixed bottom-16 inset-x-0 z-40 px-4">
          <div
            className={`relative bg-white rounded-2xl border-t border-slate-200 shadow-[0_-6px_24px_rgba(15,23,42,0.12)] px-4 py-3 flex items-center gap-3 ${
              barFlash ? "flash-bar" : ""
            }`}
          >
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-slate-300" />
            <div className="flex-1">
              <div className="inline-flex items-center gap-1 text-[11px] text-slate-500 leading-tight">
                <span>মোট বিল</span>
                <button
                  type="button"
                  aria-label="বিল বিস্তারিত দেখুন"
                  className="text-slate-400 hover:text-slate-600"
                  onClick={scrollToCart}
                >
                  ▼
                </button>
              </div>
              <p className="text-base font-semibold text-slate-900 leading-tight">
                {safeTotalAmount.toFixed(2)} ৳ — {itemCount} আইটেম
              </p>
            </div>
            <button
              type="button"
              onClick={handleClearFromBar}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700"
            >
              পরিষ্কার
            </button>
            <button
              type="button"
              onClick={handleSellFromBar}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold min-w-[140px]"
            >
              বিল সম্পন্ন
            </button>
          </div>
        </div>
      )}

      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40 animate-fade-in"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 bg-white rounded-t-2xl shadow-2xl p-4 space-y-4 max-h-[70vh] overflow-y-auto animate-slide-up">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">বর্তমান বিল</p>
                <p className="text-lg font-semibold text-slate-900">
                  {safeTotalAmount.toFixed(2)} ৳ • {itemCount} আইটেম
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700"
              >
                বন্ধ
              </button>
            </div>

            {items.length === 0 ? (
              <p className="text-center text-slate-500 py-6">কার্ট খালি</p>
            ) : (
              <div className="space-y-3">
                {items.map((i) => (
                  <PosCartItem key={i.productId} item={i} />
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={scrollToCart}
                className="flex-1 rounded-lg border border-slate-200 py-3 text-sm font-semibold text-slate-800"
              >
                পূর্ণ বিল ফর্ম দেখুন
              </button>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="px-4 py-3 rounded-lg bg-emerald-600 text-white text-sm font-semibold"
              >
                ঠিক আছে
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
