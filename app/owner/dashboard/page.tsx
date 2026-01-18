// app/owner/dashboard/page.tsx

import { cookies } from "next/headers";
import { getShopsByUser } from "@/app/actions/shops";
import { submitPaymentRequest } from "@/app/actions/billing";
import { getSupportContact } from "@/app/actions/system-settings";
import { requireUser } from "@/lib/auth-session";
import { resolveBillingStatus } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { getTodaySummaryForShop } from "@/lib/reports/today-summary";
import OwnerDashboardClient from "./OwnerDashboardClient";

type DashboardPageProps = {
  searchParams?: Promise<{ shopId?: string } | undefined>;
};

export default async function OwnerDashboardPage({
  searchParams,
}: DashboardPageProps) {
  const user = await requireUser();
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

  const [summary, supportContact, subscription, invoice] = await Promise.all([
    getTodaySummaryForShop(selectedShopId, user),
    getSupportContact(),
    prisma.shopSubscription.findUnique({
      where: { shopId: selectedShopId },
      select: {
        status: true,
        currentPeriodEnd: true,
        trialEndsAt: true,
        graceEndsAt: true,
      },
    }),
    prisma.invoice.findFirst({
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
    }),
  ]);

  const paymentRequest = invoice?.paymentRequests?.[0] ?? null;

  const billingStatus = resolveBillingStatus(
    subscription
      ? {
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd,
          trialEndsAt: subscription.trialEndsAt,
          graceEndsAt: subscription.graceEndsAt,
        }
      : null,
    invoice
      ? {
          status: invoice.status,
          dueDate: invoice.dueDate,
          periodEnd: invoice.periodEnd,
          paidAt: invoice.paidAt,
        }
      : null,
  );

  return (
    <OwnerDashboardClient
      userId={user.id}
      initialData={{
        shopId: selectedShopId,
        shops: shopSnapshot,
        summary,
        billing: {
          status: billingStatus,
          invoiceId: invoice?.id ?? null,
          amount: invoice?.amount?.toString() ?? null,
          dueDate: invoice?.dueDate?.toISOString() ?? null,
          periodEnd: invoice?.periodEnd?.toISOString() ?? null,
          paymentRequestStatus: paymentRequest ? "pending" : "none",
        },
        supportContact,
      }}
      onPaymentRequest={submitPaymentRequest}
    />
  );
}
