// app/actions/purchases.ts

"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { requirePermission } from "@/lib/rbac";
import { assertShopAccess } from "@/lib/shop-access";
import { revalidatePath } from "next/cache";
import { revalidateReportsForProduct } from "@/lib/reports/revalidate";
import {
  getDhakaDateString,
  parseDhakaDateOnlyRange,
  toDhakaBusinessDate,
} from "@/lib/dhaka-date";

type PurchaseItemInput = {
  productId: string;
  qty: number | string;
  unitCost: number | string;
};

type CreatePurchaseInput = {
  shopId: string;
  items: PurchaseItemInput[];
  purchaseDate?: string;
  supplierId?: string | null;
  supplierName?: string | null;
  paymentMethod?: "cash" | "bkash" | "bank" | "due";
  paidNow?: number | string | null;
  note?: string | null;
};

function toMoney(value: number | string, field: string) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error(`${field} must be a valid non-negative number`);
  }
  return num;
}

function normalizePurchaseDate(raw?: string | null) {
  const trimmed = raw?.trim();
  const day = trimmed || getDhakaDateString();
  const { start } = parseDhakaDateOnlyRange(day, day, true);
  return start ?? new Date(`${day}T00:00:00.000Z`);
}

export async function createPurchase(input: CreatePurchaseInput) {
  const user = await requireUser();
  requirePermission(user, "create_purchase");
  await assertShopAccess(input.shopId, user);

  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("At least one item is required");
  }

  const paymentMethod = (input.paymentMethod || "cash").toLowerCase() as
    | "cash"
    | "bkash"
    | "bank"
    | "due";

  const productIds = input.items.map((item) => item.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
  });

  if (products.length !== productIds.length) {
    throw new Error("Some products not found");
  }

  const productMap = new Map(products.map((p) => [p.id, p]));

  let supplierId = input.supplierId ?? null;
  const supplierName = input.supplierName?.trim() || null;

  if (!supplierId && supplierName) {
    const existing = await prisma.supplier.findFirst({
      where: { shopId: input.shopId, name: supplierName },
      select: { id: true },
    });
    if (existing) {
      supplierId = existing.id;
    } else {
      const createdSupplier = await prisma.supplier.create({
        data: {
          shopId: input.shopId,
          name: supplierName,
        },
        select: { id: true },
      });
      supplierId = createdSupplier.id;
    }
  } else if (supplierId) {
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, shopId: input.shopId },
      select: { id: true },
    });
    if (!supplier) {
      throw new Error("Supplier not found for this shop");
    }
  }

  if (paymentMethod === "due" && !supplierId && !supplierName) {
    throw new Error("Supplier required for due purchase");
  }

  let totalAmount = 0;
  const rows = input.items.map((item) => {
    const product = productMap.get(item.productId);
    if (!product) throw new Error("Product not found");
    if (product.shopId !== input.shopId) {
      throw new Error("Product does not belong to this shop");
    }
    const qty = toMoney(item.qty, "Quantity");
    const unitCost = toMoney(item.unitCost, "Unit cost");
    if (qty <= 0) throw new Error("Quantity must be greater than 0");
    const lineTotal = qty * unitCost;
    totalAmount += lineTotal;
    return { product, qty, unitCost, lineTotal };
  });

  const paidNowRaw = Number(input.paidNow ?? 0);
  const paidNow = Number.isFinite(paidNowRaw) ? Math.max(0, paidNowRaw) : 0;
  const paidAmount =
    paymentMethod === "cash" ||
    paymentMethod === "bkash" ||
    paymentMethod === "bank"
      ? totalAmount
      : Math.min(paidNow, totalAmount);
  const dueAmount = Number((totalAmount - paidAmount).toFixed(2));

  const purchaseDate = normalizePurchaseDate(input.purchaseDate);
  let createdPurchaseId: string | null = null;

  await prisma.$transaction(async (tx) => {
    const created = await tx.purchase.create({
      data: {
        shopId: input.shopId,
        supplierId,
        supplierName,
        purchaseDate,
        paymentMethod,
        totalAmount: totalAmount.toFixed(2),
        paidAmount: paidAmount.toFixed(2),
        dueAmount: dueAmount.toFixed(2),
        note: input.note?.trim() || null,
      },
      select: { id: true },
    });
    createdPurchaseId = created.id;

    await tx.purchaseItem.createMany({
      data: rows.map((row) => ({
        purchaseId: created.id,
        productId: row.product.id,
        quantity: row.qty.toFixed(2),
        unitCost: row.unitCost.toFixed(2),
        lineTotal: row.lineTotal.toFixed(2),
      })),
    });

    for (const row of rows) {
      const product = row.product;
      const currentStock = Number(product.stockQty ?? 0);
      const currentCost = Number(product.buyPrice ?? 0);
      const baseStock = product.trackStock ? currentStock : 0;
      const nextStock = product.trackStock ? currentStock + row.qty : currentStock;
      const totalUnits = baseStock + row.qty;
      const weighted =
        totalUnits > 0
          ? (baseStock * currentCost + row.qty * row.unitCost) / totalUnits
          : row.unitCost;
      const nextCost = Number.isFinite(weighted) ? weighted : row.unitCost;

      await tx.product.update({
        where: { id: product.id },
        data: {
          buyPrice: nextCost.toFixed(2),
          ...(product.trackStock ? { stockQty: nextStock.toFixed(2) } : {}),
        },
      });
    }

    if (paidAmount > 0) {
      await tx.cashEntry.create({
        data: {
          shopId: input.shopId,
          entryType: "OUT",
          amount: paidAmount.toFixed(2),
          reason: `Purchase #${created.id}`,
          createdAt: purchaseDate,
          businessDate: toDhakaBusinessDate(purchaseDate),
        },
      });
    }

    if (supplierId) {
      await tx.supplierLedger.create({
        data: {
          shopId: input.shopId,
          supplierId,
          entryType: "PURCHASE",
          amount: totalAmount.toFixed(2),
          note: `Purchase #${created.id}`,
          entryDate: purchaseDate,
          businessDate: toDhakaBusinessDate(purchaseDate),
        },
      });

      if (paidAmount > 0) {
        await tx.purchasePayment.create({
          data: {
            shopId: input.shopId,
            purchaseId: created.id,
            supplierId,
            amount: paidAmount.toFixed(2),
            method: paymentMethod === "due" ? "cash" : paymentMethod,
            paidAt: purchaseDate,
            businessDate: toDhakaBusinessDate(purchaseDate),
            note: `Payment for purchase #${created.id}`,
          },
        });

        await tx.supplierLedger.create({
          data: {
            shopId: input.shopId,
            supplierId,
            entryType: "PAYMENT",
            amount: paidAmount.toFixed(2),
            note: `Payment for purchase #${created.id}`,
            entryDate: purchaseDate,
            businessDate: toDhakaBusinessDate(purchaseDate),
          },
        });
      }
    }
  });

  revalidatePath("/dashboard/purchases");
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/reports");
  revalidatePath("/dashboard/suppliers");
  revalidateReportsForProduct();

  return { success: true, purchaseId: createdPurchaseId };
}

export async function recordPurchasePayment(input: {
  shopId: string;
  purchaseId: string;
  amount: string | number;
  paidAt?: string;
  method?: string;
  note?: string | null;
}) {
  const user = await requireUser();
  requirePermission(user, "create_purchase_payment");
  await assertShopAccess(input.shopId, user);

  const amount = toMoney(input.amount, "Amount");
  if (amount <= 0) throw new Error("Amount must be greater than 0");
  const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
  if (Number.isNaN(paidAt.getTime())) throw new Error("Invalid payment date");
  const paymentBusinessDate = toDhakaBusinessDate(paidAt);

  const purchase = await prisma.purchase.findUnique({
    where: { id: input.purchaseId },
    select: {
      id: true,
      shopId: true,
      paidAmount: true,
      dueAmount: true,
      supplierId: true,
    },
  });

  if (!purchase || purchase.shopId !== input.shopId) {
    throw new Error("Purchase not found for this shop");
  }
  if (!purchase.supplierId) {
    throw new Error("Supplier is required to record payment");
  }

  const due = Number(purchase.dueAmount ?? 0);
  const paid = Number(purchase.paidAmount ?? 0);
  if (due <= 0) {
    throw new Error("No due amount remaining for this purchase");
  }
  const payAmount = Math.min(due, amount);

  await prisma.$transaction(async (tx) => {
    await tx.purchase.update({
      where: { id: purchase.id },
      data: {
        paidAmount: (paid + payAmount).toFixed(2),
        dueAmount: (due - payAmount).toFixed(2),
      } as any,
    });

    await tx.purchasePayment.create({
      data: {
        shopId: input.shopId,
        purchaseId: purchase.id,
        supplierId: purchase.supplierId!,
        amount: payAmount.toFixed(2),
        method: input.method || "cash",
        paidAt,
        businessDate: paymentBusinessDate,
        note: input.note?.trim() || null,
      },
    });

    await tx.cashEntry.create({
      data: {
        shopId: input.shopId,
        entryType: "OUT",
        amount: payAmount.toFixed(2),
        reason: `Purchase payment #${purchase.id}`,
        createdAt: paidAt,
        businessDate: paymentBusinessDate,
      },
    });

    await tx.supplierLedger.create({
      data: {
        shopId: input.shopId,
        supplierId: purchase.supplierId!,
        entryType: "PAYMENT",
        amount: payAmount.toFixed(2),
        note: `Payment for purchase #${purchase.id}`,
        entryDate: paidAt,
        businessDate: paymentBusinessDate,
      },
    });
  });

  revalidatePath("/dashboard/purchases");
  revalidatePath("/dashboard/suppliers");
  return { success: true };
}

export async function getPurchasesByShopPaginated({
  shopId,
  from,
  to,
  page = 1,
  pageSize = 20,
}: {
  shopId: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}) {
  const user = await requireUser();
  requirePermission(user, "view_purchases");
  await assertShopAccess(shopId, user);

  const safePage = Math.max(1, Math.floor(page));
  const safeSize = Math.max(1, Math.min(Math.floor(pageSize), 100));
  const skip = (safePage - 1) * safeSize;

  const start = from ? normalizePurchaseDate(from) : undefined;
  const end = to ? normalizePurchaseDate(to) : undefined;

  const where = {
    shopId,
    purchaseDate: from || to ? { gte: start, lte: end } : undefined,
  } as const;

  const [rows, totalCount] = await Promise.all([
    prisma.purchase.findMany({
      where,
      orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }],
      skip,
      take: safeSize,
      include: {
        supplier: { select: { id: true, name: true } },
        items: {
          select: {
            id: true,
            quantity: true,
            unitCost: true,
            lineTotal: true,
            product: { select: { name: true } },
          },
        },
      },
    }),
    prisma.purchase.count({ where }),
  ]);

  const items = rows.map((p) => ({
    id: p.id,
    shopId: p.shopId,
    supplierId: p.supplier?.id ?? null,
    supplierName: p.supplier?.name ?? p.supplierName,
    purchaseDate: p.purchaseDate?.toISOString?.() ?? p.purchaseDate,
    paymentMethod: p.paymentMethod,
    totalAmount: p.totalAmount?.toString?.() ?? "0",
    paidAmount: p.paidAmount?.toString?.() ?? "0",
    dueAmount: p.dueAmount?.toString?.() ?? "0",
    note: p.note,
    createdAt: p.createdAt?.toISOString?.() ?? p.createdAt,
    items: p.items.map((item) => ({
      id: item.id,
      name: item.product?.name || "Unknown",
      quantity: item.quantity?.toString?.() ?? "0",
      unitCost: item.unitCost?.toString?.() ?? "0",
      lineTotal: item.lineTotal?.toString?.() ?? "0",
    })),
  }));

  return {
    items,
    totalCount,
    page: safePage,
    pageSize: safeSize,
    totalPages: Math.max(1, Math.ceil(totalCount / safeSize)),
  };
}

export async function getPurchaseSummaryByRange(
  shopId: string,
  from?: string,
  to?: string
) {
  const user = await requireUser();
  requirePermission(user, "view_purchases");
  await assertShopAccess(shopId, user);

  const start = from ? normalizePurchaseDate(from) : undefined;
  const end = to ? normalizePurchaseDate(to) : undefined;

  const agg = await prisma.purchase.aggregate({
    where: {
      shopId,
      purchaseDate: from || to ? { gte: start, lte: end } : undefined,
    },
    _sum: { totalAmount: true },
    _count: { _all: true },
  });

  return {
    totalAmount: agg._sum.totalAmount?.toString?.() ?? "0",
    count: agg._count._all ?? 0,
  };
}

export async function getPurchaseWithPayments(
  purchaseId: string,
  options?: { page?: number; pageSize?: number }
) {
  const user = await requireUser();
  requirePermission(user, "view_purchases");

  const page = Math.max(1, Math.floor(options?.page ?? 1));
  const pageSize = Math.max(1, Math.min(Math.floor(options?.pageSize ?? 10), 50));
  const skip = (page - 1) * pageSize;

  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: {
      supplier: { select: { id: true, name: true } },
      items: {
        select: {
          id: true,
          quantity: true,
          unitCost: true,
          lineTotal: true,
          product: { select: { name: true } },
        },
      },
      payments: {
        orderBy: [{ paidAt: "desc" }],
        skip,
        take: pageSize,
        select: {
          id: true,
          amount: true,
          method: true,
          paidAt: true,
          note: true,
        },
      },
    },
  });

  if (!purchase) throw new Error("Purchase not found");
  await assertShopAccess(purchase.shopId, user);

  const totalPayments = await prisma.purchasePayment.count({
    where: { purchaseId },
  });

  return {
    id: purchase.id,
    shopId: purchase.shopId,
    supplierId: purchase.supplier?.id ?? null,
    supplierName: purchase.supplier?.name ?? purchase.supplierName,
    purchaseDate: purchase.purchaseDate?.toISOString?.() ?? purchase.purchaseDate,
    paymentMethod: purchase.paymentMethod,
    totalAmount: purchase.totalAmount?.toString?.() ?? "0",
    paidAmount: purchase.paidAmount?.toString?.() ?? "0",
    dueAmount: purchase.dueAmount?.toString?.() ?? "0",
    note: purchase.note,
    items: purchase.items.map((item) => ({
      id: item.id,
      name: item.product?.name || "Unknown",
      quantity: item.quantity?.toString?.() ?? "0",
      unitCost: item.unitCost?.toString?.() ?? "0",
      lineTotal: item.lineTotal?.toString?.() ?? "0",
    })),
    payments: purchase.payments.map((p) => ({
      id: p.id,
      amount: p.amount?.toString?.() ?? "0",
      method: p.method,
      paidAt: p.paidAt?.toISOString?.() ?? p.paidAt,
      note: p.note,
    })),
    paymentMeta: {
      page,
      pageSize,
      total: totalPayments,
      totalPages: Math.max(1, Math.ceil(totalPayments / pageSize)),
    },
  };
}

export async function getPayablesSummary(shopId: string) {
  const user = await requireUser();
  requirePermission(user, "view_suppliers");
  await assertShopAccess(shopId, user);

  const [agg, supplierGroups] = await Promise.all([
    prisma.purchase.aggregate({
      where: { shopId, dueAmount: { gt: 0 } },
      _sum: { dueAmount: true },
      _count: { _all: true },
    }),
    prisma.purchase.groupBy({
      by: ["supplierId"],
      where: { shopId, dueAmount: { gt: 0 }, supplierId: { not: null } },
    }),
  ]);

  return {
    totalDue: Number(agg._sum.dueAmount ?? 0),
    dueCount: agg._count._all ?? 0,
    supplierCount: supplierGroups.length,
  };
}
