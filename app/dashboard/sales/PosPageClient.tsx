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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import RefreshIconButton from "@/components/ui/refresh-icon-button";

import { useOnlineStatus } from "@/lib/sync/net-status";
import { toast } from "sonner";
import { useSyncStatus } from "@/lib/sync/sync-status";
import { db } from "@/lib/dexie/db";
import { queueAdd } from "@/lib/sync/queue";
import { handlePermissionError } from "@/lib/permission-toast";
import { getPollingProfile } from "@/lib/polling/config";
import { useSmartPolling } from "@/lib/polling/use-smart-polling";
import { usePageVisibility } from "@/lib/use-page-visibility";
import {
  emitDueCustomersEvent,
  subscribeDueCustomersEvent,
} from "@/lib/due/customer-events";
import { subscribeProductEvent } from "@/lib/products/product-events";
import useRealTimeReports from "@/hooks/useRealTimeReports";
import { emitSaleUpdate } from "@/lib/events/reportEvents";
import { computeSaleDiscount, type SaleDiscountType } from "@/lib/sales/discount";
import { computeSaleTax } from "@/lib/sales/tax";
import { reserveOfflineSalesInvoice } from "@/lib/offline/offline-sales-invoice";

type ProductOption = {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  sellPrice: string;
  stockQty?: string | number;
  category?: string | null;
  trackStock?: boolean | null;
  variants?: Array<{
    id: string;
    label: string;
    sellPrice: string;
    sku?: string | null;
    barcode?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  }>;
};

type PosPageClientProps = {
  products: {
    id: string;
    name: string;
    sku?: string | null;
    barcode?: string | null;
    sellPrice: string | number;
    stockQty?: string | number;
    category?: string | null;
    trackStock?: boolean | null;
    variants?: Array<{
      id: string;
      label: string;
      sellPrice: string | number;
      sku?: string | null;
      barcode?: string | null;
      sortOrder?: number;
      isActive?: boolean;
    }>;
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
  canCreateSale: boolean;
  canCreateDueSale: boolean;
  canViewCustomers: boolean;
  canCreateCustomer: boolean;
  canViewDuePage: boolean;
  canUseBarcodeScan: boolean;
  canUseSaleDiscount: boolean;
  canUseSaleTax: boolean;
  saleTaxLabel: string;
  saleTaxRate: number;
  canIssueSalesInvoice: boolean;
  salesInvoicePrefix?: string | null;
  nextSalesInvoiceSeq?: number;
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
  canCreateSale,
  canCreateDueSale,
  canViewCustomers,
  canCreateCustomer,
  canViewDuePage,
  canUseBarcodeScan,
  canUseSaleDiscount,
  canUseSaleTax,
  saleTaxLabel,
  saleTaxRate,
  canIssueSalesInvoice,
  salesInvoicePrefix,
  nextSalesInvoiceSeq,
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
  const [paymentSheetOpen, setPaymentSheetOpen] = useState(false);
  const [barFlash, setBarFlash] = useState(false);
  const cartPanelRef = useRef<HTMLDivElement | null>(null);
  const saleFormRef = useRef<HTMLFormElement | null>(null);
  const submitButtonRef = useRef<HTMLButtonElement | null>(null);
  const [productOptions, setProductOptions] = useState<ProductOption[]>(
    () =>
      products.map((p) => ({
        ...p,
        sku: p.sku ?? null,
        barcode: p.barcode ?? null,
        sellPrice: p.sellPrice.toString(),
        variants: Array.isArray(p.variants)
          ? p.variants.map((variant) => ({
              ...variant,
              sellPrice: variant.sellPrice.toString(),
              sku: variant.sku ?? null,
              barcode: variant.barcode ?? null,
            }))
          : [],
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
  const [discountType, setDiscountType] = useState<SaleDiscountType>("amount");
  const [discountValue, setDiscountValue] = useState<string>("");
  const [note, setNote] = useState("");
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [quickCustomer, setQuickCustomer] = useState({
    name: "",
    phone: "",
    address: "",
  });
  const [success, setSuccess] = useState<{
    saleId?: string;
    invoiceNo?: string | null;
  } | null>(null);
  const [productsRefreshing, setProductsRefreshing] = useState(false);
  const online = useOnlineStatus();
  const isVisible = usePageVisibility();
  const { pendingCount, syncing, lastSyncAt } = useSyncStatus();
  const posPollingProfile = useMemo(() => getPollingProfile("pos"), []);
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
  const canUseDueSale = canCreateDueSale && canViewCustomers;
  const isDue = paymentMethod === "due";
  const saleDiscount = useMemo(
    () =>
      canUseSaleDiscount
        ? computeSaleDiscount(safeTotalAmount, {
            type: discountType,
            value: discountValue,
          })
        : computeSaleDiscount(safeTotalAmount, null),
    [canUseSaleDiscount, safeTotalAmount, discountType, discountValue]
  );
  const saleTax = useMemo(
    () =>
      computeSaleTax(saleDiscount.total, {
        enabled: canUseSaleTax,
        label: saleTaxLabel,
        rate: saleTaxRate,
      }),
    [canUseSaleTax, saleDiscount.total, saleTaxLabel, saleTaxRate]
  );
  const payableTotal = saleTax.total;
  const paymentOptions = useMemo(
    () => {
      const options = [
        { value: "cash", label: "ক্যাশ" },
        { value: "due", label: "ধার" },
        { value: "bkash", label: "বিকাশ" },
        { value: "nagad", label: "নগদ" },
        { value: "card", label: "কার্ড" },
        { value: "bank_transfer", label: "ব্যাংক ট্রান্সফার" },
      ];
      if (canUseDueSale) {
        return options;
      }
      return options.filter((option) => option.value !== "due");
    },
    [canUseDueSale]
  );
  const loadCustomersFromDexie = useCallback(async () => {
    if (!canViewCustomers) {
      setCustomerList([]);
      return [] as typeof customers;
    }
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
  }, [canViewCustomers, shopId]);

  const dueCustomerQueryKey = useMemo(
    () => ["due", "customers", shopId],
    [shopId]
  );

  const fetchDueCustomers = useCallback(async () => {
    if (!canViewCustomers) {
      setCustomerList([]);
      return [] as typeof customers;
    }
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
  }, [canViewCustomers, shopId, loadCustomersFromDexie]);

  const dueCustomersQuery = useQuery({
    queryKey: dueCustomerQueryKey,
    queryFn: fetchDueCustomers,
    enabled: online && isDue && canViewCustomers,
    staleTime: 15_000,
    refetchInterval:
      online && isDue && isVisible && canViewCustomers
        ? posPollingProfile.intervalMs
        : false,
    initialData: () => (canViewCustomers ? customers ?? [] : []),
    placeholderData: (prev) => prev ?? [],
  });

  const customersLoading =
    dueCustomersQuery.isFetching && online && isDue && canViewCustomers;

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
        sku: (p as any).sku ?? null,
        barcode: (p as any).barcode ?? null,
        sellPrice: p.sellPrice.toString(),
        stockQty: p.stockQty?.toString(),
        category: p.category,
        trackStock: p.trackStock,
        variants: Array.isArray((p as any).variants)
          ? (p as any).variants
              .filter((variant: any) => variant?.isActive !== false)
              .map((variant: any) => ({
                id: String(variant.id),
                label: String(variant.label || "").trim(),
                sellPrice: String(variant.sellPrice ?? "0"),
                sku: variant.sku ?? null,
                barcode: variant.barcode ?? null,
                sortOrder:
                  Number.isFinite(Number(variant.sortOrder))
                    ? Number(variant.sortOrder)
                    : 0,
                isActive: variant.isActive !== false,
              }))
          : [],
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

  const { triggerRefresh } = useSmartPolling({
    profile: "pos",
    enabled: Boolean(shopId),
    online,
    isVisible,
    blocked: syncing || pendingCount > 0,
    syncToken: lastSyncAt,
    canRefresh: () => !refreshInFlightRef.current,
    markRefreshStarted: () => {
      refreshInFlightRef.current = true;
    },
    onRefresh: () => {
      router.refresh();
    },
  });

  useEffect(() => {
    if (!canUseDueSale && paymentMethod === "due") {
      setPaymentMethod("cash");
      setCustomerId("");
      setPaidNow("");
    }
  }, [canUseDueSale, paymentMethod]);

  useEffect(() => {
    if (!isDue) return;
    loadCustomersFromDexie();
  }, [isDue, loadCustomersFromDexie]);

  useEffect(() => {
    if (!isDue || online) return;
    loadCustomersFromDexie();
  }, [isDue, online, loadCustomersFromDexie]);

  useEffect(() => {
    if (!canViewCustomers) return;
    return subscribeDueCustomersEvent((detail) => {
      if (detail.shopId !== shopId) return;
      loadCustomersFromDexie();
      if (online) {
        queryClient.invalidateQueries({
          queryKey: dueCustomerQueryKey,
          refetchType: "active",
        });
      }
    });
  }, [
    canViewCustomers,
    loadCustomersFromDexie,
    shopId,
    online,
    queryClient,
    dueCustomerQueryKey,
  ]);

  useEffect(() => {
    return subscribeProductEvent((detail) => {
      if (detail.shopId !== shopId) return;
      const now = detail.at ?? Date.now();
      loadProductsFromDexie();
      if (!online) return;
      triggerRefresh("event", { at: now });
    });
  }, [loadProductsFromDexie, shopId, online, triggerRefresh]);

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
          sku: p.sku ?? null,
          barcode: p.barcode ?? null,
          sellPrice: p.sellPrice.toString(),
          variants: Array.isArray(p.variants)
            ? p.variants.map((variant) => ({
                ...variant,
                sellPrice: variant.sellPrice.toString(),
                sku: variant.sku ?? null,
                barcode: variant.barcode ?? null,
              }))
            : [],
        }))
      );
      const rows = products.map((p) => ({
        id: p.id,
        shopId,
        name: p.name,
        category: p.category || "Uncategorized",
        sku: p.sku ?? null,
        barcode: p.barcode ?? null,
        sellPrice: p.sellPrice.toString(),
        stockQty: (p.stockQty ?? "0").toString(),
        isActive: true,
        trackStock: Boolean(p.trackStock),
        variants: Array.isArray(p.variants)
          ? p.variants.map((variant) => ({
              id: variant.id,
              label: variant.label,
              sellPrice: variant.sellPrice.toString(),
              sku: variant.sku ?? null,
              barcode: variant.barcode ?? null,
              sortOrder:
                Number.isFinite(Number(variant.sortOrder))
                  ? Number(variant.sortOrder)
                  : 0,
              isActive: variant.isActive !== false,
            }))
          : [],
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

  useEffect(() => {
    if (canUseSaleDiscount) return;
    setDiscountType("amount");
    setDiscountValue("");
  }, [canUseSaleDiscount]);

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

    if (!canCreateSale) {
      toast.error("আপনার বিক্রি সম্পন্ন করার অনুমতি নেই।");
      return;
    }

    if (paymentMethod === "due" && !canUseDueSale) {
      toast.error("বাকিতে বিক্রির অনুমতি নেই।");
      setPaymentMethod("cash");
      return;
    }

    if (paymentMethod === "due" && !customerId) {
      toast.warning("বাকিতে বিক্রির জন্য কাস্টমার নির্বাচন করুন।");
      return;
    }

    // Prevent double submission
    if (isSubmitting) return;
    setIsSubmitting(true);

    const totalVal = payableTotal;
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
        formData.set(
          "discountType",
          canUseSaleDiscount && saleDiscount.hasDiscount ? discountType : ""
        );
        formData.set(
          "discountValue",
          canUseSaleDiscount && saleDiscount.hasDiscount
            ? saleDiscount.discountValue.toString()
            : ""
        );
        formData.set("note", note);
        formData.set("cart", JSON.stringify(items));
        formData.set("totalAmount", payableTotal.toString());

        const res = await submitSale(formData);
        applyStockDelta(items);
        clear();
        setPaidNow("");
        setDiscountType("amount");
        setDiscountValue("");
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
        variantId: i.variantId ?? null,
        variantLabel: i.variantLabel ?? null,
        unitPrice: i.unitPrice,
        qty: i.qty,
      })),
      paymentMethod,
      customerId: isDue ? customerId : null,
      paidNow: isDue ? paidNowNumber : undefined,
      dueLedgerIds: isDue ? dueLedgerIds : undefined,
      subtotalAmount: saleDiscount.subtotal.toFixed(2),
      discountType:
        canUseSaleDiscount && saleDiscount.hasDiscount ? discountType : null,
      discountValue:
        canUseSaleDiscount && saleDiscount.hasDiscount
          ? saleDiscount.discountValue.toFixed(2)
          : null,
      discountAmount: saleDiscount.discountAmount.toFixed(2),
      note,
      totalAmount: totalVal.toFixed(2),
      taxableAmount: saleTax.taxableAmount.toFixed(2),
      taxLabel: saleTax.label,
      taxRate: saleTax.rate > 0 ? saleTax.rate.toFixed(2) : null,
      taxAmount: saleTax.taxAmount.toFixed(2),
      createdAt: nowTs,
      invoiceNo: null as string | null,
      invoiceIssuedAt: null as string | null,
      syncStatus: "new" as const,
    };

    const offlineInvoice = reserveOfflineSalesInvoice({
      shopId,
      enabled: canIssueSalesInvoice,
      prefix: salesInvoicePrefix,
      nextSequence: nextSalesInvoiceSeq,
      issuedAt: new Date(nowTs),
    });
    if (offlineInvoice) {
      salePayload.invoiceNo = offlineInvoice.invoiceNo;
      salePayload.invoiceIssuedAt = offlineInvoice.issuedAt;
    }

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
    setSuccess({
      saleId: salePayload.id,
      invoiceNo: salePayload.invoiceNo ?? null,
    });

    toast.success(
      isDue
        ? "অফলাইন: বাকির বিক্রি সেভ হয়েছে, অনলাইনে গেলে সিঙ্ক হবে।"
        : "অফলাইন: বিক্রি সেভ হয়েছে, অনলাইনে গেলে সিঙ্ক হবে।"
    );
    clear();
    setDiscountType("amount");
    setDiscountValue("");
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
    () => items.map((i) => <PosCartItem key={i.itemKey} item={i} />),
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
  const currentPaymentLabel =
    paymentOptions.find((option) => option.value === paymentMethod)?.label ??
    "ক্যাশ";
  const selectedCustomerName =
    customerList.find((customer) => customer.id === customerId)?.name ?? "";

  const sortCustomers = useCallback(
    (list: typeof customers) =>
      [...list].sort((a, b) => a.name.localeCompare(b.name, "bn")),
    []
  );

  const upsertCustomerList = useCallback(
    (customer: {
      id: string;
      name: string;
      phone?: string | null;
      address?: string | null;
      totalDue?: string | number;
      lastPaymentAt?: string | null;
    }) => {
      setCustomerList((prev) => {
        const next = prev.filter((item) => item.id !== customer.id);
        next.push({
          id: customer.id,
          name: customer.name,
          phone: customer.phone ?? null,
          address: customer.address ?? null,
          totalDue: customer.totalDue ?? 0,
          lastPaymentAt: customer.lastPaymentAt ?? null,
        });
        return sortCustomers(next);
      });
    },
    [sortCustomers]
  );

  async function handleQuickCustomerSave() {
    if (!canCreateCustomer) {
      toast.error("গ্রাহক যোগ করার অনুমতি নেই।");
      return;
    }

    const name = quickCustomer.name.trim();
    const phone = quickCustomer.phone.trim();
    const address = quickCustomer.address.trim();

    if (!name) {
      toast.warning("গ্রাহকের নাম লিখুন।");
      return;
    }

    if (savingCustomer) return;
    setSavingCustomer(true);

    try {
      if (!online) {
        const now = Date.now();
        const payload = {
          id: crypto.randomUUID(),
          shopId,
          name,
          phone: phone || null,
          address: address || null,
          totalDue: "0",
          lastPaymentAt: null,
          updatedAt: now,
          syncStatus: "new" as const,
        };

        await db.transaction("rw", db.dueCustomers, db.queue, async () => {
          await db.dueCustomers.put(payload);
          await queueAdd("due_customer", "create", payload);
        });

        upsertCustomerList(payload);
        emitDueCustomersEvent({ shopId, at: Date.now(), source: "local" });
        setCustomerId(payload.id);
        setQuickCustomer({ name: "", phone: "", address: "" });
        setQuickCustomerOpen(false);
        toast.success("অফলাইন: গ্রাহক যোগ হয়েছে, অনলাইনে গেলে সিঙ্ক হবে।");
        return;
      }

      const res = await fetch("/api/due/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId,
          name,
          phone: phone || undefined,
          address: address || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error("Quick customer create failed");
      }

      const json = (await res.json()) as { id?: string };
      const createdId = json.id;

      if (!createdId) {
        throw new Error("Customer id missing");
      }

      const payload = {
        id: createdId,
        shopId,
        name,
        phone: phone || null,
        address: address || null,
        totalDue: 0,
        lastPaymentAt: null,
        updatedAt: Date.now(),
        syncStatus: "synced" as const,
      };

      try {
        await db.dueCustomers.put(payload);
      } catch (err) {
        handlePermissionError(err);
        console.warn("Quick customer cache write failed", err);
      }

      upsertCustomerList(payload);
      setCustomerId(createdId);
      setQuickCustomer({ name: "", phone: "", address: "" });
      setQuickCustomerOpen(false);
      emitDueCustomersEvent({ shopId, at: Date.now(), source: "create" });
      queryClient.invalidateQueries({
        queryKey: dueCustomerQueryKey,
        refetchType: "active",
      });
      toast.success("গ্রাহক যোগ হয়েছে এবং নির্বাচন করা হয়েছে।");
    } catch (error) {
      console.error("Quick customer create failed:", error);
      toast.error("গ্রাহক যোগ করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setSavingCustomer(false);
    }
  }

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
    triggerRefresh("manual", { force: true });
  };

  const suspendScannerBeforeCheckout = useCallback((ms = 1600) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("pos-scanner-suspend", {
          detail: { shopId, ms },
        })
      );
    }

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      activeElement.blur();
    }
  }, [shopId]);

  const handleSellFromBar = () => {
    if (!canCreateSale) {
      toast.error("আপনার বিক্রি সম্পন্ন করার অনুমতি নেই।");
      return;
    }
    suspendScannerBeforeCheckout();
    const latestCartItems = useCart
      .getState()
      .items.filter((item) => item.shopId === shopId);

    if (latestCartItems.length === 0) {
      toast.warning("কার্টে কোনো পণ্য নেই।");
      return;
    }

    const submitCurrentForm = () => {
      saleFormRef.current?.requestSubmit(submitButtonRef.current ?? undefined);
    };

    if (items.length > 0) {
      submitCurrentForm();
      return;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        submitCurrentForm();
      });
    });
  };

  const handleClearFromBar = () => {
    clear();
    setPaidNow("");
    setDiscountType("amount");
    setDiscountValue("");
  };

  useEffect(() => {
    if (items.length === 0) return;
    setBarFlash(true);
    const t = setTimeout(() => setBarFlash(false), 240);
    return () => clearTimeout(t);
  }, [items.length]);

  useEffect(() => {
    if (!success) return;

    const toastId = toast.custom(
      (id) => (
        <div className="w-[min(92vw,24rem)] rounded-2xl border border-success/30 bg-success px-4 py-3 text-primary-foreground shadow-[0_18px_40px_rgba(22,163,74,0.28)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold">বিক্রি সম্পন্ন</p>
              <p className="mt-1 text-xs text-primary-foreground/85">
                নতুন বিল সফলভাবে সংরক্ষণ হয়েছে।
              </p>
            </div>
            <button
              type="button"
              onClick={() => toast.dismiss(id)}
              className="text-xs font-semibold text-primary-foreground/80 transition hover:text-primary-foreground"
            >
              বন্ধ
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              href={`/dashboard/sales?shopId=${shopId}`}
              onClick={() => toast.dismiss(id)}
              className="inline-flex h-8 items-center rounded-full border border-primary-foreground/30 px-3 text-xs font-semibold text-primary-foreground transition hover:bg-primary-foreground/10"
            >
              বিক্রি দেখুন
            </Link>
            {success.saleId && success.invoiceNo ? (
              <Link
                href={`/dashboard/sales/${success.saleId}/invoice`}
                onClick={() => toast.dismiss(id)}
                className="inline-flex h-8 items-center rounded-full border border-primary-foreground/30 px-3 text-xs font-semibold text-primary-foreground transition hover:bg-primary-foreground/10"
              >
                ইনভয়েস দেখুন
              </Link>
            ) : null}
          </div>
        </div>
      ),
      {
        duration: 5000,
      }
    );

    setSuccess(null);

    try {
      navigator.vibrate?.(20);
    } catch {
      // ignore vibration failures
    }
    return () => {
      toast.dismiss(toastId);
    };
  }, [shopId, success]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pb-28">
      {/* Left: Products */}
      <div className="lg:col-span-2 flex flex-col gap-6">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_12px_28px_rgba(15,23,42,0.08)] animate-fade-in">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-soft/30 via-card to-card" />
          <div className="pointer-events-none absolute -top-12 right-0 h-24 w-24 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative space-y-2 p-3 sm:p-4">
            <div className="flex items-start justify-between gap-2 sm:items-center">
              <div className="min-w-0 space-y-1">
                <h1 className="text-2xl font-bold text-foreground tracking-tight leading-tight sm:text-3xl">
                  নতুন বিক্রি
                </h1>
                <p
                  className="truncate text-xs text-muted-foreground"
                  title={`দোকান: ${shopName}`}
                >
                  দোকান: <span className="font-semibold">{shopName}</span>
                </p>
              </div>
              <RefreshIconButton
                onClick={handleProductRefresh}
                loading={productsRefreshing}
                label="রিফ্রেশ"
                showLabelOnMobile
                className="h-8 shrink-0 px-3 text-xs sm:h-7 sm:px-2.5"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              {pendingCount > 0 ? (
                <span className="inline-flex h-7 items-center rounded-full border border-warning/30 bg-warning-soft px-3 text-warning">
                  পেন্ডিং {pendingCount} টি
                </span>
              ) : null}
              {!canCreateSale ? (
                <span className="inline-flex h-7 items-center rounded-full border border-danger/30 bg-danger-soft px-3 text-danger">
                  বিক্রি করা নিষ্ক্রিয়
                </span>
              ) : null}
              {canCreateSale && !canUseDueSale ? (
                <span className="inline-flex h-7 items-center rounded-full border border-warning/30 bg-warning-soft px-3 text-warning">
                  বাকির বিক্রি নিষ্ক্রিয়
                </span>
              ) : null}
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
          <PosProductSearch
            products={productOptions}
            shopId={shopId}
            canUseBarcodeScan={canUseBarcodeScan}
          />
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
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">নেট মোট</p>
            <p className="text-3xl font-bold text-foreground">
              {payableTotal.toFixed(2)} ৳
            </p>
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>সাব-টোটাল</span>
                <span>{safeTotalAmount.toFixed(2)} ৳</span>
              </div>
              {saleDiscount.hasDiscount ? (
                <div className="flex items-center justify-between text-success">
                  <span>
                    ছাড়
                    {saleDiscount.discountType === "percent"
                      ? ` (${saleDiscount.discountValue.toFixed(2)}%)`
                      : ""}
                  </span>
                  <span>- {saleDiscount.discountAmount.toFixed(2)} ৳</span>
                </div>
              ) : null}
              {saleTax.taxAmount > 0 ? (
                <div className="flex items-center justify-between text-primary">
                  <span>
                    {saleTax.label}
                    {saleTax.rate > 0 ? ` (${saleTax.rate.toFixed(2)}%)` : ""}
                  </span>
                  <span>+ {saleTax.taxAmount.toFixed(2)} ৳</span>
                </div>
              ) : null}
            </div>
          </div>

          {canUseSaleDiscount ? (
            <div className="rounded-xl border border-success/25 bg-success-soft/40 p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <label className="text-base font-medium text-foreground">Discount</label>
                  <p className="text-xs text-muted-foreground">
                    পুরো bill-এ amount বা percent discount দিন।
                  </p>
                </div>
                {saleDiscount.hasDiscount ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDiscountType("amount");
                      setDiscountValue("");
                    }}
                    className="inline-flex h-8 items-center rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted"
                  >
                    রিসেট
                  </button>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "amount", label: "টাকা" },
                  { value: "percent", label: "শতাংশ" },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setDiscountType(option.value as SaleDiscountType)}
                    className={`h-10 rounded-xl border px-3 text-sm font-semibold transition-colors ${
                      discountType === option.value
                        ? "bg-success/15 text-success border-success/40"
                        : "bg-card text-foreground border-border hover:border-success/30"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                <input
                  type="number"
                  min="0"
                  max={discountType === "percent" ? 100 : safeTotalAmount}
                  step="0.01"
                  className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-success/30"
                  placeholder={
                    discountType === "percent"
                      ? "যেমন: 5 বা 10"
                      : "যেমন: 20 বা 50"
                  }
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {saleDiscount.hasDiscount
                    ? `ছাড় ${saleDiscount.discountAmount.toFixed(2)} ৳, net bill ${payableTotal.toFixed(2)} ৳`
                    : "ফাঁকা রাখলে কোনো discount apply হবে না।"}
                </p>
              </div>
            </div>
          ) : null}

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
          {isDue && canUseDueSale && (
            <div className="rounded-xl border border-warning/30 bg-warning-soft/40 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label className="text-base font-medium text-foreground">
                  গ্রাহক নির্বাচন করুন
                </label>
                {canCreateCustomer ? (
                  <button
                    type="button"
                    onClick={() => setQuickCustomerOpen(true)}
                    className="inline-flex h-8 items-center rounded-full border border-primary/30 bg-primary-soft px-3 text-xs font-semibold text-primary transition hover:bg-primary/20"
                  >
                    + নতুন গ্রাহক
                  </button>
                ) : null}
              </div>
              <Select
                value={customerId || undefined}
                onValueChange={setCustomerId}
                disabled={customersLoading || customerList.length === 0}
              >
                <SelectTrigger className="h-11 w-full rounded-xl border border-border bg-card px-3 text-left text-sm text-foreground shadow-sm focus:ring-2 focus:ring-primary/30">
                  <SelectValue placeholder="একজন গ্রাহক নির্বাচন করুন" />
                </SelectTrigger>
                <SelectContent
                  align="start"
                  className="min-w-[var(--radix-select-trigger-width)]"
                >
                  {customersLoading ? (
                    <SelectItem value="__loading" disabled>
                      গ্রাহক লোড হচ্ছে...
                    </SelectItem>
                  ) : customerList.length === 0 ? (
                    <SelectItem value="__empty" disabled>
                      কোনো গ্রাহক পাওয়া যায়নি
                    </SelectItem>
                  ) : (
                    customerList.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name} — বকেয়া:{" "}
                        {Number(customer.totalDue || 0).toFixed(2)} ৳
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {canCreateCustomer ? (
                <p className="text-xs text-muted-foreground">
                  এখানে নতুন গ্রাহক যোগ করলে সঙ্গে সঙ্গে বাকির বিক্রিতে নির্বাচন হবে।
                </p>
              ) : canViewDuePage ? (
                <a
                  className="text-sm text-primary hover:underline"
                  href={`/dashboard/due?shopId=${shopId}`}
                >
                  নতুন গ্রাহক যোগ করতে ধার/বাকি পেজে যান
                </a>
              ) : (
                <p className="text-xs text-muted-foreground">
                  কাস্টমার যোগ করতে Due page access প্রয়োজন।
                </p>
              )}
            </div>
          )}

          {/* Partial payment - only for due */}
          {isDue && canUseDueSale && (
            <div className="rounded-xl border border-warning/30 bg-warning-soft/40 p-3 space-y-2">
              <label className="text-base font-medium text-foreground">
                এখন পরিশোধ (আংশিক হলে)
              </label>
              <input
                type="number"
                min="0"
                max={payableTotal}
                step="0.01"
                className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="যেমন: 100 (আংশিক পরিশোধের জন্য)"
                value={paidNow}
                onChange={(e) => setPaidNow(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                মোট {payableTotal.toFixed(2)} ৳ | আংশিক দিলে বাকি ধার হিসেবে
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
        <form ref={saleFormRef} onSubmit={handleSubmit} className="mt-6 space-y-3">
          <button
            type="submit"
            onPointerDown={() => suspendScannerBeforeCheckout()}
            disabled={items.length === 0 || isSubmitting || !canCreateSale}
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
            onClick={handleClearFromBar}
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
            className={`relative bg-card/95 backdrop-blur rounded-3xl border border-border shadow-[0_-10px_30px_rgba(15,23,42,0.18)] px-4 py-3 space-y-3 ${
              barFlash ? "flash-bar" : ""
            }`}
          >
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-muted-foreground/30" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
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
                  {payableTotal.toFixed(2)} ৳ — {itemCount} আইটেম
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentSheetOpen(true)}
                    className="inline-flex h-8 items-center rounded-full border border-primary/30 bg-primary-soft px-3 text-xs font-semibold text-primary"
                  >
                    পেমেন্ট: {currentPaymentLabel} ▼
                  </button>
                  {saleDiscount.hasDiscount ? (
                    <span className="inline-flex h-8 items-center rounded-full border border-success/30 bg-success-soft px-3 text-[11px] font-semibold text-success">
                      ছাড় {saleDiscount.discountAmount.toFixed(2)} ৳
                    </span>
                  ) : null}
                  {saleTax.taxAmount > 0 ? (
                    <span className="inline-flex h-8 items-center rounded-full border border-primary/30 bg-primary-soft px-3 text-[11px] font-semibold text-primary">
                      {saleTax.label} {saleTax.taxAmount.toFixed(2)} ৳
                    </span>
                  ) : null}
                  {isDue ? (
                    <span className="text-[11px] text-muted-foreground">
                      {selectedCustomerName
                        ? `গ্রাহক: ${selectedCustomerName}`
                        : "গ্রাহক বাছাই বাকি"}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClearFromBar}
                className="flex-1 px-3 py-2 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted"
              >
                পরিষ্কার
              </button>
              <button
                type="button"
                onPointerDown={() => suspendScannerBeforeCheckout()}
                onClick={handleSellFromBar}
                disabled={isSubmitting || !canCreateSale}
                className="flex-[1.2] px-4 py-2 rounded-xl bg-gradient-to-r from-primary to-primary-hover text-primary-foreground border border-primary/40 text-sm font-semibold min-w-[140px] flex items-center justify-center gap-1 shadow-[0_10px_18px_rgba(22,163,74,0.28)] disabled:opacity-60"
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
                  {payableTotal.toFixed(2)} ৳ • {itemCount} আইটেম
                </p>
                <p className="text-xs text-muted-foreground">
                  সাব-টোটাল {safeTotalAmount.toFixed(2)} ৳
                  {saleDiscount.hasDiscount
                    ? ` • ছাড় ${saleDiscount.discountAmount.toFixed(2)} ৳`
                    : ""}
                  {saleTax.taxAmount > 0
                    ? ` • ${saleTax.label} ${saleTax.taxAmount.toFixed(2)} ৳`
                    : ""}
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

      {paymentSheetOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-foreground/30 animate-fade-in"
            onClick={() => setPaymentSheetOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 bg-card rounded-t-3xl shadow-[0_-20px_50px_rgba(15,23,42,0.2)] p-5 space-y-4 max-h-[75vh] overflow-y-auto animate-slide-up">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">দ্রুত পেমেন্ট সেটিং</p>
                <p className="text-lg font-semibold text-foreground">
                  {payableTotal.toFixed(2)} ৳
                </p>
                <p className="text-xs text-muted-foreground">
                  সাব-টোটাল {safeTotalAmount.toFixed(2)} ৳
                  {saleDiscount.hasDiscount
                    ? ` • ছাড় ${saleDiscount.discountAmount.toFixed(2)} ৳`
                    : ""}
                  {saleTax.taxAmount > 0
                    ? ` • ${saleTax.label} ${saleTax.taxAmount.toFixed(2)} ৳`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPaymentSheetOpen(false)}
                className="px-3 py-2 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted"
              >
                বন্ধ
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">
                পেমেন্ট পদ্ধতি
              </label>
              <div className="grid grid-cols-2 gap-2">
                {paymentOptions.map((method) => (
                  <button
                    key={`mobile-${method.value}`}
                    type="button"
                    onClick={() => {
                      setPaymentMethod(method.value);
                      if (method.value !== "due") {
                        setPaymentSheetOpen(false);
                      }
                    }}
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

            {isDue && canUseDueSale ? (
              <div className="space-y-4 rounded-2xl border border-warning/30 bg-warning-soft/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm font-semibold text-foreground">
                    গ্রাহক নির্বাচন করুন
                  </label>
                  {canCreateCustomer ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentSheetOpen(false);
                        setQuickCustomerOpen(true);
                      }}
                      className="inline-flex h-8 items-center rounded-full border border-primary/30 bg-primary-soft px-3 text-xs font-semibold text-primary"
                    >
                      + নতুন গ্রাহক
                    </button>
                  ) : null}
                </div>
                <Select
                  value={customerId || undefined}
                  onValueChange={setCustomerId}
                  disabled={customersLoading || customerList.length === 0}
                >
                  <SelectTrigger className="h-11 w-full rounded-xl border border-border bg-card px-3 text-left text-sm text-foreground shadow-sm focus:ring-2 focus:ring-primary/30">
                    <SelectValue placeholder="একজন গ্রাহক নির্বাচন করুন" />
                  </SelectTrigger>
                  <SelectContent
                    align="start"
                    className="min-w-[var(--radix-select-trigger-width)]"
                  >
                    {customersLoading ? (
                      <SelectItem value="__loading-mobile" disabled>
                        গ্রাহক লোড হচ্ছে...
                      </SelectItem>
                    ) : customerList.length === 0 ? (
                      <SelectItem value="__empty-mobile" disabled>
                        কোনো গ্রাহক পাওয়া যায়নি
                      </SelectItem>
                    ) : (
                      customerList.map((customer) => (
                        <SelectItem key={`mobile-${customer.id}`} value={customer.id}>
                          {customer.name} — বকেয়া:{" "}
                          {Number(customer.totalDue || 0).toFixed(2)} ৳
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">
                    এখন পরিশোধ (আংশিক হলে)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={payableTotal}
                    step="0.01"
                    className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="যেমন: 100"
                    value={paidNow}
                    onChange={(e) => setPaidNow(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    গ্রাহক বাছাই করে আংশিক টাকা নিলে বাকি পরে দেখাবে।
                  </p>
                </div>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setPaymentSheetOpen(false)}
              className="w-full h-11 rounded-xl bg-primary-soft text-primary border border-primary/30 text-sm font-semibold"
            >
              হয়ে গেছে
            </button>
          </div>
        </div>
      )}

      <Dialog
        open={quickCustomerOpen}
        onOpenChange={(open) => {
          setQuickCustomerOpen(open);
          if (!open && !savingCustomer) {
            setQuickCustomer({ name: "", phone: "", address: "" });
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-1rem)] max-w-md border-border/70 sm:w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle>বাকির জন্য নতুন গ্রাহক</DialogTitle>
            <DialogDescription>
              এই পেজ ছাড়াই গ্রাহক যোগ করুন। save হলে তাকে সঙ্গে সঙ্গে নির্বাচন করা হবে।
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-foreground">
                গ্রাহকের নাম *
              </label>
              <input
                className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="যেমন: করিম সাহেব"
                value={quickCustomer.name}
                onChange={(e) =>
                  setQuickCustomer((prev) => ({
                    ...prev,
                    name: e.target.value,
                  }))
                }
                disabled={savingCustomer}
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-foreground">
                ফোন নম্বর
              </label>
              <input
                className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="যেমন: 01700000000"
                value={quickCustomer.phone}
                onChange={(e) =>
                  setQuickCustomer((prev) => ({
                    ...prev,
                    phone: e.target.value,
                  }))
                }
                disabled={savingCustomer}
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-foreground">
                ঠিকানা
              </label>
              <input
                className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="যেমন: বাজার রোড"
                value={quickCustomer.address}
                onChange={(e) =>
                  setQuickCustomer((prev) => ({
                    ...prev,
                    address: e.target.value,
                  }))
                }
                disabled={savingCustomer}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => setQuickCustomerOpen(false)}
              disabled={savingCustomer}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              বন্ধ
            </button>
            <button
              type="button"
              onClick={handleQuickCustomerSave}
              disabled={!quickCustomer.name.trim() || savingCustomer}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-primary/30 bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingCustomer
                ? "সংরক্ষণ হচ্ছে..."
                : "গ্রাহক যোগ করে নির্বাচন করুন"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
