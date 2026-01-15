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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { useSyncStatus } from "@/lib/sync/sync-status";
import { queueAdd } from "@/lib/sync/queue";
import { handlePermissionError } from "@/lib/permission-toast";
import {
  db,
  type LocalDueCustomer,
  type LocalDueLedger,
} from "@/lib/dexie/db";

type Customer = {
  id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  totalDue: string | number;
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

function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function normalizeEntryDate(value: string | number | Date | undefined) {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? parsed.toISOString()
    : new Date().toISOString();
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
};

export default function DuePageClient({
  shopId,
  shopName,
  initialCustomers,
}: Props) {
  const online = useOnlineStatus();
  const { pendingCount, syncing, lastSyncAt } = useSyncStatus();
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [voiceReady, setVoiceReady] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const customerTemplateKey = useMemo(
    () => `due:customerTemplates:${shopId}`,
    [shopId]
  );
  const paymentTemplateKey = useMemo(
    () => `due:paymentTemplates:${shopId}`,
    [shopId]
  );

  const [activeTab, setActiveTab] = useState<
    "summary" | "add" | "payment" | "list"
  >("summary");
  const [customers, setCustomers] = useState<Customer[]>(
    initialCustomers || []
  );
  const summary = useMemo(() => computeSummary(customers), [customers]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [statement, setStatement] = useState<StatementRow[]>([]);
  const [loadingStatement, setLoadingStatement] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: "",
    phone: "",
    address: "",
  });
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

  function parsePhone(text: string) {
    const digits = text.replace(/\D/g, "");
    return digits ? digits.slice(0, 15) : "";
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

  // Seed Dexie when online; always read from Dexie as source of truth.
  useEffect(() => {
    const run = async () => {
      if (online) {
        try {
          await seedCustomersToDexie(initialCustomers || []);
        } catch (err) {
          handlePermissionError(err);
          console.error("Seed Dexie due customers failed", err);
        }
      }
      await loadCustomersFromDexie();
    };
    run();
  }, [online, initialCustomers, loadCustomersFromDexie, seedCustomersToDexie]);

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
    const SpeechRecognitionImpl =
      typeof window !== "undefined"
        ? (window as any).SpeechRecognition ||
          (window as any).webkitSpeechRecognition
        : null;
    setVoiceReady(Boolean(SpeechRecognitionImpl));
    return () => recognitionRef.current?.stop?.();
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const storedCustomers = localStorage.getItem(customerTemplateKey);
    if (storedCustomers) {
      try {
        setCustomerTemplates(JSON.parse(storedCustomers) as CustomerTemplate[]);
      } catch {
        setCustomerTemplates([]);
      }
    }
    const storedPayments = localStorage.getItem(paymentTemplateKey);
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
    setStatement([]);
    loadCustomersFromDexie();
  }, [shopId, loadCustomersFromDexie]);

  useEffect(() => {
    if (!selectedCustomerId && customers.length > 0) {
      setSelectedCustomerId(customers[0].id);
      setPaymentForm((prev) => ({ ...prev, customerId: customers[0].id }));
      loadStatement(customers[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers]);

  async function refreshData() {
    const customersRes = await fetch(
      `/api/due/customers?shopId=${shopId}`
    ).then((r) => r.json());
    const list = Array.isArray(customersRes?.data) ? customersRes.data : [];
    try {
      await seedCustomersToDexie(list);
    } catch (err) {
      handlePermissionError(err);
      console.error("Refresh due customers failed", err);
    }
    await loadCustomersFromDexie();
  }

  async function loadStatement(customerId: string) {
    if (!customerId) return;
    setLoadingStatement(true);
    try {
      if (online) {
        const res = await fetch(
          `/api/due/statement?shopId=${shopId}&customerId=${customerId}`
        );
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

      const localRows = await db.dueLedger
        .where("[shopId+customerId]")
        .equals([shopId, customerId])
        .toArray();
      const localStatement = localRows
        .map(fromLocalDueLedger)
        .sort(
          (a, b) =>
            new Date(a.entryDate).getTime() -
            new Date(b.entryDate).getTime()
        );
      setStatement(localStatement);
    } catch (err) {
      handlePermissionError(err);
      console.error("Load due statement failed", err);
      setStatement([]);
    } finally {
      setLoadingStatement(false);
    }
  }

  useEffect(() => {
    if (!online) return;
    if (!lastSyncAt) return;
    if (syncing) return;
    if (pendingCount > 0) return;
    refreshData();
    if (selectedCustomerId) {
      loadStatement(selectedCustomerId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, lastSyncAt, syncing, pendingCount]);

  async function handleAddCustomer(e: FormEvent) {
    e.preventDefault();
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
      await db.dueCustomers.put(payload);
      await queueAdd("due_customer", "create", payload);
      const template: CustomerTemplate = {
        name: newCustomer.name.trim(),
        phone: newCustomer.phone.trim() || undefined,
        address: newCustomer.address.trim() || undefined,
        count: 1,
        lastUsed: Date.now(),
      };
      const merged = mergeCustomerTemplates(customerTemplates, template);
      setCustomerTemplates(merged);
      localStorage.setItem(customerTemplateKey, JSON.stringify(merged));
      setNewCustomer({ name: "", phone: "", address: "" });
      await loadCustomersFromDexie();
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
    localStorage.setItem(customerTemplateKey, JSON.stringify(merged));

    setNewCustomer({ name: "", phone: "", address: "" });
    await refreshData();
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
    localStorage.setItem(paymentTemplateKey, JSON.stringify(merged));
  }


  async function handlePayment(e: FormEvent) {
    e.preventDefault();
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

        await db.transaction("rw", db.dueCustomers, db.dueLedger, async () => {
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
        });

        await queueAdd("due_payment", "payment", {
          shopId,
          customerId: paymentForm.customerId,
          amount: amountValue,
          description: description || null,
          createdAt: nowIso,
          localId: entryId,
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

        await loadStatement(paymentForm.customerId);
        alert("অফলাইন: পেমেন্ট সেভ হয়েছে, অনলাইনে গেলে সিঙ্ক হবে।");
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
      await refreshData();
      await loadStatement(paymentForm.customerId);
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

  const lastSyncLabel =
    mounted && lastSyncAt
      ? new Date(lastSyncAt).toLocaleTimeString("bn-BD", {
          hour: "numeric",
          minute: "2-digit",
        })
      : null;

  const openStatementFor = (customerId: string) => {
    setActiveTab("list");
    setSelectedCustomerId(customerId);
    loadStatement(customerId);
  };

  const openPaymentFor = (customerId: string) => {
    setActiveTab("payment");
    setSelectedCustomerId(customerId);
    setPaymentForm((prev) => ({ ...prev, customerId }));
    loadStatement(customerId);
  };

  function startVoice(
    field:
      | "customerName"
      | "customerPhone"
      | "customerAddress"
      | "paymentAmount"
      | "paymentDescription"
  ) {
    if (listening) return;
    const SpeechRecognitionImpl =
      typeof window !== "undefined"
        ? (window as any).SpeechRecognition ||
          (window as any).webkitSpeechRecognition
        : null;

    if (!SpeechRecognitionImpl) {
      setVoiceReady(false);
      setVoiceError("ব্রাউজার মাইক্রোফোন সমর্থন দিচ্ছে না");
      return;
    }

    const recognition: SpeechRecognitionInstance = new SpeechRecognitionImpl();
    recognition.lang = "bn-BD";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onerror = () => {
      setListening(false);
      setVoiceError("মাইক্রোফোন অ্যাক্সেস পাওয়া যায়নি");
    };
    recognition.onend = () => setListening(false);
    recognition.onresult = (event: any) => {
      const spoken: string | undefined = event?.results?.[0]?.[0]?.transcript;
      if (spoken) {
        if (field === "customerName") {
          const phone = parsePhone(spoken);
          const name = phone ? spoken.replace(phone, "").trim() : spoken;
          setNewCustomer((p) => ({ ...p, name }));
          if (phone && !newCustomer.phone)
            setNewCustomer((p) => ({ ...p, phone }));
        } else if (field === "customerPhone") {
          const phone = parsePhone(spoken);
          if (phone) setNewCustomer((p) => ({ ...p, phone }));
        } else if (field === "customerAddress") {
          setNewCustomer((p) => ({ ...p, address: spoken }));
        } else if (field === "paymentAmount") {
          const amt = parseAmount(spoken);
          if (amt) setPaymentForm((p) => ({ ...p, amount: amt }));
          const leftover = amt ? spoken.replace(amt, "").trim() : spoken;
          if (leftover && !paymentForm.description) {
            setPaymentForm((p) => ({ ...p, description: leftover }));
          }
        } else if (field === "paymentDescription") {
          setPaymentForm((p) => ({
            ...p,
            description: p.description ? `${p.description} ${spoken}` : spoken,
          }));
          const amt = parseAmount(spoken);
          if (amt && !paymentForm.amount)
            setPaymentForm((p) => ({ ...p, amount: amt }));
        }
      }
      setListening(false);
    };

    recognitionRef.current = recognition;
    setVoiceError(null);
    setListening(true);
    recognition.start();
  }

  function stopVoice() {
    recognitionRef.current?.stop?.();
    setListening(false);
  }

  const tabs = [
    { id: "summary", label: "সারাংশ" },
    { id: "add", label: "গ্রাহক যোগ" },
    { id: "payment", label: "পেমেন্ট নিন" },
    { id: "list", label: "স্টেটমেন্ট" },
  ] as const;

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
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                বাকি সারসংক্ষেপ
              </p>
              <p className="text-3xl font-bold text-foreground tracking-tight sm:text-4xl">
                {summary.totalDue.toFixed(2)} ৳
              </p>
              <p className="text-xs text-muted-foreground">
                দোকান:{" "}
                <span className="font-semibold text-foreground">{shopName}</span>{" "}
                • {customers.length} গ্রাহক
                {topDueName ? (
                  <span>
                    {" "}
                    • সর্বোচ্চ বাকি: {topDueName} ({topDueAmount.toFixed(2)} ৳)
                  </span>
                ) : (
                  <span> • কোনো বাকি নেই</span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab("add")}
              className="inline-flex h-10 items-center justify-center rounded-full bg-primary-soft text-primary border border-primary/30 px-4 text-sm font-semibold shadow-sm hover:bg-primary/15 hover:border-primary/40 transition-colors"
            >
              ➕ নতুন গ্রাহক
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-3 text-xs">
            <span
              className={`inline-flex h-7 items-center gap-1 rounded-full px-3 font-semibold border ${
                online
                  ? "bg-success-soft text-success border-success/30"
                  : "bg-muted text-muted-foreground border-border"
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
                পেন্ডিং {pendingCount} টি
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

      <div className="sticky top-0 z-20 bg-card/95 backdrop-blur border-b border-border/70">
        <div className="flex gap-2 overflow-x-auto no-scrollbar px-2 py-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`h-9 px-4 rounded-full text-sm font-semibold whitespace-nowrap border transition-colors ${
                activeTab === tab.id
                  ? "bg-primary-soft text-primary border-primary/30 shadow-sm"
                  : "bg-muted text-foreground border-transparent hover:border-border"
              }`}
            >
              {tab.label}
            </button>
          ))}
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
              {customers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/70 bg-muted/40 p-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    এখনও কোনো গ্রাহক নেই।
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab("add")}
                    className="mt-3 inline-flex h-10 items-center justify-center rounded-full bg-primary-soft text-primary border border-primary/30 px-4 text-sm font-semibold hover:bg-primary/15 hover:border-primary/40 transition-colors"
                  >
                    ➕ প্রথম গ্রাহক যোগ করুন
                  </button>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {customers.map((c) => {
                    const dueAmount = Number(c.totalDue || 0).toFixed(2);
                    return (
                      <div
                        key={c.id}
                        className="rounded-2xl border border-border bg-card p-4 shadow-sm card-lift"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <h4 className="text-base font-semibold text-foreground truncate">
                              {c.name}
                            </h4>
                            <p className="text-xs text-muted-foreground mt-1">
                              {c.phone ? `ফোন: ${c.phone}` : "ফোন নেই"}
                              {c.address ? ` • ঠিকানা: ${c.address}` : ""}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="inline-flex items-center rounded-full bg-warning-soft text-warning border border-warning/30 px-3 py-1 text-xs font-semibold">
                              বাকি {dueAmount} ৳
                            </span>
                            {c.lastPaymentAt && (
                              <p className="text-[11px] text-muted-foreground mt-2">
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
                          <button
                            type="button"
                            onClick={() => openPaymentFor(c.id)}
                            className="h-9 rounded-full border border-success/30 bg-success-soft px-3 text-xs font-semibold text-success hover:border-success/40 transition-colors"
                          >
                            পেমেন্ট নিন
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Add Customer Tab */}
          {activeTab === "add" && (
            <form onSubmit={handleAddCustomer} className="space-y-5 max-w-xl">
              <h3 className="text-lg font-bold text-foreground">
                নতুন গ্রাহক যোগ করুন
              </h3>
              {voiceError && (
                <div className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
                  {voiceError}
                </div>
              )}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-foreground">
                  গ্রাহকের নাম *
                </label>
                <div className="flex gap-3">
                  <input
                    className="h-11 w-full rounded-xl border border-border bg-card px-4 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
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
                      listening ? stopVoice : () => startVoice("customerName")
                    }
                    disabled={!voiceReady}
                    className={`shrink-0 h-11 px-4 border rounded-xl text-sm font-semibold transition-colors ${
                      listening
                        ? "bg-primary-soft text-primary border-primary/40"
                        : "bg-primary-soft border-primary/30 text-primary hover:border-primary/50"
                    } ${!voiceReady ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    {listening ? "থামান" : "ভয়েস"}
                  </button>
                </div>
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
                <div className="flex gap-3">
                  <input
                    className="h-11 w-full rounded-xl border border-border bg-card px-4 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="যেমন: 01700000000"
                    value={newCustomer.phone}
                    onChange={(e) =>
                      setNewCustomer((p) => ({ ...p, phone: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    onClick={
                      listening ? stopVoice : () => startVoice("customerPhone")
                    }
                    disabled={!voiceReady}
                    className={`shrink-0 h-11 px-4 border rounded-xl text-sm font-semibold transition-colors ${
                      listening
                        ? "bg-primary-soft text-primary border-primary/40"
                        : "bg-primary-soft border-primary/30 text-primary hover:border-primary/50"
                    } ${!voiceReady ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    {listening ? "থামান" : "ভয়েস"}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-foreground">
                  ঠিকানা (ঐচ্ছিক)
                </label>
                <div className="flex gap-3">
                  <input
                    className="h-11 w-full rounded-xl border border-border bg-card px-4 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="যেমন: বাজার রোড, ঢাকা"
                    value={newCustomer.address}
                    onChange={(e) =>
                      setNewCustomer((p) => ({ ...p, address: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    onClick={
                      listening
                        ? stopVoice
                        : () => startVoice("customerAddress")
                    }
                    disabled={!voiceReady}
                    className={`shrink-0 h-11 px-4 border rounded-xl text-sm font-semibold transition-colors ${
                      listening
                        ? "bg-primary-soft text-primary border-primary/40"
                        : "bg-primary-soft border-primary/30 text-primary hover:border-primary/50"
                    } ${!voiceReady ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    {listening ? "থামান" : "ভয়েস"}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                className="w-full h-12 bg-primary-soft text-primary border border-primary/30 hover:bg-primary/15 hover:border-primary/40 font-bold px-6 rounded-xl text-lg transition-colors"
              >
                ✓ গ্রাহক যোগ করুন
              </button>
            </form>
          )}

          {/* Payment Tab */}
          {activeTab === "payment" && (
            <form onSubmit={handlePayment} className="space-y-5 max-w-xl">
              <h3 className="text-lg font-bold text-foreground">পেমেন্ট নিন</h3>
              {voiceError && (
                <div className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
                  {voiceError}
                </div>
              )}
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
                      loadStatement(value);
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
                          {Number(c.totalDue || 0).toFixed(2)} ৳
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
                      loadStatement(e.target.value);
                    }}
                    disabled={customers.length === 0}
                  >
                    <option value="">-- গ্রাহক বাছাই করুন --</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} — বাকি: {Number(c.totalDue || 0).toFixed(2)} ৳
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-foreground">
                  পেমেন্টের পরিমাণ (৳) *
                </label>
                <div className="flex gap-3">
                  <input
                    className="h-11 w-full rounded-xl border border-border bg-card px-4 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
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
                      listening ? stopVoice : () => startVoice("paymentAmount")
                    }
                    disabled={!voiceReady}
                    className={`shrink-0 h-11 px-4 border rounded-xl text-sm font-semibold transition-colors ${
                      listening
                        ? "bg-primary-soft text-primary border-primary/40"
                        : "bg-primary-soft border-primary/30 text-primary hover:border-primary/50"
                    } ${!voiceReady ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    {listening ? "থামান" : "ভয়েস"}
                  </button>
                </div>
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
                <div className="flex gap-3">
                  <input
                    className="h-11 w-full rounded-xl border border-border bg-card px-4 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
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
                      listening
                        ? stopVoice
                        : () => startVoice("paymentDescription")
                    }
                    disabled={!voiceReady}
                    className={`shrink-0 h-11 px-4 border rounded-xl text-sm font-semibold transition-colors ${
                      listening
                        ? "bg-primary-soft text-primary border-primary/40"
                        : "bg-primary-soft border-primary/30 text-primary hover:border-primary/50"
                    } ${!voiceReady ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    {listening ? "থামান" : "ভয়েস"}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={
                  !paymentForm.customerId ||
                  !paymentForm.amount ||
                  savingPayment
                }
                className="w-full h-12 bg-success hover:bg-success/90 disabled:bg-muted disabled:text-muted-foreground text-primary-foreground font-bold px-6 rounded-xl text-lg transition-colors"
              >
                {savingPayment ? "সংরক্ষণ করছে..." : "✓ পেমেন্ট রেকর্ড করুন"}
              </button>
            </form>
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
                      loadStatement(value);
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
                      loadStatement(e.target.value);
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
                  <div className="hidden md:block overflow-hidden rounded-xl border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/70">
                        <tr>
                          <th className="p-3 text-left">তারিখ</th>
                          <th className="p-3 text-left">বিবরণ</th>
                          <th className="p-3 text-right">বিক্রয়</th>
                          <th className="p-3 text-right">পেমেন্ট</th>
                          <th className="p-3 text-right">ব্যালেন্স</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loadingStatement ? (
                          <tr>
                            <td className="p-3 text-center" colSpan={5}>
                              লোড হচ্ছে...
                            </td>
                          </tr>
                        ) : statementWithBalance.length === 0 ? (
                          <tr>
                            <td className="p-3 text-center" colSpan={5}>
                              কোনো লেনদেন নেই।
                            </td>
                          </tr>
                        ) : (
                          statementWithBalance.map((row) => (
                            <tr key={row.id} className="border-t border-border/70">
                              <td className="p-3">
                                {new Date(row.entryDate).toLocaleDateString(
                                  "bn-BD"
                                )}
                              </td>
                              <td className="p-3 text-left">
                                {row.description || "-"}
                              </td>
                              <td className="p-3 text-right">
                                {row.entryType === "SALE"
                                  ? Number(row.amount || 0).toFixed(2)
                                  : ""}
                              </td>
                              <td className="p-3 text-right">
                                {row.entryType === "PAYMENT"
                                  ? Number(row.amount || 0).toFixed(2)
                                  : ""}
                              </td>
                              <td className="p-3 text-right font-semibold">
                                {Number((row as any).running || 0).toFixed(2)} ৳
                              </td>
                            </tr>
                          ))
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
                        const amount = Number(row.amount || 0).toFixed(2);
                        const running = Number((row as any).running || 0).toFixed(2);

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
                                  {new Date(row.entryDate).toLocaleDateString("bn-BD")}
                                </p>
                                <p className="text-base font-semibold text-foreground mt-1">
                                  {row.description || "-"}
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
                              <div className="bg-muted rounded-lg p-3">
                                <p className="text-xs text-muted-foreground">
                                  {sale ? "বিক্রির পরিমাণ" : "পেমেন্টের পরিমাণ"}
                                </p>
                                <p className="text-base font-semibold text-foreground">
                                  {amount} ৳
                                </p>
                              </div>
                              <div className="bg-muted rounded-lg p-3">
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
        </div>
      </div>
    </div>
  );
}


