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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded p-3 bg-white">
          <p className="text-sm text-gray-500">Total Due</p>
          <p className="text-2xl font-bold">{summary.totalDue.toFixed(2)} ?</p>
        </div>
        <div className="border rounded p-3 bg-white">
          <p className="text-sm text-gray-500">Customers with Due</p>
          <p className="text-2xl font-bold">{customers.length}</p>
        </div>
        <div className="border rounded p-3 bg-white">
          <p className="text-sm text-gray-500">Top Due Customers</p>
          {summary.topDue?.length === 0 && (
            <p className="text-xs text-gray-500">No due yet</p>
          )}
          {summary.topDue?.map((c) => (
            <p key={c.id} className="text-sm">
              {c.name} — {c.totalDue.toFixed(2)} ?
            </p>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <form onSubmit={handleAddCustomer} className="border rounded p-4 bg-white space-y-3">
          <div>
            <h3 className="text-lg font-bold">Add Customer</h3>
            <p className="text-xs text-gray-500">
              Name + phone for quick due tracking.
            </p>
          </div>
          <input
            className="border p-2 rounded w-full text-sm"
            placeholder="Customer name"
            value={newCustomer.name}
            onChange={(e) => setNewCustomer((p) => ({ ...p, name: e.target.value }))}
            required
          />
          <input
            className="border p-2 rounded w-full text-sm"
            placeholder="Phone (optional)"
            value={newCustomer.phone}
            onChange={(e) => setNewCustomer((p) => ({ ...p, phone: e.target.value }))}
          />
          <input
            className="border p-2 rounded w-full text-sm"
            placeholder="Address (optional)"
            value={newCustomer.address}
            onChange={(e) => setNewCustomer((p) => ({ ...p, address: e.target.value }))}
          />
          <button className="bg-black text-white px-4 py-2 rounded text-sm" type="submit">
            Save Customer
          </button>
        </form>

        <form onSubmit={handlePayment} className="border rounded p-4 bg-white space-y-3">
          <div>
            <h3 className="text-lg font-bold">Take Payment</h3>
            <p className="text-xs text-gray-500">Reduce customer due instantly.</p>
          </div>
          <select
            className="border p-2 rounded w-full text-sm"
            value={paymentForm.customerId}
            onChange={(e) => {
              setPaymentForm((p) => ({ ...p, customerId: e.target.value }));
              setSelectedCustomerId(e.target.value);
              loadStatement(e.target.value);
            }}
          >
            <option value="">Select customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — Due: {Number(c.totalDue || 0).toFixed(2)} ?
              </option>
            ))}
          </select>

          <input
            className="border p-2 rounded w-full text-sm"
            placeholder="Amount"
            type="number"
            min="0"
            step="0.01"
            value={paymentForm.amount}
            onChange={(e) => setPaymentForm((p) => ({ ...p, amount: e.target.value }))}
            required
          />
          <input
            className="border p-2 rounded w-full text-sm"
            placeholder="Note (optional)"
            value={paymentForm.description}
            onChange={(e) => setPaymentForm((p) => ({ ...p, description: e.target.value }))}
          />
          <button
            className="bg-green-600 text-white px-4 py-2 rounded text-sm disabled:bg-gray-400"
            type="submit"
            disabled={!paymentForm.customerId || !paymentForm.amount || savingPayment}
          >
            {savingPayment ? "Saving..." : "Record Payment"}
          </button>
        </form>
      </div>

      <div className="border rounded p-4 bg-white">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold">Customer List</h3>
          <p className="text-xs text-gray-500">
            Select in POS (payment method = Due) to add new due sales.
          </p>
        </div>
        <div className="divide-y">
          {customers.length === 0 ? (
            <p className="text-sm text-gray-500 py-2">No customers yet.</p>
          ) : (
            customers.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2">
                <div>
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-xs text-gray-500">
                    {c.phone || "No phone"}{" "}
                    {c.address ? `• ${c.address}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">
                    Due: {Number(c.totalDue || 0).toFixed(2)} ?
                  </p>
                  {c.lastPaymentAt && (
                    <p className="text-xs text-gray-500">
                      Last payment: {new Date(c.lastPaymentAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="border rounded p-4 bg-white space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">Statement</h3>
          <select
            className="border p-2 rounded text-sm"
            value={selectedCustomerId}
            onChange={(e) => {
              setSelectedCustomerId(e.target.value);
              loadStatement(e.target.value);
              setPaymentForm((p) => ({ ...p, customerId: e.target.value }));
            }}
          >
            <option value="">Select customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="border rounded">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 text-left">Date</th>
                <th className="p-2 text-left">Description</th>
                <th className="p-2 text-right">Debit (Sale)</th>
                <th className="p-2 text-right">Credit (Payment)</th>
                <th className="p-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {loadingStatement ? (
                <tr>
                  <td className="p-2 text-center" colSpan={5}>
                    Loading...
                  </td>
                </tr>
              ) : !selectedCustomerId ? (
                <tr>
                  <td className="p-2 text-center" colSpan={5}>
                    Select a customer to view statement.
                  </td>
                </tr>
              ) : statementWithBalance.length === 0 ? (
                <tr>
                  <td className="p-2 text-center" colSpan={5}>
                    No entries yet.
                  </td>
                </tr>
              ) : (
                statementWithBalance.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="p-2">
                      {new Date(row.entryDate).toLocaleDateString()}
                    </td>
                    <td className="p-2 text-left">{row.description || "-"}</td>
                    <td className="p-2 text-right">
                      {row.entryType === "SALE"
                        ? Number(row.amount || 0).toFixed(2)
                        : ""}
                    </td>
                    <td className="p-2 text-right">
                      {row.entryType === "PAYMENT"
                        ? Number(row.amount || 0).toFixed(2)
                        : ""}
                    </td>
                    <td className="p-2 text-right font-semibold">
                      {Number((row as any).running || 0).toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
