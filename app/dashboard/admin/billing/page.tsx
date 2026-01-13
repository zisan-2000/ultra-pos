import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { approvePaymentRequest, rejectPaymentRequest } from "@/app/actions/billing";
import { requireUser } from "@/lib/auth-session";
import { hasRole, isSuperAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import {
  BILLING_CONFIG,
  addDays,
  addMonths,
  resolveBillingStatus,
} from "@/lib/billing";
import { buttonVariants } from "@/components/ui/button";

type BillingPageProps = {
  searchParams?: Promise<{ q?: string; status?: string } | undefined>;
};

const formatDate = (value?: Date | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
};

const formatMoney = (value: number | string) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatMethod = (value?: string | null) => {
  if (!value) return "-";
  if (value === "bkash") return "bKash";
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const formatUserLabel = (user?: { name: string | null; email: string | null } | null) =>
  user?.name || user?.email || "Unknown";

const getRoleNames = (user?: { roles?: Array<{ name: string }> } | null) =>
  new Set((user?.roles ?? []).map((role) => role.name));

const buildHierarchyLabels = (owner?: {
  createdByUser?: {
    name: string | null;
    email: string | null;
    roles?: Array<{ name: string }>;
    createdByUser?: {
      name: string | null;
      email: string | null;
      roles?: Array<{ name: string }>;
    } | null;
  } | null;
} | null) => {
  const creator = owner?.createdByUser ?? null;
  const creatorRoles = getRoleNames(creator);
  let agent = null as typeof creator | null;
  let admin = null as typeof creator | null;

  if (creator) {
    if (creatorRoles.has("agent")) {
      agent = creator;
      admin = creator.createdByUser ?? null;
    } else {
      admin = creator;
    }
  }

  const adminLabel = admin ? formatUserLabel(admin) : "Unknown";
  const adminRoles = getRoleNames(admin);
  const directLabel = adminRoles.has("super_admin")
    ? "Direct (Super Admin)"
    : "Direct (Admin)";
  const agentLabel = agent ? formatUserLabel(agent) : admin ? directLabel : "Direct";

  return { agentLabel, adminLabel };
};

async function markInvoicePaid(formData: FormData) {
  "use server";
  const user = await requireUser();
  if (!isSuperAdmin(user) && !hasRole(user, "admin")) {
    throw new Error("Forbidden");
  }

  const invoiceId = String(formData.get("invoiceId") || "").trim();
  if (!invoiceId) {
    throw new Error("Missing invoice id");
  }

  const existing = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      amount: true,
      status: true,
      subscriptionId: true,
      periodEnd: true,
    },
  });

  if (!existing) {
    throw new Error("Invoice not found");
  }

  if (existing.status === "paid") {
    return;
  }

  const paidAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { status: "paid", paidAt },
    });

    await tx.invoicePayment.create({
      data: {
        invoiceId,
        amount: existing.amount,
        method: "manual",
        reference: null,
        paidAt,
      },
    });

    await tx.shopSubscription.update({
      where: { id: existing.subscriptionId },
      data: {
        status: "active",
        graceEndsAt: addDays(existing.periodEnd, BILLING_CONFIG.graceDays),
        nextInvoiceAt: existing.periodEnd,
      },
    });
  });

  revalidatePath("/dashboard/admin/billing");
  revalidatePath("/dashboard");
  revalidatePath("/owner/dashboard");
}

async function generateDueInvoices() {
  "use server";
  const user = await requireUser();
  if (!isSuperAdmin(user) && !hasRole(user, "admin")) {
    throw new Error("Forbidden");
  }

  const now = new Date();
  const subscriptions = await prisma.shopSubscription.findMany({
    include: {
      plan: { select: { amount: true, intervalMonths: true } },
      invoices: { orderBy: { periodEnd: "desc" }, take: 1 },
      shop: { select: { ownerId: true } },
    },
  });

  for (const subscription of subscriptions) {
    const latestInvoice = subscription.invoices[0];
    if (!latestInvoice || latestInvoice.status !== "paid") continue;
    if (subscription.currentPeriodEnd > now) continue;

    const periodStart = subscription.currentPeriodEnd;
    const periodEnd = addMonths(periodStart, subscription.plan.intervalMonths);

    const existing = await prisma.invoice.findFirst({
      where: {
        subscriptionId: subscription.id,
        periodStart,
        periodEnd,
      },
      select: { id: true },
    });

    if (existing) continue;

    await prisma.$transaction(async (tx) => {
      await tx.invoice.create({
        data: {
          subscriptionId: subscription.id,
          shopId: subscription.shopId,
          ownerId: subscription.shop.ownerId,
          periodStart,
          periodEnd,
          amount: subscription.plan.amount,
          status: "open",
          dueDate: periodEnd,
        },
      });

      await tx.shopSubscription.update({
        where: { id: subscription.id },
        data: {
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          nextInvoiceAt: periodEnd,
          graceEndsAt: addDays(periodEnd, BILLING_CONFIG.graceDays),
          status: "active",
        },
      });
    });
  }

  revalidatePath("/dashboard/admin/billing");
  revalidatePath("/dashboard");
  revalidatePath("/owner/dashboard");
}

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const user = await requireUser();
  if (!isSuperAdmin(user) && !hasRole(user, "admin")) {
    redirect("/dashboard");
  }

  const resolvedSearch = await searchParams;
  const queryRaw = resolvedSearch?.q?.trim() ?? "";
  const query = queryRaw.toLowerCase();
  const statusFilterRaw = resolvedSearch?.status?.trim().toLowerCase() ?? "all";
  const allowedStatuses = new Set([
    "all",
    "paid",
    "due",
    "past_due",
    "trialing",
    "canceled",
    "untracked",
  ]);
  const statusFilter = allowedStatuses.has(statusFilterRaw)
    ? statusFilterRaw
    : "all";

  const subscriptions = await prisma.shopSubscription.findMany({
    include: {
      shop: {
        select: {
          id: true,
          name: true,
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
              createdByUser: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  roles: { select: { name: true } },
                  createdByUser: {
                    select: {
                      id: true,
                      name: true,
                      email: true,
                      roles: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      plan: { select: { name: true, amount: true, intervalMonths: true } },
      invoices: { orderBy: { periodEnd: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });

  const paymentRequests = await prisma.billingPaymentRequest.findMany({
    where: { status: "pending" },
    include: {
      shop: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true, email: true } },
      invoice: { select: { id: true, amount: true, dueDate: true, status: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows = subscriptions.map((subscription) => {
    const invoice = subscription.invoices[0] ?? null;
    const status = resolveBillingStatus(
      {
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
        trialEndsAt: subscription.trialEndsAt,
        graceEndsAt: subscription.graceEndsAt,
      },
      invoice
        ? {
            status: invoice.status,
            dueDate: invoice.dueDate,
            periodEnd: invoice.periodEnd,
            paidAt: invoice.paidAt,
          }
        : null,
    );

    const owner = subscription.shop.owner ?? null;
    const { agentLabel, adminLabel } = buildHierarchyLabels(owner);

    const searchText = [
      subscription.shop.name,
      subscription.shop.id,
      subscription.plan.name,
      owner?.name,
      owner?.email,
      agentLabel,
      adminLabel,
      invoice?.status,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return {
      subscription,
      invoice,
      status,
      owner,
      agentLabel,
      adminLabel,
      searchText,
    };
  });

  const filteredRows = rows.filter((row) => {
    if (statusFilter !== "all" && row.status !== statusFilter) {
      return false;
    }
    if (query && !row.searchText.includes(query)) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Billing overview</h1>
          <p className="text-sm text-muted-foreground">
            Track shop subscriptions, invoices, and payment status.
          </p>
        </div>
        <form action={generateDueInvoices}>
          <button
            type="submit"
            className={buttonVariants({ variant: "outline", className: "w-fit" })}
          >
            Generate due invoices
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
        <form method="get" className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1 min-w-[220px] flex-1">
            <label className="text-xs font-semibold text-muted-foreground">
              Search
            </label>
            <input
              name="q"
              defaultValue={queryRaw}
              placeholder="Shop, owner, agent, admin, email"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-muted-foreground">
              Status
            </label>
            <select
              name="status"
              defaultValue={statusFilter}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
            >
              <option value="all">All</option>
              <option value="paid">Paid</option>
              <option value="due">Due</option>
              <option value="past_due">Past due</option>
              <option value="trialing">Trialing</option>
              <option value="canceled">Canceled</option>
              <option value="untracked">Untracked</option>
            </select>
          </div>
          <button
            type="submit"
            className={buttonVariants({ variant: "default", className: "h-9 px-4 text-sm" })}
          >
            Apply
          </button>
          <a
            href="/dashboard/admin/billing"
            className={buttonVariants({ variant: "outline", className: "h-9 px-4 text-sm" })}
          >
            Reset
          </a>
        </form>
        <div className="text-xs text-muted-foreground">
          Showing {filteredRows.length} of {subscriptions.length} shops
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Payment requests</h2>
          <p className="text-sm text-muted-foreground">
            Owner-submitted payment claims waiting for approval.
          </p>
        </div>
        {paymentRequests.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            No pending payment requests.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Shop
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Owner
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Invoice
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Method
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Note
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Requested
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {paymentRequests.map((request) => (
                  <tr key={request.id} className="hover:bg-muted/50">
                    <td className="px-3 py-2 text-foreground">
                      <div className="flex flex-col">
                        <span className="font-semibold">{request.shop.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {request.shop.id}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-foreground">
                      <div className="flex flex-col">
                        <span className="font-semibold">
                          {request.owner.name || "Owner"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {request.owner.email || "No email"}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      <div className="flex flex-col">
                        <span className="font-semibold text-foreground">
                          {formatMoney(request.invoice.amount.toString())}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Status: {request.invoice.status}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Due: {formatDate(request.invoice.dueDate)}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      <div className="flex flex-col">
                        <span className="font-semibold text-foreground">
                          {formatMethod(request.method)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Ref: {request.reference || "-"}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {request.note || "-"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatDate(request.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <form action={approvePaymentRequest}>
                          <input type="hidden" name="requestId" value={request.id} />
                          <button
                            type="submit"
                            className={buttonVariants({
                              variant: "default",
                              className: "h-8 px-3 text-xs",
                            })}
                          >
                            Approve
                          </button>
                        </form>
                        <form action={rejectPaymentRequest}>
                          <input type="hidden" name="requestId" value={request.id} />
                          <button
                            type="submit"
                            className={buttonVariants({
                              variant: "outline",
                              className: "h-8 px-3 text-xs",
                            })}
                          >
                            Reject
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
        {filteredRows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            No shop subscriptions found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Shop
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Owner
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Plan
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Status
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Period end
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Invoice
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Amount
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Action
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {filteredRows.map((row) => {
                  const subscription = row.subscription;
                  const invoice = row.invoice;
                  const status = row.status;
                  const owner = row.owner;

                  const statusStyles: Record<string, string> = {
                    paid: "border-success/30 bg-success-soft text-success",
                    due: "border-warning/30 bg-warning-soft text-warning",
                    past_due: "border-danger/30 bg-danger-soft text-danger",
                    trialing: "border-border bg-muted text-muted-foreground",
                    canceled: "border-border bg-muted text-muted-foreground",
                    untracked: "border-border bg-muted text-muted-foreground",
                  };

                  return (
                    <tr key={subscription.id} className="hover:bg-muted/50">
                      <td className="px-3 py-2 text-foreground">
                        <div className="flex flex-col">
                          <span className="font-semibold">
                            {subscription.shop.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {subscription.shop.id}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-foreground">
                        <div className="flex flex-col">
                          <span className="font-semibold">
                            {owner?.name || "Owner"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {owner?.email || "No email"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Agent: {row.agentLabel}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        <div className="flex flex-col">
                          <span className="font-semibold text-foreground">
                            {subscription.plan.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Every {subscription.plan.intervalMonths} month(s)
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${
                            statusStyles[status] ?? statusStyles.untracked
                          }`}
                        >
                          {status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatDate(subscription.currentPeriodEnd)}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        <div className="flex flex-col">
                          <span className="font-semibold text-foreground">
                            {invoice?.status ? invoice.status : "none"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Due: {formatDate(invoice?.dueDate)}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatMoney(subscription.plan.amount.toString())}
                      </td>
                      <td className="px-3 py-2">
                        {invoice && invoice.status === "open" ? (
                          <form action={markInvoicePaid}>
                            <input
                              type="hidden"
                              name="invoiceId"
                              value={invoice.id}
                            />
                            <button
                              type="submit"
                              className={buttonVariants({
                                variant: "default",
                                className: "h-8 px-3 text-xs",
                              })}
                            >
                              Mark paid
                            </button>
                          </form>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            -
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        <details className="group">
                          <summary className="cursor-pointer text-xs font-semibold text-primary">
                            Details
                          </summary>
                          <div className="mt-2 space-y-1 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                            <div>Admin: {row.adminLabel}</div>
                            <div>Agent: {row.agentLabel}</div>
                            <div>Owner: {formatUserLabel(owner)}</div>
                            <div>Shop ID: {subscription.shop.id}</div>
                            <div>Subscription ID: {subscription.id}</div>
                            <div>Invoice: {invoice ? invoice.id : "none"}</div>
                          </div>
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
