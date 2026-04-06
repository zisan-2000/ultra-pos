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
import { sanitizeSaleTaxLabel, sanitizeSaleTaxRate } from "@/lib/sales/tax";

async function getCurrentUser() {
  return requireUser();
}

function serializeShopForClient<T extends Record<string, any>>(shop: T): T {
  return {
    ...shop,
    taxRate:
      shop.taxRate === null || shop.taxRate === undefined
        ? shop.taxRate
        : shop.taxRate.toString(),
  };
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
  salesInvoiceEntitled?: boolean;
  salesInvoiceEnabled?: boolean;
  salesInvoicePrefix?: string | null;
  salesInvoicePrintSize?: string | null;
  queueTokenEntitled?: boolean;
  queueTokenEnabled?: boolean;
  queueTokenPrefix?: string | null;
  queueWorkflow?: string | null;
  discountFeatureEntitled?: boolean;
  discountEnabled?: boolean;
  taxFeatureEntitled?: boolean;
  taxEnabled?: boolean;
  taxLabel?: string | null;
  taxRate?: number | string | null;
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
      where: { ownerId: user.id, deletedAt: null },
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

  const wantsInvoiceEntitlementChange = data.salesInvoiceEntitled === true;
  if (wantsInvoiceEntitlementChange) {
    requirePermission(user, "manage_shop_invoice_entitlement");
  }
  const wantsInvoiceFeatureChange =
    data.salesInvoiceEnabled !== undefined ||
    data.salesInvoicePrefix !== undefined ||
    data.salesInvoicePrintSize !== undefined;
  if (wantsInvoiceFeatureChange) {
    requirePermission(user, "manage_shop_invoice_feature");
  }
  const wantsQueueEntitlementChange = data.queueTokenEntitled === true;
  if (wantsQueueEntitlementChange) {
    requirePermission(user, "manage_shop_queue_entitlement");
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
  const wantsTaxEntitlementChange = data.taxFeatureEntitled === true;
  if (wantsTaxEntitlementChange) {
    requirePermission(user, "manage_shop_tax_entitlement");
  }
  const wantsTaxFeatureChange =
    data.taxEnabled !== undefined ||
    data.taxLabel !== undefined ||
    data.taxRate !== undefined;
  if (wantsTaxFeatureChange) {
    requirePermission(user, "manage_shop_tax_feature");
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
  const resolvedSalesInvoiceEntitled = Boolean(data.salesInvoiceEntitled ?? false);
  const resolvedSalesInvoiceEnabled = Boolean(data.salesInvoiceEnabled ?? false);
  if (resolvedSalesInvoiceEnabled && !resolvedSalesInvoiceEntitled) {
    throw new Error(
      "Sales invoice cannot be enabled before super-admin entitlement is turned on"
    );
  }
  const resolvedQueueEntitled = Boolean(data.queueTokenEntitled ?? false);
  const resolvedQueueEnabled = Boolean(data.queueTokenEnabled ?? false);
  if (resolvedQueueEnabled && !resolvedQueueEntitled) {
    throw new Error(
      "Queue token cannot be enabled before super-admin entitlement is turned on"
    );
  }

  const resolvedBarcodeEntitled = Boolean(data.barcodeFeatureEntitled ?? false);
  const resolvedBarcodeScanEnabled = Boolean(data.barcodeScanEnabled ?? false);
  const resolvedDiscountEntitled = Boolean(data.discountFeatureEntitled ?? false);
  const resolvedDiscountEnabled = Boolean(data.discountEnabled ?? false);
  if (resolvedDiscountEnabled && !resolvedDiscountEntitled) {
    throw new Error(
      "Discount cannot be enabled before super-admin entitlement is turned on"
    );
  }
  const resolvedTaxEntitled = Boolean(data.taxFeatureEntitled ?? false);
  const resolvedTaxEnabled = Boolean(data.taxEnabled ?? false);
  const resolvedTaxLabel = sanitizeSaleTaxLabel(data.taxLabel);
  const resolvedTaxRate = sanitizeSaleTaxRate(data.taxRate);
  if (resolvedTaxEnabled && !resolvedTaxEntitled) {
    throw new Error(
      "VAT/Tax cannot be enabled before super-admin entitlement is turned on"
    );
  }
  if (resolvedTaxEnabled && resolvedTaxRate <= 0) {
    throw new Error("VAT/Tax rate must be greater than 0 to enable the feature");
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
      salesInvoiceEntitled: resolvedSalesInvoiceEntitled,
      salesInvoiceEnabled: resolvedSalesInvoiceEntitled
        ? resolvedSalesInvoiceEnabled
        : false,
      queueTokenEntitled: resolvedQueueEntitled,
      queueTokenEnabled: resolvedQueueEntitled ? resolvedQueueEnabled : false,
      discountFeatureEntitled: resolvedDiscountEntitled,
      discountEnabled: resolvedDiscountEntitled ? resolvedDiscountEnabled : false,
      taxFeatureEntitled: resolvedTaxEntitled,
      taxEnabled: resolvedTaxEntitled ? resolvedTaxEnabled : false,
      taxLabel:
        resolvedTaxEntitled && resolvedTaxEnabled ? resolvedTaxLabel : null,
      taxRate:
        resolvedTaxEntitled && resolvedTaxEnabled
          ? resolvedTaxRate.toFixed(2)
          : "0.00",
      barcodeFeatureEntitled: resolvedBarcodeEntitled,
      barcodeScanEnabled: resolvedBarcodeEntitled
        ? resolvedBarcodeScanEnabled
        : false,
      smsSummaryEntitled: resolvedSmsEntitled,
      smsSummaryEnabled: resolvedSmsEntitled ? resolvedSmsEnabled : false,
      ...(data.salesInvoicePrefix !== undefined
        ? { salesInvoicePrefix: sanitizeSalesInvoicePrefix(data.salesInvoicePrefix) }
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
    const shops = await prisma.shop.findMany({
      where: { deletedAt: null },
      include: { owner: { select: ownerSelect } },
      orderBy: [{ ownerId: "asc" }, { createdAt: "desc" }, { name: "asc" }],
    });
    return shops.map(serializeShopForClient);
  }

  if (isAssignedTeamMember && !isOwner) {
    if (!user.staffShopId) return [];
    const shop = await prisma.shop.findUnique({
      where: { id: user.staffShopId },
      include: { owner: { select: ownerSelect } },
    });
    return shop && !shop.deletedAt ? [serializeShopForClient(shop)] : [];
  }

  const shops = await prisma.shop.findMany({
    where: { ownerId: user.id, deletedAt: null },
    include: { owner: { select: ownerSelect } },
    orderBy: [{ createdAt: "desc" }, { name: "asc" }],
  });
  return shops.map(serializeShopForClient);
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

  const wantsInvoiceEntitlementChange = data.salesInvoiceEntitled !== undefined;
  if (wantsInvoiceEntitlementChange) {
    requirePermission(user, "manage_shop_invoice_entitlement");
    (updateData as any).salesInvoiceEntitled = Boolean(data.salesInvoiceEntitled);
  }

  const wantsInvoiceFeatureChange =
    data.salesInvoiceEnabled !== undefined ||
    data.salesInvoicePrefix !== undefined ||
    data.salesInvoicePrintSize !== undefined;
  if (wantsInvoiceFeatureChange) {
    requirePermission(user, "manage_shop_invoice_feature");
    if (data.salesInvoiceEnabled !== undefined) {
      const effectiveEntitlement =
        data.salesInvoiceEntitled !== undefined
          ? Boolean(data.salesInvoiceEntitled)
          : Boolean((shop as any).salesInvoiceEntitled);
      if (Boolean(data.salesInvoiceEnabled) && !effectiveEntitlement) {
        throw new Error(
          "Sales invoice cannot be enabled before super-admin entitlement is turned on"
        );
      }
      updateData.salesInvoiceEnabled = Boolean(data.salesInvoiceEnabled);
    }
    if (data.salesInvoicePrefix !== undefined) {
      updateData.salesInvoicePrefix = sanitizeSalesInvoicePrefix(
        data.salesInvoicePrefix
      );
    }
  }
  const wantsQueueEntitlementChange = data.queueTokenEntitled !== undefined;
  if (wantsQueueEntitlementChange) {
    requirePermission(user, "manage_shop_queue_entitlement");
    (updateData as any).queueTokenEntitled = Boolean(data.queueTokenEntitled);
  }
  const wantsQueueFeatureChange =
    data.queueTokenEnabled !== undefined ||
    data.queueTokenPrefix !== undefined ||
    data.queueWorkflow !== undefined;
  if (wantsQueueFeatureChange) {
    requirePermission(user, "manage_shop_queue_feature");
    if (data.queueTokenEnabled !== undefined) {
      const effectiveEntitlement =
        data.queueTokenEntitled !== undefined
          ? Boolean(data.queueTokenEntitled)
          : Boolean((shop as any).queueTokenEntitled);
      if (Boolean(data.queueTokenEnabled) && !effectiveEntitlement) {
        throw new Error(
          "Queue token cannot be enabled before super-admin entitlement is turned on"
        );
      }
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

  const wantsTaxEntitlementChange = data.taxFeatureEntitled !== undefined;
  if (wantsTaxEntitlementChange) {
    requirePermission(user, "manage_shop_tax_entitlement");
    (updateData as any).taxFeatureEntitled = Boolean(data.taxFeatureEntitled);
  }

  const wantsTaxFeatureChange =
    data.taxEnabled !== undefined ||
    data.taxLabel !== undefined ||
    data.taxRate !== undefined;
  if (wantsTaxFeatureChange) {
    requirePermission(user, "manage_shop_tax_feature");

    const effectiveEntitlement =
      data.taxFeatureEntitled !== undefined
        ? Boolean(data.taxFeatureEntitled)
        : Boolean((shop as any).taxFeatureEntitled);
    const effectiveEnabled =
      data.taxEnabled !== undefined
        ? Boolean(data.taxEnabled)
        : Boolean((shop as any).taxEnabled);
    const resolvedTaxLabel = sanitizeSaleTaxLabel(
      data.taxLabel !== undefined ? data.taxLabel : (shop as any).taxLabel
    );
    const resolvedTaxRate = sanitizeSaleTaxRate(
      data.taxRate !== undefined ? data.taxRate : (shop as any).taxRate
    );

    if (effectiveEnabled && !effectiveEntitlement) {
      throw new Error(
        "VAT/Tax cannot be enabled before super-admin entitlement is turned on"
      );
    }
    if (effectiveEnabled && resolvedTaxRate <= 0) {
      throw new Error("VAT/Tax rate must be greater than 0 to enable the feature");
    }

    if (data.taxEnabled !== undefined) {
      (updateData as any).taxEnabled = Boolean(data.taxEnabled);
    }
    if (data.taxLabel !== undefined || effectiveEnabled) {
      (updateData as any).taxLabel =
        effectiveEntitlement && effectiveEnabled ? resolvedTaxLabel : null;
    }
    if (data.taxRate !== undefined || effectiveEnabled) {
      (updateData as any).taxRate =
        effectiveEntitlement && effectiveEnabled
          ? resolvedTaxRate.toFixed(2)
          : "0.00";
    }
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
  if (
    data.salesInvoiceEntitled !== undefined &&
    !Boolean(data.salesInvoiceEntitled)
  ) {
    (updateData as any).salesInvoiceEnabled = false;
  }
  if (data.queueTokenEntitled !== undefined && !Boolean(data.queueTokenEntitled)) {
    (updateData as any).queueTokenEnabled = false;
  }
  if (data.discountFeatureEntitled !== undefined && !Boolean(data.discountFeatureEntitled)) {
    (updateData as any).discountEnabled = false;
  }
  if (data.taxFeatureEntitled !== undefined && !Boolean(data.taxFeatureEntitled)) {
    (updateData as any).taxEnabled = false;
    (updateData as any).taxLabel = null;
    (updateData as any).taxRate = "0.00";
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
    await tx.user.updateMany({
      where: { staffShopId: id },
      data: { staffShopId: null },
    });
    await tx.shop.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        smsSummaryEnabled: false,
        queueTokenEnabled: false,
      },
    });
  });

  return { success: true };
}
