// app/actions/sales.ts

"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { requirePermission } from "@/lib/rbac";
import { assertShopAccess } from "@/lib/shop-access";

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
  createdAt: string;
  id: string;
};

type SaleRow = Prisma.SaleGetPayload<{}>;

type SaleWithSummary = SaleRow & {
  itemCount: number;
  itemPreview: string;
  customerName: string | null;
};

type GetSalesByShopPaginatedInput = {
  shopId: string;
  limit?: number;
  cursor?: { createdAt: Date; id: string } | null;
  dateFrom?: Date | null;
  dateTo?: Date | null;
};

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
    if (entry.names.length < 3 && it.product?.name) {
      entry.names.push(
        `${it.product.name} x${Number(it.quantity || 0)}`
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

  return rows.map((r) => {
    const summary = itemSummaryMap[r.id] || { count: 0, names: [] };
    return {
      ...r,
      itemCount: summary.count,
      itemPreview: summary.names.join(", "),
      customerName: r.customerId ? customerMap[r.customerId] : null,
    };
  });
}

// ------------------------------
// CREATE SALE
// ------------------------------
export async function createSale(input: CreateSaleInput) {
  const user = await requireUser();
  requirePermission(user, "create_sale");
  await assertShopAccess(input.shopId, user);

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

  const dbProducts = await prisma.product.findMany({
    where: { id: { in: productIds } },
  });

  if (dbProducts.length !== productIds.length) {
    throw new Error("Some products not found");
  }

  // Validate each item
  let computedTotal = 0;

  for (const item of input.items) {
    const p = dbProducts.find((dp) => dp.id === item.productId);

    if (!p) throw new Error("Product not found");

    if (p.shopId !== input.shopId) {
      throw new Error("Product does not belong to this shop");
    }

    if (!p.isActive) {
      throw new Error("Inactive product in cart");
    }

    computedTotal += item.unitPrice * item.qty;
  }

  const totalStr = computedTotal.toFixed(2); // numeric as string

  const saleId = await prisma.$transaction(async (tx) => {
    // Insert sale
    const inserted = await tx.sale.create({
      data: {
        shopId: input.shopId,
        customerId: input.customerId || null,
        totalAmount: totalStr,
        paymentMethod: input.paymentMethod || "cash",
        note: input.note || null,
      },
      select: { id: true },
    });

    // Insert sale items
    const saleItemRows = input.items.map((item) => ({
      saleId: inserted.id,
      productId: item.productId,
      quantity: item.qty.toString(),
      unitPrice: item.unitPrice.toFixed(2),
      lineTotal: (item.qty * item.unitPrice).toFixed(2),
    }));
    await tx.saleItem.createMany({ data: saleItemRows });

    // Update stock
    for (const p of dbProducts) {
      const soldQty = input.items
        .filter((i) => i.productId === p.id)
        .reduce((sum, i) => sum + i.qty, 0);

      if (soldQty === 0) continue;
      if (p.trackStock === false) continue;

      const currentStock = Number(p.stockQty || "0");
      const newStock = currentStock - soldQty;

      await tx.product.update({
        where: { id: p.id },
        data: { stockQty: newStock.toFixed(2) },
      });
    }

    // Record due entry if needed
    if (dueCustomer) {
      const total = Number(totalStr);
      const payNowRaw = Number(input.paidNow || 0);
      const payNow = Math.min(Math.max(payNowRaw, 0), total); // clamp 0..total
      const dueAmount = Number((total - payNow).toFixed(2));

      await tx.customerLedger.create({
        data: {
          shopId: input.shopId,
          customerId: dueCustomer.id,
          entryType: "SALE",
          amount: totalStr,
          description: input.note || "Due sale",
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

    return inserted.id;
  });

  return { success: true, saleId };
}

// ------------------------------
// GET SALES BY SHOP
// ------------------------------
export async function getSalesByShop(shopId: string) {
  const user = await requireUser();
  requirePermission(user, "view_sales");
  await assertShopAccess(shopId, user);

  const rows = await prisma.sale.findMany({
    where: { shopId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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
  dateFrom,
  dateTo,
}: GetSalesByShopPaginatedInput) {
  const user = await requireUser();
  requirePermission(user, "view_sales");
  await assertShopAccess(shopId, user);

  const safeLimit = Math.max(1, Math.min(limit, 100));

  const where: Prisma.SaleWhereInput = { shopId };
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lt: dateTo } : {}),
    };
  }

  if (cursor) {
    where.AND = [
      {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      },
    ];
  }

  const rows = await prisma.sale.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: safeLimit + 1,
  });

  const hasMore = rows.length > safeLimit;
  const pageRows = rows.slice(0, safeLimit);
  const items = await attachSaleSummaries(pageRows, shopId);

  const last = pageRows[pageRows.length - 1];
  const nextCursor: SaleCursor | null =
    hasMore && last
      ? { createdAt: last.createdAt.toISOString(), id: last.id }
      : null;

  return {
    items,
    nextCursor,
    hasMore,
  };
}

// ------------------------------
// SALES SUMMARY (count + total)
// ------------------------------
export async function getSalesSummary({
  shopId,
  dateFrom,
  dateTo,
}: {
  shopId: string;
  dateFrom?: Date | null;
  dateTo?: Date | null;
}) {
  const user = await requireUser();
  requirePermission(user, "view_sales");
  await assertShopAccess(shopId, user);

  const where: Prisma.SaleWhereInput = {
    shopId,
    status: { not: "VOIDED" },
  };

  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lt: dateTo } : {}),
    };
  }

  const agg = await prisma.sale.aggregate({
    where,
    _sum: { totalAmount: true },
    _count: { _all: true },
  });

  return {
    totalAmount: agg._sum.totalAmount?.toString() ?? "0",
    count: agg._count._all ?? 0,
  };
}

// ------------------------------
// VOID SALE (simple version, non-due only)
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

  // For now, avoid trying to unwind complex due ledger logic.
  if (sale.paymentMethod === "due") {
    throw new Error("Due sales cannot be voided yet. Please handle via customer ledger.");
  }

  await prisma.$transaction(async (tx) => {
    // Restore stock for tracked products
    const saleItems = await tx.saleItem.findMany({
      where: { saleId },
      include: {
        product: true,
      },
    });

    for (const it of saleItems as any[]) {
      const p = it.product;
      if (!p || p.trackStock === false) continue;

      const qty = Number(it.quantity || 0);
      if (!Number.isFinite(qty) || qty === 0) continue;

      const currentStock = Number(p.stockQty || 0);
      const newStock = currentStock + qty;

      await tx.product.update({
        where: { id: p.id },
        data: { stockQty: newStock.toFixed(2) },
      });
    }

    await tx.sale.update({
      where: { id: saleId },
      data: {
        status: "VOIDED",
        voidReason: reason || null,
        voidAt: new Date(),
        voidByUserId: user.id,
      } as any,
    });
  });

  return { success: true };
}
