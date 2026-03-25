// app/actions/shops.ts

"use server";

import { Prisma, type Prisma as PrismaTypes } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { assertShopAccess } from "@/lib/shop-access";
import { requirePermission } from "@/lib/rbac";
import { BILLING_CONFIG, DEFAULT_PLAN, addDays, addMonths } from "@/lib/billing";
import { sanitizeSalesInvoicePrefix } from "@/lib/sales-invoice";
import { sanitizeSalesInvoicePrintSize } from "@/lib/sales-invoice-print";
import { sanitizeQueueTokenPrefix } from "@/lib/queue-token";
import { sanitizeQueueWorkflow } from "@/lib/queue-workflow";

async function getCurrentUser() {
  return requireUser();
}

async function ensureDefaultPlan(tx: PrismaTypes.TransactionClient) {
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
  tx: PrismaTypes.TransactionClient,
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
  salesInvoicePrintSize?: string | null;
  queueTokenEnabled?: boolean;
  queueTokenPrefix?: string | null;
  queueWorkflow?: string | null;
  discountFeatureEntitled?: boolean;
  discountEnabled?: boolean;
  barcodeFeatureEntitled?: boolean;
  barcodeScanEnabled?: boolean;
  smsSummaryEntitled?: boolean;
  smsSummaryEnabled?: boolean;
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
    data.salesInvoiceEnabled !== undefined ||
    data.salesInvoicePrefix !== undefined ||
    data.salesInvoicePrintSize !== undefined;
  if (wantsInvoiceFeatureChange) {
    requirePermission(user, "manage_shop_invoice_feature");
  }
  const wantsQueueFeatureChange =
    data.queueTokenEnabled !== undefined ||
    data.queueTokenPrefix !== undefined ||
    data.queueWorkflow !== undefined;
  if (wantsQueueFeatureChange) {
    requirePermission(user, "manage_shop_queue_feature");
  }
  const wantsDiscountEntitlementChange = data.discountFeatureEntitled === true;
  if (wantsDiscountEntitlementChange) {
    requirePermission(user, "manage_shop_discount_entitlement");
  }
  const wantsDiscountFeatureChange = data.discountEnabled !== undefined;
  if (wantsDiscountFeatureChange) {
    requirePermission(user, "manage_shop_discount_feature");
  }

  const wantsBarcodeEntitlementChange = data.barcodeFeatureEntitled === true;
  if (wantsBarcodeEntitlementChange) {
    requirePermission(user, "manage_shop_barcode_entitlement");
  }
  const wantsBarcodeFeatureChange = data.barcodeScanEnabled !== undefined;
  if (wantsBarcodeFeatureChange) {
    requirePermission(user, "manage_shop_barcode_feature");
  }
  const wantsSmsEntitlementChange = data.smsSummaryEntitled === true;
  if (wantsSmsEntitlementChange) {
    requirePermission(user, "manage_shop_sms_entitlement");
  }
  const wantsSmsFeatureChange = data.smsSummaryEnabled !== undefined;
  if (wantsSmsFeatureChange) {
    requirePermission(user, "manage_shop_sms_feature");
  }
  const resolvedSalesInvoicePrintSize =
    data.salesInvoicePrintSize !== undefined
      ? sanitizeSalesInvoicePrintSize(data.salesInvoicePrintSize)
      : undefined;

  const resolvedBarcodeEntitled = Boolean(data.barcodeFeatureEntitled ?? false);
  const resolvedBarcodeScanEnabled = Boolean(data.barcodeScanEnabled ?? false);
  const resolvedDiscountEntitled = Boolean(data.discountFeatureEntitled ?? false);
  const resolvedDiscountEnabled = Boolean(data.discountEnabled ?? false);
  if (resolvedDiscountEnabled && !resolvedDiscountEntitled) {
    throw new Error(
      "Discount cannot be enabled before super-admin entitlement is turned on"
    );
  }
  if (resolvedBarcodeScanEnabled && !resolvedBarcodeEntitled) {
    throw new Error(
      "Barcode scan cannot be enabled before super-admin entitlement is turned on"
    );
  }
  const resolvedSmsEntitled = Boolean(data.smsSummaryEntitled ?? false);
  const resolvedSmsEnabled = Boolean(data.smsSummaryEnabled ?? false);
  if (resolvedSmsEnabled && !resolvedSmsEntitled) {
    throw new Error(
      "SMS summary cannot be enabled before super-admin entitlement is turned on"
    );
  }

  await prisma.$transaction(async (tx) => {
    const createData: any = {
      ownerId: targetOwnerId,
      name: data.name,
      address: data.address || "",
      phone: data.phone || "",
      businessType: data.businessType || "tea_stall",
      discountFeatureEntitled: resolvedDiscountEntitled,
      discountEnabled: resolvedDiscountEntitled ? resolvedDiscountEnabled : false,
      barcodeFeatureEntitled: resolvedBarcodeEntitled,
      barcodeScanEnabled: resolvedBarcodeEntitled
        ? resolvedBarcodeScanEnabled
        : false,
      smsSummaryEntitled: resolvedSmsEntitled,
      smsSummaryEnabled: resolvedSmsEntitled ? resolvedSmsEnabled : false,
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
      ...(data.queueWorkflow !== undefined
        ? { queueWorkflow: sanitizeQueueWorkflow(data.queueWorkflow) }
        : {}),
    };

    const shop = await tx.shop.create({
      data: createData,
    });

    if (resolvedSalesInvoicePrintSize !== undefined) {
      await tx.$executeRaw(
        Prisma.sql`
          UPDATE "shops"
          SET "sales_invoice_print_size" = ${resolvedSalesInvoicePrintSize}
          WHERE "id" = CAST(${shop.id} AS uuid)
        `
      );
    }

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
  const isSuperAdmin = user.roles?.includes("super_admin");
  const isOwner = user.roles?.includes("owner");
  const isAssignedTeamMember =
    user.roles?.includes("staff") || user.roles?.includes("manager");
  const ownerSelect = { id: true, name: true, email: true };

  if (isSuperAdmin) {
    return prisma.shop.findMany({
      include: { owner: { select: ownerSelect } },
      orderBy: [{ ownerId: "asc" }, { createdAt: "desc" }, { name: "asc" }],
    });
  }

  if (isAssignedTeamMember && !isOwner) {
    if (!user.staffShopId) return [];
    const shop = await prisma.shop.findUnique({
      where: { id: user.staffShopId },
      include: { owner: { select: ownerSelect } },
    });
    return shop ? [shop] : [];
  }

  return prisma.shop.findMany({
    where: { ownerId: user.id },
    include: { owner: { select: ownerSelect } },
    orderBy: [{ createdAt: "desc" }, { name: "asc" }],
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
  const isSuperAdmin = user.roles?.includes("super_admin") ?? false;
  if (!isSuperAdmin && shop.ownerId !== user.id) {
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
    data.salesInvoiceEnabled !== undefined ||
    data.salesInvoicePrefix !== undefined ||
    data.salesInvoicePrintSize !== undefined;
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
    data.queueTokenEnabled !== undefined ||
    data.queueTokenPrefix !== undefined ||
    data.queueWorkflow !== undefined;
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
    if (data.queueWorkflow !== undefined) {
      (updateData as any).queueWorkflow = sanitizeQueueWorkflow(data.queueWorkflow);
    }
  }

  const wantsDiscountEntitlementChange = data.discountFeatureEntitled !== undefined;
  if (wantsDiscountEntitlementChange) {
    requirePermission(user, "manage_shop_discount_entitlement");
    (updateData as any).discountFeatureEntitled = Boolean(data.discountFeatureEntitled);
  }

  const wantsDiscountFeatureChange = data.discountEnabled !== undefined;
  if (wantsDiscountFeatureChange) {
    requirePermission(user, "manage_shop_discount_feature");

    const effectiveEntitlement =
      data.discountFeatureEntitled !== undefined
        ? Boolean(data.discountFeatureEntitled)
        : Boolean((shop as any).discountFeatureEntitled);

    if (Boolean(data.discountEnabled) && !effectiveEntitlement) {
      throw new Error(
        "Discount cannot be enabled before super-admin entitlement is turned on"
      );
    }

    (updateData as any).discountEnabled = Boolean(data.discountEnabled);
  }

  const wantsBarcodeEntitlementChange = data.barcodeFeatureEntitled !== undefined;
  if (wantsBarcodeEntitlementChange) {
    requirePermission(user, "manage_shop_barcode_entitlement");
    (updateData as any).barcodeFeatureEntitled = Boolean(data.barcodeFeatureEntitled);
  }

  const wantsBarcodeFeatureChange = data.barcodeScanEnabled !== undefined;
  if (wantsBarcodeFeatureChange) {
    requirePermission(user, "manage_shop_barcode_feature");

    const effectiveEntitlement =
      data.barcodeFeatureEntitled !== undefined
        ? Boolean(data.barcodeFeatureEntitled)
        : Boolean((shop as any).barcodeFeatureEntitled);

    if (Boolean(data.barcodeScanEnabled) && !effectiveEntitlement) {
      throw new Error(
        "Barcode scan cannot be enabled before super-admin entitlement is turned on"
      );
    }

    (updateData as any).barcodeScanEnabled = Boolean(data.barcodeScanEnabled);
  }

  const wantsSmsEntitlementChange = data.smsSummaryEntitled !== undefined;
  if (wantsSmsEntitlementChange) {
    requirePermission(user, "manage_shop_sms_entitlement");
    (updateData as any).smsSummaryEntitled = Boolean(data.smsSummaryEntitled);
  }

  const wantsSmsFeatureChange = data.smsSummaryEnabled !== undefined;
  if (wantsSmsFeatureChange) {
    requirePermission(user, "manage_shop_sms_feature");

    const effectiveEntitlement =
      data.smsSummaryEntitled !== undefined
        ? Boolean(data.smsSummaryEntitled)
        : Boolean((shop as any).smsSummaryEntitled);

    if (Boolean(data.smsSummaryEnabled) && !effectiveEntitlement) {
      throw new Error(
        "SMS summary cannot be enabled before super-admin entitlement is turned on"
      );
    }

    (updateData as any).smsSummaryEnabled = Boolean(data.smsSummaryEnabled);
  }

  if (data.barcodeFeatureEntitled !== undefined && !Boolean(data.barcodeFeatureEntitled)) {
    (updateData as any).barcodeScanEnabled = false;
  }
  if (data.discountFeatureEntitled !== undefined && !Boolean(data.discountFeatureEntitled)) {
    (updateData as any).discountEnabled = false;
  }
  if (data.smsSummaryEntitled !== undefined && !Boolean(data.smsSummaryEntitled)) {
    (updateData as any).smsSummaryEnabled = false;
  }

  await prisma.shop.update({
    where: { id },
    data: updateData,
  });
  if (data.salesInvoicePrintSize !== undefined) {
    const resolvedSalesInvoicePrintSize = sanitizeSalesInvoicePrintSize(
      data.salesInvoicePrintSize
    );
    await prisma.$executeRaw(
      Prisma.sql`
        UPDATE "shops"
        SET "sales_invoice_print_size" = ${resolvedSalesInvoicePrintSize}
        WHERE "id" = CAST(${id} AS uuid)
      `
    );
  }
  return { success: true };
}

// ------------------------------
// DELETE SHOP
// ------------------------------
export async function deleteShop(id: string) {
  const user = await getCurrentUser();
  const shop = await assertShopAccess(id, user);
  const isSuperAdmin = user.roles?.includes("super_admin") ?? false;
  if (!isSuperAdmin && shop.ownerId !== user.id) {
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
