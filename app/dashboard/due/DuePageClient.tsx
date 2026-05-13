// app/dashboard/due/DuePageClient.tsx

"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import RefreshIconButton from "@/components/ui/refresh-icon-button";
import QuickDuePaymentSheet from "./QuickDuePaymentSheet";
import QuickCustomerSheet from "./QuickCustomerSheet";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { useSyncStatus } from "@/lib/sync/sync-status";
import { queueAdd } from "@/lib/sync/queue";
import { handlePermissionError } from "@/lib/permission-toast";
import { toast } from "sonner";
import { useSmartPolling, type SmartPollingReason } from "@/lib/polling/use-smart-polling";
import { usePageVisibility } from "@/lib/use-page-visibility";
import {
  emitDueCustomersEvent,
  subscribeDueCustomersEvent,
} from "@/lib/due/customer-events";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";
import {
  getSpeechRecognitionCtor,
  mapVoiceErrorBangla,
  startDualLanguageVoice,
  type VoiceSession,
} from "@/lib/voice-recognition";
import { parsePhoneInput } from "@/lib/phone-input";
import {
  db,
  type LocalDueCustomer,
  type LocalDueLedger,
} from "@/lib/dexie/db";
import { Skeleton } from "@/components/ui/skeleton";

type Customer = {
  id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  totalDue: string | number;
  creditLimit?: number | null;
  lastPaymentAt?: string | null;
};

type Summary = {
  totalDue: number;
  topDue: {
    id: string;
    name: string;
    totalDue: number;
    phone?: string | null;
  }[];
};

type StatementRow = {
  id: string;
  entryType: "SALE" | "PAYMENT";
  amount: string | number;
  description?: string | null;
  entryDate: string;
  saleId?: string | null;
  dueDate?: string | null;
  invoiceNo?: string | null;
};

type AgingReport = {
  asOf: string;
  totals: {
    current: string;
    b1_30: string;
    b31_60: string;
    b61_90: string;
    b90plus: string;
    total: string;
  };
  rows: {
    customerId: string;
    customerName: string;
    phone: string | null;
    current: string;
    b1_30: string;
    b31_60: string;
    b61_90: string;
    b90plus: string;
    totalDue: string;
  }[];
};

type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
};

type CustomerTemplate = {
  name: string;
  phone?: string;
  address?: string;
  count: number;
  lastUsed: number;
};

type PaymentTemplate = {
  customerId?: string;
  amount: string;
  description?: string;
  count: number;
  lastUsed: number;
};

type VoiceField =
  | "customerName"
  | "customerPhone"
  | "customerAddress"
  | "paymentAmount"
  | "paymentDescription";

function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function formatBn(value: number, decimals = 2) {
  return value.toLocaleString("bn-BD", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function normalizeEntryDate(value: string | number | Date | undefined) {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? parsed.toISOString()
    : new Date().toISOString();
}

function formatStatementDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";

  return date.toLocaleString("bn-BD", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function computeSummary(customers: Customer[]): Summary {
  const totalDue = customers.reduce((sum, c) => sum + toNumber(c.totalDue), 0);
  const topDue = [...customers]
    .sort((a, b) => toNumber(b.totalDue) - toNumber(a.totalDue))
    .slice(0, 5)
    .map((c) => ({
      id: c.id,
      name: c.name,
      totalDue: toNumber(c.totalDue),
      phone: c.phone ?? null,
    }));
  return { totalDue, topDue };
}

function toLocalDueCustomer(
  customer: Customer,
  shopId: string,
  now: number
): LocalDueCustomer {
  return {
    id: customer.id,
    shopId,
    name: customer.name,
    phone: customer.phone ?? null,
    address: customer.address ?? null,
    totalDue: toNumber(customer.totalDue),
    lastPaymentAt: customer.lastPaymentAt ?? null,
    updatedAt: now,
    syncStatus: "synced",
  };
}

function fromLocalDueCustomer(row: LocalDueCustomer): Customer {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? null,
    address: row.address ?? null,
    totalDue: row.totalDue ?? 0,
    lastPaymentAt: row.lastPaymentAt ?? null,
  };
}

function toLocalDueLedger(
  row: StatementRow,
  shopId: string,
  customerId: string
): LocalDueLedger {
  return {
    id: row.id,
    shopId,
    customerId,
    entryType: row.entryType,
    amount: row.amount,
    description: row.description ?? null,
    entryDate: normalizeEntryDate(row.entryDate),
    syncStatus: "synced",
  };
}

function fromLocalDueLedger(row: LocalDueLedger): StatementRow {
  return {
    id: row.id,
    entryType: row.entryType,
    amount: row.amount,
    description: row.description ?? null,
    entryDate: normalizeEntryDate(row.entryDate),
  };
}

type Props = {
  shopId: string;
  shopName: string;
  initialCustomers: Customer[];
  canCreateCustomer: boolean;
  canTakeDuePayment: boolean;
};

type DueTabId = "summary" | "add" | "payment" | "list" | "aging";

export default function DuePageClient({
  shopId,
  shopName,
  initialCustomers,
  canCreateCustomer,
  canTakeDuePayment,
}: Props) {
  const online = useOnlineStatus();
  const isVisible = usePageVisibility();
  const queryClient = useQueryClient();
  const { pendingCount, syncing, lastSyncAt } = useSyncStatus();
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const voiceSessionRef = useRef<VoiceSession | null>(null);
  const refreshInFlightRef = useRef(false);
  const lastRefreshAtRef = useRef(0);
  const REFRESH_MIN_INTERVAL_MS = 2_000;
  const [voiceReady, setVoiceReady] = useState(false);
  const [listeningField, setListeningField] = useState<VoiceField | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [manualRefreshing, setManualRefreshing] = useState(false);

  const customerTemplateKey = useMemo(
    () => `due:customerTemplates:${shopId}`,
    [shopId]
  );
  const paymentTemplateKey = useMemo(
    () => `due:paymentTemplates:${shopId}`,
    [shopId]
  );

  const [activeTab, setActiveTab] = useState<DueTabId>("summary");
  const [mobileAdvancedMode, setMobileAdvancedMode] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>(
    initialCustomers || []
  );
  const summary = useMemo(() => computeSummary(customers), [customers]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [savingPayment, setSavingPayment] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: "",
    phone: "",
    address: "",
    creditLimit: "",
  });
  const [agingReport, setAgingReport] = useState<AgingReport | null>(null);
  const [loadingAging, setLoadingAging] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    customerId: "",
    amount: "",
    description: "",
  });
  const [customerTemplates, setCustomerTemplates] = useState<
    CustomerTemplate[]
  >([]);
  const [paymentTemplates, setPaymentTemplates] = useState<PaymentTemplate[]>(
    []
  );

  function parseAmount(text: string) {
    const match = text.match(/(\d+(?:[.,]\d+)?)/);
    return match ? match[1].replace(",", "") : "";
  }

  function dedupe(values: string[]) {
    return Array.from(new Set(values.filter(Boolean)));
  }

  const loadCustomersFromDexie = useCallback(async () => {
    try {
      const rows = await db.dueCustomers
        .where("shopId")
        .equals(shopId)
        .toArray();
      const mapped = rows
        .map(fromLocalDueCustomer)
        .sort((a, b) => toNumber(b.totalDue) - toNumber(a.totalDue));
      setCustomers(mapped);
      return mapped;
    } catch (err) {
      handlePermissionError(err);
      console.error("Load offline due customers failed", err);
      setCustomers([]);
      return [];
    }
  }, [shopId]);

  const seedCustomersToDexie = useCallback(async (nextCustomers: Customer[]) => {
    const now = Date.now();
    const rows = (nextCustomers || []).map((customer) =>
      toLocalDueCustomer(customer, shopId, now)
    );
    await db.transaction("rw", db.dueCustomers, async () => {
      await db.dueCustomers
        .where("shopId")
        .equals(shopId)
        .and((row) => row.syncStatus === "synced")
        .delete();
      if (rows.length > 0) {
        await db.dueCustomers.bulkPut(rows);
      }
    });
  }, [shopId]);

  const customerQueryKey = useMemo(() => ["due", "customers", shopId], [shopId]);

  const fetchCustomers = useCallback(async () => {
    const res = await fetch(`/api/due/customers?shopId=${shopId}`);
    if (res.status === 304) {
      return loadCustomersFromDexie();
    }
    if (!res.ok) {
      throw new Error("Due customers fetch failed");
    }
    const json = await res.json();
    return Array.isArray(json?.data) ? json.data : [];
  }, [shopId, loadCustomersFromDexie]);

  const customersQuery = useQuery({
    queryKey: customerQueryKey,
    queryFn: fetchCustomers,
    enabled: online,
    staleTime: 15_000,
    initialData: () => initialCustomers ?? [],
    placeholderData: (prev) => prev ?? [],
  });

  // Seed Dexie when online; always read from Dexie as source of truth.
  useEffect(() => {
    const run = async () => {
      if (online) {
        try {
          await seedCustomersToDexie(customersQuery.data ?? initialCustomers ?? []);
        } catch (err) {
          handlePermissionError(err);
          console.error("Seed Dexie due customers failed", err);
        }
      }
      await loadCustomersFromDexie();
    };
    run();
  }, [
    online,
    initialCustomers,
    customersQuery.data,
    loadCustomersFromDexie,
    seedCustomersToDexie,
  ]);

  function mergeCustomerTemplates(
    existing: CustomerTemplate[],
    incoming: CustomerTemplate
  ) {
    const idx = existing.findIndex(
      (t) => t.name.toLowerCase() === incoming.name.toLowerCase()
    );
    const next = [...existing];
    if (idx >= 0) {
      const current = next[idx];
      next[idx] = {
        ...current,
        phone: incoming.phone || current.phone,
        address: incoming.address || current.address,
        count: current.count + 1,
        lastUsed: incoming.lastUsed,
      };
    } else {
      next.unshift(incoming);
    }
    return next
      .sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed)
      .slice(0, 50);
  }

  function mergePaymentTemplates(
    existing: PaymentTemplate[],
    incoming: PaymentTemplate
  ) {
    const keyMatch = (t: PaymentTemplate) =>
      (t.customerId || "") === (incoming.customerId || "") &&
      (t.description || "") === (incoming.description || "");
    const idx = existing.findIndex(keyMatch);
    const next = [...existing];
    if (idx >= 0) {
      const current = next[idx];
      next[idx] = {
        ...current,
        amount: incoming.amount || current.amount,
        description: incoming.description || current.description,
        customerId: incoming.customerId || current.customerId,
        count: current.count + 1,
        lastUsed: incoming.lastUsed,
      };
    } else {
      next.unshift(incoming);
    }
    return next
      .sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed)
      .slice(0, 50);
  }

  useEffect(() => {
    const SpeechRecognitionImpl = getSpeechRecognitionCtor();
    setVoiceReady(Boolean(SpeechRecognitionImpl));
    return () => {
      voiceSessionRef.current?.stop();
      voiceSessionRef.current = null;
      recognitionRef.current?.stop?.();
    };
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 767px)");
    const apply = () => setIsMobileViewport(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const storedCustomers = safeLocalStorageGet(customerTemplateKey);
    if (storedCustomers) {
      try {
        setCustomerTemplates(JSON.parse(storedCustomers) as CustomerTemplate[]);
      } catch {
        setCustomerTemplates([]);
      }
    }
    const storedPayments = safeLocalStorageGet(paymentTemplateKey);
    if (storedPayments) {
      try {
        setPaymentTemplates(JSON.parse(storedPayments) as PaymentTemplate[]);
      } catch {
        setPaymentTemplates([]);
      }
    }
  }, [customerTemplateKey, paymentTemplateKey]);

  // Reset client state when shop changes to avoid leaking data across shops.
  useEffect(() => {
    setSelectedCustomerId("");
    setPaymentForm({ customerId: "", amount: "", description: "" });
    loadCustomersFromDexie();
  }, [shopId, loadCustomersFromDexie]);

  useEffect(() => {
    if (!selectedCustomerId && customers.length > 0) {
      setSelectedCustomerId(customers[0].id);
      setPaymentForm((prev) => ({ ...prev, customerId: customers[0].id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers]);

  const refreshData = useCallback(
    async (options?: {
      force?: boolean;
      source?: "refresh" | "create" | "payment" | "sync" | "local";
    }) => {
      if (refreshInFlightRef.current) return;
      const now = Date.now();
      if (
        !options?.force &&
        now - lastRefreshAtRef.current < REFRESH_MIN_INTERVAL_MS
      ) {
        return;
      }
      refreshInFlightRef.current = true;
      lastRefreshAtRef.current = now;
      try {
        if (online) {
          await queryClient.invalidateQueries({
            queryKey: customerQueryKey,
            refetchType: "active",
          });
        }
        await loadCustomersFromDexie();
        emitDueCustomersEvent({
          shopId,
          at: Date.now(),
          source: options?.source ?? "refresh",
        });
      } catch (err) {
        handlePermissionError(err);
        console.error("Refresh due customers request failed", err);
      } finally {
        refreshInFlightRef.current = false;
      }
    },
    [online, queryClient, customerQueryKey, loadCustomersFromDexie, shopId]
  );

  const readStatementFromDexie = useCallback(
    async (customerId: string) => {
      const localRows = await db.dueLedger
        .where("[shopId+customerId]")
        .equals([shopId, customerId])
        .toArray();
      return localRows
        .map(fromLocalDueLedger)
        .sort(
          (a, b) =>
            new Date(a.entryDate).getTime() -
            new Date(b.entryDate).getTime()
        );
    },
    [shopId]
  );

  const fetchStatement = useCallback(
    async (customerId: string) => {
      if (!customerId) return [];
      try {
        if (online) {
          const res = await fetch(
            `/api/due/statement?shopId=${shopId}&customerId=${customerId}`
          );
          if (res.ok) {
            const json = await res.json();
            const rows = Array.isArray(json?.data) ? json.data : [];
            const mapped = rows.map((row: any) =>
              toLocalDueLedger(
                {
                  id: row.id,
                  entryType: row.entryType,
                  amount: row.amount,
                  description: row.description ?? null,
                  entryDate: row.entryDate,
                },
                shopId,
                customerId
              )
            );

            await db.transaction("rw", db.dueLedger, async () => {
              await db.dueLedger
                .where("[shopId+customerId]")
                .equals([shopId, customerId])
                .and((row) => row.syncStatus === "synced")
                .delete();
              if (mapped.length > 0) {
                await db.dueLedger.bulkPut(mapped);
              }
            });
          }
        }
      } catch (err) {
        handlePermissionError(err);
        console.error("Load due statement failed", err);
      }

      try {
        return await readStatementFromDexie(customerId);
      } catch (err) {
        handlePermissionError(err);
        console.error("Load due statement cache failed", err);
        return [];
      }
    },
    [online, shopId, readStatementFromDexie]
  );

  const statementQueryKey = useMemo(
    () => ["due", "statement", shopId, selectedCustomerId],
    [shopId, selectedCustomerId]
  );

  const statementQuery = useQuery({
    queryKey: statementQueryKey,
    queryFn: () => fetchStatement(selectedCustomerId),
    enabled: Boolean(selectedCustomerId),
    staleTime: 15_000,
    placeholderData: (prev) => prev ?? [],
  });

  const statement = useMemo<StatementRow[]>(
    () => statementQuery.data ?? [],
    [statementQuery.data]
  );
  const loadingStatement = statementQuery.isFetching && online;
  const refreshStatement = useCallback(
    (customerId?: string) => {
      if (!customerId) return;
      queryClient.invalidateQueries({
        queryKey: ["due", "statement", shopId, customerId],
        refetchType: "active",
      });
    },
    [queryClient, shopId]
  );

  const handleSmartRefresh = useCallback(
    (reason: SmartPollingReason) => {
      const force = reason === "focus" || reason === "reconnect";
      refreshData({
        force,
        source: reason === "sync" ? "sync" : "refresh",
      });
      if (selectedCustomerId) {
        refreshStatement(selectedCustomerId);
      }
    },
    [refreshData, selectedCustomerId, refreshStatement]
  );

  const { triggerRefresh } = useSmartPolling({
    profile: "due",
    enabled: Boolean(shopId),
    online,
    isVisible,
    blocked: syncing || pendingCount > 0,
    syncToken: lastSyncAt,
    canRefresh: () => !refreshInFlightRef.current,
    onRefresh: handleSmartRefresh,
  });

  const handleManualRefresh = useCallback(async () => {
    setManualRefreshing(true);
    try {
      await refreshData({ force: true, source: "refresh" });
      if (selectedCustomerId) {
        refreshStatement(selectedCustomerId);
      }
    } finally {
      setTimeout(() => setManualRefreshing(false), 600);
    }
  }, [refreshData, selectedCustomerId, refreshStatement]);

  const handleQuickPaymentSuccess = useCallback(
    (customerId: string) => {
      void refreshData({ force: true, source: "payment" });
      refreshStatement(customerId);
    },
    [refreshData, refreshStatement]
  );

  const handleQuickCustomerCreated = useCallback(
    (mode: "online" | "offline") => {
      void refreshData({
        force: true,
        source: mode === "online" ? "create" : "local",
      });
    },
    [refreshData]
  );

  useEffect(() => {
    return subscribeDueCustomersEvent((detail) => {
      if (detail.shopId !== shopId) return;
      triggerRefresh("event", { at: detail.at ?? Date.now() });
    });
  }, [
    shopId,
    triggerRefresh,
  ]);

  async function handleAddCustomer(e: FormEvent) {
    e.preventDefault();
    if (!canCreateCustomer) {
      toast.error("গ্রাহক যোগ করার অনুমতি নেই।");
      return;
    }
    if (!newCustomer.name.trim()) return;
    if (!online) {
      const now = Date.now();
      const payload = {
        id: crypto.randomUUID(),
        shopId,
        name: newCustomer.name.trim(),
        phone: newCustomer.phone.trim() || null,
        address: newCustomer.address.trim() || null,
        totalDue: "0",
        lastPaymentAt: null,
        updatedAt: now,
        syncStatus: "new" as const,
      };
      await db.transaction("rw", db.dueCustomers, db.queue, async () => {
        await db.dueCustomers.put(payload);
        await queueAdd("due_customer", "create", payload);
      });
      const template: CustomerTemplate = {
        name: newCustomer.name.trim(),
        phone: newCustomer.phone.trim() || undefined,
        address: newCustomer.address.trim() || undefined,
        count: 1,
        lastUsed: Date.now(),
      };
      const merged = mergeCustomerTemplates(customerTemplates, template);
      setCustomerTemplates(merged);
      safeLocalStorageSet(customerTemplateKey, JSON.stringify(merged));
      setNewCustomer({ name: "", phone: "", address: "", creditLimit: "" });
      await loadCustomersFromDexie();
      emitDueCustomersEvent({ shopId, at: Date.now(), source: "local" });
      return;
    }

    await fetch("/api/due/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shopId,
        name: newCustomer.name.trim(),
        phone: newCustomer.phone.trim() || undefined,
        address: newCustomer.address.trim() || undefined,
        creditLimit: newCustomer.creditLimit
          ? Number(newCustomer.creditLimit) || undefined
          : undefined,
      }),
    });

    const template: CustomerTemplate = {
      name: newCustomer.name.trim(),
      phone: newCustomer.phone.trim() || undefined,
      address: newCustomer.address.trim() || undefined,
      count: 1,
      lastUsed: Date.now(),
    };
    const merged = mergeCustomerTemplates(customerTemplates, template);
    setCustomerTemplates(merged);
    safeLocalStorageSet(customerTemplateKey, JSON.stringify(merged));

    setNewCustomer({ name: "", phone: "", address: "", creditLimit: "" });
    await refreshData({ force: true, source: "create" });
  }

  function persistPaymentTemplate(
    customerId: string,
    amount: string,
    description: string
  ) {
    const template: PaymentTemplate = {
      customerId,
      amount: amount || "0",
      description: description || "",
      count: 1,
      lastUsed: Date.now(),
    };
    const merged = mergePaymentTemplates(paymentTemplates, template);
    setPaymentTemplates(merged);
    safeLocalStorageSet(paymentTemplateKey, JSON.stringify(merged));
  }


  async function handlePayment(e: FormEvent) {
    e.preventDefault();
    if (!canTakeDuePayment) {
      toast.error("পেমেন্ট রেকর্ড করার অনুমতি নেই।");
      return;
    }
    if (!paymentForm.customerId || !paymentForm.amount) return;

    const amountValue = Number(paymentForm.amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) return;

    setSavingPayment(true);
    try {
      if (!online) {
        const nowIso = new Date().toISOString();
        const nowTs = Date.now();
        const entryId = crypto.randomUUID();
        const description = paymentForm.description?.trim() || "";
        const targetCustomer = customers.find(
          (customer) => customer.id === paymentForm.customerId
        );
        const nextDue = Math.max(
          0,
          toNumber(targetCustomer?.totalDue) - amountValue
        );
        let nextCustomers = customers.map((customer) =>
          customer.id === paymentForm.customerId
            ? {
                ...customer,
                totalDue: nextDue,
                lastPaymentAt: nowIso,
              }
            : customer
        );
        if (!targetCustomer) {
          nextCustomers = nextCustomers.concat({
            id: paymentForm.customerId,
            name: "Customer",
            phone: null,
            address: null,
            totalDue: nextDue,
            lastPaymentAt: nowIso,
          });
        }
        nextCustomers = nextCustomers.sort(
          (a, b) => toNumber(b.totalDue) - toNumber(a.totalDue)
        );
        setCustomers(nextCustomers);

        const ledgerEntry: LocalDueLedger = {
          id: entryId,
          shopId,
          customerId: paymentForm.customerId,
          entryType: "PAYMENT",
          amount: amountValue,
          description: description || null,
          entryDate: nowIso,
          syncStatus: "new",
        };

        await db.transaction(
          "rw",
          db.dueCustomers,
          db.dueLedger,
          db.queue,
          async () => {
          await db.dueLedger.put(ledgerEntry);
          const existing = await db.dueCustomers.get(paymentForm.customerId);
          if (existing) {
            await db.dueCustomers.update(paymentForm.customerId, {
              totalDue: nextDue,
              lastPaymentAt: nowIso,
              updatedAt: nowTs,
              syncStatus: "synced",
            });
          } else {
            const name = targetCustomer?.name || "Customer";
            const phone = targetCustomer?.phone ?? null;
            const address = targetCustomer?.address ?? null;
            await db.dueCustomers.put({
              id: paymentForm.customerId,
              shopId,
              name,
              phone,
              address,
              totalDue: nextDue,
              lastPaymentAt: nowIso,
              updatedAt: nowTs,
              syncStatus: "synced",
            });
          }
          await queueAdd("due_payment", "payment", {
            shopId,
            customerId: paymentForm.customerId,
            amount: amountValue,
            description: description || null,
            createdAt: nowIso,
            localId: entryId,
          });
        });

        persistPaymentTemplate(
          paymentForm.customerId,
          paymentForm.amount,
          paymentForm.description || ""
        );

        setPaymentForm({
          customerId: paymentForm.customerId,
          amount: "",
          description: "",
        });

        refreshStatement(paymentForm.customerId);
        toast.success("অফলাইন: পেমেন্ট সেভ হয়েছে, অনলাইনে গেলে সিঙ্ক হবে।");
        return;
      }

      await fetch("/api/due/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId,
          customerId: paymentForm.customerId,
          amount: amountValue,
          description: paymentForm.description || undefined,
        }),
      });

      persistPaymentTemplate(
        paymentForm.customerId,
        paymentForm.amount,
        paymentForm.description || ""
      );

      setPaymentForm({
        customerId: paymentForm.customerId,
        amount: "",
        description: "",
      });
      await refreshData({ force: true, source: "payment" });
      refreshStatement(paymentForm.customerId);
    } finally {
      setSavingPayment(false);
    }
  }

  const statementWithBalance = useMemo(() => {
    let balance = 0;
    return statement.map((row) => {
      const amt = Number(row.amount || 0);
      balance += row.entryType === "SALE" ? amt : -amt;
      return { ...row, running: balance };
    });
  }, [statement]);

  const customerSuggestions = useMemo(() => {
    const recent = customerTemplates.slice(0, 6).map((t) => t.name);
    const topDue = summary.topDue?.slice(0, 4).map((c) => c.name) || [];
    const existing = customers.slice(0, 6).map((c) => c.name);
    return dedupe([...recent, ...topDue, ...existing]).slice(0, 8);
  }, [customerTemplates, summary.topDue, customers]);

  const amountSuggestions = useMemo(() => {
    const fromTemplates = paymentTemplates.map((t) => t.amount);
    return dedupe(fromTemplates).slice(0, 6);
  }, [paymentTemplates]);

  const voiceErrorText = voiceError ? `(${voiceError})` : "";
  const isListeningName = listeningField === "customerName";
  const isListeningPhone = listeningField === "customerPhone";
  const isListeningAddress = listeningField === "customerAddress";
  const isListeningPaymentAmount = listeningField === "paymentAmount";
  const isListeningPaymentDescription = listeningField === "paymentDescription";
  const isVoiceListening = listeningField !== null;

  const nameVoiceHint = isListeningName
    ? "শুনছি... গ্রাহকের নাম বলুন"
    : voiceReady
    ? "ভয়েসে নাম বললে অটো পূরণ হবে"
    : "এই ডিভাইসে ভয়েস সাপোর্ট নেই";
  const phoneVoiceHint = isListeningPhone
    ? "শুনছি... ফোন নম্বর বলুন"
    : voiceReady
    ? "ভয়েসে নম্বর বলুন"
    : "এই ডিভাইসে ভয়েস সাপোর্ট নেই";
  const addressVoiceHint = isListeningAddress
    ? "শুনছি... ঠিকানা বলুন"
    : voiceReady
    ? "ভয়েসে ঠিকানা বলুন"
    : "এই ডিভাইসে ভয়েস সাপোর্ট নেই";
  const paymentAmountVoiceHint = isListeningPaymentAmount
    ? "শুনছি... পরিমাণ বলুন"
    : voiceReady
    ? "ভয়েসে পরিমাণ বলুন"
    : "এই ডিভাইসে ভয়েস সাপোর্ট নেই";
  const paymentDescriptionVoiceHint = isListeningPaymentDescription
    ? "শুনছি... বিবরণ বলুন"
    : voiceReady
    ? "ভয়েসে বিবরণ বলুন"
    : "এই ডিভাইসে ভয়েস সাপোর্ট নেই";

  const latestPaymentLabel = useMemo(() => {
    const timestamps = customers
      .map((c) => (c.lastPaymentAt ? new Date(c.lastPaymentAt).getTime() : 0))
      .filter((t) => t > 0);
    if (timestamps.length === 0) return null;
    const latest = Math.max(...timestamps);
    return new Date(latest).toLocaleDateString("bn-BD", {
      day: "numeric",
      month: "short",
    });
  }, [customers]);

  const selectedCustomer = useMemo(() => {
    const id = paymentForm.customerId || selectedCustomerId;
    return customers.find((c) => c.id === id) || null;
  }, [customers, paymentForm.customerId, selectedCustomerId]);

  const selectedCustomerDue = selectedCustomer
    ? Number(selectedCustomer.totalDue || 0)
    : null;
  const selectedCustomerDueLabel =
    selectedCustomerDue !== null ? selectedCustomerDue.toFixed(2) : null;
  const selectedCustomerHasDue = selectedCustomerDue !== null && selectedCustomerDue > 0;

  const statementCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) || null,
    [customers, selectedCustomerId]
  );

  const lastSyncLabel =
    mounted && lastSyncAt
      ? new Date(lastSyncAt).toLocaleTimeString("bn-BD", {
          hour: "numeric",
          minute: "2-digit",
        })
      : null;

  const handleTabSelect = useCallback(
    (tabId: DueTabId) => {
      setActiveTab(tabId);
      if (!isMobileViewport) return;
      if (tabId === "add" || tabId === "payment") {
        setMobileAdvancedMode(true);
      } else {
        setMobileAdvancedMode(false);
      }
    },
    [isMobileViewport]
  );

  // Fetch aging report when aging tab becomes active
  useEffect(() => {
    if (activeTab !== "aging") return;
    setLoadingAging(true);
    fetch(`/api/due/aging?shopId=${shopId}`)
      .then((r) => r.json())
      .then((data) => setAgingReport(data))
      .catch(() => setAgingReport(null))
      .finally(() => setLoadingAging(false));
  }, [activeTab, shopId]);

  const openStatementFor = (customerId: string) => {
    handleTabSelect("list");
    setSelectedCustomerId(customerId);
  };

  const openAddTab = () => {
    if (!canCreateCustomer) {
      toast.error("গ্রাহক যোগ করার অনুমতি নেই।");
      return;
    }
    handleTabSelect("add");
  };

  const openPaymentTab = (customerId?: string) => {
    if (!canTakeDuePayment) {
      toast.error("পেমেন্ট নেওয়ার অনুমতি নেই।");
      return;
    }
    if (customerId) {
      setPaymentForm((prev) => ({
        ...prev,
        customerId,
      }));
      setSelectedCustomerId(customerId);
    }
    handleTabSelect("payment");
  };

  useEffect(() => {
    if (
      activeTab === "add" &&
      (!canCreateCustomer || (isMobileViewport && !mobileAdvancedMode))
    ) {
      setActiveTab("summary");
    }
    if (
      activeTab === "payment" &&
      (!canTakeDuePayment || (isMobileViewport && !mobileAdvancedMode))
    ) {
      setActiveTab("summary");
    }
  }, [
    activeTab,
    canCreateCustomer,
    canTakeDuePayment,
    isMobileViewport,
    mobileAdvancedMode,
  ]);

  function startVoice(field: VoiceField) {
    if (listeningField === field) return;
    if (listeningField) stopVoice();
    voiceSessionRef.current?.stop();
    voiceSessionRef.current = startDualLanguageVoice({
      onRecognitionRef: (recognition) => {
        recognitionRef.current = recognition;
      },
      onTranscript: (spoken) => {
        if (field === "customerName") {
          const phone = parsePhoneInput(spoken);
          const name = phone ? spoken.replace(phone, "").trim() : spoken;
          setNewCustomer((p) => ({ ...p, name }));
          if (phone && !newCustomer.phone) {
            setNewCustomer((p) => ({ ...p, phone }));
          }
          return;
        }
        if (field === "customerPhone") {
          const phone = parsePhoneInput(spoken);
          if (phone) setNewCustomer((p) => ({ ...p, phone }));
          return;
        }
        if (field === "customerAddress") {
          setNewCustomer((p) => ({ ...p, address: spoken }));
          return;
        }
        if (field === "paymentAmount") {
          const amt = parseAmount(spoken);
          if (amt) setPaymentForm((p) => ({ ...p, amount: amt }));
          const leftover = amt ? spoken.replace(amt, "").trim() : spoken;
          if (leftover && !paymentForm.description) {
            setPaymentForm((p) => ({ ...p, description: leftover }));
          }
          return;
        }
        setPaymentForm((p) => ({
          ...p,
          description: p.description ? `${p.description} ${spoken}` : spoken,
        }));
        const amt = parseAmount(spoken);
        if (amt && !paymentForm.amount) {
          setPaymentForm((p) => ({ ...p, amount: amt }));
        }
      },
      onError: (kind) => {
        if (kind === "aborted") return;
        if (kind === "not_supported") setVoiceReady(false);
        setVoiceError(mapVoiceErrorBangla(kind));
      },
      onEnd: () => {
        setListeningField(null);
        voiceSessionRef.current = null;
      },
    });
    if (!voiceSessionRef.current) return;
    setVoiceError(null);
    setListeningField(field);
  }

  function stopVoice() {
    voiceSessionRef.current?.stop();
    voiceSessionRef.current = null;
    recognitionRef.current?.stop?.();
    setListeningField(null);
  }

  const tabs = useMemo(
    () =>
      (
        isMobileViewport && !mobileAdvancedMode
          ? [
              { id: "summary", label: "সারাংশ", enabled: true },
              { id: "list", label: "স্টেটমেন্ট", enabled: true },
              { id: "aging", label: "বকেয়া রিপোর্ট", enabled: true },
            ]
          : [
              { id: "summary", label: "সারাংশ", enabled: true },
              { id: "add", label: "গ্রাহক যোগ", enabled: canCreateCustomer },
              { id: "payment", label: "পেমেন্ট নিন", enabled: canTakeDuePayment },
              { id: "list", label: "স্টেটমেন্ট", enabled: true },
              { id: "aging", label: "বকেয়া রিপোর্ট", enabled: true },
            ]
      ).filter((tab) => tab.enabled),
    [canCreateCustomer, canTakeDuePayment, isMobileViewport, mobileAdvancedMode]
  );

  const topDueName = summary.topDue?.[0]?.name || "";
  const topDueAmount = summary.topDue?.[0]?.totalDue ?? 0;

  return (
    <div className="space-y-5 pb-24">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_16px_36px_rgba(15,23,42,0.08)] animate-fade-in">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-soft/50 via-card to-card" />
        <div className="pointer-events-none absolute -bottom-16 right-0 h-32 w-32 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative space-y-3 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                বাকি সারসংক্ষেপ
              </p>
              <p className="text-3xl font-bold text-foreground tracking-tight sm:text-4xl">
                ৳ {formatBn(summary.totalDue)}
              </p>
              <p className="text-xs text-muted-foreground">
                দোকান:{" "}
                <span className="font-semibold text-foreground">{shopName}</span>{" "}
                • {customers.length.toLocaleString("bn-BD")} গ্রাহক
                {topDueName ? (
                  <span>
                    {" "}
                    • সর্বোচ্চ বাকি: {topDueName} ({formatBn(topDueAmount)} ৳)
                  </span>
                ) : (
                  <span> • কোনো বাকি নেই</span>
                )}
              </p>
            </div>
            <div className="flex w-full items-center gap-2 md:hidden">
              <RefreshIconButton
                onClick={handleManualRefresh}
                loading={manualRefreshing}
                label="রিফ্রেশ"
                className="h-11 w-11 shrink-0 justify-center rounded-full border-border/80 bg-card px-0"
              />
              {canTakeDuePayment ? (
                <QuickDuePaymentSheet
                  shopId={shopId}
                  customers={customers}
                  onSuccess={handleQuickPaymentSuccess}
                  onOpenFullForm={() => openPaymentTab()}
                  triggerLabel="পেমেন্ট"
                  triggerClassName="inline-flex h-11 min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-full border border-success/35 bg-success-soft/70 px-3 text-sm font-semibold leading-none text-success shadow-sm transition-colors hover:border-success/50"
                />
              ) : null}
              {canCreateCustomer ? (
                <QuickCustomerSheet
                  shopId={shopId}
                  onCreated={handleQuickCustomerCreated}
                  onOpenFullForm={openAddTab}
                  triggerLabel="নতুন গ্রাহক"
                  triggerClassName="inline-flex h-11 min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-full border border-primary/35 bg-primary-soft/75 px-3 text-sm font-semibold leading-none text-primary shadow-sm transition-colors hover:border-primary/50"
                />
              ) : null}
            </div>
            <div className="hidden items-center gap-2 md:flex">
              <RefreshIconButton
                onClick={handleManualRefresh}
                loading={manualRefreshing}
                label="রিফ্রেশ"
                className="h-10 px-3"
              />
              <button
                type="button"
                onClick={() => openPaymentTab()}
                disabled={!canTakeDuePayment}
                className="inline-flex h-10 items-center justify-center rounded-full border border-success/30 bg-success-soft px-4 text-sm font-semibold text-success shadow-sm transition-colors hover:border-success/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                পেমেন্ট নিন
              </button>
              <button
                type="button"
                onClick={openAddTab}
                disabled={!canCreateCustomer}
                className="inline-flex h-10 items-center justify-center rounded-full border border-primary/30 bg-primary-soft px-4 text-sm font-semibold text-primary shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                নতুন গ্রাহক
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-3 text-xs">
            <span
              className={`inline-flex h-7 items-center gap-1 rounded-full px-3 font-semibold border ${
                online
                  ? "bg-success-soft text-success border-success/30"
                  : "bg-danger-soft text-danger border-danger/30"
              }`}
            >
              {online ? "অনলাইন" : "অফলাইন"}
            </span>
            {syncing ? (
              <span className="inline-flex h-7 items-center gap-1 rounded-full bg-primary-soft text-primary border border-primary/30 px-3 font-semibold">
                সিঙ্ক হচ্ছে...
              </span>
            ) : null}
            {pendingCount > 0 ? (
              <span className="inline-flex h-7 items-center gap-1 rounded-full bg-warning-soft text-warning border border-warning/30 px-3 font-semibold">
                পেন্ডিং {pendingCount.toLocaleString("bn-BD")} টি
              </span>
            ) : null}
            {latestPaymentLabel ? (
              <span className="inline-flex h-7 items-center gap-1 rounded-full bg-card/80 text-muted-foreground border border-border px-3 font-semibold">
                শেষ পেমেন্ট: {latestPaymentLabel}
              </span>
            ) : null}
            {lastSyncLabel ? (
              <span className="inline-flex h-7 items-center gap-1 rounded-full bg-card/80 text-muted-foreground border border-border px-3 font-semibold">
                শেষ সিঙ্ক: {lastSyncLabel}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border/70">
        <div className="px-2 py-2">
          <div className="flex gap-2 overflow-x-auto no-scrollbar rounded-full bg-muted/70 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabSelect(tab.id as DueTabId)}
                className={`h-9 px-4 rounded-full text-sm font-semibold whitespace-nowrap border border-transparent transition-colors ${
                  activeTab === tab.id
                    ? "bg-card text-foreground border-border shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-sm">
        <div className="p-4 sm:p-6">
          {/* Summary Tab */}
          {activeTab === "summary" && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-foreground">
                  গ্রাহক তালিকা
                </h3>
                <p className="text-sm text-muted-foreground">
                  বাকি, ফোন ও শেষ পেমেন্ট এক নজরে দেখুন।
                </p>
              </div>
              {manualRefreshing ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-[120px] rounded-2xl" />
                  ))}
                </div>
              ) : customers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/70 bg-muted/40 p-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    এখনও কোনো গ্রাহক নেই।
                  </p>
                  <button
                    type="button"
                    onClick={openAddTab}
                    disabled={!canCreateCustomer}
                    className="mt-3 hidden h-10 items-center justify-center rounded-full bg-primary-soft text-primary border border-primary/30 px-4 text-sm font-semibold hover:bg-primary/15 hover:border-primary/40 transition-colors md:inline-flex"
                  >
                    ➕ প্রথম গ্রাহক যোগ করুন
                  </button>
                  {canCreateCustomer ? (
                    <QuickCustomerSheet
                      shopId={shopId}
                      onCreated={handleQuickCustomerCreated}
                      onOpenFullForm={openAddTab}
                      triggerLabel="➕ প্রথম গ্রাহক যোগ করুন"
                      triggerClassName="mt-3 inline-flex h-10 items-center justify-center rounded-full bg-primary-soft text-primary border border-primary/30 px-4 text-sm font-semibold hover:bg-primary/15 hover:border-primary/40 transition-colors md:hidden"
                    />
                  ) : null}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {customers.map((c) => {
                    const dueValue = Number(c.totalDue || 0);
                    const dueAmount = formatBn(dueValue);
                    const hasDue = dueValue > 0;
                    const initial = c.name?.trim()?.charAt(0) || "•";
                    return (
                      <div
                        key={c.id}
                        className="rounded-2xl border border-border bg-card p-4 shadow-sm card-lift"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex items-start gap-3 min-w-0">
                            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-primary text-sm font-bold">
                              {initial}
                            </span>
                            <div className="min-w-0">
                              <h4 className="text-base font-semibold text-foreground truncate">
                                {c.name}
                              </h4>
                              <p className="text-xs text-muted-foreground mt-1">
                                {c.phone ? `ফোন: ${c.phone}` : "ফোন নেই"}
                                {c.address ? ` • ঠিকানা: ${c.address}` : ""}
                              </p>
                            </div>
                          </div>
                          <div className="text-right space-y-1.5">
                            <span
                              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                                hasDue
                                  ? "bg-warning-soft text-warning border-warning/30"
                                  : "bg-success-soft text-success border-success/30"
                              }`}
                            >
                              {hasDue ? `বাকি ${dueAmount} ৳` : "পরিশোধিত"}
                            </span>
                            {(c as any).creditLimit != null && (
                              <p
                                className={`text-[11px] font-medium ${
                                  Number(c.totalDue || 0) >=
                                  Number((c as any).creditLimit) * 0.9
                                    ? "text-danger"
                                    : "text-muted-foreground"
                                }`}
                              >
                                সীমা: {Number((c as any).creditLimit).toLocaleString("bn-BD", { maximumFractionDigits: 0 })} ৳
                              </p>
                            )}
                            {c.lastPaymentAt && (
                              <p className="text-[11px] text-muted-foreground">
                                শেষ পেমেন্ট:{" "}
                                {new Date(c.lastPaymentAt).toLocaleDateString(
                                  "bn-BD"
                                )}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openStatementFor(c.id)}
                            className="h-9 rounded-full border border-border px-3 text-xs font-semibold text-foreground hover:border-primary/40 hover:text-primary transition-colors"
                          >
                            স্টেটমেন্ট দেখুন
                          </button>
                          {canTakeDuePayment ? (
                            <button
                              type="button"
                              onClick={() => openPaymentTab(c.id)}
                              className="hidden h-9 rounded-full border border-success/30 bg-success-soft px-3 text-xs font-semibold text-success hover:border-success/40 transition-colors md:inline-flex"
                            >
                              পেমেন্ট ফর্ম
                            </button>
                          ) : null}
                          {canTakeDuePayment ? (
                            <QuickDuePaymentSheet
                              shopId={shopId}
                              customers={customers}
                              defaultCustomerId={c.id}
                              onSuccess={handleQuickPaymentSuccess}
                              onOpenFullForm={(customerId) =>
                                openPaymentTab(customerId ?? c.id)
                              }
                              triggerLabel="পেমেন্ট নিন"
                              triggerClassName="h-9 rounded-full border border-success/30 bg-success-soft px-3 text-xs font-semibold text-success hover:border-success/40 transition-colors md:hidden"
                            />
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Add Customer Tab */}
          {activeTab === "add" && canCreateCustomer && (
            <form onSubmit={handleAddCustomer} className="space-y-5 max-w-xl">
              <h3 className="text-lg font-bold text-foreground">
                নতুন গ্রাহক যোগ করুন
              </h3>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-foreground">
                  গ্রাহকের নাম *
                </label>
                <div className="relative">
                  <input
                    className="h-12 w-full rounded-xl border border-border bg-card px-4 pr-16 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="যেমন: করিম সাহেব"
                    value={newCustomer.name}
                    onChange={(e) =>
                      setNewCustomer((p) => ({ ...p, name: e.target.value }))
                    }
                    required
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={
                      isListeningName
                        ? stopVoice
                        : () => startVoice("customerName")
                    }
                    disabled={
                      !voiceReady || (isVoiceListening && !isListeningName)
                    }
                    aria-label={
                      isListeningName
                        ? "ভয়েস বন্ধ করুন"
                        : "ভয়েস ইনপুট চালু করুন"
                    }
                    className={`absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition ${
                      isListeningName
                        ? "bg-primary-soft text-primary border-primary/40 animate-pulse"
                        : "bg-primary-soft text-primary border-primary/30 active:scale-95"
                    } ${
                      !voiceReady || (isVoiceListening && !isListeningName)
                        ? "opacity-60 cursor-not-allowed"
                        : ""
                    }`}
                  >
                    {isListeningName ? "🔴" : "🎤"}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {nameVoiceHint}{" "}
                  {voiceErrorText ? (
                    <span className="text-danger">{voiceErrorText}</span>
                  ) : null}
                </p>
                {customerSuggestions.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {customerSuggestions.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() =>
                          setNewCustomer((p) => ({ ...p, name: n }))
                        }
                        className="h-9 px-3 rounded-full border border-primary/30 text-primary bg-primary-soft text-xs font-semibold hover:border-primary/50"
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-foreground">
                  ফোন নম্বর (ঐচ্ছিক)
                </label>
                <div className="relative">
                  <input
                    className="h-12 w-full rounded-xl border border-border bg-card px-4 pr-16 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="যেমন: 01700000000"
                    value={newCustomer.phone}
                    onChange={(e) =>
                      setNewCustomer((p) => ({ ...p, phone: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    onClick={
                      isListeningPhone
                        ? stopVoice
                        : () => startVoice("customerPhone")
                    }
                    disabled={
                      !voiceReady || (isVoiceListening && !isListeningPhone)
                    }
                    aria-label={
                      isListeningPhone
                        ? "ভয়েস বন্ধ করুন"
                        : "ভয়েস ইনপুট চালু করুন"
                    }
                    className={`absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition ${
                      isListeningPhone
                        ? "bg-primary-soft text-primary border-primary/40 animate-pulse"
                        : "bg-primary-soft text-primary border-primary/30 active:scale-95"
                    } ${
                      !voiceReady || (isVoiceListening && !isListeningPhone)
                        ? "opacity-60 cursor-not-allowed"
                        : ""
                    }`}
                  >
                    {isListeningPhone ? "🔴" : "🎤"}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {phoneVoiceHint}{" "}
                  {voiceErrorText ? (
                    <span className="text-danger">{voiceErrorText}</span>
                  ) : null}
                </p>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-foreground">
                  ঠিকানা (ঐচ্ছিক)
                </label>
                <div className="relative">
                  <input
                    className="h-12 w-full rounded-xl border border-border bg-card px-4 pr-16 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="যেমন: বাজার রোড, ঢাকা"
                    value={newCustomer.address}
                    onChange={(e) =>
                      setNewCustomer((p) => ({ ...p, address: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    onClick={
                      isListeningAddress
                        ? stopVoice
                        : () => startVoice("customerAddress")
                    }
                    disabled={
                      !voiceReady || (isVoiceListening && !isListeningAddress)
                    }
                    aria-label={
                      isListeningAddress
                        ? "ভয়েস বন্ধ করুন"
                        : "ভয়েস ইনপুট চালু করুন"
                    }
                    className={`absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition ${
                      isListeningAddress
                        ? "bg-primary-soft text-primary border-primary/40 animate-pulse"
                        : "bg-primary-soft text-primary border-primary/30 active:scale-95"
                    } ${
                      !voiceReady || (isVoiceListening && !isListeningAddress)
                        ? "opacity-60 cursor-not-allowed"
                        : ""
                    }`}
                  >
                    {isListeningAddress ? "🔴" : "🎤"}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {addressVoiceHint}{" "}
                  {voiceErrorText ? (
                    <span className="text-danger">{voiceErrorText}</span>
                  ) : null}
                </p>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-foreground">
                  ক্রেডিট সীমা (ঐচ্ছিক)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="h-12 w-full rounded-xl border border-border bg-card px-4 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="যেমন: 50000 (ফাঁকা রাখলে কোনো সীমা নেই)"
                  value={newCustomer.creditLimit}
                  onChange={(e) =>
                    setNewCustomer((p) => ({ ...p, creditLimit: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  সর্বোচ্চ কত টাকা বাকি দেওয়া যাবে তা এখানে লিখুন।
                </p>
              </div>
              <button
                type="submit"
                className="w-full h-12 bg-primary-soft text-primary border border-primary/30 hover:bg-primary/15 hover:border-primary/40 font-bold px-6 rounded-xl text-lg transition-colors"
              >
                ✓ গ্রাহক যোগ করুন
              </button>
            </form>
          )}
          {activeTab === "add" && !canCreateCustomer && (
            <div className="rounded-2xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
              গ্রাহক যোগ করার জন্য <code>create_customer</code> permission লাগবে।
            </div>
          )}

          {/* Payment Tab */}
          {activeTab === "payment" && canTakeDuePayment && (
            <form onSubmit={handlePayment} className="space-y-5 max-w-xl">
              <h3 className="text-lg font-bold text-foreground">পেমেন্ট নিন</h3>
              {customers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/70 bg-muted/40 p-4 text-center text-sm text-muted-foreground">
                  কোনো গ্রাহক নেই। আগে গ্রাহক যোগ করুন।
                  <button
                    type="button"
                    onClick={openAddTab}
                    disabled={!canCreateCustomer}
                    className="mt-3 inline-flex h-9 items-center justify-center rounded-full bg-primary-soft text-primary border border-primary/30 px-4 text-xs font-semibold hover:bg-primary/15 hover:border-primary/40 transition-colors"
                  >
                    ➕ গ্রাহক যোগ করুন
                  </button>
                </div>
              ) : null}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-foreground">
                  গ্রাহক বাছাই করুন *
                </label>
                {mounted ? (
                  <Select
                    value={paymentForm.customerId}
                    onValueChange={(value) => {
                      setPaymentForm((p) => ({
                        ...p,
                        customerId: value,
                      }));
                      setSelectedCustomerId(value);
                    }}
                    disabled={customers.length === 0}
                  >
                    <SelectTrigger className="h-11 w-full rounded-xl border border-border bg-card px-4 text-left text-base text-foreground shadow-sm focus:ring-2 focus:ring-primary/30">
                      <SelectValue placeholder="গ্রাহক বাছাই করুন" />
                    </SelectTrigger>
                    <SelectContent
                      align="start"
                      className="min-w-[var(--radix-select-trigger-width)]"
                    >
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} — বাকি:{" "}
                          {formatBn(Number(c.totalDue || 0))} ৳
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <select
                    className="h-11 w-full rounded-xl border border-border bg-card px-4 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    value={paymentForm.customerId}
                    onChange={(e) => {
                      setPaymentForm((p) => ({
                        ...p,
                        customerId: e.target.value,
                      }));
                      setSelectedCustomerId(e.target.value);
                    }}
                    disabled={customers.length === 0}
                  >
                    <option value="">-- গ্রাহক বাছাই করুন --</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} — বাকি: {formatBn(Number(c.totalDue || 0))} ৳
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {selectedCustomer ? (
                <div className="rounded-xl border border-border bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">নির্বাচিত গ্রাহক</p>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-foreground truncate">
                      {selectedCustomer.name}
                    </p>
                    <span
                      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                        selectedCustomerHasDue
                          ? "bg-warning-soft text-warning border-warning/30"
                          : "bg-success-soft text-success border-success/30"
                      }`}
                    >
                      {selectedCustomerHasDue && selectedCustomerDueLabel
                        ? `বাকি ${selectedCustomerDueLabel} ৳`
                        : "পরিশোধিত"}
                    </span>
                  </div>
                  {selectedCustomer.lastPaymentAt && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      শেষ পেমেন্ট: {" "}
                      {new Date(selectedCustomer.lastPaymentAt).toLocaleDateString(
                        "bn-BD"
                      )}
                    </p>
                  )}
                </div>
              ) : null}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-foreground">
                  পেমেন্টের পরিমাণ (৳) *
                </label>
                <div className="relative">
                  <input
                    className="h-12 w-full rounded-xl border border-border bg-card px-4 pr-16 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="যেমন: 500, 1000"
                    type="number"
                    min="0"
                    step="0.01"
                    value={paymentForm.amount}
                    onChange={(e) =>
                      setPaymentForm((p) => ({ ...p, amount: e.target.value }))
                    }
                    required
                  />
                  <button
                    type="button"
                    onClick={
                      isListeningPaymentAmount
                        ? stopVoice
                        : () => startVoice("paymentAmount")
                    }
                    disabled={
                      !voiceReady ||
                      (isVoiceListening && !isListeningPaymentAmount)
                    }
                    aria-label={
                      isListeningPaymentAmount
                        ? "ভয়েস বন্ধ করুন"
                        : "ভয়েস ইনপুট চালু করুন"
                    }
                    className={`absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition ${
                      isListeningPaymentAmount
                        ? "bg-primary-soft text-primary border-primary/40 animate-pulse"
                        : "bg-primary-soft text-primary border-primary/30 active:scale-95"
                    } ${
                      !voiceReady ||
                      (isVoiceListening && !isListeningPaymentAmount)
                        ? "opacity-60 cursor-not-allowed"
                        : ""
                    }`}
                  >
                    {isListeningPaymentAmount ? "🔴" : "🎤"}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {paymentAmountVoiceHint}{" "}
                  {voiceErrorText ? (
                    <span className="text-danger">{voiceErrorText}</span>
                  ) : null}
                </p>
                {amountSuggestions.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {amountSuggestions.map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() =>
                          setPaymentForm((p) => ({ ...p, amount: a }))
                        }
                        className="h-9 px-3 rounded-full border border-primary/30 bg-primary-soft text-primary text-xs font-semibold hover:border-primary/50"
                      >
                        ৳ {a}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-foreground">
                  বিবরণ (ঐচ্ছিক)
                </label>
                <div className="relative">
                  <input
                    className="h-12 w-full rounded-xl border border-border bg-card px-4 pr-16 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="যেমন: নগদ পেমেন্ট"
                    value={paymentForm.description}
                    onChange={(e) =>
                      setPaymentForm((p) => ({
                        ...p,
                        description: e.target.value,
                      }))
                    }
                  />
                  <button
                    type="button"
                    onClick={
                      isListeningPaymentDescription
                        ? stopVoice
                        : () => startVoice("paymentDescription")
                    }
                    disabled={
                      !voiceReady ||
                      (isVoiceListening && !isListeningPaymentDescription)
                    }
                    aria-label={
                      isListeningPaymentDescription
                        ? "ভয়েস বন্ধ করুন"
                        : "ভয়েস ইনপুট চালু করুন"
                    }
                    className={`absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition ${
                      isListeningPaymentDescription
                        ? "bg-primary-soft text-primary border-primary/40 animate-pulse"
                        : "bg-primary-soft text-primary border-primary/30 active:scale-95"
                    } ${
                      !voiceReady ||
                      (isVoiceListening && !isListeningPaymentDescription)
                        ? "opacity-60 cursor-not-allowed"
                        : ""
                    }`}
                  >
                    {isListeningPaymentDescription ? "🔴" : "🎤"}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {paymentDescriptionVoiceHint}{" "}
                  {voiceErrorText ? (
                    <span className="text-danger">{voiceErrorText}</span>
                  ) : null}
                </p>
              </div>
              <button
                type="submit"
                disabled={
                  !paymentForm.customerId ||
                  !paymentForm.amount ||
                  savingPayment ||
                  !canTakeDuePayment
                }
                className="w-full h-12 bg-success hover:bg-success/90 disabled:bg-muted disabled:text-muted-foreground text-primary-foreground font-bold px-6 rounded-xl text-lg transition-colors"
              >
                {savingPayment ? "সংরক্ষণ করছে..." : "✓ পেমেন্ট রেকর্ড করুন"}
              </button>
            </form>
          )}
          {activeTab === "payment" && !canTakeDuePayment && (
            <div className="rounded-2xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
              পেমেন্ট নেওয়ার জন্য <code>take_due_payment</code> permission লাগবে।
            </div>
          )}

          {/* Customer List Tab */}
          {activeTab === "list" && (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-foreground">সব গ্রাহক</h3>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-foreground">
                  বিবরণ দেখতে গ্রাহক বাছাই করুন
                </label>
                {mounted ? (
                  <Select
                    value={selectedCustomerId}
                    onValueChange={(value) => {
                      setSelectedCustomerId(value);
                    }}
                    disabled={customers.length === 0}
                  >
                    <SelectTrigger className="h-11 w-full rounded-xl border border-border bg-card px-4 text-left text-base text-foreground shadow-sm focus:ring-2 focus:ring-primary/30">
                      <SelectValue placeholder="গ্রাহক বাছাই করুন" />
                    </SelectTrigger>
                    <SelectContent
                      align="start"
                      className="min-w-[var(--radix-select-trigger-width)]"
                    >
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <select
                    className="h-11 w-full rounded-xl border border-border bg-card px-4 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    value={selectedCustomerId}
                    onChange={(e) => {
                      setSelectedCustomerId(e.target.value);
                    }}
                    disabled={customers.length === 0}
                  >
                    <option value="">-- গ্রাহক বাছাই করুন --</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {selectedCustomerId && (
                <div className="mt-6 space-y-4">
                  <h4 className="font-bold text-foreground">লেনদেনের বিবরণ</h4>
                  {statementCustomer ? (
                    <div className="rounded-xl border border-border bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground">গ্রাহক</p>
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-foreground truncate">
                          {statementCustomer.name}
                        </p>
                        <span
                          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                            Number(statementCustomer.totalDue || 0) > 0
                              ? "bg-warning-soft text-warning border-warning/30"
                              : "bg-success-soft text-success border-success/30"
                          }`}
                        >
                          {Number(statementCustomer.totalDue || 0) > 0
                            ? `বাকি ${formatBn(Number(statementCustomer.totalDue || 0))} ৳`
                            : "পরিশোধিত"}
                        </span>
                      </div>
                    </div>
                  ) : null}
                  <div className="hidden md:block overflow-hidden rounded-xl border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/70">
                        <tr>
                          <th className="p-3 text-left">তারিখ</th>
                          <th className="p-3 text-left">বিবরণ</th>
                          <th className="p-3 text-left">বাকির মেয়াদ</th>
                          <th className="p-3 text-right">বিক্রয়</th>
                          <th className="p-3 text-right">পেমেন্ট</th>
                          <th className="p-3 text-right">ব্যালেন্স</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loadingStatement ? (
                          <tr>
                            <td className="p-3 text-center" colSpan={6}>
                              লোড হচ্ছে...
                            </td>
                          </tr>
                        ) : statementWithBalance.length === 0 ? (
                          <tr>
                            <td className="p-3 text-center" colSpan={6}>
                              কোনো লেনদেন নেই।
                            </td>
                          </tr>
                        ) : (
                          statementWithBalance.map((row) => {
                            const dueDateStr = (row as any).dueDate as string | null | undefined;
                            const isOverdue =
                              dueDateStr &&
                              row.entryType === "SALE" &&
                              new Date(dueDateStr) < new Date(new Date().toDateString());
                            const nearDue =
                              dueDateStr &&
                              row.entryType === "SALE" &&
                              !isOverdue &&
                              (new Date(dueDateStr).getTime() - Date.now()) <
                                3 * 86400000;
                            return (
                            <tr key={row.id} className="border-t border-border/70">
                              <td className="p-3">
                                {formatStatementDateTime(row.entryDate)}
                              </td>
                              <td className="p-3 text-left">
                                {row.description || "-"}
                              </td>
                              <td className="p-3 text-left">
                                {row.entryType === "SALE" && dueDateStr ? (
                                  <span
                                    className={`text-xs font-medium ${
                                      isOverdue
                                        ? "text-danger"
                                        : nearDue
                                        ? "text-warning"
                                        : "text-muted-foreground"
                                    }`}
                                  >
                                    {dueDateStr}
                                    {isOverdue && " ⚠️"}
                                  </span>
                                ) : (
                                  "-"
                                )}
                              </td>
                              <td className="p-3 text-right">
                                {row.entryType === "SALE"
                                  ? formatBn(Number(row.amount || 0))
                                  : ""}
                              </td>
                              <td className="p-3 text-right">
                                {row.entryType === "PAYMENT"
                                  ? formatBn(Number(row.amount || 0))
                                  : ""}
                              </td>
                              <td className="p-3 text-right font-semibold">
                                {formatBn(Number((row as any).running || 0))} ৳
                              </td>
                            </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-3 md:hidden">
                    {loadingStatement ? (
                      <p className="text-center text-muted-foreground bg-card border border-border rounded-xl p-4">
                        লোড হচ্ছে...
                      </p>
                    ) : statementWithBalance.length === 0 ? (
                      <p className="text-center text-muted-foreground bg-card border border-border rounded-xl p-4">
                        কোনো লেনদেন নেই
                      </p>
                    ) : (
                      statementWithBalance.map((row) => {
                        const sale = row.entryType === "SALE";
                        const amountValue = Number(row.amount || 0);
                        const amount = formatBn(amountValue);
                        const running = formatBn(Number((row as any).running || 0));
                        const title = row.description || (sale ? "বিক্রি" : "পেমেন্ট");
                        const sign = sale ? "+" : "-";
                        const dueDateStr = (row as any).dueDate as string | null | undefined;
                        const isOverdue =
                          sale &&
                          dueDateStr &&
                          new Date(dueDateStr) < new Date(new Date().toDateString());

                        return (
                          <div
                            key={row.id}
                            className="relative bg-card border border-border rounded-2xl p-4 shadow-sm card-lift overflow-hidden"
                          >
                            <div
                              className={`absolute left-0 top-3 bottom-3 w-1 rounded-full ${
                                sale ? "bg-warning" : "bg-success"
                              }`}
                            />
                            <div className="pl-3 flex items-center justify-between">
                              <div>
                                <p className="text-xs text-muted-foreground">
                                  {formatStatementDateTime(row.entryDate)}
                                  {sale && dueDateStr && (
                                    <span
                                      className={`ml-2 ${
                                        isOverdue ? "text-danger font-semibold" : "text-muted-foreground"
                                      }`}
                                    >
                                      মেয়াদ: {dueDateStr}
                                      {isOverdue && " ⚠️"}
                                    </span>
                                  )}
                                </p>
                                <p className="text-base font-semibold text-foreground mt-1">
                                  {title}
                                </p>
                              </div>
                              <span
                                className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                  sale
                                    ? "bg-warning-soft text-warning"
                                    : "bg-success-soft text-success"
                                }`}
                              >
                                {sale ? "বিক্রি" : "পেমেন্ট"}
                              </span>
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                              <div className="bg-muted/80 rounded-xl p-3">
                                <p className="text-xs text-muted-foreground">
                                  {sale ? "বিক্রির পরিমাণ" : "পেমেন্টের পরিমাণ"}
                                </p>
                                <p
                                  className={`text-base font-semibold ${
                                    sale ? "text-warning" : "text-success"
                                  }`}
                                >
                                  {sign}{amount} ৳
                                </p>
                              </div>
                              <div className="bg-muted/80 rounded-xl p-3">
                                <p className="text-xs text-muted-foreground">চলতি বাকি</p>
                                <p className="text-base font-semibold text-foreground">
                                  {running} ৳
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Aging Report Tab */}
          {activeTab === "aging" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-foreground">বকেয়া রিপোর্ট</h3>
                <button
                  type="button"
                  onClick={() => {
                    setAgingReport(null);
                    setLoadingAging(true);
                    fetch(`/api/due/aging?shopId=${shopId}`)
                      .then((r) => r.json())
                      .then(setAgingReport)
                      .catch(() => setAgingReport(null))
                      .finally(() => setLoadingAging(false));
                  }}
                  className="h-8 px-3 rounded-full border border-border text-xs font-semibold text-foreground hover:border-primary/40 hover:text-primary transition-colors"
                >
                  রিফ্রেশ
                </button>
              </div>

              {loadingAging ? (
                <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
                  লোড হচ্ছে...
                </div>
              ) : !agingReport ? (
                <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
                  ডেটা পাওয়া যায়নি
                </div>
              ) : (
                <>
                  {/* Summary Totals */}
                  <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="px-4 py-3 bg-muted/50 border-b border-border">
                      <p className="text-sm font-semibold text-foreground">
                        মোট বকেয়া সারসংক্ষেপ — {agingReport.asOf} পর্যন্ত
                      </p>
                    </div>
                    <div className="divide-y divide-border/60">
                      {[
                        { label: "চলতি (এখনো মেয়াদ আছে)", value: agingReport.totals.current, color: "text-success" },
                        { label: "১–৩০ দিন অতিক্রান্ত", value: agingReport.totals.b1_30, color: "text-warning" },
                        { label: "৩১–৬০ দিন অতিক্রান্ত", value: agingReport.totals.b31_60, color: "text-warning" },
                        { label: "৬১–৯০ দিন অতিক্রান্ত", value: agingReport.totals.b61_90, color: "text-danger" },
                        { label: "৯০+ দিন অতিক্রান্ত", value: agingReport.totals.b90plus, color: "text-danger" },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="flex items-center justify-between px-4 py-2.5">
                          <span className="text-sm text-foreground">{label}</span>
                          <span className={`text-sm font-semibold ${parseFloat(value) > 0 ? color : "text-muted-foreground"}`}>
                            {parseFloat(value) > 0 ? `${formatBn(parseFloat(value))} ৳` : "—"}
                          </span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30">
                        <span className="text-sm font-bold text-foreground">মোট বকেয়া</span>
                        <span className="text-sm font-bold text-foreground">
                          {formatBn(parseFloat(agingReport.totals.total))} ৳
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Per-Customer Breakdown */}
                  {agingReport.rows.length === 0 ? (
                    <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                      কোনো বকেয়া নেই
                    </div>
                  ) : (
                    <>
                      {/* Desktop table */}
                      <div className="hidden md:block overflow-x-auto rounded-xl border border-border">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/70">
                            <tr>
                              <th className="p-3 text-left">গ্রাহক</th>
                              <th className="p-3 text-right text-success">চলতি</th>
                              <th className="p-3 text-right text-warning">১–৩০</th>
                              <th className="p-3 text-right text-warning">৩১–৬০</th>
                              <th className="p-3 text-right text-danger">৬১–৯০</th>
                              <th className="p-3 text-right text-danger">৯০+</th>
                              <th className="p-3 text-right font-bold">মোট</th>
                            </tr>
                          </thead>
                          <tbody>
                            {agingReport.rows.map((row) => {
                              const hasCritical =
                                parseFloat(row.b61_90) > 0 ||
                                parseFloat(row.b90plus) > 0;
                              const hasWarning =
                                !hasCritical &&
                                (parseFloat(row.b1_30) > 0 ||
                                  parseFloat(row.b31_60) > 0);
                              return (
                                <tr
                                  key={row.customerId}
                                  className={`border-t border-border/70 ${
                                    hasCritical
                                      ? "bg-danger/5"
                                      : hasWarning
                                      ? "bg-warning/5"
                                      : ""
                                  }`}
                                >
                                  <td className="p-3">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        openStatementFor(row.customerId)
                                      }
                                      className="text-left font-semibold text-primary hover:underline"
                                    >
                                      {row.customerName}
                                    </button>
                                    {row.phone && (
                                      <p className="text-xs text-muted-foreground">
                                        {row.phone}
                                      </p>
                                    )}
                                  </td>
                                  <td className="p-3 text-right text-success">
                                    {parseFloat(row.current) > 0 ? formatBn(parseFloat(row.current)) : "—"}
                                  </td>
                                  <td className="p-3 text-right text-warning">
                                    {parseFloat(row.b1_30) > 0 ? formatBn(parseFloat(row.b1_30)) : "—"}
                                  </td>
                                  <td className="p-3 text-right text-warning">
                                    {parseFloat(row.b31_60) > 0 ? formatBn(parseFloat(row.b31_60)) : "—"}
                                  </td>
                                  <td className="p-3 text-right text-danger">
                                    {parseFloat(row.b61_90) > 0 ? formatBn(parseFloat(row.b61_90)) : "—"}
                                  </td>
                                  <td className="p-3 text-right text-danger font-semibold">
                                    {parseFloat(row.b90plus) > 0 ? formatBn(parseFloat(row.b90plus)) : "—"}
                                  </td>
                                  <td className="p-3 text-right font-bold">
                                    {formatBn(parseFloat(row.totalDue))} ৳
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile cards */}
                      <div className="space-y-3 md:hidden">
                        {agingReport.rows.map((row) => {
                          const hasCritical =
                            parseFloat(row.b61_90) > 0 ||
                            parseFloat(row.b90plus) > 0;
                          return (
                            <div
                              key={row.customerId}
                              className={`rounded-2xl border p-4 space-y-2 ${
                                hasCritical
                                  ? "border-danger/30 bg-danger/5"
                                  : "border-border bg-card"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <button
                                  type="button"
                                  onClick={() =>
                                    openStatementFor(row.customerId)
                                  }
                                  className="font-semibold text-primary hover:underline text-sm"
                                >
                                  {row.customerName}
                                </button>
                                <span className="text-sm font-bold">
                                  {formatBn(parseFloat(row.totalDue))} ৳
                                </span>
                              </div>
                              <div className="grid grid-cols-3 gap-1 text-xs">
                                {parseFloat(row.b1_30) > 0 && (
                                  <span className="text-warning">১–৩০: {parseFloat(row.b1_30).toLocaleString("bn-BD", { maximumFractionDigits: 0 })}</span>
                                )}
                                {parseFloat(row.b31_60) > 0 && (
                                  <span className="text-warning">৩১–৬০: {parseFloat(row.b31_60).toLocaleString("bn-BD", { maximumFractionDigits: 0 })}</span>
                                )}
                                {parseFloat(row.b61_90) > 0 && (
                                  <span className="text-danger font-semibold">৬১–৯০: {parseFloat(row.b61_90).toLocaleString("bn-BD", { maximumFractionDigits: 0 })}</span>
                                )}
                                {parseFloat(row.b90plus) > 0 && (
                                  <span className="text-danger font-bold">৯০+: {parseFloat(row.b90plus).toLocaleString("bn-BD", { maximumFractionDigits: 0 })}</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}



