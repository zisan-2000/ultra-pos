// app/owner/dashboard/page.tsx

import { cookies } from "next/headers";
import { getShopsByUser } from "@/app/actions/shops";
import { submitPaymentRequest } from "@/app/actions/billing";
import { getPayablesSummary } from "@/app/actions/purchases";
import { getSupportContact } from "@/app/actions/system-settings";
import { requireUser } from "@/lib/auth-session";
import { hasRole } from "@/lib/rbac";
import { resolveBillingStatus } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { shopNeedsCogs } from "@/lib/accounting/cogs";
import { getTodaySummaryForShop } from "@/lib/reports/today-summary";
import OwnerDashboardClient from "./OwnerDashboardClient";

type DashboardPageProps = {
  searchParams?: Promise<{ shopId?: string } | undefined>;
};

export default async function OwnerDashboardPage({
  searchParams,
}: DashboardPageProps) {
  const user = await requireUser();
  const canViewBilling = hasRole(user, "owner");
  const shops = await getShopsByUser();

  if (!shops || shops.length === 0) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-foreground">ড্যাশবোর্ড</h1>
        <p className="mt-4 text-muted-foreground">প্রথমে একটি দোকান তৈরি করুন।</p>
      </div>
    );
  }

  const resolvedSearch = await searchParams;
  const cookieStore = await cookies();
  const cookieShopId = cookieStore.get("activeShopId")?.value;

  const cookieSelectedShopId =
    cookieShopId && shops.some((s) => s.id === cookieShopId)
      ? cookieShopId
      : null;

  const selectedShopId =
    resolvedSearch?.shopId && shops.some((s) => s.id === resolvedSearch.shopId)
      ? resolvedSearch.shopId
      : cookieSelectedShopId ?? shops[0].id;

  const shopSnapshot = shops.map((shop) => ({ id: shop.id, name: shop.name }));

  let payables = { totalDue: 0, dueCount: 0, supplierCount: 0 };
  try {
    payables = await getPayablesSummary(selectedShopId);
  } catch {
    // If permission missing, silently skip payables
  }

  const [summary, supportContact, subscription, latestInvoice, actionableInvoice, needsCogs] =
    await Promise.all([
      getTodaySummaryForShop(selectedShopId, user),
      getSupportContact(),
      canViewBilling
        ? prisma.shopSubscription.findUnique({
            where: { shopId: selectedShopId },
            select: {
              status: true,
              currentPeriodEnd: true,
              trialEndsAt: true,
              graceEndsAt: true,
            },
          })
        : Promise.resolve(null),
      canViewBilling
        ? prisma.invoice.findFirst({
            where: { shopId: selectedShopId },
            select: {
              id: true,
              status: true,
              dueDate: true,
              periodEnd: true,
              paidAt: true,
              amount: true,
              paymentRequests: {
                where: {
                  ownerId: user.id,
                  status: "pending",
                },
                select: { id: true },
                take: 1,
              },
            },
            orderBy: { periodEnd: "desc" },
          })
        : Promise.resolve(null),
      canViewBilling
        ? prisma.invoice.findFirst({
            where: {
              shopId: selectedShopId,
              ownerId: user.id,
              status: "open",
            },
            select: {
              id: true,
              status: true,
              dueDate: true,
              periodEnd: true,
              paidAt: true,
              amount: true,
              paymentRequests: {
                where: {
                  ownerId: user.id,
                  status: "pending",
                },
                select: { id: true },
                take: 1,
              },
            },
            orderBy: [{ dueDate: "desc" }, { periodEnd: "desc" }],
          })
        : Promise.resolve(null),
      shopNeedsCogs(selectedShopId),
    ]);

  const paymentRequest = actionableInvoice?.paymentRequests?.[0] ?? null;

  const billingStatus = canViewBilling
    ? resolveBillingStatus(
        subscription
          ? {
              status: subscription.status,
              currentPeriodEnd: subscription.currentPeriodEnd,
              trialEndsAt: subscription.trialEndsAt,
              graceEndsAt: subscription.graceEndsAt,
            }
          : null,
        latestInvoice
          ? {
              status: latestInvoice.status,
              dueDate: latestInvoice.dueDate,
              periodEnd: latestInvoice.periodEnd,
              paidAt: latestInvoice.paidAt,
            }
          : null,
      )
    : "untracked";

  return (
    <OwnerDashboardClient
      userId={user.id}
      initialData={{
        shopId: selectedShopId,
        shops: shopSnapshot,
        summary,
        needsCogs,
        payables,
        ...(canViewBilling
          ? {
              billing: {
                status: billingStatus,
                invoiceId: actionableInvoice?.id ?? null,
                amount:
                  actionableInvoice?.amount?.toString() ??
                  latestInvoice?.amount?.toString() ??
                  null,
                dueDate:
                  actionableInvoice?.dueDate?.toISOString() ??
                  latestInvoice?.dueDate?.toISOString() ??
                  null,
                periodEnd:
                  actionableInvoice?.periodEnd?.toISOString() ??
                  latestInvoice?.periodEnd?.toISOString() ??
                  null,
                paymentRequestStatus: paymentRequest ? "pending" : "none",
              },
            }
          : {}),
        supportContact,
      }}
      onPaymentRequest={submitPaymentRequest}
    />
  );
}
