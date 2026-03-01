// app/actions/sales.ts

"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { requirePermission } from "@/lib/rbac";
import { assertShopAccess } from "@/lib/shop-access";
import { revalidatePath } from "next/cache";
import { publishRealtimeEvent } from "@/lib/realtime/publisher";
import { REALTIME_EVENTS } from "@/lib/realtime/events";
import { revalidateReportsForSale } from "@/lib/reports/revalidate";
import { shopNeedsCogs } from "@/lib/accounting/cogs";
import { parseDhakaDateOnlyRange, toDhakaBusinessDate } from "@/lib/dhaka-date";
import { validateBoundedReportRange } from "@/lib/reporting-config";
import {
  allocateSalesInvoiceNumber,
  canIssueSalesInvoice,
  canViewSalesInvoice,
} from "@/lib/sales-invoice";
import {
  allocateSaleReturnNumber,
  canManageSaleReturn,
  canViewSaleReturn,
} from "@/lib/sales-return";

const logPerf = (...args: unknown[]) => {
  if (process.env.NODE_ENV !== "production") {
    console.log(...args);
  }
};

type CartItemInput = {
  productId: string;
  name: string;
  unitPrice: number;
  qty: number;
};

type CreateSaleInput = {
  shopId: string;
  items: CartItemInput[];
  paymentMethod: string;
  note?: string | null;
  customerId?: string | null;
  paidNow?: number | null;
};

export type SaleCursor = {
  saleDate: string;
  id: string;
};

type SaleRow = {
  id: string;
  saleDate: Date;
  totalAmount: Prisma.Decimal | string;
  paymentMethod: string;
  invoiceNo?: string | null;
  status?: string | null;
  voidReason?: string | null;
  customerId?: string | null;
};

type SaleWithSummary = SaleRow & {
  itemCount: number;
  itemPreview: string;
  customerName: string | null;
  returnCount: number;
  refundCount: number;
  exchangeCount: number;
  returnNetAmount: string;
  lastReturnAt: string | null;
  latestReturnedPreview: string | null;
  latestExchangePreview: string | null;
};

type GetSalesByShopPaginatedInput = {
  shopId: string;
  limit?: number;
  cursor?: { saleDate: Date; id: string } | null;
  from?: string;
  to?: string;
};

type SaleReturnRowInput = {
  saleItemId: string;
  qty: number;
};

type SaleExchangeRowInput = {
  productId: string;
  qty: number;
  unitPrice?: number | null;
};

type SaleReturnSettlementMode = "cash" | "due";

type ProcessSaleReturnInput = {
  saleId: string;
  type: "refund" | "exchange";
  returnedItems: SaleReturnRowInput[];
  exchangeItems?: SaleExchangeRowInput[];
  settlementMode?: SaleReturnSettlementMode;
  reason?: string | null;
  note?: string | null;
};

type ReissueDueSaleItemInput = {
  productId: string;
  qty: number;
  unitPrice: number;
  name?: string | null;
};

type ReissueDueSaleInput = {
  originalSaleId: string;
  customerId: string;
  items: ReissueDueSaleItemInput[];
  paidNow?: number | null;
  note?: string | null;
  reason?: string | null;
};

type SaleReturnHistoryItem = {
  id: string;
  returnNo: string;
  type: "refund" | "exchange";
  status: "completed" | "canceled";
  reason: string | null;
  note: string | null;
  subtotal: string;
  exchangeSubtotal: string;
  netAmount: string;
  refundAmount: string;
  additionalCashInAmount: string;
  dueAdjustmentAmount: string;
  additionalDueAmount: string;
  createdAt: string;
  items: {
    id: string;
    saleItemId: string;
    productId: string;
    productName: string;
    quantity: string;
    unitPrice: string;
    lineTotal: string;
  }[];
  exchangeItems: {
    id: string;
    productId: string;
    productName: string;
    quantity: string;
    unitPrice: string;
    lineTotal: string;
  }[];
};

export type SaleReturnDraft = {
  sale: {
    id: string;
    shopId: string;
    saleDate: string;
    invoiceNo: string | null;
    paymentMethod: string;
    status: string;
    totalAmount: string;
    note: string | null;
    customer: { id: string; name: string; totalDue: string } | null;
  };
  returnableItems: {
    saleItemId: string;
    productId: string;
    productName: string;
    soldQty: string;
    returnedQty: string;
    maxReturnQty: string;
    unitPrice: string;
    lineTotal: string;
  }[];
  exchangeProducts: {
    id: string;
    name: string;
    sellPrice: string;
    stockQty: string;
    trackStock: boolean;
    isActive: boolean;
  }[];
  existingReturns: SaleReturnHistoryItem[];
  canManage: boolean;
};

export type DueSaleEditDraft = {
  sale: {
    id: string;
    shopId: string;
    invoiceNo: string | null;
    saleDate: string;
    status: string;
    paymentMethod: string;
    totalAmount: string;
    customer: { id: string; name: string; totalDue: string } | null;
    note: string | null;
  };
  items: {
    saleItemId: string;
    productId: string;
    productName: string;
    quantity: string;
    unitPrice: string;
    lineTotal: string;
  }[];
  completedReturnCount: number;
  partialPaidAtSale: string;
  outstandingDue: string;
  canReissue: boolean;
  blockingReason: string | null;
};

function toMoney(value: number) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.00";
  return num.toFixed(2);
}

function formatQtyCompact(value: unknown) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n - Math.round(n)) < 0.000001) return `${Math.round(n)}`;
  return n.toFixed(2).replace(/\.?0+$/, "");
}

function summarizePreviewLines(lines: string[], limit = 2) {
  const normalized = lines.filter(Boolean);
  if (normalized.length === 0) return null;
  if (normalized.length <= limit) return normalized.join(", ");
  return `${normalized.slice(0, limit).join(", ")} +${normalized.length - limit}`;
}

function toSafePositiveNumber(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

function roundMoney(value: number) {
  return Number(toMoney(value));
}

function assertSaleReturnPermission(user: Awaited<ReturnType<typeof requireUser>>) {
  if (!canManageSaleReturn(user)) {
    throw new Error("Forbidden: missing permission create_sale_return");
  }
}

function assertViewSaleReturnPermission(
  user: Awaited<ReturnType<typeof requireUser>>
) {
  if (!canViewSaleReturn(user)) {
    throw new Error("Forbidden: missing permission view_sale_return");
  }
}

async function attachSaleSummaries(
  rows: SaleRow[],
  shopId: string
): Promise<SaleWithSummary[]> {
  if (rows.length === 0) return [];

  const saleIds = rows.map((r) => r.id);

  const items = await prisma.saleItem.findMany({
    where: { saleId: { in: saleIds } },
    select: {
      saleId: true,
      quantity: true,
      productNameSnapshot: true,
      product: {
        select: { name: true },
      },
    },
  });

  const itemSummaryMap: Record<
    string,
    { count: number; names: string[] }
  > = {};

  for (const it of items) {
    const entry = itemSummaryMap[it.saleId] || { count: 0, names: [] };
    entry.count += 1;
    const itemName = it.productNameSnapshot || it.product?.name;
    if (entry.names.length < 3 && itemName) {
      entry.names.push(
        `${itemName} x${Number(it.quantity || 0)}`
      );
    }
    itemSummaryMap[it.saleId] = entry;
  }

  const customerIds = Array.from(
    new Set(rows.map((r) => r.customerId).filter(Boolean) as string[])
  );

  let customerMap: Record<string, string> = {};
  if (customerIds.length) {
    const cs = await prisma.customer.findMany({
      where: { shopId, id: { in: customerIds } },
      select: { id: true, name: true },
    });
    customerMap = Object.fromEntries(cs.map((c) => [c.id, c.name || ""]));
  }

  const returnAggRows = await prisma.saleReturn.groupBy({
    by: ["saleId"],
    where: {
      saleId: { in: saleIds },
      status: "completed",
    },
    _sum: { netAmount: true },
    _count: { _all: true },
    _max: { createdAt: true },
  });

  const returnTypeAggRows = await prisma.saleReturn.groupBy({
    by: ["saleId", "type"],
    where: {
      saleId: { in: saleIds },
      status: "completed",
    },
    _count: { _all: true },
  });

  const completedReturns = await prisma.saleReturn.findMany({
    where: {
      saleId: { in: saleIds },
      status: "completed",
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      saleId: true,
      items: {
        select: {
          quantity: true,
          productNameSnapshot: true,
          product: { select: { name: true } },
        },
      },
      exchangeItems: {
        select: {
          quantity: true,
          productNameSnapshot: true,
          product: { select: { name: true } },
        },
      },
    },
  });

  const returnSummaryBySaleId = new Map<
    string,
    { count: number; netAmount: string; lastReturnAt: string | null }
  >();
  const returnTypeSummaryBySaleId = new Map<
    string,
    { refundCount: number; exchangeCount: number }
  >();
  const latestReturnPreviewBySaleId = new Map<
    string,
    { returnedPreview: string | null; exchangePreview: string | null }
  >();

  for (const row of returnAggRows) {
    returnSummaryBySaleId.set(row.saleId, {
      count: Number(row._count._all ?? 0),
      netAmount: toMoney(Number(row._sum.netAmount ?? 0)),
      lastReturnAt: row._max.createdAt?.toISOString() ?? null,
    });
  }

  for (const row of returnTypeAggRows) {
    const current = returnTypeSummaryBySaleId.get(row.saleId) ?? {
      refundCount: 0,
      exchangeCount: 0,
    };
    const count = Number(row._count._all ?? 0);
    if (row.type === "refund") {
      current.refundCount += count;
    } else if (row.type === "exchange") {
      current.exchangeCount += count;
    }
    returnTypeSummaryBySaleId.set(row.saleId, current);
  }

  for (const row of completedReturns) {
    if (latestReturnPreviewBySaleId.has(row.saleId)) continue;
    const returnedLines = row.items.map((it) => {
      const name = it.productNameSnapshot || it.product?.name || "Unnamed";
      return `${name} x${formatQtyCompact(it.quantity)}`;
    });
    const exchangeLines = row.exchangeItems.map((it) => {
      const name = it.productNameSnapshot || it.product?.name || "Unnamed";
      return `${name} x${formatQtyCompact(it.quantity)}`;
    });
    latestReturnPreviewBySaleId.set(row.saleId, {
      returnedPreview: summarizePreviewLines(returnedLines),
      exchangePreview: summarizePreviewLines(exchangeLines),
    });
  }

  return rows.map((r) => {
    const summary = itemSummaryMap[r.id] || { count: 0, names: [] };
    const returnSummary = returnSummaryBySaleId.get(r.id);
    const returnTypeSummary = returnTypeSummaryBySaleId.get(r.id);
    const latestReturnPreview = latestReturnPreviewBySaleId.get(r.id);
    return {
      ...r,
      itemCount: summary.count,
      itemPreview: summary.names.join(", "),
      customerName: r.customerId ? customerMap[r.customerId] : null,
      returnCount: returnSummary?.count ?? 0,
      refundCount: returnTypeSummary?.refundCount ?? 0,
      exchangeCount: returnTypeSummary?.exchangeCount ?? 0,
      returnNetAmount: returnSummary?.netAmount ?? "0.00",
      lastReturnAt: returnSummary?.lastReturnAt ?? null,
      latestReturnedPreview: latestReturnPreview?.returnedPreview ?? null,
      latestExchangePreview: latestReturnPreview?.exchangePreview ?? null,
    };
  });
}

async function getReturnedQtyBySaleItemId(
  saleId: string,
  tx?: Prisma.TransactionClient
) {
  const db = tx ?? prisma;
  const rows = await db.saleReturnItem.findMany({
    where: {
      saleReturn: {
        saleId,
        status: "completed",
      },
    },
    select: {
      saleItemId: true,
      quantity: true,
    },
  });

  const returnedBySaleItem = new Map<string, number>();
  for (const row of rows) {
    const qty = Number(row.quantity ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    returnedBySaleItem.set(
      row.saleItemId,
      (returnedBySaleItem.get(row.saleItemId) ?? 0) + qty
    );
  }
  return returnedBySaleItem;
}

async function getSaleReturnHistoryBySale(
  saleId: string
): Promise<SaleReturnHistoryItem[]> {
  const rows = await prisma.saleReturn.findMany({
    where: { saleId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      items: {
        orderBy: { id: "asc" },
        include: {
          product: { select: { name: true } },
        },
      },
      exchangeItems: {
        orderBy: { id: "asc" },
        include: {
          product: { select: { name: true } },
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    returnNo: row.returnNo,
    type: row.type,
    status: row.status,
    reason: row.reason ?? null,
    note: row.note ?? null,
    subtotal: row.subtotal.toString(),
    exchangeSubtotal: row.exchangeSubtotal.toString(),
    netAmount: row.netAmount.toString(),
    refundAmount: row.refundAmount.toString(),
    additionalCashInAmount: row.additionalCashInAmount.toString(),
    dueAdjustmentAmount: row.dueAdjustmentAmount.toString(),
    additionalDueAmount: row.additionalDueAmount.toString(),
    createdAt: row.createdAt.toISOString(),
    items: row.items.map((item) => ({
      id: item.id,
      saleItemId: item.saleItemId,
      productId: item.productId,
      productName: item.productNameSnapshot || item.product?.name || "Unnamed",
      quantity: item.quantity.toString(),
      unitPrice: item.unitPrice.toString(),
      lineTotal: item.lineTotal.toString(),
    })),
    exchangeItems: row.exchangeItems.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productNameSnapshot || item.product?.name || "Unnamed",
      quantity: item.quantity.toString(),
      unitPrice: item.unitPrice.toString(),
      lineTotal: item.lineTotal.toString(),
    })),
  }));
}

export async function getSaleReturnDraft(
  saleId: string
): Promise<SaleReturnDraft> {
  const user = await requireUser();
  assertViewSaleReturnPermission(user);

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: {
      id: true,
      shopId: true,
      saleDate: true,
      invoiceNo: true,
      paymentMethod: true,
      status: true,
      totalAmount: true,
      note: true,
      customer: {
        select: {
          id: true,
          name: true,
          totalDue: true,
        },
      },
      saleItems: {
        orderBy: { id: "asc" },
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
    },
  });

  if (!sale) {
    throw new Error("Sale not found");
  }
  await assertShopAccess(sale.shopId, user);

  const [returnedMap, exchangeProducts, existingReturns] = await Promise.all([
    getReturnedQtyBySaleItemId(sale.id),
    prisma.product.findMany({
      where: { shopId: sale.shopId, isActive: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        sellPrice: true,
        stockQty: true,
        trackStock: true,
        isActive: true,
      },
      take: 300,
    }),
    getSaleReturnHistoryBySale(sale.id),
  ]);

  return {
    sale: {
      id: sale.id,
      shopId: sale.shopId,
      saleDate: sale.saleDate.toISOString(),
      invoiceNo: sale.invoiceNo ?? null,
      paymentMethod: sale.paymentMethod,
      status: sale.status,
      totalAmount: sale.totalAmount.toString(),
      note: sale.note ?? null,
      customer: sale.customer
        ? {
            id: sale.customer.id,
            name: sale.customer.name,
            totalDue: sale.customer.totalDue.toString(),
          }
        : null,
    },
    returnableItems: sale.saleItems.map((item) => {
      const soldQty = Number(item.quantity ?? 0);
      const returnedQty = returnedMap.get(item.id) ?? 0;
      const maxReturnQty = Math.max(0, soldQty - returnedQty);
      return {
        saleItemId: item.id,
        productId: item.productId,
        productName:
          item.productNameSnapshot || item.product?.name || "Unnamed product",
        soldQty: toMoney(soldQty),
        returnedQty: toMoney(returnedQty),
        maxReturnQty: toMoney(maxReturnQty),
        unitPrice: item.unitPrice.toString(),
        lineTotal: item.lineTotal.toString(),
      };
    }),
    exchangeProducts: exchangeProducts.map((row) => ({
      id: row.id,
      name: row.name,
      sellPrice: row.sellPrice.toString(),
      stockQty: row.stockQty.toString(),
      trackStock: row.trackStock,
      isActive: row.isActive,
    })),
    existingReturns,
    canManage: canManageSaleReturn(user),
  };
}

export async function getDueSaleEditDraft(
  saleId: string
): Promise<DueSaleEditDraft> {
  const user = await requireUser();
  requirePermission(user, "view_sales");
  requirePermission(user, "create_sale");
  requirePermission(user, "create_due_sale");
  requirePermission(user, "view_customers");

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: {
      id: true,
      shopId: true,
      invoiceNo: true,
      saleDate: true,
      status: true,
      paymentMethod: true,
      totalAmount: true,
      note: true,
      customer: {
        select: {
          id: true,
          name: true,
          totalDue: true,
        },
      },
      saleItems: {
        orderBy: { id: "asc" },
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
    },
  });

  if (!sale) {
    throw new Error("Sale not found");
  }
  await assertShopAccess(sale.shopId, user);

  if ((sale.paymentMethod || "").toLowerCase() !== "due") {
    throw new Error("Only due sales can be edited via reissue flow");
  }

  const completedReturnCount = await prisma.saleReturn.count({
    where: { saleId: sale.id, status: "completed" },
  });

  const partialCashAgg = await prisma.cashEntry.aggregate({
    where: {
      shopId: sale.shopId,
      entryType: "IN",
      reason: `Partial cash received for due sale #${sale.id}`,
    },
    _sum: { amount: true },
  });

  const partialPaidAtSale = roundMoney(Number(partialCashAgg._sum.amount ?? 0));
  const saleTotal = roundMoney(Number(sale.totalAmount ?? 0));
  const outstandingDue = roundMoney(Math.max(0, saleTotal - partialPaidAtSale));
  const isVoided = (sale.status || "").toUpperCase() === "VOIDED";
  const canReissue = !isVoided && completedReturnCount === 0;

  let blockingReason: string | null = null;
  if (isVoided) {
    blockingReason = "This sale is already voided";
  } else if (completedReturnCount > 0) {
    blockingReason =
      "This sale already has return/exchange records. Reissue edit is locked.";
  }

  return {
    sale: {
      id: sale.id,
      shopId: sale.shopId,
      invoiceNo: sale.invoiceNo ?? null,
      saleDate: sale.saleDate.toISOString(),
      status: sale.status,
      paymentMethod: sale.paymentMethod,
      totalAmount: sale.totalAmount.toString(),
      customer: sale.customer
        ? {
            id: sale.customer.id,
            name: sale.customer.name,
            totalDue: sale.customer.totalDue.toString(),
          }
        : null,
      note: sale.note ?? null,
    },
    items: sale.saleItems.map((item) => ({
      saleItemId: item.id,
      productId: item.productId,
      productName:
        item.productNameSnapshot || item.product?.name || "Unnamed product",
      quantity: item.quantity.toString(),
      unitPrice: item.unitPrice.toString(),
      lineTotal: item.lineTotal.toString(),
    })),
    completedReturnCount,
    partialPaidAtSale: toMoney(partialPaidAtSale),
    outstandingDue: toMoney(outstandingDue),
    canReissue,
    blockingReason,
  };
}

export async function reissueDueSale(input: ReissueDueSaleInput) {
  const user = await requireUser();
  requirePermission(user, "view_sales");
  requirePermission(user, "create_sale");
  requirePermission(user, "create_due_sale");

  const originalSaleId = (input.originalSaleId || "").toString().trim();
  if (!originalSaleId) {
    throw new Error("Original sale is required");
  }

  const originalSale = await prisma.sale.findUnique({
    where: { id: originalSaleId },
    select: {
      id: true,
      shopId: true,
      paymentMethod: true,
      status: true,
      customerId: true,
      totalAmount: true,
    },
  });

  if (!originalSale) {
    throw new Error("Original sale not found");
  }
  await assertShopAccess(originalSale.shopId, user);

  if ((originalSale.paymentMethod || "").toLowerCase() !== "due") {
    throw new Error("Only due sales can be reissued");
  }
  if ((originalSale.status || "").toUpperCase() === "VOIDED") {
    throw new Error("This due sale is already voided");
  }

  const completedReturnCount = await prisma.saleReturn.count({
    where: { saleId: originalSale.id, status: "completed" },
  });
  if (completedReturnCount > 0) {
    throw new Error("Cannot reissue a sale that already has return/exchange history");
  }

  const customerId = (input.customerId || "").toString().trim();
  if (!customerId) {
    throw new Error("Customer is required for due reissue");
  }

  const normalizedItems = new Map<
    string,
    { qty: number; unitPrice: number; name: string }
  >();
  for (const row of input.items || []) {
    const productId = (row?.productId || "").toString().trim();
    const qty = toSafePositiveNumber(row?.qty);
    const unitPrice = Number(row?.unitPrice ?? 0);
    if (!productId || qty <= 0) continue;
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error("Invalid unit price in reissue items");
    }
    const existing = normalizedItems.get(productId);
    const safeName = (row?.name || "").toString().trim();
    if (!existing) {
      normalizedItems.set(productId, {
        qty,
        unitPrice: roundMoney(unitPrice),
        name: safeName,
      });
      continue;
    }
    if (existing.unitPrice !== roundMoney(unitPrice)) {
      throw new Error("Duplicate product with different unit price is not allowed");
    }
    normalizedItems.set(productId, {
      qty: existing.qty + qty,
      unitPrice: existing.unitPrice,
      name: existing.name || safeName,
    });
  }

  if (normalizedItems.size === 0) {
    throw new Error("At least one valid item is required for reissue");
  }

  const items = Array.from(normalizedItems.entries()).map(([productId, row]) => ({
    productId,
    name: row.name || "Reissued item",
    unitPrice: roundMoney(row.unitPrice),
    qty: row.qty,
  }));

  const replacementTotal = roundMoney(
    items.reduce((sum, row) => sum + row.qty * row.unitPrice, 0)
  );
  const paidNowRaw = Number(input.paidNow ?? 0);
  const paidNow = Math.min(Math.max(paidNowRaw, 0), replacementTotal);

  const reason =
    (input.reason || "").toString().trim() ||
    `Due sale reissue correction for #${originalSale.id}`;

  await voidSale(originalSale.id, reason);

  const reissueNote = [input.note?.toString().trim() || "", `Reissue of sale #${originalSale.id}`]
    .filter(Boolean)
    .join(" | ");

  try {
    const created = await createSale({
      shopId: originalSale.shopId,
      items,
      paymentMethod: "due",
      customerId,
      paidNow,
      note: reissueNote || null,
    });

    revalidatePath("/dashboard/sales");
    revalidatePath(`/dashboard/sales/${originalSale.id}/invoice`);
    revalidatePath(`/dashboard/sales/${created.saleId}/invoice`);
    revalidatePath("/dashboard/due");
    revalidatePath("/dashboard/cash");
    revalidatePath("/dashboard/reports");

    return {
      success: true,
      oldSaleId: originalSale.id,
      saleId: created.saleId,
      invoiceNo: created.invoiceNo ?? null,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error while creating replacement sale";
    throw new Error(
      `Original due sale was voided successfully, but replacement sale creation failed: ${message}`
    );
  }
}

// ------------------------------
// CREATE SALE
// ------------------------------
export async function createSale(input: CreateSaleInput) {
  const startTime = Date.now();
  logPerf("🚀 [PERF] createSale started at:", new Date().toISOString());

  // Add connection warmup for Neon (reduce cold start)
  // Multiple warmups for Vercel serverless environment
  try {
    await prisma.$queryRaw`SELECT 1`;
    await prisma.$queryRaw`SELECT 2`;
    await prisma.$queryRaw`SELECT 3`;
    await prisma.$queryRaw`SELECT 4`;
    await prisma.$queryRaw`SELECT 5`;
  } catch (e) {
    // Ignore warmup errors
  }
  const warmupTime = Date.now();
  logPerf(`🔥 [PERF] DB warmup took: ${warmupTime - startTime}ms`);

  const user = await requireUser();
  requirePermission(user, "create_sale");
  const shop = await assertShopAccess(input.shopId, user);
  const shouldIssueSalesInvoice = canIssueSalesInvoice(
    user,
    (shop as any).salesInvoiceEnabled
  );
  const needsCogs = await shopNeedsCogs(input.shopId);

  const authTime = Date.now();
  logPerf(`🔐 [PERF] Auth checks took: ${authTime - warmupTime}ms`);

  if (!input.items || input.items.length === 0) {
    throw new Error("Cart is empty");
  }

  let dueCustomer: { id: string } | null = null;
  if (input.paymentMethod === "due") {
    requirePermission(user, "create_due_sale");
    if (!input.customerId) {
      throw new Error("Select a customer for due sale");
    }

    const c = await prisma.customer.findFirst({
      where: { id: input.customerId },
      select: { id: true, shopId: true },
    });

    if (!c || c.shopId !== input.shopId) {
      throw new Error("Customer not found for this shop");
    }

    dueCustomer = { id: c.id };
  }

  // Product IDs
  const productIds = input.items.map((i) => i.productId);
  logPerf(
    `📦 [DEBUG] Processing ${input.items.length} items, ${productIds.length} products`
  );

  const dbProducts = await prisma.product.findMany({
    where: { id: { in: productIds } },
  });

  const dbTime = Date.now();
  logPerf(
    `💾 [PERF] DB product fetch took: ${dbTime - authTime}ms for ${dbProducts.length} products`
  );

  if (dbProducts.length !== productIds.length) {
    throw new Error("Some products not found");
  }

  const productMap = new Map(dbProducts.map((p) => [p.id, p]));

  // Validate each item
  let computedTotal = 0;

  for (const item of input.items) {
    const p = productMap.get(item.productId);

    if (!p) throw new Error("Product not found");

    if (p.shopId !== input.shopId) {
      throw new Error("Product does not belong to this shop");
    }

    if (!p.isActive) {
      throw new Error("Inactive product in cart");
    }

    computedTotal += item.unitPrice * item.qty;
  }

  if (needsCogs) {
    const missing = dbProducts.filter((p) => p.buyPrice == null);
    if (missing.length > 0) {
      const names = missing.map((p) => p.name).slice(0, 5).join(", ");
      throw new Error(
        `Purchase price missing for: ${names}${
          missing.length > 5 ? "..." : ""
        }. Set buy price to ensure accurate profit.`
      );
    }
  }

  const totalStr = computedTotal.toFixed(2); // numeric as string
  const normalizedPaymentMethod = (input.paymentMethod || "cash").toLowerCase();
  const totalNum = Number(totalStr);
  const payNowRaw = Number(input.paidNow || 0);
  const payNow = Math.min(Math.max(payNowRaw, 0), totalNum);
  const cashCollected =
    normalizedPaymentMethod === "cash"
      ? totalNum
      : normalizedPaymentMethod === "due" && payNow > 0
      ? payNow
      : null;
  const saleTimestamp = new Date();

  const createdSale = await prisma.$transaction(async (tx) => {
    const transactionStart = Date.now();
    logPerf(`🔄 [PERF] Transaction started at: ${new Date().toISOString()}`);

    // Pre-calculate stock changes for O(1) lookup
    const stockMap = new Map<string, number>();
    input.items.forEach(item => {
      const current = stockMap.get(item.productId) || 0;
      stockMap.set(item.productId, current + item.qty);
    });

    const issuedInvoice = shouldIssueSalesInvoice
      ? await allocateSalesInvoiceNumber(tx, input.shopId, saleTimestamp)
      : null;

    // Create sale first
    const inserted = await tx.sale.create({
      data: {
        shopId: input.shopId,
        customerId: input.customerId || null,
        totalAmount: totalStr,
        paymentMethod: input.paymentMethod || "cash",
        note: input.note || null,
        invoiceNo: issuedInvoice?.invoiceNo ?? null,
        invoiceIssuedAt: issuedInvoice?.issuedAt ?? null,
        saleDate: saleTimestamp,
        businessDate: toDhakaBusinessDate(saleTimestamp),
      },
      select: { id: true, invoiceNo: true },
    });

    const cashCollected =
      normalizedPaymentMethod === "cash"
        ? totalStr
        : normalizedPaymentMethod === "due" && payNow > 0
        ? payNow.toFixed(2)
        : null;

    // Create sale items
    const saleItemRows = input.items.map((item) => {
      const product = productMap.get(item.productId);
      const costAtSale = product?.buyPrice ?? null;
      return {
        saleId: inserted.id,
        productId: item.productId,
        productNameSnapshot: item.name || product?.name || null,
        quantity: item.qty.toString(),
        unitPrice: item.unitPrice.toFixed(2),
        costAtSale,
        lineTotal: (item.qty * item.unitPrice).toFixed(2),
      };
    });
    await tx.saleItem.createMany({ data: saleItemRows });

    // Create cash entry if needed
    if (cashCollected) {
      await tx.cashEntry.create({
        data: {
          shopId: input.shopId,
          entryType: "IN",
          amount: cashCollected,
          reason:
            normalizedPaymentMethod === "due"
              ? `Partial cash received for due sale #${inserted.id}`
              : `Cash sale #${inserted.id}`,
          businessDate: toDhakaBusinessDate(saleTimestamp),
        },
      });
    }

    // Update stock atomically with non-negative guard
    logPerf(`📊 [DEBUG] Starting stock updates for ${dbProducts.length} products`);
    let stockUpdateCount = 0;
    
    for (const p of dbProducts) {
      const soldQty = stockMap.get(p.id) || 0;
      if (soldQty > 0 && p.trackStock !== false) {
        const soldQtyDecimal = new Prisma.Decimal(soldQty.toFixed(2));
        
        const singleUpdateStart = Date.now();
        const updated = await tx.product.updateMany({
          where: {
            id: p.id,
            trackStock: true,
            stockQty: { gte: soldQtyDecimal },
          },
          data: {
            stockQty: { decrement: soldQtyDecimal },
          },
        });
        if (updated.count !== 1) {
          throw new Error(`Insufficient stock for product "${p.name}"`);
        }
        const singleUpdateEnd = Date.now();
        
        stockUpdateCount++;
        logPerf(
          `🔄 [DEBUG] Stock update ${stockUpdateCount}/${dbProducts.length}: ${singleUpdateEnd - singleUpdateStart}ms for product ${p.id}`
        );
      }
    }
    
    logPerf(`📈 [DEBUG] Total stock updates: ${stockUpdateCount} products updated`);

    // Handle due customer
    if (dueCustomer) {
      const dueAmount = Number((totalNum - payNow).toFixed(2));

      await tx.customerLedger.create({
        data: {
          shopId: input.shopId,
          customerId: dueCustomer.id,
          entryType: "SALE",
          amount: totalStr,
          description: input.note || "Due sale",
          entryDate: saleTimestamp,
          businessDate: toDhakaBusinessDate(saleTimestamp),
        },
      });

      if (payNow > 0) {
        await tx.customerLedger.create({
          data: {
            shopId: input.shopId,
            customerId: dueCustomer.id,
            entryType: "PAYMENT",
            amount: payNow.toFixed(2),
            description: "Partial payment at sale",
            entryDate: saleTimestamp,
            businessDate: toDhakaBusinessDate(saleTimestamp),
          },
        });
      }

      const current = await tx.customer.findUnique({
        where: { id: dueCustomer.id },
        select: { totalDue: true },
      });
      
      const currentDue = new Prisma.Decimal(current?.totalDue ?? 0);
      const newDue = currentDue.add(new Prisma.Decimal(dueAmount));

      await tx.customer.update({
        where: { id: dueCustomer.id },
        data: {
          totalDue: newDue.toFixed(2),
          lastPaymentAt: payNow > 0 ? new Date() : null,
        },
      });
    }

    const transactionEnd = Date.now();
    logPerf(
      `⏱️ [PERF] Transaction completed in: ${transactionEnd - transactionStart}ms`
    );

    return {
      saleId: inserted.id,
      invoiceNo: inserted.invoiceNo ?? null,
    };
  });

  // Move revalidate outside transaction for better performance
  // Revalidate paths in parallel (non-blocking)
  Promise.all([
    revalidatePath("/dashboard"),
    revalidatePath("/dashboard/sales"),
    revalidatePath("/dashboard/reports"),
    revalidatePath("/dashboard/cash"),
    revalidatePath("/dashboard/products"),
  ]).catch(err => console.warn("Revalidation failed:", err));
  revalidateReportsForSale();

  const totalTime = Date.now() - startTime;
  logPerf(`🎯 [PERF] TOTAL createSale time: ${totalTime}ms`);
  logPerf(
    `📊 [PERF] Breakdown: Warmup(${warmupTime - startTime}ms) + Auth(${authTime - warmupTime}ms) + DB(${dbTime - authTime}ms) + Transaction (see above)`
  );

  const publishTasks: Promise<void>[] = [];
  publishTasks.push(
    publishRealtimeEvent(REALTIME_EVENTS.saleCommitted, input.shopId, {
      saleId: createdSale.saleId,
      totalAmount: totalNum,
      paymentMethod: normalizedPaymentMethod,
      invoiceNo: createdSale.invoiceNo,
    })
  );

  if (cashCollected) {
    publishTasks.push(
      publishRealtimeEvent(REALTIME_EVENTS.cashUpdated, input.shopId, {
        amount: cashCollected,
        entryType: "IN",
      })
    );
  }

  const uniqueProductIds = Array.from(
    new Set(input.items.map((item) => item.productId))
  );
  if (uniqueProductIds.length > 0) {
    publishTasks.push(
      publishRealtimeEvent(REALTIME_EVENTS.stockUpdated, input.shopId, {
        productIds: uniqueProductIds,
      })
    );
  }

  if (dueCustomer) {
    publishTasks.push(
      publishRealtimeEvent(REALTIME_EVENTS.ledgerUpdated, input.shopId, {
        customerId: dueCustomer.id,
      })
    );
  }

  await Promise.all(publishTasks);

  return {
    success: true,
    saleId: createdSale.saleId,
    invoiceNo: createdSale.invoiceNo,
  };
}

export async function getSaleReturnHistory(saleId: string) {
  const user = await requireUser();
  assertViewSaleReturnPermission(user);

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: { id: true, shopId: true },
  });

  if (!sale) {
    throw new Error("Sale not found");
  }
  await assertShopAccess(sale.shopId, user);
  return getSaleReturnHistoryBySale(saleId);
}

export async function processSaleReturn(input: ProcessSaleReturnInput) {
  const user = await requireUser();
  assertSaleReturnPermission(user);

  const saleScope = await prisma.sale.findUnique({
    where: { id: input.saleId },
    select: { id: true, shopId: true },
  });
  if (!saleScope) {
    throw new Error("Sale not found");
  }
  await assertShopAccess(saleScope.shopId, user);

  const normalizedType = input.type === "exchange" ? "exchange" : "refund";
  const reason = (input.reason || "").toString().trim() || null;
  const note = (input.note || "").toString().trim() || null;

  const returnRequestMap = new Map<string, number>();
  for (const row of input.returnedItems || []) {
    const saleItemId = (row?.saleItemId || "").toString().trim();
    const qty = toSafePositiveNumber(row?.qty);
    if (!saleItemId || qty <= 0) continue;
    returnRequestMap.set(saleItemId, (returnRequestMap.get(saleItemId) ?? 0) + qty);
  }
  if (returnRequestMap.size === 0) {
    throw new Error("At least one returned item quantity is required");
  }

  const exchangeRequestMap = new Map<
    string,
    { qty: number; unitPrice: number | null }
  >();
  for (const row of input.exchangeItems || []) {
    const productId = (row?.productId || "").toString().trim();
    const qty = toSafePositiveNumber(row?.qty);
    if (!productId || qty <= 0) continue;

    const unitPriceRaw = row?.unitPrice;
    const unitPrice =
      unitPriceRaw === null || unitPriceRaw === undefined
        ? null
        : Number(unitPriceRaw);
    const normalizedPrice =
      unitPrice !== null && Number.isFinite(unitPrice) && unitPrice >= 0
        ? roundMoney(unitPrice)
        : null;

    const current = exchangeRequestMap.get(productId);
    if (!current) {
      exchangeRequestMap.set(productId, { qty, unitPrice: normalizedPrice });
      continue;
    }
    if (
      current.unitPrice !== null &&
      normalizedPrice !== null &&
      current.unitPrice !== normalizedPrice
    ) {
      throw new Error("Exchange item unit price must be consistent per product");
    }
    exchangeRequestMap.set(productId, {
      qty: current.qty + qty,
      unitPrice: current.unitPrice ?? normalizedPrice,
    });
  }

  if (normalizedType === "refund" && exchangeRequestMap.size > 0) {
    throw new Error("Refund cannot include exchange products");
  }
  if (normalizedType === "exchange" && exchangeRequestMap.size === 0) {
    throw new Error("Exchange requires at least one replacement product");
  }

  const result = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const businessDate = toDhakaBusinessDate(now);
    const sale = await tx.sale.findUnique({
      where: { id: input.saleId },
      select: {
        id: true,
        shopId: true,
        customerId: true,
        paymentMethod: true,
        status: true,
        saleItems: {
          select: {
            id: true,
            productId: true,
            productNameSnapshot: true,
            quantity: true,
            unitPrice: true,
            costAtSale: true,
            product: {
              select: {
                id: true,
                name: true,
                buyPrice: true,
                stockQty: true,
                trackStock: true,
                isActive: true,
              },
            },
          },
        },
        customer: {
          select: {
            id: true,
            totalDue: true,
          },
        },
      },
    });

    if (!sale) {
      throw new Error("Sale not found");
    }
    if ((sale.status || "").toUpperCase() === "VOIDED") {
      throw new Error("Voided sale cannot be returned");
    }

    const previouslyReturnedByItem = await getReturnedQtyBySaleItemId(sale.id, tx);
    const saleItemsById = new Map(sale.saleItems.map((row) => [row.id, row]));

    const returnRows: Array<{
      saleItemId: string;
      productId: string;
      productNameSnapshot: string | null;
      quantity: string;
      unitPrice: string;
      lineTotal: string;
      costAtReturn: string | null;
    }> = [];

    const returnStockByProduct = new Map<string, number>();
    let returnedSubtotal = 0;

    for (const [saleItemId, qty] of returnRequestMap.entries()) {
      const saleItem = saleItemsById.get(saleItemId);
      if (!saleItem) {
        throw new Error("Invalid sale item in return request");
      }
      const soldQty = Number(saleItem.quantity ?? 0);
      const alreadyReturned = previouslyReturnedByItem.get(saleItemId) ?? 0;
      const maxReturnQty = Math.max(0, soldQty - alreadyReturned);
      if (qty > maxReturnQty + 1e-9) {
        throw new Error(
          `Return qty exceeds remaining quantity for ${
            saleItem.productNameSnapshot || saleItem.product?.name || saleItemId
          }`
        );
      }

      const unitPrice = Number(saleItem.unitPrice ?? 0);
      const lineTotal = roundMoney(unitPrice * qty);
      returnedSubtotal += lineTotal;

      const costAtReturnRaw =
        saleItem.costAtSale ?? saleItem.product?.buyPrice ?? null;
      returnRows.push({
        saleItemId,
        productId: saleItem.productId,
        productNameSnapshot:
          saleItem.productNameSnapshot || saleItem.product?.name || null,
        quantity: toMoney(qty),
        unitPrice: toMoney(unitPrice),
        lineTotal: toMoney(lineTotal),
        costAtReturn:
          costAtReturnRaw === null || costAtReturnRaw === undefined
            ? null
            : toMoney(Number(costAtReturnRaw)),
      });

      if (saleItem.product?.trackStock) {
        returnStockByProduct.set(
          saleItem.productId,
          (returnStockByProduct.get(saleItem.productId) ?? 0) + qty
        );
      }
    }

    if (returnRows.length === 0) {
      throw new Error("No valid return rows found");
    }

    const exchangeProducts = exchangeRequestMap.size
      ? await tx.product.findMany({
          where: { id: { in: Array.from(exchangeRequestMap.keys()) } },
          select: {
            id: true,
            shopId: true,
            name: true,
            sellPrice: true,
            buyPrice: true,
            stockQty: true,
            trackStock: true,
            isActive: true,
          },
        })
      : [];
    const exchangeProductById = new Map(exchangeProducts.map((row) => [row.id, row]));

    const exchangeRows: Array<{
      productId: string;
      productNameSnapshot: string | null;
      quantity: string;
      unitPrice: string;
      lineTotal: string;
      costAtReturn: string | null;
    }> = [];
    const exchangeStockByProduct = new Map<string, number>();
    let exchangeSubtotal = 0;

    for (const [productId, requested] of exchangeRequestMap.entries()) {
      const product = exchangeProductById.get(productId);
      if (!product) {
        throw new Error("Invalid exchange product");
      }
      if (product.shopId !== sale.shopId) {
        throw new Error("Exchange product does not belong to this shop");
      }
      if (!product.isActive) {
        throw new Error(`Inactive exchange product: ${product.name}`);
      }

      const unitPrice =
        requested.unitPrice !== null ? requested.unitPrice : Number(product.sellPrice ?? 0);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new Error(`Invalid exchange unit price for ${product.name}`);
      }
      const lineTotal = roundMoney(unitPrice * requested.qty);
      exchangeSubtotal += lineTotal;

      exchangeRows.push({
        productId,
        productNameSnapshot: product.name || null,
        quantity: toMoney(requested.qty),
        unitPrice: toMoney(unitPrice),
        lineTotal: toMoney(lineTotal),
        costAtReturn:
          product.buyPrice === null || product.buyPrice === undefined
            ? null
            : toMoney(Number(product.buyPrice)),
      });

      if (product.trackStock) {
        exchangeStockByProduct.set(
          productId,
          (exchangeStockByProduct.get(productId) ?? 0) + requested.qty
        );
      }
    }

    const subtotalRounded = roundMoney(returnedSubtotal);
    const exchangeRounded = roundMoney(exchangeSubtotal);
    const netAmount = roundMoney(exchangeRounded - subtotalRounded);

    let refundAmount = 0;
    let additionalCashInAmount = 0;
    let dueAdjustmentAmount = 0;
    let additionalDueAmount = 0;

    if (netAmount < 0) {
      const refundNeeded = roundMoney(Math.abs(netAmount));
      if (sale.customerId && sale.customer) {
        const currentDue = Number(sale.customer.totalDue ?? 0);
        dueAdjustmentAmount = roundMoney(Math.min(currentDue, refundNeeded));
        refundAmount = roundMoney(refundNeeded - dueAdjustmentAmount);
      } else {
        refundAmount = refundNeeded;
      }
    } else if (netAmount > 0) {
      const wantsDueSettlement = input.settlementMode === "due";
      const isDueSale = (sale.paymentMethod || "").toLowerCase() === "due";
      if (wantsDueSettlement && !sale.customerId) {
        throw new Error("Due settlement requires a customer-linked sale");
      }

      if ((wantsDueSettlement || isDueSale) && sale.customerId) {
        additionalDueAmount = roundMoney(netAmount);
      } else {
        additionalCashInAmount = roundMoney(netAmount);
      }
    }

    const numbering = await allocateSaleReturnNumber(tx, sale.shopId, now);

    const createdReturn = await tx.saleReturn.create({
      data: {
        shopId: sale.shopId,
        saleId: sale.id,
        returnNo: numbering.returnNo,
        type: normalizedType,
        status: "completed",
        reason,
        note,
        subtotal: toMoney(subtotalRounded),
        exchangeSubtotal: toMoney(exchangeRounded),
        netAmount: toMoney(netAmount),
        refundAmount: toMoney(refundAmount),
        additionalCashInAmount: toMoney(additionalCashInAmount),
        dueAdjustmentAmount: toMoney(dueAdjustmentAmount),
        additionalDueAmount: toMoney(additionalDueAmount),
        businessDate,
        createdByUserId: user.id,
      },
      select: {
        id: true,
        returnNo: true,
      },
    });

    await tx.saleReturnItem.createMany({
      data: returnRows.map((row) => ({
        saleReturnId: createdReturn.id,
        saleItemId: row.saleItemId,
        productId: row.productId,
        productNameSnapshot: row.productNameSnapshot,
        quantity: row.quantity,
        unitPrice: row.unitPrice,
        lineTotal: row.lineTotal,
        costAtReturn: row.costAtReturn,
      })),
    });

    if (exchangeRows.length > 0) {
      await tx.saleReturnExchangeItem.createMany({
        data: exchangeRows.map((row) => ({
          saleReturnId: createdReturn.id,
          productId: row.productId,
          productNameSnapshot: row.productNameSnapshot,
          quantity: row.quantity,
          unitPrice: row.unitPrice,
          lineTotal: row.lineTotal,
          costAtReturn: row.costAtReturn,
        })),
      });
    }

    for (const [productId, qty] of returnStockByProduct.entries()) {
      await tx.product.updateMany({
        where: { id: productId, trackStock: true },
        data: {
          stockQty: { increment: new Prisma.Decimal(toMoney(qty)) },
        },
      });
    }

    for (const [productId, qty] of exchangeStockByProduct.entries()) {
      const updated = await tx.product.updateMany({
        where: {
          id: productId,
          trackStock: true,
          stockQty: { gte: new Prisma.Decimal(toMoney(qty)) },
        },
        data: {
          stockQty: { decrement: new Prisma.Decimal(toMoney(qty)) },
        },
      });
      if (updated.count !== 1) {
        const productName = exchangeProductById.get(productId)?.name || productId;
        throw new Error(`Insufficient stock for exchange product "${productName}"`);
      }
    }

    if (refundAmount > 0) {
      await tx.cashEntry.create({
        data: {
          shopId: sale.shopId,
          entryType: "OUT",
          amount: toMoney(refundAmount),
          reason: `Sale return ${createdReturn.returnNo} refund`,
          businessDate,
        },
      });
    }

    if (additionalCashInAmount > 0) {
      await tx.cashEntry.create({
        data: {
          shopId: sale.shopId,
          entryType: "IN",
          amount: toMoney(additionalCashInAmount),
          reason: `Sale exchange ${createdReturn.returnNo} adjustment`,
          businessDate,
        },
      });
    }

    if (sale.customerId && (dueAdjustmentAmount > 0 || additionalDueAmount > 0)) {
      const customer = await tx.customer.findUnique({
        where: { id: sale.customerId },
        select: { id: true, totalDue: true },
      });
      if (!customer) {
        throw new Error("Customer not found for due adjustment");
      }

      if (dueAdjustmentAmount > 0) {
        await tx.customerLedger.create({
          data: {
            shopId: sale.shopId,
            customerId: customer.id,
            entryType: "PAYMENT",
            amount: toMoney(dueAdjustmentAmount),
            description: `Sale return ${createdReturn.returnNo} adjustment`,
            entryDate: now,
            businessDate,
          },
        });
      }

      if (additionalDueAmount > 0) {
        await tx.customerLedger.create({
          data: {
            shopId: sale.shopId,
            customerId: customer.id,
            entryType: "SALE",
            amount: toMoney(additionalDueAmount),
            description: `Sale exchange ${createdReturn.returnNo} additional due`,
            entryDate: now,
            businessDate,
          },
        });
      }

      const currentDue = Number(customer.totalDue ?? 0);
      const nextDue = Math.max(
        0,
        roundMoney(currentDue - dueAdjustmentAmount + additionalDueAmount)
      );

      await tx.customer.update({
        where: { id: customer.id },
        data: {
          totalDue: toMoney(nextDue),
          ...(dueAdjustmentAmount > 0 ? { lastPaymentAt: now } : {}),
        },
      });
    }

    const affectedProductIds = Array.from(
      new Set([
        ...returnRows.map((row) => row.productId),
        ...exchangeRows.map((row) => row.productId),
      ])
    );

    return {
      id: createdReturn.id,
      returnNo: createdReturn.returnNo,
      shopId: sale.shopId,
      saleId: sale.id,
      customerId: sale.customerId,
      subtotal: subtotalRounded,
      exchangeSubtotal: exchangeRounded,
      netAmount,
      refundAmount,
      additionalCashInAmount,
      dueAdjustmentAmount,
      additionalDueAmount,
      affectedProductIds,
    };
  });

  await Promise.all([
    publishRealtimeEvent(REALTIME_EVENTS.saleReturned, result.shopId, {
      saleId: result.saleId,
      returnId: result.id,
      returnNo: result.returnNo,
      netAmount: result.netAmount,
    }),
    ...(result.refundAmount > 0
      ? [
          publishRealtimeEvent(REALTIME_EVENTS.cashUpdated, result.shopId, {
            amount: result.refundAmount,
            entryType: "OUT",
          }),
        ]
      : []),
    ...(result.additionalCashInAmount > 0
      ? [
          publishRealtimeEvent(REALTIME_EVENTS.cashUpdated, result.shopId, {
            amount: result.additionalCashInAmount,
            entryType: "IN",
          }),
        ]
      : []),
    ...(result.affectedProductIds.length > 0
      ? [
          publishRealtimeEvent(REALTIME_EVENTS.stockUpdated, result.shopId, {
            productIds: result.affectedProductIds,
          }),
        ]
      : []),
    ...(result.customerId
      ? [
          publishRealtimeEvent(REALTIME_EVENTS.ledgerUpdated, result.shopId, {
            customerId: result.customerId,
          }),
        ]
      : []),
  ]);

  revalidateReportsForSale();
  revalidatePath("/dashboard/sales");
  revalidatePath(`/dashboard/sales/${result.saleId}/invoice`);
  revalidatePath("/dashboard/reports");
  revalidatePath("/dashboard/cash");
  revalidatePath("/dashboard/due");
  revalidatePath("/dashboard/products");

  return {
    success: true,
    returnId: result.id,
    returnNo: result.returnNo,
    subtotal: toMoney(result.subtotal),
    exchangeSubtotal: toMoney(result.exchangeSubtotal),
    netAmount: toMoney(result.netAmount),
    refundAmount: toMoney(result.refundAmount),
    additionalCashInAmount: toMoney(result.additionalCashInAmount),
    dueAdjustmentAmount: toMoney(result.dueAdjustmentAmount),
    additionalDueAmount: toMoney(result.additionalDueAmount),
  };
}

// ------------------------------
// GET SALES BY SHOP
// ------------------------------
export async function getSalesByShop(shopId: string) {
  const user = await requireUser();
  requirePermission(user, "view_sales");
  const showInvoiceNo = canViewSalesInvoice(user);
  await assertShopAccess(shopId, user);

  const rows = await prisma.sale.findMany({
    where: { shopId },
    select: {
      id: true,
      saleDate: true,
      totalAmount: true,
      paymentMethod: true,
      status: true,
      voidReason: true,
      customerId: true,
      ...(showInvoiceNo ? { invoiceNo: true } : {}),
    },
    orderBy: [{ saleDate: "desc" }, { id: "desc" }],
  });

  return attachSaleSummaries(rows, shopId);
}

// ------------------------------
// GET SALES BY SHOP (CURSOR PAGINATION)
// ------------------------------
export async function getSalesByShopPaginated({
  shopId,
  limit = 12,
  cursor,
  from,
  to,
}: GetSalesByShopPaginatedInput) {
  const user = await requireUser();
  requirePermission(user, "view_sales");
  const showInvoiceNo = canViewSalesInvoice(user);
  await assertShopAccess(shopId, user);

  const safeLimit = Math.max(1, Math.min(limit, 100));

  const where: Prisma.SaleWhereInput = { shopId };
  const validatedRange = validateBoundedReportRange(from, to);
  const { start, end } = parseDhakaDateOnlyRange(
    validatedRange.from,
    validatedRange.to,
    true
  );
  where.businessDate = {
    ...(start ? { gte: start } : {}),
    ...(end ? { lte: end } : {}),
  };

  if (cursor) {
    where.AND = [
      {
        OR: [
          { saleDate: { lt: cursor.saleDate } },
          { saleDate: cursor.saleDate, id: { lt: cursor.id } },
        ],
      },
    ];
  }

  const rows = await prisma.sale.findMany({
    where,
    select: {
      id: true,
      saleDate: true,
      totalAmount: true,
      paymentMethod: true,
      status: true,
      voidReason: true,
      customerId: true,
      ...(showInvoiceNo ? { invoiceNo: true } : {}),
    },
    orderBy: [{ saleDate: "desc" }, { id: "desc" }],
    take: safeLimit + 1,
  });

  const hasMore = rows.length > safeLimit;
  const pageRows = rows.slice(0, safeLimit);
  const items = await attachSaleSummaries(pageRows, shopId);

  const last = pageRows[pageRows.length - 1];
  const nextCursor: SaleCursor | null =
    hasMore && last
      ? { saleDate: last.saleDate.toISOString(), id: last.id }
      : null;

  return {
    items,
    nextCursor,
    hasMore,
  };
}

type SaleInvoiceItem = {
  id: string;
  productId: string;
  productName: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
};

type SaleInvoiceDetails = {
  saleId: string;
  shopId: string;
  shopName: string;
  shopAddress: string | null;
  shopPhone: string | null;
  invoiceNo: string;
  invoiceIssuedAt: string;
  saleDate: string;
  businessDate: string | null;
  paymentMethod: string;
  note: string | null;
  totalAmount: string;
  status: string;
  voidReason: string | null;
  customer: {
    id: string;
    name: string;
    phone: string | null;
    address: string | null;
  } | null;
  items: SaleInvoiceItem[];
};

export async function getSaleInvoiceDetails(
  saleId: string
): Promise<SaleInvoiceDetails> {
  const user = await requireUser();
  if (!canViewSalesInvoice(user)) {
    throw new Error("Forbidden: missing permission view_sales_invoice");
  }

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: {
      id: true,
      shopId: true,
      saleDate: true,
      businessDate: true,
      totalAmount: true,
      paymentMethod: true,
      note: true,
      status: true,
      voidReason: true,
      invoiceNo: true,
      invoiceIssuedAt: true,
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          address: true,
        },
      },
      shop: {
        select: {
          id: true,
          name: true,
          address: true,
          phone: true,
        },
      },
      saleItems: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          productId: true,
          productNameSnapshot: true,
          quantity: true,
          unitPrice: true,
          lineTotal: true,
          product: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  if (!sale) {
    throw new Error("Sale not found");
  }
  await assertShopAccess(sale.shopId, user);

  if (!sale.invoiceNo) {
    throw new Error("Invoice not issued for this sale");
  }

  return {
    saleId: sale.id,
    shopId: sale.shopId,
    shopName: sale.shop.name,
    shopAddress: sale.shop.address ?? null,
    shopPhone: sale.shop.phone ?? null,
    invoiceNo: sale.invoiceNo,
    invoiceIssuedAt: (sale.invoiceIssuedAt ?? sale.saleDate).toISOString(),
    saleDate: sale.saleDate.toISOString(),
    businessDate: sale.businessDate ? sale.businessDate.toISOString() : null,
    paymentMethod: sale.paymentMethod,
    note: sale.note ?? null,
    totalAmount: sale.totalAmount.toString(),
    status: sale.status,
    voidReason: sale.voidReason ?? null,
    customer: sale.customer
      ? {
          id: sale.customer.id,
          name: sale.customer.name,
          phone: sale.customer.phone ?? null,
          address: sale.customer.address ?? null,
        }
      : null,
    items: sale.saleItems.map((item) => ({
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

// ------------------------------
// SALES SUMMARY (count + total)
// ------------------------------
export async function getSalesSummary({
  shopId,
  from,
  to,
}: {
  shopId: string;
  from?: string;
  to?: string;
}) {
  const user = await requireUser();
  requirePermission(user, "view_sales");
  await assertShopAccess(shopId, user);

  const where: Prisma.SaleWhereInput = {
    shopId,
    status: { not: "VOIDED" },
  };

  const validatedRange = validateBoundedReportRange(from, to);
  const { start, end } = parseDhakaDateOnlyRange(
    validatedRange.from,
    validatedRange.to,
    true
  );
  where.businessDate = {
    ...(start ? { gte: start } : {}),
    ...(end ? { lte: end } : {}),
  };

  const agg = await prisma.sale.aggregate({
    where,
    _sum: { totalAmount: true },
    _count: { _all: true },
  });

  const returnAgg = await prisma.saleReturn.aggregate({
    where: {
      shopId,
      status: "completed",
      businessDate: {
        ...(start ? { gte: start } : {}),
        ...(end ? { lte: end } : {}),
      },
    },
    _sum: { netAmount: true },
  });

  return {
    totalAmount: (
      Number(agg._sum.totalAmount ?? 0) + Number(returnAgg._sum.netAmount ?? 0)
    ).toFixed(2),
    count: agg._count._all ?? 0,
  };
}

// ------------------------------
// VOID SALE (supports cash + due with guarded reversal)
// ------------------------------
export async function voidSale(saleId: string, reason?: string | null) {
  const user = await requireUser();
  requirePermission(user, "create_sale");

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    include: { shop: true },
  });

  if (!sale) {
    throw new Error("Sale not found");
  }

  await assertShopAccess(sale.shopId, user);

  if ((sale as any).status === "VOIDED") {
    return { success: true, alreadyVoided: true };
  }

  const paymentMethod = (sale.paymentMethod || "").toLowerCase();
  const isCashSale = paymentMethod === "cash";
  const isDueSale = paymentMethod === "due";
  const voidTimestamp = new Date();
  const voidBusinessDate = toDhakaBusinessDate(voidTimestamp);

  const txResult = await prisma.$transaction(async (tx) => {
    // Idempotency + race guard: claim void once.
    const claimed = await tx.sale.updateMany({
      where: {
        id: saleId,
        status: { not: "VOIDED" },
      },
      data: {
        status: "VOIDED",
        voidReason: reason || null,
        voidAt: voidTimestamp,
        voidByUserId: user.id,
      } as any,
    });
    if (claimed.count !== 1) {
      return {
        alreadyVoided: true as const,
        affectedProductIds: [] as string[],
        cashOutAmount: 0,
      };
    }

    let affectedProductIds: string[] = [];
    let cashOutAmount = 0;

    // Restore stock for tracked products
    const saleItems = await tx.saleItem.findMany({
      where: { saleId },
      include: {
        product: true,
      },
    });
    affectedProductIds = saleItems.map((it: any) => it.productId);

    for (const it of saleItems as any[]) {
      const p = it.product;
      if (!p || p.trackStock === false) continue;

      const qty = Number(it.quantity || 0);
      if (!Number.isFinite(qty) || qty === 0) continue;
      const qtyDecimal = new Prisma.Decimal(qty.toFixed(2));

      await tx.product.update({
        where: { id: p.id },
        data: {
          stockQty: { increment: qtyDecimal },
        },
      });
    }

    if (isCashSale) {
      cashOutAmount = roundMoney(Number(sale.totalAmount ?? 0));
      await tx.cashEntry.create({
        data: {
          shopId: sale.shopId,
          entryType: "OUT",
          amount: toMoney(cashOutAmount),
          reason: `Reversal of sale #${sale.id}`,
          businessDate: voidBusinessDate,
        },
      });
    }

    if (isDueSale) {
      if (!sale.customerId) {
        throw new Error("Due sale is missing customer link");
      }

      const customer = await tx.customer.findUnique({
        where: { id: sale.customerId },
        select: { id: true, totalDue: true },
      });
      if (!customer) {
        throw new Error("Customer not found for due sale void");
      }

      const partialCashAgg = await tx.cashEntry.aggregate({
        where: {
          shopId: sale.shopId,
          entryType: "IN",
          reason: `Partial cash received for due sale #${sale.id}`,
        },
        _sum: { amount: true },
      });

      const partialCashAtSale = roundMoney(
        Number(partialCashAgg._sum.amount ?? 0)
      );
      const saleTotal = roundMoney(Number(sale.totalAmount ?? 0));
      const outstandingDueFromSale = roundMoney(
        Math.max(0, saleTotal - partialCashAtSale)
      );
      const currentDue = Number(customer.totalDue ?? 0);

      if (outstandingDueFromSale > 0 && currentDue + 0.000001 < outstandingDueFromSale) {
        throw new Error(
          "Due amount already settled/adjusted. Cannot void this due sale safely."
        );
      }

      if (outstandingDueFromSale > 0) {
        await tx.customerLedger.create({
          data: {
            shopId: sale.shopId,
            customerId: customer.id,
            entryType: "PAYMENT",
            amount: toMoney(outstandingDueFromSale),
            description: `Void reversal for due sale #${sale.id}`,
            entryDate: voidTimestamp,
            businessDate: voidBusinessDate,
          },
        });

        const nextDue = roundMoney(Math.max(0, currentDue - outstandingDueFromSale));
        await tx.customer.update({
          where: { id: customer.id },
          data: {
            totalDue: toMoney(nextDue),
            lastPaymentAt: voidTimestamp,
          },
        });
      }

      if (partialCashAtSale > 0) {
        await tx.cashEntry.create({
          data: {
            shopId: sale.shopId,
            entryType: "OUT",
            amount: toMoney(partialCashAtSale),
            reason: `Reversal of partial payment for due sale #${sale.id}`,
            businessDate: voidBusinessDate,
          },
        });
        cashOutAmount = roundMoney(cashOutAmount + partialCashAtSale);
      }
    }

    return { alreadyVoided: false as const, affectedProductIds, cashOutAmount };
  });
  if (txResult.alreadyVoided) {
    return { success: true, alreadyVoided: true };
  }
  const affectedProductIds = txResult.affectedProductIds;

  const voidTasks: Promise<void>[] = [];
  voidTasks.push(
    publishRealtimeEvent(REALTIME_EVENTS.saleVoided, sale.shopId, {
      saleId,
      totalAmount: Number(sale.totalAmount ?? 0),
      voidReason: reason || null,
    })
  );

  if (txResult.cashOutAmount > 0) {
    voidTasks.push(
      publishRealtimeEvent(REALTIME_EVENTS.cashUpdated, sale.shopId, {
        amount: txResult.cashOutAmount,
        entryType: "OUT",
      })
    );
  }

  if (affectedProductIds.length > 0) {
    voidTasks.push(
      publishRealtimeEvent(REALTIME_EVENTS.stockUpdated, sale.shopId, {
        productIds: Array.from(new Set(affectedProductIds)),
      })
    );
  }

  await Promise.all(voidTasks);

  revalidateReportsForSale();
  revalidatePath("/dashboard/sales");
  revalidatePath(`/dashboard/sales/${saleId}/invoice`);
  revalidatePath("/dashboard/cash");
  revalidatePath("/dashboard/due");
  revalidatePath("/dashboard/products");

  return { success: true };
}
