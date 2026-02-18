// app/dashboard/sales/PosPageClient.tsx

"use client";

import {
  useCallback,
  useState,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PosProductSearch } from "./components/pos-product-search";
import { PosCartItem } from "./components/pos-cart-item";
import { useCart } from "@/hooks/use-cart";
import { useShallow } from "zustand/react/shallow";

import { useOnlineStatus } from "@/lib/sync/net-status";
import { toast } from "sonner";
import { useSyncStatus } from "@/lib/sync/sync-status";
import { db } from "@/lib/dexie/db";
import { queueAdd } from "@/lib/sync/queue";
import { handlePermissionError } from "@/lib/permission-toast";
import { useRealtimeStatus } from "@/lib/realtime/status";
import { usePageVisibility } from "@/lib/use-page-visibility";
import { subscribeDueCustomersEvent } from "@/lib/due/customer-events";
import { subscribeProductEvent } from "@/lib/products/product-events";
import useRealTimeReports from "@/hooks/useRealTimeReports";
import { emitSaleUpdate } from "@/lib/events/reportEvents";

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
    address?: string | null;
    totalDue: string | number;
    lastPaymentAt?: string | null;
  }[];
  shopName: string;
  shopId: string;
  submitSale: (formData: FormData) => Promise<{
    success: boolean;
    saleId: string;
    invoiceNo?: string | null;
  }>;
};

export function PosPageClient({
  products,
  customers,
  shopName,
  shopId,
  submitSale,
}: PosPageClientProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const realTimeReports = useRealTimeReports(shopId);
  const {
    clear,
    setShop,
    items: cartItems,
    currentShopId: cartShopId,
  } = useCart(
    useShallow((s) => ({
      clear: s.clear,
      setShop: s.setShop,
      items: s.items,
      currentShopId: s.currentShopId,
    }))
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
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
  const [customerList, setCustomerList] = useState(customers);
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
  const [success, setSuccess] = useState<{
    saleId?: string;
    invoiceNo?: string | null;
  } | null>(null);
  const [productsRefreshing, setProductsRefreshing] = useState(false);
  const online = useOnlineStatus();
  const realtime = useRealtimeStatus();
  const isVisible = usePageVisibility();
  const { pendingCount, syncing, lastSyncAt } = useSyncStatus();
  const lastSyncLabel = useMemo(() => {
    if (!lastSyncAt) return null;
    return new Intl.DateTimeFormat("bn-BD", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(lastSyncAt));
  }, [lastSyncAt]);
  const serverSnapshotRef = useRef(products);
  useEffect(() => {
    if (customers.length === 0) return;
    setCustomerList(customers);
  }, [customers]);
  useEffect(() => {
    setCustomerList([]);
  }, [shopId]);
  const refreshInFlightRef = useRef(false);
  const lastRefreshAtRef = useRef(0);
  const REFRESH_MIN_INTERVAL_MS = 15_000;
  const lastEventAtRef = useRef(0);
  const wasVisibleRef = useRef(isVisible);
  const pollIntervalMs = realtime.connected ? 60_000 : 15_000;
  const pollingEnabled = !realtime.connected;
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
  const loadCustomersFromDexie = useCallback(async () => {
    try {
      const rows = await db.dueCustomers
        .where("shopId")
        .equals(shopId)
        .toArray();
      const cachedRows = rows.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone ?? null,
        totalDue: c.totalDue,
      }));
      if (cachedRows.length > 0) {
        setCustomerList(cachedRows);
      }
      return cachedRows;
    } catch (err) {
      handlePermissionError(err);
      console.warn("Load due customers cache failed", err);
      return [] as typeof customers;
    }
  }, [shopId]);

  const dueCustomerQueryKey = useMemo(
    () => ["due", "customers", shopId],
    [shopId]
  );

  const fetchDueCustomers = useCallback(async () => {
    try {
      const res = await fetch(`/api/due/customers?shopId=${shopId}`);
      if (res.status === 304) {
        return loadCustomersFromDexie();
      }
      if (!res.ok) {
        throw new Error("Load due customers failed");
      }
      const json = (await res.json()) as { data?: typeof customers };
      const list = Array.isArray(json?.data) ? json.data : [];

      if (list.length > 0) {
        const nowTs = Date.now();
        const rows = list.map((c) => ({
          id: c.id,
          shopId,
          name: c.name,
          phone: c.phone ?? null,
          address: c.address ?? null,
          totalDue: c.totalDue ?? 0,
          lastPaymentAt: c.lastPaymentAt ?? null,
          updatedAt: nowTs,
          syncStatus: "synced" as const,
        }));
        try {
          await db.transaction("rw", db.dueCustomers, async () => {
            await db.dueCustomers.where("shopId").equals(shopId).delete();
            await db.dueCustomers.bulkPut(rows);
          });
        } catch (err) {
          handlePermissionError(err);
          console.warn("Update due customers cache failed", err);
        }
      }

      return list;
    } catch (err) {
      handlePermissionError(err);
      console.error("Load due customers failed", err);
      return loadCustomersFromDexie();
    }
  }, [shopId, loadCustomersFromDexie]);

  const dueCustomersQuery = useQuery({
    queryKey: dueCustomerQueryKey,
    queryFn: fetchDueCustomers,
    enabled: online && isDue,
    staleTime: 15_000,
    refetchInterval:
      online && isDue && isVisible && pollingEnabled ? pollIntervalMs : false,
    initialData: () => customers ?? [],
    placeholderData: (prev) => prev ?? [],
  });

  const customersLoading = dueCustomersQuery.isFetching && online && isDue;

  useEffect(() => {
    if (!isDue) return;
    if (dueCustomersQuery.data) {
      setCustomerList(dueCustomersQuery.data);
    }
  }, [isDue, dueCustomersQuery.data]);

  const loadProductsFromDexie = useCallback(async () => {
    try {
      const rows = await db.products.where("shopId").equals(shopId).toArray();
      const mapped = rows.map((p) => ({
        id: p.id,
        name: p.name,
        sellPrice: p.sellPrice.toString(),
        stockQty: p.stockQty?.toString(),
        category: p.category,
        trackStock: p.trackStock,
      }));
      setProductOptions(mapped);
      return mapped;
    } catch (err) {
      handlePermissionError(err);
      console.error("Load offline products failed", err);
      return [] as ProductOption[];
    }
  }, [shopId]);

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
      setProductsRefreshing(false);
    }
  }, [products]);

  useEffect(() => {
    if (!online || !lastSyncAt || syncing || pendingCount > 0) return;
    if (refreshInFlightRef.current) return;
    const now = Date.now();
    if (now - lastRefreshAtRef.current < REFRESH_MIN_INTERVAL_MS) return;
    refreshInFlightRef.current = true;
    lastRefreshAtRef.current = now;
    router.refresh();
  }, [online, lastSyncAt, syncing, pendingCount, router]);

  useEffect(() => {
    if (!online || !isVisible || !pollingEnabled) return;
    const intervalId = setInterval(() => {
      const now = Date.now();
      if (now - lastEventAtRef.current < pollIntervalMs / 2) return;
      if (refreshInFlightRef.current) return;
      if (syncing || pendingCount > 0) return;
      if (now - lastRefreshAtRef.current < REFRESH_MIN_INTERVAL_MS) return;
      refreshInFlightRef.current = true;
      lastRefreshAtRef.current = now;
      router.refresh();
    }, pollIntervalMs);

    return () => clearInterval(intervalId);
  }, [
    online,
    isVisible,
    pollingEnabled,
    router,
    syncing,
    pendingCount,
    pollIntervalMs,
  ]);

  useEffect(() => {
    if (!online) return;
    if (wasVisibleRef.current === isVisible) return;
    wasVisibleRef.current = isVisible;
    if (!isVisible) return;
    const now = Date.now();
    if (refreshInFlightRef.current) return;
    if (syncing || pendingCount > 0) return;
    if (now - lastRefreshAtRef.current < REFRESH_MIN_INTERVAL_MS) return;
    lastEventAtRef.current = now;
    lastRefreshAtRef.current = now;
    refreshInFlightRef.current = true;
    router.refresh();
  }, [online, isVisible, router, syncing, pendingCount]);

  useEffect(() => {
    if (!isDue) return;
    loadCustomersFromDexie();
  }, [isDue, loadCustomersFromDexie]);

  useEffect(() => {
    if (!isDue || online) return;
    loadCustomersFromDexie();
  }, [isDue, online, loadCustomersFromDexie]);

  useEffect(() => {
    return subscribeDueCustomersEvent((detail) => {
      if (detail.shopId !== shopId) return;
      lastEventAtRef.current = Date.now();
      loadCustomersFromDexie();
      if (online) {
        queryClient.invalidateQueries({
          queryKey: dueCustomerQueryKey,
          refetchType: "active",
        });
      }
    });
  }, [loadCustomersFromDexie, shopId, online, queryClient, dueCustomerQueryKey]);

  useEffect(() => {
    return subscribeProductEvent((detail) => {
      if (detail.shopId !== shopId) return;
      const now = detail.at ?? Date.now();
      lastEventAtRef.current = now;
      loadProductsFromDexie();
      if (!online) return;
      if (syncing || pendingCount > 0) return;
      if (refreshInFlightRef.current) return;
      if (now - lastRefreshAtRef.current < REFRESH_MIN_INTERVAL_MS) return;
      refreshInFlightRef.current = true;
      lastRefreshAtRef.current = now;
      router.refresh();
    });
  }, [loadProductsFromDexie, shopId, online, router, syncing, pendingCount]);

  // Keep Dexie seeded when online; load from Dexie when offline.
  useEffect(() => {
    if (online) {
      if (syncing || pendingCount > 0 || refreshInFlightRef.current) {
        loadProductsFromDexie();
        return;
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
      return;
    }

    loadProductsFromDexie();
  }, [online, products, shopId, pendingCount, syncing, loadProductsFromDexie]);

  // Keep cart tied to the currently selected shop; reset when shop changes
  useEffect(() => {
    setShop(shopId);
  }, [shopId, setShop]);

  // Clear partial payment when switching away from due
  useEffect(() => {
    if (!isDue) {
      setPaidNow("");
    }
  }, [isDue]);

  const reportSale = useCallback(
    (amount: number) => {
      if (!Number.isFinite(amount) || amount <= 0) return null;
      const updateId = realTimeReports.updateSalesReport(amount, "add", {
        timestamp: Date.now(),
      });
      emitSaleUpdate(
        shopId,
        {
          type: "sale",
          operation: "add",
          amount,
          shopId,
          metadata: {
            timestamp: Date.now(),
          },
        },
        {
          source: "ui",
          priority: "high",
          correlationId: updateId,
        }
      );
      return updateId;
    },
    [realTimeReports, shopId]
  );

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (items.length === 0) return;

    if (paymentMethod === "due" && !customerId) {
      toast.warning("বাকিতে বিক্রির জন্য কাস্টমার নির্বাচন করুন।");
      return;
    }

    // Prevent double submission
    if (isSubmitting) return;
    setIsSubmitting(true);

    const totalVal = safeTotalAmount as number;
    const paidNowNumber = isDue
      ? Math.min(Math.max(Number(paidNow || 0), 0), totalVal)
      : 0;

    try {
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
        setSuccess({ saleId: res?.saleId, invoiceNo: res?.invoiceNo ?? null });
        toast.success("বিল সম্পন্ন হয়েছে।");
        const updateId = reportSale(totalVal);
        if (updateId) {
          setTimeout(() => {
            realTimeReports.syncWithServer(updateId);
          }, 500);
        }
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
    }

    const salePayload = {
      id: crypto.randomUUID(),
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

    await db.transaction(
      "rw",
      db.dueCustomers,
      db.dueLedger,
      db.sales,
      db.queue,
      async () => {
        if (isDue) {
          const totalAmount = Number(totalVal.toFixed(2));
          const paidAmount = Number(paidNowNumber.toFixed(2));
          const dueDelta = Number((totalAmount - paidAmount).toFixed(2));

          const saleLedgerId = dueLedgerIds[0];
          const paidLedgerId = dueLedgerIds.length > 1 ? dueLedgerIds[1] : null;

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
            customerList.find((c) => c.id === customerId)?.totalDue ??
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
            const customer = customerList.find((c) => c.id === customerId);
            await db.dueCustomers.put({
              id: customerId,
              shopId,
              name: customer?.name || "",
              totalDue: nextDue,
              lastPaymentAt,
              updatedAt: nowTs,
              syncStatus: "synced",
            });
          }
        }

        await db.sales.put(salePayload);
        await queueAdd("sale", "create", salePayload);
      }
    );
    applyStockDelta(items);
    reportSale(totalVal);

    toast.success(
      isDue
        ? "অফলাইন: বাকির বিক্রি সেভ হয়েছে, অনলাইনে গেলে সিঙ্ক হবে।"
        : "অফলাইন: বিক্রি সেভ হয়েছে, অনলাইনে গেলে সিঙ্ক হবে।"
    );
    clear();
    } catch (error) {
      console.error("Sale submission failed:", error);
      toast.error("বিল সম্পন্ন করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।");
    } finally {
      setIsSubmitting(false);
    }
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
      customerList.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name} - বকেয়া: {Number(c.totalDue || 0).toFixed(2)} ৳
        </option>
      )),
    [customerList]
  );

  const scrollToCart = () => {
    setDrawerOpen(false);
    if (cartPanelRef.current) {
      cartPanelRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  const handleProductRefresh = () => {
    if (!online) {
      loadProductsFromDexie();
      return;
    }
    if (productsRefreshing) return;
    setProductsRefreshing(true);
    refreshInFlightRef.current = true;
    lastRefreshAtRef.current = Date.now();
    router.refresh();
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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pb-28">
      {/* Left: Products */}
      <div className="lg:col-span-2 flex flex-col gap-6">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_12px_28px_rgba(15,23,42,0.08)] animate-fade-in">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-soft/30 via-card to-card" />
          <div className="pointer-events-none absolute -top-12 right-0 h-24 w-24 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative space-y-2 p-3 sm:p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <h1 className="text-2xl font-bold text-foreground tracking-tight leading-tight sm:text-3xl">
                  নতুন বিক্রি
                </h1>
                <p className="text-xs text-muted-foreground">
                  দোকান: <span className="font-semibold">{shopName}</span>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2" />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              {pendingCount > 0 ? (
                <span className="inline-flex h-7 items-center rounded-full border border-warning/30 bg-warning-soft px-3 text-warning">
                  পেন্ডিং {pendingCount} টি
                </span>
              ) : null}
              <button
                type="button"
                onClick={handleProductRefresh}
                disabled={productsRefreshing}
                className={`inline-flex h-7 items-center rounded-full border px-3 transition ${
                  productsRefreshing
                    ? "border-primary/40 bg-primary-soft text-primary"
                    : "border-border bg-card/80 text-muted-foreground hover:border-primary/30"
                }`}
              >
                {productsRefreshing ? "রিফ্রেশ হচ্ছে..." : "রিফ্রেশ"}
              </button>
              {syncing ? (
                <span className="inline-flex h-7 items-center rounded-full border border-primary/30 bg-primary-soft px-3 text-primary">
                  সিঙ্ক হচ্ছে...
                </span>
              ) : null}
              {lastSyncLabel ? (
                <span className="inline-flex h-7 items-center rounded-full border border-border bg-card/80 px-3 text-muted-foreground">
                  শেষ সিঙ্ক: {lastSyncLabel}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex-1">
          <PosProductSearch products={productOptions} shopId={shopId} />
        </div>
      </div>

      {/* Right: Cart */}
      <div
        ref={cartPanelRef}
        className="lg:col-span-1 bg-gradient-to-br from-card via-card to-muted/30 rounded-2xl p-4 sm:p-5 flex flex-col gap-4 border border-border shadow-[0_16px_36px_rgba(15,23,42,0.08)]"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-2xl font-bold text-foreground">বর্তমান বিল</h2>
          <span className="inline-flex h-7 items-center rounded-full border border-border bg-card/80 px-3 text-xs font-semibold text-muted-foreground">
            {itemCount} আইটেম
          </span>
        </div>

        <div className="rounded-2xl border border-border bg-muted/40 p-3 space-y-3">
          {items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-card/60 py-8 text-center text-sm text-muted-foreground">কিছু যোগ করা হয়নি</p>
          ) : (
            cartList
          )}
        </div>

        {/* Summary Section */}
        <div className="border-t border-border/70 pt-5 space-y-4">
          <div className="rounded-2xl border border-border bg-muted/60 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">মোট পরিমাণ</p>
            <p className="text-3xl font-bold text-foreground">
              {(safeTotalAmount as number).toFixed(2)} ৳
            </p>
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <label className="text-base font-medium text-foreground">
              পেমেন্ট পদ্ধতি
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {paymentOptions.map((method) => (
                <button
                  key={method.value}
                  type="button"
                  onClick={() => setPaymentMethod(method.value)}
                  aria-pressed={paymentMethod === method.value}
                  className={`h-10 rounded-xl border px-3 text-sm font-semibold transition-colors ${
                    paymentMethod === method.value
                      ? "bg-primary-soft text-primary border-primary/40 shadow-sm"
                      : "bg-card text-foreground border-border hover:border-primary/30"
                  }`}
                >
                  {method.label}
                </button>
              ))}
            </div>
          </div>

          {/* Customer Selection for Due */}
          {isDue && (
            <div className="rounded-xl border border-warning/30 bg-warning-soft/40 p-3 space-y-2">
              <label className="text-base font-medium text-foreground">
                গ্রাহক নির্বাচন করুন
              </label>
              <select
                className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                disabled={customersLoading}
              >
                <option value="">-- একজন গ্রাহক নির্বাচন করুন --</option>
                {customersLoading ? (
                  <option value="" disabled>
                    গ্রাহক লোড হচ্ছে...
                  </option>
                ) : customerList.length === 0 ? (
                  <option value="" disabled>
                    কোনো গ্রাহক পাওয়া যায়নি
                  </option>
                ) : null}
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
            <div className="rounded-xl border border-warning/30 bg-warning-soft/40 p-3 space-y-2">
              <label className="text-base font-medium text-foreground">
                এখন পরিশোধ (আংশিক হলে)
              </label>
              <input
                type="number"
                min="0"
                max={safeTotalAmount}
                step="0.01"
                className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="যেমন: 100 (আংশিক পরিশোধের জন্য)"
                value={paidNow}
                onChange={(e) => setPaidNow(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
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
              className="min-h-[96px] w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
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
            disabled={items.length === 0 || isSubmitting}
            ref={submitButtonRef}
            className="w-full h-14 rounded-xl bg-gradient-to-r from-primary to-primary-hover text-primary-foreground border border-primary/40 text-base font-semibold shadow-[0_12px_22px_rgba(22,163,74,0.28)] transition hover:brightness-105 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                বিল সম্পন্ন হচ্ছে...
              </>
            ) : (
              <>✓ বিল সম্পন্ন করুন</>
            )}
          </button>

          <button
            type="button"
            onClick={() => clear()}
            className="w-full h-12 rounded-xl border border-border text-foreground font-semibold text-base hover:bg-muted transition-colors"
          >
            কার্ট পরিষ্কার করুন
          </button>
        </form>
      </div>
      {/* Sticky mini-bill for mobile */}
      {items.length > 0 && (
        <div className="lg:hidden fixed bottom-16 inset-x-0 z-40 px-4">
          <div
            className={`relative bg-card/95 backdrop-blur rounded-3xl border border-border shadow-[0_-10px_30px_rgba(15,23,42,0.18)] px-4 py-3 flex items-center gap-3 ${
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
                  onClick={() => setDrawerOpen(true)}
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
              className="px-3 py-2 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted"
            >
              পরিষ্কার
            </button>
            <button
              type="button"
              onClick={handleSellFromBar}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-primary to-primary-hover text-primary-foreground border border-primary/40 text-sm font-semibold min-w-[140px] flex items-center justify-center gap-1 shadow-[0_10px_18px_rgba(22,163,74,0.28)] disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                  সম্পন্ন হচ্ছে...
                </>
              ) : (
                "বিল সম্পন্ন"
              )}
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
              {success.saleId && success.invoiceNo ? (
                <Link
                  href={`/dashboard/sales/${success.saleId}/invoice`}
                  className="text-xs font-semibold underline underline-offset-2"
                >
                  ইনভয়েস দেখুন
                </Link>
              ) : null}
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
          <div className="absolute inset-x-0 bottom-0 bg-card rounded-t-3xl shadow-[0_-20px_50px_rgba(15,23,42,0.2)] p-5 space-y-4 max-h-[70vh] overflow-y-auto animate-slide-up">
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
                className="px-3 py-2 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted"
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
                className="flex-1 rounded-xl border border-border py-3 text-sm font-semibold text-foreground"
              >
                পূর্ণ বিল ফর্ম দেখুন
              </button>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="px-4 py-3 rounded-xl bg-primary-soft text-primary border border-primary/30 text-sm font-semibold"
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
