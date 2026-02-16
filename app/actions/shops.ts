// app/actions/shops.ts

"use server";

import { type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { assertShopAccess } from "@/lib/shop-access";
import { requirePermission } from "@/lib/rbac";
import { BILLING_CONFIG, DEFAULT_PLAN, addDays, addMonths } from "@/lib/billing";
import { sanitizeSalesInvoicePrefix } from "@/lib/sales-invoice";
import { sanitizeQueueTokenPrefix } from "@/lib/queue-token";

async function getCurrentUser() {
  return requireUser();
}

async function ensureDefaultPlan(tx: Prisma.TransactionClient) {
  return tx.subscriptionPlan.upsert({
    where: { key: DEFAULT_PLAN.key },
    update: {
      name: DEFAULT_PLAN.name,
      amount: DEFAULT_PLAN.amount,
      intervalMonths: DEFAULT_PLAN.intervalMonths,
      isActive: true,
    },
    create: {
      key: DEFAULT_PLAN.key,
      name: DEFAULT_PLAN.name,
      amount: DEFAULT_PLAN.amount,
      intervalMonths: DEFAULT_PLAN.intervalMonths,
      isActive: true,
    },
  });
}

async function createShopSubscription(
  tx: Prisma.TransactionClient,
  shop: { id: string; ownerId: string },
) {
  const plan = await ensureDefaultPlan(tx);
  const periodStart = new Date();
  const periodEnd = addMonths(periodStart, plan.intervalMonths);
  const trialEndsAt = addDays(periodStart, BILLING_CONFIG.trialDays);
  const graceEndsAt = addDays(periodEnd, BILLING_CONFIG.graceDays);

  const subscription = await tx.shopSubscription.create({
    data: {
      shopId: shop.id,
      ownerId: shop.ownerId,
      planId: plan.id,
      status: "trialing",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      nextInvoiceAt: periodEnd,
      trialEndsAt,
      graceEndsAt,
    },
  });

  await tx.invoice.create({
    data: {
      subscriptionId: subscription.id,
      shopId: shop.id,
      ownerId: shop.ownerId,
      periodStart,
      periodEnd,
      amount: plan.amount,
      status: "open",
      dueDate: periodEnd,
    },
  });
}

// ------------------------------
// CREATE SHOP
// ------------------------------
export async function createShop(data: {
  name: string;
  address?: string;
  phone?: string;
  businessType?: string;
  ownerId?: string;
  salesInvoiceEnabled?: boolean;
  salesInvoicePrefix?: string | null;
  queueTokenEnabled?: boolean;
  queueTokenPrefix?: string | null;
}) {
  const user = await getCurrentUser();
  const isSuperAdmin = user.roles?.includes("super_admin") ?? false;
  const isOwner = user.roles?.includes("owner") ?? false;
  const requestedOwnerId = data.ownerId?.trim() || undefined;

  if (!isSuperAdmin) {
    if (!isOwner) {
      throw new Error("Only super admin can create shops");
    }

    if (requestedOwnerId && requestedOwnerId !== user.id) {
      throw new Error("Owner cannot create shop for another user");
    }

    const existingCount = await prisma.shop.count({
      where: { ownerId: user.id },
    });

    if (existingCount > 0) {
      throw new Error(
        "Owner can only create the first shop. Please contact super admin to create additional shops."
      );
    }
  }

  if (requestedOwnerId && isSuperAdmin) {
    const targetOwner = await prisma.user.findUnique({
      where: { id: requestedOwnerId },
      select: { id: true, roles: { select: { name: true } } },
    });
    if (!targetOwner || !targetOwner.roles.some((r) => r.name === "owner")) {
      throw new Error("Target owner is not valid");
    }
  }

  const targetOwnerId = isSuperAdmin ? requestedOwnerId ?? user.id : user.id;

  const wantsInvoiceFeatureChange =
    data.salesInvoiceEnabled !== undefined || data.salesInvoicePrefix !== undefined;
  if (wantsInvoiceFeatureChange) {
    requirePermission(user, "manage_shop_invoice_feature");
  }
  const wantsQueueFeatureChange =
    data.queueTokenEnabled !== undefined || data.queueTokenPrefix !== undefined;
  if (wantsQueueFeatureChange) {
    requirePermission(user, "manage_shop_queue_feature");
  }

  await prisma.$transaction(async (tx) => {
    const shop = await tx.shop.create({
      data: {
        ownerId: targetOwnerId,
        name: data.name,
        address: data.address || "",
        phone: data.phone || "",
        businessType: data.businessType || "tea_stall",
        ...(data.salesInvoiceEnabled !== undefined
          ? { salesInvoiceEnabled: Boolean(data.salesInvoiceEnabled) }
          : {}),
        ...(data.salesInvoicePrefix !== undefined
          ? { salesInvoicePrefix: sanitizeSalesInvoicePrefix(data.salesInvoicePrefix) }
          : {}),
        ...(data.queueTokenEnabled !== undefined
          ? { queueTokenEnabled: Boolean(data.queueTokenEnabled) }
          : {}),
        ...(data.queueTokenPrefix !== undefined
          ? { queueTokenPrefix: sanitizeQueueTokenPrefix(data.queueTokenPrefix) }
          : {}),
      },
    });

    await createShopSubscription(tx, { id: shop.id, ownerId: shop.ownerId });
  });

  return { success: true };
}

// ------------------------------
// GET OWNER OPTIONS (SUPER ADMIN)
// ------------------------------
export async function getOwnerOptions() {
  const user = await getCurrentUser();
  const isSuperAdmin = user.roles?.includes("super_admin") ?? false;
  if (!isSuperAdmin) {
    throw new Error("Forbidden");
  }

  return prisma.user.findMany({
    where: { roles: { some: { name: "owner" } } },
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
}

// ------------------------------
// GET SHOPS BY USER
// ------------------------------
export async function getShopsByUser() {
  const user = await getCurrentUser();
  const isOwner = user.roles?.includes("owner");
  const isStaff = user.roles?.includes("staff");

  if (isStaff && !isOwner) {
    if (!user.staffShopId) return [];
    const shop = await prisma.shop.findUnique({
      where: { id: user.staffShopId },
    });
    return shop ? [shop] : [];
  }

  return prisma.shop.findMany({
    where: { ownerId: user.id },
  });
}

// ------------------------------
// GET SINGLE SHOP
// ------------------------------
export async function getShop(id: string) {
  const user = await getCurrentUser();
  return assertShopAccess(id, user);
}

// ------------------------------
// UPDATE SHOP
// ------------------------------
export async function updateShop(id: string, data: any) {
  const user = await getCurrentUser();
  const shop = await assertShopAccess(id, user);
  if (shop.ownerId !== user.id) {
    throw new Error("Unauthorized");
  }

  const updateData: Prisma.ShopUpdateInput = {
    ...(data.name !== undefined ? { name: data.name } : {}),
    ...(data.address !== undefined ? { address: data.address } : {}),
    ...(data.phone !== undefined ? { phone: data.phone } : {}),
    ...(data.businessType !== undefined ? { businessType: data.businessType } : {}),
    ...(data.closingTime !== undefined ? { closingTime: data.closingTime } : {}),
  };

  const wantsInvoiceFeatureChange =
    data.salesInvoiceEnabled !== undefined || data.salesInvoicePrefix !== undefined;
  if (wantsInvoiceFeatureChange) {
    requirePermission(user, "manage_shop_invoice_feature");
    if (data.salesInvoiceEnabled !== undefined) {
      updateData.salesInvoiceEnabled = Boolean(data.salesInvoiceEnabled);
    }
    if (data.salesInvoicePrefix !== undefined) {
      updateData.salesInvoicePrefix = sanitizeSalesInvoicePrefix(
        data.salesInvoicePrefix
      );
    }
  }
  const wantsQueueFeatureChange =
    data.queueTokenEnabled !== undefined || data.queueTokenPrefix !== undefined;
  if (wantsQueueFeatureChange) {
    requirePermission(user, "manage_shop_queue_feature");
    if (data.queueTokenEnabled !== undefined) {
      updateData.queueTokenEnabled = Boolean(data.queueTokenEnabled);
    }
    if (data.queueTokenPrefix !== undefined) {
      updateData.queueTokenPrefix = sanitizeQueueTokenPrefix(
        data.queueTokenPrefix
      );
    }
  }

  await prisma.shop.update({
    where: { id },
    data: updateData,
  });
  return { success: true };
}

// ------------------------------
// DELETE SHOP
// ------------------------------
export async function deleteShop(id: string) {
  const user = await getCurrentUser();
  const shop = await assertShopAccess(id, user);
  if (shop.ownerId !== user.id) {
    throw new Error("Unauthorized");
  }

  await prisma.$transaction(async (tx) => {
    const saleIds = await tx.sale.findMany({
      where: { shopId: id },
      select: { id: true },
    });
    const productIds = await tx.product.findMany({
      where: { shopId: id },
      select: { id: true },
    });
    const invoiceIds = await tx.invoice.findMany({
      where: { shopId: id },
      select: { id: true },
    });

    if (saleIds.length) {
      await tx.saleItem.deleteMany({
        where: { saleId: { in: saleIds.map((s) => s.id) } },
      });
    }
    if (productIds.length) {
      await tx.saleItem.deleteMany({
        where: { productId: { in: productIds.map((p) => p.id) } },
      });
    }

    await tx.customerLedger.deleteMany({ where: { shopId: id } });
    await tx.queueTokenItem.deleteMany({
      where: { token: { shopId: id } },
    });
    await tx.queueToken.deleteMany({ where: { shopId: id } });
    await tx.expense.deleteMany({ where: { shopId: id } });
    await tx.cashEntry.deleteMany({ where: { shopId: id } });
    await tx.sale.deleteMany({ where: { shopId: id } });
    await tx.customer.deleteMany({ where: { shopId: id } });
    await tx.product.deleteMany({ where: { shopId: id } });
    if (invoiceIds.length) {
      await tx.invoicePayment.deleteMany({
        where: { invoiceId: { in: invoiceIds.map((row) => row.id) } },
      });
    }
    await tx.invoice.deleteMany({ where: { shopId: id } });
    await tx.shopSubscription.deleteMany({ where: { shopId: id } });
    await tx.shop.delete({ where: { id } });
  });

  return { success: true };
}
