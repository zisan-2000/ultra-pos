"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button";
import { BillingStatus } from "@/lib/billing";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { useSyncStatus } from "@/lib/sync/sync-status";

type Summary = {
  sales?: { total?: number } | number;
  expenses?: { total?: number } | number;
  profit?: number;
  cash?: { balance?: number } | null;
  balance?: number;
};

type Shop = {
  id: string;
  name: string;
};

type BillingInfo = {
  status: BillingStatus;
  invoiceId: string | null;
  amount: string | null;
  dueDate: string | null;
  periodEnd: string | null;
  paymentRequestStatus: "pending" | "none";
};

type SupportContact = {
  supportPhone: string | null;
  supportWhatsapp: string | null;
};

type OwnerDashboardData = {
  shopId: string;
  shops: Shop[];
  summary: Summary;
  billing?: BillingInfo;
  supportContact?: SupportContact;
};

type Props = {
  userId: string;
  initialData: OwnerDashboardData;
  onPaymentRequest: (formData: FormData) => Promise<void>;
};

function getSummaryTotal(value?: { total?: number } | number) {
  if (typeof value === "number") return value;
  return value?.total ?? 0;
}

const defaultBilling: BillingInfo = {
  status: "untracked",
  invoiceId: null,
  amount: null,
  dueDate: null,
  periodEnd: null,
  paymentRequestStatus: "none",
};

const defaultSupport: SupportContact = {
  supportPhone: null,
  supportWhatsapp: null,
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
}

function formatMoney(value?: string | null) {
  if (!value) return "-";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export default function OwnerDashboardClient({
  userId,
  initialData,
  onPaymentRequest,
}: Props) {
  const router = useRouter();
  const online = useOnlineStatus();
  const { pendingCount, syncing, lastSyncAt } = useSyncStatus();
  const [data, setData] = useState<OwnerDashboardData>(initialData);
  const [cacheMissing, setCacheMissing] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const serverSnapshotRef = useRef(initialData);
  const refreshInFlightRef = useRef(false);

  const cacheKey = useMemo(() => `owner:dashboard:${userId}`, [userId]);

  useEffect(() => {
    if (serverSnapshotRef.current !== initialData) {
      serverSnapshotRef.current = initialData;
      refreshInFlightRef.current = false;
    }

    if (online) {
      setData(initialData);
      setCacheMissing(false);
      try {
        localStorage.setItem(cacheKey, JSON.stringify(initialData));
      } catch {
        // ignore cache errors
      }
      return;
    }

    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) {
        setCacheMissing(true);
        return;
      }
      const parsed = JSON.parse(raw) as OwnerDashboardData;
      if (parsed && parsed.summary) {
        setData(parsed);
        setCacheMissing(false);
      } else {
        setCacheMissing(true);
      }
    } catch {
      setCacheMissing(true);
    }
  }, [online, initialData, cacheKey]);

  useEffect(() => {
    if (!online || !lastSyncAt || syncing || pendingCount > 0) return;
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    router.refresh();
  }, [online, lastSyncAt, syncing, pendingCount, router]);

  const selectedShopId = data.shopId || data.shops?.[0]?.id || "";
  const salesTotal = Number(getSummaryTotal(data.summary?.sales));
  const expenseTotal = Number(getSummaryTotal(data.summary?.expenses));
  const profitTotal = Number(data.summary?.profit ?? 0);
  const cashBalance = Number(
    data.summary?.cash?.balance ?? data.summary?.balance ?? 0
  );
  const billing = data.billing ?? defaultBilling;
  const supportContact = data.supportContact ?? defaultSupport;
  const showBillingWarning =
    billing.status === "due" || billing.status === "past_due";
  const isPastDue = billing.status === "past_due";
  const paymentRequestPending = billing.paymentRequestStatus === "pending";
  const canSubmitPaymentRequest =
    showBillingWarning && Boolean(billing.invoiceId) && !paymentRequestPending;
  const contactHref = useMemo(() => {
    if (supportContact.supportWhatsapp) {
      const digits = supportContact.supportWhatsapp.replace(/\D/g, "");
      return digits ? `https://wa.me/${digits}` : null;
    }
    if (supportContact.supportPhone) {
      return `tel:${supportContact.supportPhone}`;
    }
    return null;
  }, [supportContact.supportPhone, supportContact.supportWhatsapp]);

  return (
    <div className="space-y-6 -mt-1 mb-6">
      {!online && (
        <div className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs font-semibold text-warning">
          Offline: showing cached owner dashboard data.
        </div>
      )}
      {!online && cacheMissing && (
        <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          Offline: cached owner dashboard data not available.
        </div>
      )}
      <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground leading-tight">
              দৈনিক সারসংক্ষেপ
            </h1>
            {/* <p className="text-sm text-muted-foreground mt-1 leading-snug">
              আজকের সারসংক্ষেপ, বিক্রি ও খরচ
            </p> */}
          </div>
        </div>
      </div>

      {showBillingWarning && (
        <div
          className={`rounded-xl border p-4 shadow-sm ${
            isPastDue
              ? "border-danger/30 bg-danger-soft"
              : "border-warning/30 bg-warning-soft"
          }`}
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                    isPastDue
                      ? "bg-danger/15 text-danger"
                      : "bg-warning/15 text-warning"
                  }`}
                >
                  {isPastDue ? "Past due" : "Payment due"}
                </span>
                <span className="text-xs text-muted-foreground">
                  Due: {formatDate(billing.dueDate)}
                </span>
              </div>
              <div className="text-sm font-semibold text-foreground">
                Amount: {formatMoney(billing.amount)}
              </div>
              <p className="text-xs text-muted-foreground">
                Your subscription invoice is still open. All features remain
                active, but please clear the payment to avoid future
                restrictions.
              </p>
              {paymentRequestPending && (
                <p className="text-xs text-muted-foreground">
                  Payment request sent. Waiting for admin approval.
                </p>
              )}
              {(supportContact.supportPhone ||
                supportContact.supportWhatsapp) && (
                <div className="text-xs text-muted-foreground">
                  {supportContact.supportPhone
                    ? `Phone: ${supportContact.supportPhone}`
                    : null}
                  {supportContact.supportWhatsapp
                    ? ` ${supportContact.supportPhone ? "| " : ""}WhatsApp: ${
                        supportContact.supportWhatsapp
                      }`
                    : null}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {contactHref ? (
                <a
                  href={contactHref}
                  target={
                    contactHref.startsWith("https") ? "_blank" : undefined
                  }
                  rel={
                    contactHref.startsWith("https") ? "noreferrer" : undefined
                  }
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Contact admin
                </a>
              ) : null}
              {canSubmitPaymentRequest ? (
                <Dialog
                  open={paymentDialogOpen}
                  onOpenChange={setPaymentDialogOpen}
                >
                  <DialogTrigger asChild>
                    <button
                      type="button"
                      className={buttonVariants({
                        variant: "default",
                        size: "sm",
                      })}
                    >
                      I have paid
                    </button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Payment confirmation</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                      This sends a payment claim to the admin. The invoice stays
                      open until it is verified.
                    </p>
                    <form
                      action={onPaymentRequest}
                      className="space-y-4"
                      onSubmit={() => setPaymentDialogOpen(false)}
                    >
                      <input
                        type="hidden"
                        name="invoiceId"
                        value={billing.invoiceId ?? ""}
                      />
                      <input
                        type="hidden"
                        name="shopId"
                        value={selectedShopId}
                      />
                      <div className="space-y-1">
                        <label
                          htmlFor="billing-method"
                          className="text-xs font-semibold text-muted-foreground"
                        >
                          Payment method
                        </label>
                        <select
                          id="billing-method"
                          name="method"
                          defaultValue="cash"
                          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                        >
                          <option value="cash">Cash</option>
                          <option value="bkash">bKash</option>
                          <option value="bank">Bank</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label
                          htmlFor="billing-reference"
                          className="text-xs font-semibold text-muted-foreground"
                        >
                          Reference (optional)
                        </label>
                        <input
                          id="billing-reference"
                          name="reference"
                          type="text"
                          placeholder="Transaction id or note"
                          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <label
                          htmlFor="billing-note"
                          className="text-xs font-semibold text-muted-foreground"
                        >
                          Note (optional)
                        </label>
                        <textarea
                          id="billing-note"
                          name="note"
                          className="min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                        />
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          onClick={() => setPaymentDialogOpen(false)}
                          className={buttonVariants({
                            variant: "outline",
                            size: "sm",
                          })}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className={buttonVariants({
                            variant: "default",
                            size: "sm",
                          })}
                        >
                          Send request
                        </button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              ) : paymentRequestPending ? (
                <span className="text-xs font-semibold text-muted-foreground">
                  Payment request pending
                </span>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card
            title="আজকের বিক্রি"
            value={`${salesTotal.toFixed(2)} ৳`}
            color="success"
            icon="💰"
          />

          <Card
            title="আজকের খরচ"
            value={`${expenseTotal.toFixed(2)} ৳`}
            color="danger"
            icon="💸"
          />

          <Card
            title="আজকের লাভ"
            value={`${profitTotal.toFixed(2)} ৳`}
            color="primary"
            icon="📈"
          />

          <Card
            title="ক্যাশ ব্যালেন্স"
            value={`${cashBalance.toFixed(2)} ৳`}
            color="warning"
            icon="🏦"
          />
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground mb-3">
          দ্রুত কাজ
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
          <Link
            href={`/dashboard/sales/new?shopId=${selectedShopId}`}
            className="block bg-primary-soft border border-primary/30 text-primary font-semibold rounded-lg py-4 px-3 text-base text-center transition-colors hover:border-primary/50 hover:bg-primary/20 pressable card-lift h-full"
          >
            <span className="flex flex-col items-center gap-1">
              <span className="text-xl">⚡</span>
              <span>নতুন বিক্রি শুরু করুন</span>
            </span>
          </Link>
          <Link
            href={`/dashboard/due?shopId=${selectedShopId}`}
            className="block bg-warning-soft border border-warning/30 text-warning font-semibold rounded-lg py-4 px-3 text-base text-center transition-colors hover:border-warning/50 hover:bg-warning/20 pressable card-lift h-full"
          >
            <span className="flex flex-col items-center gap-1">
              <span className="text-xl">🧾</span>
              <span>ধার / বাকি লিখে রাখুন</span>
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}

function Card({
  title,
  value,
  color,
  icon,
}: {
  title: string;
  value: string;
  color: string;
  icon?: string;
}) {
  const iconBg: Record<string, string> = {
    success: "bg-success/15 text-success",
    danger: "bg-danger/15 text-danger",
    primary: "bg-primary/15 text-primary",
    warning: "bg-warning/15 text-warning",
  };
  const valueColor: Record<string, string> = {
    success: "text-success",
    danger: "text-danger",
    primary: "text-primary",
    warning: "text-warning",
  };
  const trimmed = value.trim();
  const parts = trimmed.split(/\s+/);
  const currency = parts.length > 1 ? parts.pop() || "" : "";
  const amount = parts.join(" ");

  return (
    <div className="bg-card text-foreground p-5 rounded-2xl border border-border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all pressable">
      <div className="flex items-start gap-3">
        {icon ? (
          <span
            className={`inline-flex items-center justify-center h-8 w-8 rounded-full text-[18px] ${
              iconBg[color] ?? "bg-muted text-muted-foreground"
            }`}
          >
            {icon}
          </span>
        ) : null}
        <div className="space-y-3">
          <p className="text-[13px] font-medium text-foreground/80">{title}</p>
          <div className="flex items-end gap-1">
            <span
              className={`text-[30px] font-extrabold leading-none ${
                valueColor[color] ?? "text-foreground"
              }`}
            >
              {amount}
            </span>
            {currency ? (
              <span className="text-xs text-muted-foreground pb-1">
                {currency}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
