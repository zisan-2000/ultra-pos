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
  status?: string | null;
  voidReason?: string | null;
  customerId?: string | null;
};

type SaleWithSummary = SaleRow & {
  itemCount: number;
  itemPreview: string;
  customerName: string | null;
};

type GetSalesByShopPaginatedInput = {
  shopId: string;
  limit?: number;
  cursor?: { saleDate: Date; id: string } | null;
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
  const startTime = Date.now();
  console.log("🚀 [PERF] createSale started at:", new Date().toISOString());

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
  console.log(`🔥 [PERF] DB warmup took: ${warmupTime - startTime}ms`);

  const user = await requireUser();
  requirePermission(user, "create_sale");
  await assertShopAccess(input.shopId, user);
  const needsCogs = await shopNeedsCogs(input.shopId);

  const authTime = Date.now();
  console.log(`🔐 [PERF] Auth checks took: ${authTime - warmupTime}ms`);

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
  console.log(`📦 [DEBUG] Processing ${input.items.length} items, ${productIds.length} products`);

  const dbProducts = await prisma.product.findMany({
    where: { id: { in: productIds } },
  });

  const dbTime = Date.now();
  console.log(`💾 [PERF] DB product fetch took: ${dbTime - authTime}ms for ${dbProducts.length} products`);

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

  const saleId = await prisma.$transaction(async (tx) => {
    const transactionStart = Date.now();
    console.log(`🔄 [PERF] Transaction started at: ${new Date().toISOString()}`);

    // Pre-calculate stock changes for O(1) lookup
    const stockMap = new Map<string, number>();
    input.items.forEach(item => {
      const current = stockMap.get(item.productId) || 0;
      stockMap.set(item.productId, current + item.qty);
    });

    // Create sale first
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
        },
      });
    }

    // Update stock - SEQUENTIAL but optimized
    console.log(`📊 [DEBUG] Starting stock updates for ${dbProducts.length} products`);
    let stockUpdateCount = 0;
    
    for (const p of dbProducts) {
      const soldQty = stockMap.get(p.id) || 0;
      if (soldQty > 0 && p.trackStock !== false) {
        const currentStock = Number(p.stockQty || "0");
        const newStock = currentStock - soldQty;
        
        const singleUpdateStart = Date.now();
        await tx.product.update({
          where: { id: p.id },
          data: { stockQty: newStock.toFixed(2) },
        });
        const singleUpdateEnd = Date.now();
        
        stockUpdateCount++;
        console.log(`🔄 [DEBUG] Stock update ${stockUpdateCount}/${dbProducts.length}: ${singleUpdateEnd - singleUpdateStart}ms for product ${p.id}`);
      }
    }
    
    console.log(`📈 [DEBUG] Total stock updates: ${stockUpdateCount} products updated`);

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

    const transactionEnd = Date.now();
    console.log(`⏱️ [PERF] Transaction completed in: ${transactionEnd - transactionStart}ms`);

    return inserted.id;
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
  console.log(`🎯 [PERF] TOTAL createSale time: ${totalTime}ms`);
  console.log(`📊 [PERF] Breakdown: Warmup(${warmupTime - startTime}ms) + Auth(${authTime - warmupTime}ms) + DB(${dbTime - authTime}ms) + Transaction (see above)`);

  const publishTasks: Promise<void>[] = [];
  publishTasks.push(
    publishRealtimeEvent(REALTIME_EVENTS.saleCommitted, input.shopId, {
      saleId,
      totalAmount: totalNum,
      paymentMethod: normalizedPaymentMethod,
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
    select: {
      id: true,
      saleDate: true,
      totalAmount: true,
      paymentMethod: true,
      status: true,
      voidReason: true,
      customerId: true,
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
  dateFrom,
  dateTo,
}: GetSalesByShopPaginatedInput) {
  const user = await requireUser();
  requirePermission(user, "view_sales");
  await assertShopAccess(shopId, user);

  const safeLimit = Math.max(1, Math.min(limit, 100));

  const where: Prisma.SaleWhereInput = { shopId };
  if (dateFrom || dateTo) {
    where.saleDate = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lt: dateTo } : {}),
    };
  }

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
    where.saleDate = {
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

  const isCashSale = (sale.paymentMethod || "").toLowerCase() === "cash";
  let affectedProductIds: string[] = [];

  await prisma.$transaction(async (tx) => {
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

    if (isCashSale) {
      await tx.cashEntry.create({
        data: {
          shopId: sale.shopId,
          entryType: "OUT",
          amount: sale.totalAmount,
          reason: `Reversal of sale #${sale.id}`,
        },
      });
    }
  });

  const voidTasks: Promise<void>[] = [];
  voidTasks.push(
    publishRealtimeEvent(REALTIME_EVENTS.saleVoided, sale.shopId, {
      saleId,
      totalAmount: Number(sale.totalAmount ?? 0),
      voidReason: reason || null,
    })
  );

  if (isCashSale) {
    voidTasks.push(
      publishRealtimeEvent(REALTIME_EVENTS.cashUpdated, sale.shopId, {
        amount: Number(sale.totalAmount ?? 0),
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

  return { success: true };
}
