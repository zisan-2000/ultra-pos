// app/dashboard/sales/components/pos-quick-customer-dialog.tsx

"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { db } from "@/lib/dexie/db";
import { queueAdd } from "@/lib/sync/queue";
import { handlePermissionError } from "@/lib/permission-toast";
import { emitDueCustomersEvent } from "@/lib/due/customer-events";

type CreatedCustomer = {
  id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  totalDue?: string | number;
  lastPaymentAt?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  shopId: string;
  online: boolean;
  canCreateCustomer: boolean;
  onCustomerCreated: (customer: CreatedCustomer) => void;
  onSelectCustomer: (id: string) => void;
  onInvalidateQuery: () => void;
};

export function PosQuickCustomerDialog({
  open,
  onClose,
  shopId,
  online,
  canCreateCustomer,
  onCustomerCreated,
  onSelectCustomer,
  onInvalidateQuery,
}: Props) {
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [quickCustomer, setQuickCustomer] = useState({
    name: "",
    phone: "",
    address: "",
  });

  async function handleSave() {
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

        onCustomerCreated(payload);
        emitDueCustomersEvent({ shopId, at: Date.now(), source: "local" });
        onSelectCustomer(payload.id);
        setQuickCustomer({ name: "", phone: "", address: "" });
        onClose();
        toast.success("অফলাইন: গ্রাহক যোগ হয়েছে, অনলাইনে গেলে সিঙ্ক হবে।");
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

      onCustomerCreated(payload);
      onSelectCustomer(createdId);
      setQuickCustomer({ name: "", phone: "", address: "" });
      onClose();
      emitDueCustomersEvent({ shopId, at: Date.now(), source: "create" });
      onInvalidateQuery();
      toast.success("গ্রাহক যোগ হয়েছে এবং নির্বাচন করা হয়েছে।");
    } catch (error) {
      console.error("Quick customer create failed:", error);
      toast.error("গ্রাহক যোগ করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setSavingCustomer(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !savingCustomer) {
          setQuickCustomer({ name: "", phone: "", address: "" });
          onClose();
        }
      }}
    >
      <DialogContent className="w-[calc(100vw-1rem)] max-w-md border-border/70 sm:w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle>বাকির জন্য নতুন গ্রাহক</DialogTitle>
          <DialogDescription>
            এই পেজ ছাড়াই গ্রাহক যোগ করুন। save হলে তাকে সঙ্গে সঙ্গে নির্বাচন করা হবে।
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
                setQuickCustomer((prev) => ({ ...prev, name: e.target.value }))
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
                setQuickCustomer((prev) => ({ ...prev, phone: e.target.value }))
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
                setQuickCustomer((prev) => ({ ...prev, address: e.target.value }))
              }
              disabled={savingCustomer}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={savingCustomer}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            বন্ধ
          </button>
          <button
            type="button"
            onClick={handleSave}
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
  );
}
