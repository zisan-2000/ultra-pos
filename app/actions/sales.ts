// app/actions/sales.ts

"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";

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

async function assertShopBelongsToUser(shopId: string, userId: string) {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });

  if (!shop || shop.ownerId !== userId) {
    throw new Error("Unauthorized access to this shop");
  }

  return shop;
}

// ------------------------------
// CREATE SALE
// ------------------------------
export async function createSale(input: CreateSaleInput) {
  const user = await requireUser();
  await assertShopBelongsToUser(input.shopId, user.id);

  if (!input.items || input.items.length === 0) {
    throw new Error("Cart is empty");
  }

  let dueCustomer: { id: string } | null = null;
  if (input.paymentMethod === "due") {
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

  // Insert sale
  const inserted = await prisma.sale.create({
    data: {
      shopId: input.shopId,
      customerId: input.customerId || null,
      totalAmount: totalStr,
      paymentMethod: input.paymentMethod || "cash",
      note: input.note || null,
    },
    select: { id: true },
  });

  const saleId = inserted.id;

  // Insert sale items
  const saleItemRows = input.items.map((item) => ({
    saleId,
    productId: item.productId,
    quantity: item.qty.toString(),
    unitPrice: item.unitPrice.toFixed(2),
    lineTotal: (item.qty * item.unitPrice).toFixed(2),
  }));

  await prisma.saleItem.createMany({ data: saleItemRows });

  // Update stock
  for (const p of dbProducts) {
    const soldQty = input.items
      .filter((i) => i.productId === p.id)
      .reduce((sum, i) => sum + i.qty, 0);

    if (soldQty === 0) continue;

    // Only update stock when this product is tracking inventory
    if (p.trackStock === false) continue;

    const currentStock = Number(p.stockQty || "0");
    const newStock = currentStock - soldQty;

    await prisma.product.update({
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

    await prisma.$transaction(async (tx) => {
      await tx.customerLedger.create({
        data: {
          shopId: input.shopId,
          customerId: dueCustomer!.id,
          entryType: "SALE",
          amount: totalStr,
          description: input.note || "Due sale",
        },
      });

      if (payNow > 0) {
        await tx.customerLedger.create({
          data: {
            shopId: input.shopId,
            customerId: dueCustomer!.id,
            entryType: "PAYMENT",
            amount: payNow.toFixed(2),
            description: "Partial payment at sale",
          },
        });
      }

      const current = await tx.customer.findUnique({
        where: { id: dueCustomer!.id },
        select: { totalDue: true },
      });
      const currentDue = new Prisma.Decimal(current?.totalDue ?? 0);
      const newDue = currentDue.add(new Prisma.Decimal(dueAmount));

      await tx.customer.update({
        where: { id: dueCustomer!.id },
        data: {
          totalDue: newDue.toFixed(2),
          lastPaymentAt: payNow > 0 ? new Date() : null,
        },
      });
    });
  }

  return { success: true, saleId };
}

// ------------------------------
// GET SALES BY SHOP
// ------------------------------
export async function getSalesByShop(shopId: string) {
  const user = await requireUser();
  await assertShopBelongsToUser(shopId, user.id);

  const rows = await prisma.sale.findMany({
    where: { shopId },
  });

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
