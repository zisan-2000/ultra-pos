// app/actions/sales.ts

"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";

// ------------------------------
// TYPES
// ------------------------------
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

// ------------------------------
// HELPERS
// ------------------------------
async function assertShopBelongsToUser(shopId: string, userId: string) {
  const shop = await prisma.shops.findUnique({
    where: { id: shopId },
  });

  if (!shop || shop.owner_id !== userId) {
    throw new Error("Unauthorized");
  }

  return shop;
}

async function assertCustomerBelongsToShop(customerId: string, shopId: string) {
  const customer = await prisma.customers.findUnique({
    where: { id: customerId },
  });

  if (!customer || customer.shop_id !== shopId) {
    throw new Error("Customer not found for this shop");
  }

  return customer;
}

// ------------------------------
// CREATE SALE
// ------------------------------
export async function createSale(input: CreateSaleInput) {
  const user = await requireUser();
  await assertShopBelongsToUser(input.shopId, user.id);

  if (!input.items?.length) {
    throw new Error("Cart is empty");
  }

  let dueCustomer: { id: string } | null = null;

  // Handle due sale customer validation
  if (input.paymentMethod === "due") {
    if (!input.customerId) throw new Error("Select a customer for due sale");
    const customer = await assertCustomerBelongsToShop(
      input.customerId,
      input.shopId
    );
    dueCustomer = { id: customer.id };
  }

  // Validate products
  const productIds = input.items.map((i) => i.productId);

  const dbProducts = await prisma.products.findMany({
    where: { id: { in: productIds } },
  });

  if (dbProducts.length !== productIds.length) {
    throw new Error("Some products not found");
  }

  // Validate and compute total
  let total = 0;

  for (const item of input.items) {
    const product = dbProducts.find((p) => p.id === item.productId);
    if (!product) throw new Error("Product not found");

    if (product.shop_id !== input.shopId) {
      throw new Error("Product does not belong to shop");
    }

    if (!product.is_active) throw new Error("Inactive product in cart");

    total += item.unitPrice * item.qty;
  }

  const totalAmount = Number(total.toFixed(2));

  // TRANSACTION START
  return await prisma.$transaction(async (tx) => {
    // Create sale
    const sale = await tx.sales.create({
      data: {
        shop_id: input.shopId,
        customer_id: input.customerId || null,
        total_amount: totalAmount,
        payment_method: input.paymentMethod,
        note: input.note || null,
      },
      select: { id: true },
    });

    const saleId = sale.id;

    // Create sale items
    const itemData = input.items.map((item) => ({
      sale_id: saleId,
      product_id: item.productId,
      quantity: item.qty,
      unit_price: item.unitPrice,
      line_total: Number((item.qty * item.unitPrice).toFixed(2)),
    }));

    await tx.sale_items.createMany({
      data: itemData,
    });

    // Update stock
    for (const p of dbProducts) {
      if (!p.track_stock) continue;

      const soldQty = input.items
        .filter((i) => i.productId === p.id)
        .reduce((sum, i) => sum + i.qty, 0);

      const newStock = Number(p.stock_qty) - soldQty;

      await tx.products.update({
        where: { id: p.id },
        data: { stock_qty: newStock },
      });
    }

    // Handle due sale
    if (dueCustomer) {
      const payNow = Math.max(
        0,
        Math.min(Number(input.paidNow || 0), totalAmount)
      );
      const dueAmount = Number((totalAmount - payNow).toFixed(2));

      // Ledger entries
      await tx.customer_ledger.create({
        data: {
          shop_id: input.shopId,
          customer_id: dueCustomer.id,
          entry_type: "SALE",
          amount: totalAmount,
          description: input.note || "Due sale",
        },
      });

      if (payNow > 0) {
        await tx.customer_ledger.create({
          data: {
            shop_id: input.shopId,
            customer_id: dueCustomer.id,
            entry_type: "PAYMENT",
            amount: payNow,
            description: "Partial payment at sale",
          },
        });
      }

      // Update customer due
      const customer = await tx.customers.findUnique({
        where: { id: dueCustomer.id },
      });

      await tx.customers.update({
        where: { id: dueCustomer.id },
        data: {
          total_due: Number(customer!.total_due) + dueAmount,
          last_payment_at: payNow > 0 ? new Date() : customer!.last_payment_at,
        },
      });
    }

    return { success: true, saleId };
  });
}

// ------------------------------
// GET SALES BY SHOP
// ------------------------------
export async function getSalesByShop(shopId: string) {
  const user = await requireUser();
  await assertShopBelongsToUser(shopId, user.id);

  const rows = await prisma.sales.findMany({
    where: { shop_id: shopId },
    orderBy: { sale_date: "desc" },
    include: {
      sale_items: {
        include: {
          products: true,
        },
      },
      customers: true,
    },
  });

  return rows.map((sale) => {
    const items = sale.sale_items;

    const previewNames = items.slice(0, 3).map((i) => {
      const qty = Number(i.quantity);
      return `${i.products.name} x${qty}`;
    });

    return {
      ...sale,
      itemCount: items.length,
      itemPreview: previewNames.join(", "),
      customerName: sale.customers ? sale.customers.name : null,
    };
  });
}
