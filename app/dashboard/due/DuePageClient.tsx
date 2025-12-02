"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

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
  topDue: { id: string; name: string; totalDue: number; phone?: string | null }[];
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

type Props = {
  shopId: string;
  shopName: string;
  initialCustomers: Customer[];
  initialSummary: Summary;
};

export default function DuePageClient({
  shopId,
  shopName,
  initialCustomers,
  initialSummary,
}: Props) {
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [voiceReady, setVoiceReady] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const customerTemplateKey = useMemo(() => `due:customerTemplates:${shopId}`, [shopId]);
  const paymentTemplateKey = useMemo(() => `due:paymentTemplates:${shopId}`, [shopId]);

  const [activeTab, setActiveTab] = useState<"summary" | "add" | "payment" | "list">("summary");
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers || []);
  const [summary, setSummary] = useState<Summary>(
    initialSummary || { totalDue: 0, topDue: [] }
  );
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
  const [customerTemplates, setCustomerTemplates] = useState<CustomerTemplate[]>([]);
  const [paymentTemplates, setPaymentTemplates] = useState<PaymentTemplate[]>([]);

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

  function mergeCustomerTemplates(existing: CustomerTemplate[], incoming: CustomerTemplate) {
    const idx = existing.findIndex((t) => t.name.toLowerCase() === incoming.name.toLowerCase());
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
    return next.sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed).slice(0, 50);
  }

  function mergePaymentTemplates(existing: PaymentTemplate[], incoming: PaymentTemplate) {
    const keyMatch = (t: PaymentTemplate) =>
      (t.customerId || "") === (incoming.customerId || "") && (t.description || "") === (incoming.description || "");
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
    return next.sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed).slice(0, 50);
  }

  useEffect(() => {
    const SpeechRecognitionImpl =
      typeof window !== "undefined"
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;
    setVoiceReady(Boolean(SpeechRecognitionImpl));
    return () => recognitionRef.current?.stop?.();
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

  // Reset all client state when shop changes to avoid leaking data across shops
  useEffect(() => {
    setCustomers(initialCustomers || []);
    setSummary(initialSummary || { totalDue: 0, topDue: [] });
    const firstId = initialCustomers?.[0]?.id || "";
    setSelectedCustomerId(firstId);
    setPaymentForm({
      customerId: firstId,
      amount: "",
      description: "",
    });
    setStatement([]);
    if (firstId) {
      loadStatement(firstId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId, initialCustomers, initialSummary]);

  useEffect(() => {
    if (!selectedCustomerId && customers.length > 0) {
      setSelectedCustomerId(customers[0].id);
      setPaymentForm((prev) => ({ ...prev, customerId: customers[0].id }));
      loadStatement(customers[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers]);

  async function refreshData() {
    const [customersRes, summaryRes] = await Promise.all([
      fetch(`/api/due/customers?shopId=${shopId}`).then((r) => r.json()),
      fetch(`/api/due/summary?shopId=${shopId}`).then((r) => r.json()),
    ]);

    setCustomers(customersRes.data || []);
    setSummary(summaryRes || { totalDue: 0, topDue: [] });
  }

  async function loadStatement(customerId: string) {
    if (!customerId) return;
    setLoadingStatement(true);
    try {
      const res = await fetch(
        `/api/due/statement?shopId=${shopId}&customerId=${customerId}`
      );
      const json = await res.json();
      setStatement(json.data || []);
    } finally {
      setLoadingStatement(false);
    }
  }

  async function handleAddCustomer(e: FormEvent) {
    e.preventDefault();
    if (!newCustomer.name.trim()) return;

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

  async function handlePayment(e: FormEvent) {
    e.preventDefault();
    if (!paymentForm.customerId || !paymentForm.amount) return;

    setSavingPayment(true);
    try {
      await fetch("/api/due/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId,
          customerId: paymentForm.customerId,
          amount: Number(paymentForm.amount),
          description: paymentForm.description || undefined,
        }),
      });

      const template: PaymentTemplate = {
        customerId: paymentForm.customerId,
        amount: paymentForm.amount || "0",
        description: paymentForm.description || "",
        count: 1,
        lastUsed: Date.now(),
      };
      const merged = mergePaymentTemplates(paymentTemplates, template);
      setPaymentTemplates(merged);
      localStorage.setItem(paymentTemplateKey, JSON.stringify(merged));

      setPaymentForm({ customerId: paymentForm.customerId, amount: "", description: "" });
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

  function startVoice(field: "customerName" | "customerPhone" | "customerAddress" | "paymentAmount" | "paymentDescription") {
    if (listening) return;
    const SpeechRecognitionImpl =
      typeof window !== "undefined"
        ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
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
          if (phone && !newCustomer.phone) setNewCustomer((p) => ({ ...p, phone }));
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
          setPaymentForm((p) => ({ ...p, description: p.description ? `${p.description} ${spoken}` : spoken }));
          const amt = parseAmount(spoken);
          if (amt && !paymentForm.amount) setPaymentForm((p) => ({ ...p, amount: amt }));
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

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <p className="text-sm text-gray-600 mb-2">মোট বাকি</p>
          <p className="text-4xl font-bold text-gray-900">{summary.totalDue.toFixed(2)} ৳</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <p className="text-sm text-gray-600 mb-2">গ্রাহক সংখ্যা</p>
          <p className="text-4xl font-bold text-gray-900">{customers.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <p className="text-sm text-gray-600 mb-2">সর্বোচ্চ বাকি</p>
          {summary.topDue?.length === 0 ? (
            <p className="text-sm text-gray-500">কোনো বাকি নেই</p>
          ) : (
            <div className="space-y-2">
              {summary.topDue?.slice(0, 2).map((c) => (
                <p key={c.id} className="text-sm font-medium text-gray-900">
                  {c.name}: {c.totalDue.toFixed(2)} ৳
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="flex border-b border-gray-200">
          {[
            { id: "summary", label: "সারসংক্ষেপ" },
            { id: "add", label: "নতুন গ্রাহক" },
            { id: "payment", label: "পেমেন্ট নিন" },
            { id: "list", label: "গ্রাহক তালিকা" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 py-4 px-4 font-medium text-center transition-colors ${
                activeTab === tab.id
                  ? "text-green-600 border-b-2 border-green-600 bg-green-50"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {/* Summary Tab */}
          {activeTab === "summary" && (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-gray-900">গ্রাহক তালিকা ও বিবরণ</h3>
              <div className="space-y-3">
                {customers.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">এখনও কোনো গ্রাহক নেই।</p>
                ) : (
                  customers.map((c) => (
                    <div key={c.id} className="bg-gray-50 rounded-lg p-4 flex justify-between items-start">
                      <div>
                        <h4 className="font-semibold text-gray-900">{c.name}</h4>
                        <p className="text-sm text-gray-600 mt-1">
                          {c.phone || "ফোন নেই"} {c.address ? `• ${c.address}` : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900">
                          {Number(c.totalDue || 0).toFixed(2)} ৳
                        </p>
                        {c.lastPaymentAt && (
                          <p className="text-xs text-gray-500 mt-1">
                            শেষ পেমেন্ট: {new Date(c.lastPaymentAt).toLocaleDateString("bn-BD")}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Add Customer Tab */}
          {activeTab === "add" && (
            <form onSubmit={handleAddCustomer} className="space-y-4 max-w-lg">
              <h3 className="text-lg font-bold text-gray-900">নতুন গ্রাহক যোগ করুন</h3>
              <div className="space-y-2">
                <label className="block text-base font-medium text-gray-900">গ্রাহকের নাম *</label>
                <div className="flex gap-3">
                  <input
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="যেমন: করিম সাহেব"
                    value={newCustomer.name}
                    onChange={(e) => setNewCustomer((p) => ({ ...p, name: e.target.value }))}
                    required
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={listening ? stopVoice : () => startVoice("customerName")}
                    disabled={!voiceReady}
                    className={`shrink-0 px-4 py-3 border rounded-lg font-medium transition-colors ${
                      listening
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                        : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:border-emerald-300"
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
                        onClick={() => setNewCustomer((p) => ({ ...p, name: n }))}
                        className="px-3 py-2 rounded-full border border-emerald-200 text-emerald-800 bg-emerald-50 text-sm hover:border-emerald-300"
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <label className="block text-base font-medium text-gray-900">ফোন নম্বর (ঐচ্ছিক)</label>
                <div className="flex gap-3">
                  <input
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="যেমন: 01700000000"
                    value={newCustomer.phone}
                    onChange={(e) => setNewCustomer((p) => ({ ...p, phone: e.target.value }))}
                  />
                  <button
                    type="button"
                    onClick={listening ? stopVoice : () => startVoice("customerPhone")}
                    disabled={!voiceReady}
                    className={`shrink-0 px-4 py-3 border rounded-lg font-medium transition-colors ${
                      listening
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                        : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:border-emerald-300"
                    } ${!voiceReady ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    {listening ? "থামান" : "ভয়েস"}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-base font-medium text-gray-900">ঠিকানা (ঐচ্ছিক)</label>
                <div className="flex gap-3">
                  <input
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="যেমন: বাজার রোড, ঢাকা"
                    value={newCustomer.address}
                    onChange={(e) => setNewCustomer((p) => ({ ...p, address: e.target.value }))}
                  />
                  <button
                    type="button"
                    onClick={listening ? stopVoice : () => startVoice("customerAddress")}
                    disabled={!voiceReady}
                    className={`shrink-0 px-4 py-3 border rounded-lg font-medium transition-colors ${
                      listening
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                        : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:border-emerald-300"
                    } ${!voiceReady ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    {listening ? "থামান" : "ভয়েস"}
                  </button>
                </div>
              </div>
              <button 
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-lg text-lg transition-colors"
              >
                ✓ গ্রাহক যোগ করুন
              </button>
            </form>
          )}

          {/* Payment Tab */}
          {activeTab === "payment" && (
            <form onSubmit={handlePayment} className="space-y-4 max-w-lg">
              <h3 className="text-lg font-bold text-gray-900">পেমেন্ট নিন</h3>
              <div className="space-y-2">
                <label className="block text-base font-medium text-gray-900">গ্রাহক বাছাই করুন *</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                  value={paymentForm.customerId}
                  onChange={(e) => {
                    setPaymentForm((p) => ({ ...p, customerId: e.target.value }));
                    setSelectedCustomerId(e.target.value);
                    loadStatement(e.target.value);
                  }}
                  required
                >
                  <option value="">-- গ্রাহক বাছাই করুন --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — বাকি: {Number(c.totalDue || 0).toFixed(2)} ৳
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-base font-medium text-gray-900">পেমেন্টের পরিমাণ (৳) *</label>
                <div className="flex gap-3">
                  <input
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="যেমন: 500, 1000"
                    type="number"
                    min="0"
                    step="0.01"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm((p) => ({ ...p, amount: e.target.value }))}
                    required
                  />
                  <button
                    type="button"
                    onClick={listening ? stopVoice : () => startVoice("paymentAmount")}
                    disabled={!voiceReady}
                    className={`shrink-0 px-4 py-3 border rounded-lg font-medium transition-colors ${
                      listening
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                        : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:border-emerald-300"
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
                        onClick={() => setPaymentForm((p) => ({ ...p, amount: a }))}
                        className="px-3 py-2 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800 text-sm hover:border-emerald-300"
                      >
                        ৳ {a}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <label className="block text-base font-medium text-gray-900">বিবরণ (ঐচ্ছিক)</label>
                <div className="flex gap-3">
                  <input
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="যেমন: নগদ পেমেন্ট"
                    value={paymentForm.description}
                    onChange={(e) => setPaymentForm((p) => ({ ...p, description: e.target.value }))}
                  />
                  <button
                    type="button"
                    onClick={listening ? stopVoice : () => startVoice("paymentDescription")}
                    disabled={!voiceReady}
                    className={`shrink-0 px-4 py-3 border rounded-lg font-medium transition-colors ${
                      listening
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                        : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:border-emerald-300"
                    } ${!voiceReady ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    {listening ? "থামান" : "ভয়েস"}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={!paymentForm.customerId || !paymentForm.amount || savingPayment}
                className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-400 text-white font-bold py-4 px-6 rounded-lg text-lg transition-colors"
              >
                {savingPayment ? "সংরক্ষণ করছে..." : "✓ পেমেন্ট রেকর্ড করুন"}
              </button>
            </form>
          )}

          {/* Customer List Tab */}
          {activeTab === "list" && (
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-gray-900">সব গ্রাহক</h3>
              <div className="space-y-2">
                <label className="block text-base font-medium text-gray-900">বিবরণ দেখতে গ্রাহক বাছাই করুন</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                  value={selectedCustomerId}
                  onChange={(e) => {
                    setSelectedCustomerId(e.target.value);
                    loadStatement(e.target.value);
                  }}
                >
                  <option value="">-- গ্রাহক বাছাই করুন --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedCustomerId && (
                <div className="mt-6 space-y-4">
                  <h4 className="font-bold text-gray-900">লেনদেনের বিবরণ</h4>
                  <div className="overflow-x-auto hidden md:block">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100">
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
                            <tr key={row.id} className="border-t">
                              <td className="p-3">
                                {new Date(row.entryDate).toLocaleDateString("bn-BD")}
                              </td>
                              <td className="p-3 text-left">{row.description || "-"}</td>
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
                      <p className="text-center text-gray-500 bg-white border border-gray-200 rounded-lg p-4">
                        লোড হচ্ছে...
                      </p>
                    ) : statementWithBalance.length === 0 ? (
                      <p className="text-center text-gray-500 bg-white border border-gray-200 rounded-lg p-4">
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
                            className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-xs text-gray-500">
                                  {new Date(row.entryDate).toLocaleDateString("bn-BD")}
                                </p>
                                <p className="text-base font-semibold text-gray-900 mt-1">
                                  {row.description || "-"}
                                </p>
                              </div>
                              <span
                                className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                  sale
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-blue-100 text-blue-700"
                                }`}
                              >
                                {sale ? "বিক্রি" : "পরিশোধ"}
                              </span>
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-gray-600">
                              <div className="bg-gray-50 rounded-lg p-3">
                                <p className="text-xs text-gray-500">
                                  {sale ? "বিক্রির পরিমাণ" : "পরিশোধিত পরিমাণ"}
                                </p>
                                <p className="text-base font-semibold text-gray-900">
                                  {amount} ৳
                                </p>
                              </div>
                              <div className="bg-gray-50 rounded-lg p-3">
                                <p className="text-xs text-gray-500">চলতি বকেয়া</p>
                                <p className="text-base font-semibold text-gray-900">
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
