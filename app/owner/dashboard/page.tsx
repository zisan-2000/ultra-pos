// app/owner/dashboard/page.tsx

import { cookies } from "next/headers";
import { getShopsByUser } from "@/app/actions/shops";
import { submitPaymentRequest } from "@/app/actions/billing";
import { getSupportContact } from "@/app/actions/system-settings";
import { requireUser } from "@/lib/auth-session";
import { resolveBillingStatus } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import OwnerDashboardClient from "./OwnerDashboardClient";

type DashboardPageProps = {
  searchParams?: Promise<{ shopId?: string } | undefined>;
};

async function fetchSummary(shopId: string, cookieHeader: string) {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";

  const res = await fetch(
    `${baseUrl}/api/reports/today-summary?shopId=${shopId}`,
    {
      cache: "no-store",
      headers: {
        cookie: cookieHeader,
      },
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to load summary (${res.status})`);
  }

  return await res.json();
}

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
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join("; ");

  const cookieSelectedShopId =
    cookieShopId && shops.some((s) => s.id === cookieShopId)
      ? cookieShopId
      : null;

  const selectedShopId =
    resolvedSearch?.shopId && shops.some((s) => s.id === resolvedSearch.shopId)
      ? resolvedSearch.shopId
      : cookieSelectedShopId ?? shops[0].id;

  const summary = await fetchSummary(selectedShopId, cookieHeader);
  const shopSnapshot = shops.map((shop) => ({ id: shop.id, name: shop.name }));
  const supportContact = await getSupportContact();

  const subscription = await prisma.shopSubscription.findUnique({
    where: { shopId: selectedShopId },
    select: {
      status: true,
      currentPeriodEnd: true,
      trialEndsAt: true,
      graceEndsAt: true,
    },
  });

  const invoice = await prisma.invoice.findFirst({
    where: { shopId: selectedShopId },
    select: {
      id: true,
      status: true,
      dueDate: true,
      periodEnd: true,
      paidAt: true,
      amount: true,
    },
    orderBy: { periodEnd: "desc" },
  });

  const paymentRequest = invoice
    ? await prisma.billingPaymentRequest.findFirst({
        where: {
          invoiceId: invoice.id,
          ownerId: user.id,
          status: "pending",
        },
        select: { id: true },
      })
    : null;

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
