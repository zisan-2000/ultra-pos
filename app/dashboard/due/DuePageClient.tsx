"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

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
                <input
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="যেমন: করিম সাহেব"
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer((p) => ({ ...p, name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="block text-base font-medium text-gray-900">ফোন নম্বর (ঐচ্ছিক)</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="যেমন: 01700000000"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer((p) => ({ ...p, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-base font-medium text-gray-900">ঠিকানা (ঐচ্ছিক)</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="যেমন: বাজার রোড, ঢাকা"
                  value={newCustomer.address}
                  onChange={(e) => setNewCustomer((p) => ({ ...p, address: e.target.value }))}
                />
              </div>
              <button 
                type="submit"
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-lg text-lg transition-colors"
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
              </div>
              <div className="space-y-2">
                <label className="block text-base font-medium text-gray-900">বিবরণ (ঐচ্ছিক)</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="যেমন: নগদ পেমেন্ট"
                  value={paymentForm.description}
                  onChange={(e) => setPaymentForm((p) => ({ ...p, description: e.target.value }))}
                />
              </div>
              <button
                type="submit"
                disabled={!paymentForm.customerId || !paymentForm.amount || savingPayment}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-4 px-6 rounded-lg text-lg transition-colors"
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
                  <div className="overflow-x-auto">
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
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
