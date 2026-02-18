"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { assertShopAccess } from "@/lib/shop-access";
import { requirePermission } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import {
  allocateQueueTokenNumber,
  canPrintQueueToken,
} from "@/lib/queue-token";
import {
  getQueueNextAction,
  normalizeQueueOrderType,
  getQueueStatusSortRank,
  normalizeQueueStatus,
  resolveQueueWorkflowProfile,
  type QueueCoreStatus,
} from "@/lib/queue-workflow";
import { createSale } from "@/app/actions/sales";
import {
  getDhakaDateString,
  parseDhakaDateOnlyRange,
  toDhakaBusinessDate,
} from "@/lib/dhaka-date";

type QueueProductOption = {
  id: string;
  name: string;
  sellPrice: string;
  trackStock: boolean;
  availableStock: string | null;
};

type QueueTokenItemInput = {
  productId: string;
  quantity: number;
};

function normalizeBusinessDateInput(value?: string | null) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  return getDhakaDateString();
}

function cleanOptionalText(value?: string | null, maxLength = 120) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function cleanPhone(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(/[^\d+]/g, "").slice(0, 20);
  return cleaned || null;
}

function normalizeQuantity(value: unknown) {
  const qty = Number(value ?? 0);
  if (!Number.isFinite(qty)) return 0;
  return Math.max(0, Math.round(qty * 100) / 100);
}

function normalizeTokenItems(items?: QueueTokenItemInput[] | null) {
  const map = new Map<string, number>();
  (items || []).forEach((item) => {
    const productId = (item.productId || "").trim();
    if (!productId) return;
    const qty = normalizeQuantity(item.quantity);
    if (qty <= 0) return;
    map.set(productId, (map.get(productId) || 0) + qty);
  });
  return Array.from(map.entries()).map(([productId, quantity]) => ({
    productId,
    quantity,
  }));
}

async function getReservedQuantityByProduct(
  shopId: string,
  productIds?: string[]
) {
  const reservedRows = await prisma.queueTokenItem.groupBy({
    by: ["productId"],
    where: {
      ...(productIds && productIds.length > 0
        ? { productId: { in: productIds } }
        : {}),
      token: {
        shopId,
        settledSaleId: null,
        status: {
          not: "CANCELLED",
        },
      },
    },
    _sum: {
      quantity: true,
    },
  });

  return new Map(
    reservedRows.map((row) => [row.productId, Number(row._sum.quantity || 0)])
  );
}

function buildStatusTimestampPatch(status: QueueCoreStatus, now: Date) {
  switch (status) {
    case "CALLED":
      return { calledAt: now };
    case "IN_PROGRESS":
      return { inKitchenAt: now };
    case "READY":
      return { readyAt: now };
    case "DONE":
      return { servedAt: now };
    case "CANCELLED":
      return { cancelledAt: now };
    default:
      return {};
  }
}

type QueueBoardSnapshot = {
  shop: {
    id: string;
    name: string;
    businessType: string | null;
    queueWorkflow: string | null;
    queueTokenEnabled: boolean;
    queueTokenPrefix: string | null;
  };
  businessDate: string;
  tokens: Array<{
    id: string;
    tokenNo: number;
    tokenLabel: string;
    orderType: string;
    customerName: string | null;
    customerPhone: string | null;
    note: string | null;
    totalAmount: string;
    status: string;
    settledSaleId: string | null;
    settledAt: Date | null;
    calledAt: Date | null;
    inKitchenAt: Date | null;
    readyAt: Date | null;
    servedAt: Date | null;
    cancelledAt: Date | null;
    items: Array<{
      id: string;
      productId: string;
      productName: string;
      quantity: string;
      unitPrice: string;
      lineTotal: string;
    }>;
    createdAt: Date;
    updatedAt: Date;
  }>;
};

export async function getQueueProductOptions(
  shopId: string
): Promise<QueueProductOption[]> {
  const user = await requireUser();
  requirePermission(user, "create_queue_token");
  await assertShopAccess(shopId, user);

  const products = await prisma.product.findMany({
    where: { shopId, isActive: true },
    select: {
      id: true,
      name: true,
      sellPrice: true,
      trackStock: true,
      stockQty: true,
    },
    orderBy: [{ name: "asc" }, { createdAt: "asc" }],
  });
  const reservedMap = await getReservedQuantityByProduct(
    shopId,
    products.map((product) => product.id)
  );

  return products.map((product) => ({
    id: product.id,
    name: product.name,
    sellPrice: product.sellPrice.toString(),
    trackStock: Boolean(product.trackStock),
    availableStock: product.trackStock
      ? Math.max(
          Number(product.stockQty || 0) - (reservedMap.get(product.id) || 0),
          0
        ).toFixed(2)
      : null,
  }));
}

export async function getQueueBoardSnapshot(
  shopId: string,
  businessDateInput?: string | null
): Promise<QueueBoardSnapshot> {
  const user = await requireUser();
  requirePermission(user, "view_queue_board");
  const shop = await assertShopAccess(shopId, user);
  const businessDate = normalizeBusinessDateInput(businessDateInput);
  const { start, end } = parseDhakaDateOnlyRange(
    businessDate,
    businessDate,
    true
  );

  const tokens = await prisma.queueToken.findMany({
    where: {
      shopId,
      businessDate: {
        gte: start,
        lte: end,
      },
    },
    select: {
      id: true,
      tokenNo: true,
      tokenLabel: true,
      orderType: true,
      customerName: true,
      customerPhone: true,
      note: true,
      totalAmount: true,
      status: true,
      settledSaleId: true,
      settledAt: true,
      calledAt: true,
      inKitchenAt: true,
      readyAt: true,
      servedAt: true,
      cancelledAt: true,
      items: {
        select: {
          id: true,
          productId: true,
          productNameSnapshot: true,
          quantity: true,
          unitPrice: true,
          lineTotal: true,
          product: {
            select: { name: true },
          },
        },
      },
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ tokenNo: "asc" }, { createdAt: "asc" }],
  });

  const sortedTokens = tokens.sort((a, b) => {
    const aRank = getQueueStatusSortRank(a.status);
    const bRank = getQueueStatusSortRank(b.status);
    if (aRank !== bRank) {
      return aRank - bRank;
    }
    return a.tokenNo - b.tokenNo;
  });

  return {
    shop: {
      id: shop.id,
      name: shop.name,
      businessType: (shop as any).businessType ?? null,
      queueWorkflow: (shop as any).queueWorkflow ?? null,
      queueTokenEnabled: Boolean((shop as any).queueTokenEnabled),
      queueTokenPrefix: (shop as any).queueTokenPrefix ?? null,
    },
    businessDate,
    tokens: sortedTokens.map((token) => ({
      id: token.id,
      tokenNo: token.tokenNo,
      tokenLabel: token.tokenLabel,
      orderType: token.orderType,
      customerName: token.customerName ?? null,
      customerPhone: token.customerPhone ?? null,
      note: token.note ?? null,
      totalAmount: token.totalAmount.toString(),
      status: normalizeQueueStatus(token.status),
      settledSaleId: token.settledSaleId ?? null,
      settledAt: token.settledAt ?? null,
      calledAt: token.calledAt ?? null,
      inKitchenAt: token.inKitchenAt ?? null,
      readyAt: token.readyAt ?? null,
      servedAt: token.servedAt ?? null,
      cancelledAt: token.cancelledAt ?? null,
      items: token.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName:
          item.productNameSnapshot || item.product?.name || "Unnamed product",
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        lineTotal: item.lineTotal.toString(),
      })),
      createdAt: token.createdAt,
      updatedAt: token.updatedAt,
    })),
  };
}

export async function createQueueToken(input: {
  shopId: string;
  orderType?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  note?: string | null;
  items?: QueueTokenItemInput[] | null;
}) {
  const user = await requireUser();
  requirePermission(user, "create_queue_token");
  const shop = await assertShopAccess(input.shopId, user);

  if (!(shop as any).queueTokenEnabled) {
    throw new Error("Queue token feature is disabled for this shop");
  }

  const workflowProfile = resolveQueueWorkflowProfile({
    queueWorkflow: (shop as any).queueWorkflow,
    businessType: (shop as any).businessType,
  });
  const now = new Date();
  const orderType = normalizeQueueOrderType(input.orderType, workflowProfile);
  const customerName = cleanOptionalText(input.customerName, 80);
  const customerPhone = cleanPhone(input.customerPhone);
  const note = cleanOptionalText(input.note, 200);
  const normalizedItems = normalizeTokenItems(input.items);

  if (normalizedItems.length === 0) {
    throw new Error("কমপক্ষে একটি আইটেম যোগ করতে হবে");
  }

  const productIds = normalizedItems.map((item) => item.productId);
  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      shopId: input.shopId,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      sellPrice: true,
      trackStock: true,
      stockQty: true,
    },
  });

  if (products.length !== productIds.length) {
    throw new Error("এক বা একাধিক পণ্য এই দোকানে সক্রিয় নেই");
  }

  const reservedMap = await getReservedQuantityByProduct(input.shopId, productIds);
  const productMap = new Map(products.map((product) => [product.id, product]));
  const itemRows = normalizedItems.map((item) => {
    const product = productMap.get(item.productId);
    if (!product) {
      throw new Error("পণ্য পাওয়া যায়নি");
    }
    if (product.trackStock) {
      const stockQty = Number(product.stockQty || 0);
      const reservedQty = reservedMap.get(product.id) || 0;
      const availableQty = Math.max(stockQty - reservedQty, 0);
      if (item.quantity - availableQty > 0.000001) {
        throw new Error(
          `"${product.name}" এর available stock ${availableQty.toFixed(
            2
          )}; এই মুহূর্তে token এ ${item.quantity.toFixed(2)} নেওয়া যাবে না`
        );
      }
    }
    const unitPrice = Number(product.sellPrice ?? 0);
    const lineTotal = Number((unitPrice * item.quantity).toFixed(2));
    return {
      productId: product.id,
      productNameSnapshot: product.name,
      quantity: item.quantity.toFixed(2),
      unitPrice: unitPrice.toFixed(2),
      lineTotal: lineTotal.toFixed(2),
    };
  });

  const totalAmount = itemRows
    .reduce((sum, row) => sum + Number(row.lineTotal), 0)
    .toFixed(2);

  const created = await prisma.$transaction(async (tx) => {
    const allocated = await allocateQueueTokenNumber(tx, input.shopId);
    const token = await tx.queueToken.create({
      data: {
        shopId: input.shopId,
        tokenNo: allocated.tokenNo,
        tokenLabel: allocated.tokenLabel,
        orderType,
        customerName,
        customerPhone,
        note,
        totalAmount,
        status: "WAITING",
        businessDate: toDhakaBusinessDate(now),
      },
      select: {
        id: true,
        tokenNo: true,
        tokenLabel: true,
        totalAmount: true,
      },
    });

    await tx.queueTokenItem.createMany({
      data: itemRows.map((row) => ({
        tokenId: token.id,
        productId: row.productId,
        productNameSnapshot: row.productNameSnapshot,
        quantity: row.quantity,
        unitPrice: row.unitPrice,
        lineTotal: row.lineTotal,
      })),
    });

    return token;
  });

  revalidatePath("/dashboard/queue");
  return {
    ...created,
    totalAmount: created.totalAmount.toString(),
  };
}

export async function callNextQueueToken(
  shopId: string,
  businessDateInput?: string | null
) {
  const user = await requireUser();
  requirePermission(user, "update_queue_token_status");
  const shop = await assertShopAccess(shopId, user);

  if (!(shop as any).queueTokenEnabled) {
    throw new Error("Queue token feature is disabled for this shop");
  }

  const businessDate = normalizeBusinessDateInput(businessDateInput);
  const { start, end } = parseDhakaDateOnlyRange(
    businessDate,
    businessDate,
    true
  );
  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const nextWaiting = await tx.queueToken.findFirst({
      where: {
        shopId,
        status: "WAITING",
        settledSaleId: null,
        businessDate: {
          gte: start,
          lte: end,
        },
      },
      orderBy: [{ tokenNo: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });

    if (!nextWaiting) {
      return null;
    }

    return tx.queueToken.update({
      where: { id: nextWaiting.id },
      data: {
        status: "CALLED",
        calledAt: now,
      },
      select: {
        id: true,
        tokenLabel: true,
      },
    });
  });

  revalidatePath("/dashboard/queue");
  return updated;
}

export async function updateQueueTokenStatus(input: {
  tokenId: string;
  status: string;
}) {
  const user = await requireUser();
  requirePermission(user, "update_queue_token_status");
  const status = normalizeQueueStatus(input.status);

  const existing = await prisma.queueToken.findUnique({
    where: { id: input.tokenId },
    select: {
      id: true,
      shopId: true,
      status: true,
      settledSaleId: true,
      shop: {
        select: {
          businessType: true,
        },
      },
    },
  });

  if (!existing) {
    throw new Error("Queue token not found");
  }

  await assertShopAccess(existing.shopId, user);
  if (existing.settledSaleId) {
    throw new Error("এই টোকেনের Sale ইতিমধ্যে সম্পন্ন হয়েছে");
  }
  const currentStatus = normalizeQueueStatus(existing.status);
  const workflow = resolveQueueWorkflowProfile({
    businessType: existing.shop.businessType,
  });
  const nextAction = getQueueNextAction(currentStatus, workflow);

  if (status === "CANCELLED") {
    if (currentStatus === "DONE" || currentStatus === "CANCELLED") {
      throw new Error("এই টোকেন আর বাতিল করা যাবে না");
    }
  } else if (!nextAction || nextAction.status !== status) {
    throw new Error("এই workflow-এ এই status change অনুমোদিত নয়");
  }
  const now = new Date();

  const updated = await prisma.queueToken.update({
    where: { id: existing.id },
    data: {
      status,
      ...buildStatusTimestampPatch(status, now),
    },
    select: {
      id: true,
      status: true,
    },
  });

  revalidatePath("/dashboard/queue");
  return updated;
}

export async function settleQueueTokenAsCashSale(input: {
  tokenId: string;
  note?: string | null;
}) {
  const user = await requireUser();
  requirePermission(user, "create_sale");

  const token = await prisma.queueToken.findUnique({
    where: { id: input.tokenId },
    select: {
      id: true,
      shopId: true,
      status: true,
      note: true,
      settledSaleId: true,
      items: {
        select: {
          productId: true,
          productNameSnapshot: true,
          quantity: true,
          unitPrice: true,
        },
      },
    },
  });

  if (!token) {
    throw new Error("Queue token not found");
  }

  await assertShopAccess(token.shopId, user);

  if (token.settledSaleId) {
    return {
      success: true,
      saleId: token.settledSaleId,
      alreadySettled: true,
    };
  }

  if (token.status === "CANCELLED") {
    throw new Error("Cancelled token থেকে Sale তৈরি করা যাবে না");
  }

  if (token.items.length === 0) {
    throw new Error("Token এ কোনো আইটেম নেই");
  }

  const sale = await createSale({
    shopId: token.shopId,
    items: token.items.map((item) => ({
      productId: item.productId,
      name: item.productNameSnapshot || "Item",
      unitPrice: Number(item.unitPrice ?? 0),
      qty: Number(item.quantity ?? 0),
    })),
    paymentMethod: "cash",
    note: cleanOptionalText(input.note, 200) || token.note || null,
  });

  const now = new Date();
  const updateResult = await prisma.queueToken.updateMany({
    where: {
      id: token.id,
      settledSaleId: null,
    },
    data: {
      settledSaleId: sale.saleId,
      settledAt: now,
      status: "DONE",
      servedAt: now,
    },
  });

  if (updateResult.count === 0) {
    const latest = await prisma.queueToken.findUnique({
      where: { id: token.id },
      select: { settledSaleId: true },
    });
    return {
      success: true,
      saleId: latest?.settledSaleId || sale.saleId,
      alreadySettled: true,
    };
  }

  revalidatePath("/dashboard/queue");
  return {
    success: true,
    saleId: sale.saleId,
    alreadySettled: false,
  };
}

export async function closeQueueBusinessDay(input: {
  shopId: string;
  businessDate?: string | null;
}) {
  const user = await requireUser();
  requirePermission(user, "update_queue_token_status");
  const shop = await assertShopAccess(input.shopId, user);

  if (!(shop as any).queueTokenEnabled) {
    throw new Error("Queue token feature is disabled for this shop");
  }

  const businessDate = normalizeBusinessDateInput(input.businessDate);
  const { start, end } = parseDhakaDateOnlyRange(
    businessDate,
    businessDate,
    true
  );

  const pending = await prisma.queueToken.findMany({
    where: {
      shopId: input.shopId,
      settledSaleId: null,
      status: { not: "CANCELLED" },
      businessDate: {
        gte: start,
        lte: end,
      },
    },
    select: {
      id: true,
      totalAmount: true,
    },
  });

  const pendingTotal = pending
    .reduce((sum, token) => sum + Number(token.totalAmount || 0), 0)
    .toFixed(2);

  if (pending.length === 0) {
    return {
      success: true,
      businessDate,
      pendingCount: 0,
      cancelledCount: 0,
      pendingTotal,
    };
  }

  const now = new Date();
  const updated = await prisma.queueToken.updateMany({
    where: {
      id: { in: pending.map((token) => token.id) },
      settledSaleId: null,
      status: { not: "CANCELLED" },
    },
    data: {
      status: "CANCELLED",
      cancelledAt: now,
    },
  });

  revalidatePath("/dashboard/queue");
  return {
    success: true,
    businessDate,
    pendingCount: pending.length,
    cancelledCount: updated.count,
    pendingTotal,
  };
}

export async function getQueueTokenPrintData(tokenId: string) {
  const user = await requireUser();
  if (!canPrintQueueToken(user)) {
    throw new Error("Forbidden: missing permission print_queue_token");
  }

  const token = await prisma.queueToken.findUnique({
    where: { id: tokenId },
    select: {
      id: true,
      shopId: true,
      tokenNo: true,
      tokenLabel: true,
      orderType: true,
      customerName: true,
      customerPhone: true,
      note: true,
      totalAmount: true,
      status: true,
      businessDate: true,
      settledSaleId: true,
      settledAt: true,
      createdAt: true,
      calledAt: true,
      inKitchenAt: true,
      readyAt: true,
      servedAt: true,
      cancelledAt: true,
      items: {
        select: {
          id: true,
          productId: true,
          productNameSnapshot: true,
          quantity: true,
          unitPrice: true,
          lineTotal: true,
          product: {
            select: { name: true },
          },
        },
      },
      shop: {
        select: {
          name: true,
          address: true,
          phone: true,
          businessType: true,
          queueWorkflow: true,
        },
      },
    },
  });

  if (!token) {
    throw new Error("Queue token not found");
  }

  await assertShopAccess(token.shopId, user);

  return {
    ...token,
    status: normalizeQueueStatus(token.status),
    customerName: token.customerName ?? null,
    customerPhone: token.customerPhone ?? null,
    note: token.note ?? null,
    totalAmount: token.totalAmount.toString(),
    settledSaleId: token.settledSaleId ?? null,
    settledAt: token.settledAt ?? null,
    items: token.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName:
        item.productNameSnapshot || item.product?.name || "Unnamed product",
      quantity: item.quantity.toString(),
      unitPrice: item.unitPrice.toString(),
      lineTotal: item.lineTotal.toString(),
    })),
  };
}
