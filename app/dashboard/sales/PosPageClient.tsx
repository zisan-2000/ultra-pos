// app/dashboard/sales/PosPageClient.tsx

"use client";

import {
  useState,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PosProductSearch } from "./components/pos-product-search";
import { PosCartItem } from "./components/pos-cart-item";
import { useCart } from "@/hooks/use-cart";

import { useOnlineStatus } from "@/lib/sync/net-status";
import { useSyncStatus } from "@/lib/sync/sync-status";
import { db } from "@/lib/dexie/db";
import { queueAdd } from "@/lib/sync/queue";

type ProductOption = {
  id: string;
  name: string;
  sellPrice: string;
  stockQty?: string | number;
  category?: string | null;
  trackStock?: boolean | null;
};

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
  submitSale: (formData: FormData) => Promise<{ success: boolean; saleId: string }>;
};

export function PosPageClient({
  products,
  customers,
  shopName,
  shopId,
  submitSale,
}: PosPageClientProps) {
  const router = useRouter();
  const clear = useCart((s) => s.clear);
  const setCartShop = useCart((s) => s.setShop);
  const cartItems = useCart((s) => s.items);
  const cartShopId = useCart((s) => s.currentShopId);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [barFlash, setBarFlash] = useState(false);
  const cartPanelRef = useRef<HTMLDivElement | null>(null);
  const submitButtonRef = useRef<HTMLButtonElement | null>(null);
  const [productOptions, setProductOptions] = useState<ProductOption[]>(
    () =>
      products.map((p) => ({
        ...p,
        sellPrice: p.sellPrice.toString(),
      })) as ProductOption[]
  );
  const items = useMemo(
    () => (cartShopId === shopId ? cartItems : []),
    [cartItems, cartShopId, shopId]
  );
  const safeTotalAmount = useMemo(
    () => items.reduce((sum, i) => sum + i.total, 0),
    [items]
  );

  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [customerId, setCustomerId] = useState<string>("");
  const [paidNow, setPaidNow] = useState<string>("");
  const [note, setNote] = useState("");
  const [success, setSuccess] = useState<{ saleId?: string } | null>(null);
  const online = useOnlineStatus();
  const { pendingCount, syncing, lastSyncAt } = useSyncStatus();
  const serverSnapshotRef = useRef(products);
  const refreshInFlightRef = useRef(false);
  const isDue = paymentMethod === "due";
  const paymentOptions = useMemo(
    () => [
      { value: "cash", label: "ক্যাশ" },
      { value: "bkash", label: "বিকাশ" },
      { value: "nagad", label: "নগদ" },
      { value: "card", label: "কার্ড" },
      { value: "bank_transfer", label: "ব্যাংক ট্রান্সফার" },
      { value: "due", label: "ধার" },
    ],
    []
  );

  const applyStockDelta = (soldItems: typeof items) => {
    if (!soldItems || soldItems.length === 0) return;
    const deltas = new Map<string, number>();
    soldItems.forEach((item) => {
      if (!item.productId) return;
      const qty = Number(item.qty || 0);
      if (!Number.isFinite(qty) || qty === 0) return;
      deltas.set(item.productId, (deltas.get(item.productId) ?? 0) + qty);
    });
    if (deltas.size === 0) return;

    setProductOptions((prev) =>
      prev.map((product) => {
        const delta = deltas.get(product.id);
        if (!delta) return product;
        if (product.trackStock === false) return product;
        const current = Number(product.stockQty ?? 0);
        if (!Number.isFinite(current)) return product;
        return { ...product, stockQty: current - delta };
      })
    );

    const updatedAt = Date.now();
    db.transaction("rw", db.products, async () => {
      for (const [productId, delta] of deltas) {
        const record = await db.products.get(productId);
        if (!record || record.trackStock === false) continue;
        const current = Number(record.stockQty ?? 0);
        if (!Number.isFinite(current)) continue;
        const nextQty = current - delta;
        await db.products.update(productId, {
          stockQty: nextQty.toString(),
          updatedAt,
        });
      }
    }).catch((err) => {
      console.error("Update local stock failed", err);
    });
  };

  useEffect(() => {
    if (serverSnapshotRef.current !== products) {
      serverSnapshotRef.current = products;
      refreshInFlightRef.current = false;
    }
  }, [products]);

  useEffect(() => {
    if (!online || !lastSyncAt || syncing || pendingCount > 0) return;
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    router.refresh();
  }, [online, lastSyncAt, syncing, pendingCount, router]);

  // Keep Dexie seeded when online; load from Dexie when offline.
  useEffect(() => {
    let cancelled = false;

    const loadFromDexie = async () => {
      try {
        const rows = await db.products.where("shopId").equals(shopId).toArray();
        if (cancelled) return;
        setProductOptions(
          rows.map((p) => ({
            id: p.id,
            name: p.name,
            sellPrice: p.sellPrice.toString(),
            stockQty: p.stockQty?.toString(),
            category: p.category,
            trackStock: p.trackStock,
          }))
        );
      } catch (err) {
        console.error("Load offline products failed", err);
      }
    };

    if (online) {
      if (syncing || pendingCount > 0 || refreshInFlightRef.current) {
        loadFromDexie();
        return () => {
          cancelled = true;
        };
      }

      setProductOptions(
        products.map((p) => ({
          ...p,
          sellPrice: p.sellPrice.toString(),
        }))
      );
      const rows = products.map((p) => ({
        id: p.id,
        shopId,
        name: p.name,
        category: p.category || "Uncategorized",
        sellPrice: p.sellPrice.toString(),
        stockQty: (p.stockQty ?? "0").toString(),
        isActive: true,
        trackStock: Boolean(p.trackStock),
        updatedAt: Date.now(),
        syncStatus: "synced" as const,
      }));
      db.products.bulkPut(rows).catch((err) => {
        console.error("Seed Dexie products failed", err);
      });
      return () => {
        cancelled = true;
      };
    }

    loadFromDexie();
    return () => {
      cancelled = true;
    };
  }, [online, products, shopId, pendingCount, syncing]);

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

      const res = await submitSale(formData);
      applyStockDelta(items);
      clear();
      setPaidNow("");
      setNote("");
      setCustomerId("");
      setSuccess({ saleId: res?.saleId });
      return;
    }

    // Offline case - save to Dexie + queue
    const nowTs = Date.now();
    const nowIso = new Date(nowTs).toISOString();
    const dueLedgerIds: string[] = [];

    if (isDue) {
      const saleLedgerId = crypto.randomUUID();
      dueLedgerIds.push(saleLedgerId);

      const paidLedgerId = paidNowNumber > 0 ? crypto.randomUUID() : null;
      if (paidLedgerId) dueLedgerIds.push(paidLedgerId);

      const totalAmount = Number(totalVal.toFixed(2));
      const paidAmount = Number(paidNowNumber.toFixed(2));
      const dueDelta = Number((totalAmount - paidAmount).toFixed(2));

      await db.transaction("rw", db.dueCustomers, db.dueLedger, async () => {
        await db.dueLedger.put({
          id: saleLedgerId,
          shopId,
          customerId,
          entryType: "SALE",
          amount: totalAmount,
          description: note || "Due sale",
          entryDate: nowIso,
          syncStatus: "new",
        });

        if (paidLedgerId) {
          await db.dueLedger.put({
            id: paidLedgerId,
            shopId,
            customerId,
            entryType: "PAYMENT",
            amount: paidAmount,
            description: "Partial payment at sale",
            entryDate: nowIso,
            syncStatus: "new",
          });
        }

        const existing = await db.dueCustomers.get(customerId);
        const baseDueRaw =
          existing?.totalDue ??
          customers.find((c) => c.id === customerId)?.totalDue ??
          0;
        const baseDue = Number(baseDueRaw);
        const nextDue = Number(
          ((Number.isFinite(baseDue) ? baseDue : 0) + dueDelta).toFixed(2)
        );
        const lastPaymentAt =
          paidAmount > 0 ? nowIso : existing?.lastPaymentAt ?? null;

        if (existing) {
          await db.dueCustomers.update(customerId, {
            totalDue: nextDue,
            lastPaymentAt,
            updatedAt: nowTs,
            syncStatus: "synced",
          });
        } else {
          const customer = customers.find((c) => c.id === customerId);
          await db.dueCustomers.put({
            id: customerId,
            shopId,
            name: customer?.name || "Customer",
            phone: customer?.phone ?? null,
            address: null,
            totalDue: nextDue,
            lastPaymentAt,
            updatedAt: nowTs,
            syncStatus: "synced",
          });
        }
      });
    }

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
      customerId: isDue ? customerId : null,
      paidNow: isDue ? paidNowNumber : undefined,
      dueLedgerIds: isDue ? dueLedgerIds : undefined,
      note,
      totalAmount: totalVal.toFixed(2),
      createdAt: nowTs,
      syncStatus: "new" as const,
    };

    await db.sales.put(salePayload);
    await queueAdd("sale", "create", salePayload);
    applyStockDelta(items);

    alert(
      isDue
        ? "Offline: Due sale saved. It will sync when you're online."
        : "Sale stored offline. It will sync automatically when you're online."
    );
    clear();
  }

  const itemCount = useMemo(
    () => items.reduce((sum, i) => sum + i.qty, 0),
    [items]
  );
  const cartList = useMemo(
    () => items.map((i) => <PosCartItem key={i.productId} item={i} />),
    [items]
  );
  const customerOptions = useMemo(
    () =>
      customers.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name} - বকেয়া: {Number(c.totalDue || 0).toFixed(2)} ৳
        </option>
      )),
    [customers]
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

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 2200);
    try {
      navigator.vibrate?.(20);
    } catch {
      // ignore vibration failures
    }
    return () => clearTimeout(t);
  }, [success]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Products */}
      <div className="lg:col-span-2 flex flex-col gap-6">
        <div className="mb-6 pb-4 border-b border-border">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-foreground">নতুন বিক্রি</h1>
              <p className="text-base text-muted-foreground mt-2">
                দোকান: <span className="font-semibold">{shopName}</span>
              </p>
            </div>

            <span
              className={`text-sm px-4 py-2 rounded-full font-medium ${
                online
                  ? "bg-success-soft text-success"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {online ? "অনলাইন" : "অফলাইন"}
            </span>
          </div>
        </div>

        <div className="flex-1">
          <PosProductSearch products={productOptions} shopId={shopId} />
        </div>
      </div>

      {/* Right: Cart */}
      <div
        ref={cartPanelRef}
        className="lg:col-span-1 bg-card rounded-lg p-6 flex flex-col gap-4 border border-border"
      >
        <h2 className="text-2xl font-bold text-foreground mb-6">বর্তমান বিল</h2>

        <div className="mb-6 space-y-3">
          {items.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">কিছু যোগ করা হয়নি</p>
          ) : (
            cartList
          )}
        </div>

        {/* Summary Section */}
        <div className="border-t border-border pt-4 space-y-4">
          <div className="bg-muted rounded-lg p-4">
            <p className="text-sm text-muted-foreground mb-1">মোট পরিমাণ</p>
            <p className="text-3xl font-bold text-foreground">
              {(safeTotalAmount as number).toFixed(2)} ৳
            </p>
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <label className="text-base font-medium text-foreground">
              পেমেন্ট পদ্ধতি
            </label>
            <select
              className="w-full border border-border rounded-lg px-3 py-3 text-base"
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
              <label className="text-base font-medium text-foreground">
                গ্রাহক নির্বাচন করুন
              </label>
              <select
                className="w-full border border-border rounded-lg px-3 py-2 text-base"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">-- একজন গ্রাহক নির্বাচন করুন --</option>
                {customerOptions}
              </select>
              <a
                className="text-sm text-primary hover:underline"
                href={`/dashboard/due?shopId=${shopId}`}
              >
                নতুন গ্রাহক যোগ করুন
              </a>
            </div>
          )}

          {/* Partial payment - only for due */}
          {isDue && (
            <div className="space-y-2">
              <label className="text-base font-medium text-foreground">
                এখন পরিশোধ (আংশিক হলে)
              </label>
              <input
                type="number"
                min="0"
                max={safeTotalAmount}
                step="0.01"
                className="w-full border border-border rounded-lg px-3 py-2 text-base"
                placeholder="যেমন: 100 (আংশিক পরিশোধের জন্য)"
                value={paidNow}
                onChange={(e) => setPaidNow(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                মোট {safeTotalAmount.toFixed(2)} ৳ | আংশিক দিলে বাকি ধার হিসেবে
                থাকবে।
              </p>
            </div>
          )}

          {/* Note */}
          <div className="space-y-2">
            <label className="text-base font-medium text-foreground">
              নোট (ঐচ্ছিক)
            </label>
            <textarea
              className="w-full border border-border rounded-lg px-3 py-2 text-base"
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
            className="w-full rounded-lg bg-primary-soft text-primary border border-primary/30 font-semibold py-4 px-4 text-lg transition-colors hover:bg-primary/15 hover:border-primary/40 disabled:bg-muted disabled:text-muted-foreground"
          >
            ✓ বিল সম্পন্ন করুন
          </button>

          <button
            type="button"
            onClick={() => clear()}
            className="w-full border border-border text-foreground font-medium py-3 px-4 rounded-lg text-base hover:bg-muted transition-colors"
          >
            কার্ট পরিষ্কার করুন
          </button>
        </form>
      </div>
      {/* Sticky mini-bill for mobile */}
      {items.length > 0 && (
        <div className="lg:hidden fixed bottom-16 inset-x-0 z-40 px-4">
          <div
            className={`relative bg-card rounded-2xl border-t border-border shadow-[0_-6px_24px_rgba(15,23,42,0.12)] px-4 py-3 flex items-center gap-3 ${
              barFlash ? "flash-bar" : ""
            }`}
          >
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-muted-foreground/30" />
            <div className="flex-1">
              <div className="inline-flex items-center gap-1 text-[11px] text-muted-foreground leading-tight">
                <span>মোট বিল</span>
                <button
                  type="button"
                  aria-label="বিল বিস্তারিত দেখুন"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={scrollToCart}
                >
                  ▼
                </button>
              </div>
              <p className="text-base font-semibold text-foreground leading-tight">
                {safeTotalAmount.toFixed(2)} ৳ — {itemCount} আইটেম
              </p>
            </div>
            <button
              type="button"
              onClick={handleClearFromBar}
              className="px-3 py-2 rounded-lg border border-border text-sm font-semibold text-foreground"
            >
              পরিষ্কার
            </button>
            <button
              type="button"
              onClick={handleSellFromBar}
              className="px-4 py-2 rounded-lg bg-primary-soft text-primary border border-primary/30 text-sm font-semibold min-w-[140px]"
            >
              বিল সম্পন্ন
            </button>
          </div>
        </div>
      )}

      {success && (
        <div className="fixed bottom-24 inset-x-4 z-50">
          <div className="rounded-xl bg-success text-primary-foreground px-4 py-3 shadow-lg flex items-center justify-between gap-3">
            <span className="font-semibold">✔️ বিক্রি সম্পন্ন</span>
            <div className="flex items-center gap-2">
              <Link
                href={`/dashboard/sales?shopId=${shopId}`}
                className="text-xs font-semibold underline underline-offset-2"
              >
                বিক্রি দেখুন
              </Link>
              <button
                type="button"
                onClick={() => setSuccess(null)}
                className="text-xs font-semibold text-primary-foreground/80 hover:text-primary-foreground"
              >
                ঠিক আছে
              </button>
            </div>
          </div>
        </div>
      )}

      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-foreground/30 animate-fade-in"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 bg-card rounded-t-2xl shadow-2xl p-4 space-y-4 max-h-[70vh] overflow-y-auto animate-slide-up">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">বর্তমান বিল</p>
                <p className="text-lg font-semibold text-foreground">
                  {safeTotalAmount.toFixed(2)} ৳ • {itemCount} আইটেম
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="px-3 py-2 rounded-lg border border-border text-sm font-semibold text-foreground"
              >
                বন্ধ
              </button>
            </div>

            {items.length === 0 ? (
              <p className="text-center text-muted-foreground py-6">কার্ট খালি</p>
            ) : (
              <div className="space-y-3">
                {cartList}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={scrollToCart}
                className="flex-1 rounded-lg border border-border py-3 text-sm font-semibold text-foreground"
              >
                পূর্ণ বিল ফর্ম দেখুন
              </button>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="px-4 py-3 rounded-lg bg-primary-soft text-primary border border-primary/30 text-sm font-semibold"
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

