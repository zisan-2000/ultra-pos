"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { hasRole, isSuperAdmin } from "@/lib/rbac";
import { BILLING_CONFIG, addDays } from "@/lib/billing";

const ALLOWED_METHODS = new Set(["cash", "bkash", "bank", "other"]);

export async function submitPaymentRequest(formData: FormData) {
  const user = await requireUser();
  const isOwner = user.roles?.includes("owner") ?? false;
  if (!isOwner) {
    throw new Error("Only owners can submit payment requests");
  }

  const invoiceId = String(formData.get("invoiceId") || "").trim();
  const shopId = String(formData.get("shopId") || "").trim();
  const methodRaw = String(formData.get("method") || "").trim().toLowerCase();
  const reference = String(formData.get("reference") || "").trim();
  const note = String(formData.get("note") || "").trim();

  if (!invoiceId || !shopId) {
    throw new Error("Missing billing details");
  }

  const method = ALLOWED_METHODS.has(methodRaw) ? methodRaw : "other";

  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { id: true, ownerId: true },
  });

  if (!shop || shop.ownerId !== user.id) {
    throw new Error("Invalid shop access");
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, status: true, shopId: true, ownerId: true },
  });

  if (!invoice || invoice.shopId !== shopId || invoice.ownerId !== user.id) {
    throw new Error("Invoice not found");
  }

  if (invoice.status !== "open") {
    throw new Error("Invoice is not open");
  }

  const pending = await prisma.billingPaymentRequest.findFirst({
    where: { invoiceId, ownerId: user.id, status: "pending" },
    select: { id: true },
  });

  if (!pending) {
    await prisma.billingPaymentRequest.create({
      data: {
        invoiceId,
        ownerId: user.id,
        shopId,
        method,
        reference: reference || null,
        note: note || null,
      },
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/owner/dashboard");
  revalidatePath("/dashboard/admin/billing");
}

export async function approvePaymentRequest(formData: FormData) {
  const user = await requireUser();
  if (!isSuperAdmin(user) && !hasRole(user, "admin")) {
    throw new Error("Forbidden");
  }

  const requestId = String(formData.get("requestId") || "").trim();
  if (!requestId) {
    throw new Error("Missing payment request id");
  }

  const request = await prisma.billingPaymentRequest.findUnique({
    where: { id: requestId },
    include: {
      invoice: true,
      shop: true,
    },
  });

  if (!request) {
    throw new Error("Payment request not found");
  }

  if (request.status !== "pending") {
    return;
  }

  const paidAt = new Date();

  await prisma.$transaction(async (tx) => {
    if (request.invoice.status !== "paid") {
      await tx.invoice.update({
        where: { id: request.invoiceId },
        data: { status: "paid", paidAt },
      });

      await tx.invoicePayment.create({
        data: {
          invoiceId: request.invoiceId,
          amount: request.invoice.amount,
          method: request.method,
          reference: request.reference,
          paidAt,
        },
      });

      await tx.shopSubscription.update({
        where: { id: request.invoice.subscriptionId },
        data: {
          status: "active",
          graceEndsAt: addDays(request.invoice.periodEnd, BILLING_CONFIG.graceDays),
          nextInvoiceAt: request.invoice.periodEnd,
        },
      });
    }

    await tx.billingPaymentRequest.update({
      where: { id: requestId },
      data: { status: "approved", decidedAt: paidAt },
    });
  });

  revalidatePath("/dashboard/admin/billing");
  revalidatePath("/dashboard");
  revalidatePath("/owner/dashboard");
}

export async function rejectPaymentRequest(formData: FormData) {
  const user = await requireUser();
  if (!isSuperAdmin(user) && !hasRole(user, "admin")) {
    throw new Error("Forbidden");
  }

  const requestId = String(formData.get("requestId") || "").trim();
  if (!requestId) {
    throw new Error("Missing payment request id");
  }

  await prisma.billingPaymentRequest.update({
    where: { id: requestId },
    data: { status: "rejected", decidedAt: new Date() },
  });

  revalidatePath("/dashboard/admin/billing");
  revalidatePath("/dashboard");
  revalidatePath("/owner/dashboard");
}
