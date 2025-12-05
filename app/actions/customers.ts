// app/actions/customers.ts

"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";

// ----------------------------------------------
// TYPES
// ----------------------------------------------
type CreateCustomerInput = {
  shopId: string;
  name: string;
  phone?: string | null;
  address?: string | null;
};

type PaymentInput = {
  shopId: string;
  customerId: string;
  amount: number;
  description?: string | null;
};

// ----------------------------------------------
// HELPERS
// ----------------------------------------------
async function assertShopBelongsToUser(shopId: string, userId: string) {
  const shop = await prisma.shops.findUnique({
    where: { id: shopId },
  });

  if (!shop || shop.owner_id !== userId) {
    throw new Error("Unauthorized");
  }

  return shop;
}

async function assertCustomerInShop(customerId: string, shopId: string) {
  const customer = await prisma.customers.findFirst({
    where: {
      id: customerId,
      shop_id: shopId,
    },
  });

  if (!customer) {
    throw new Error("Customer not found in this shop");
  }

  return customer;
}

// ----------------------------------------------
// CREATE CUSTOMER
// ----------------------------------------------
export async function createCustomer(input: CreateCustomerInput) {
  const user = await requireUser();
  await assertShopBelongsToUser(input.shopId, user.id);

  const name = input.name?.trim();
  if (!name) throw new Error("Name is required");

  const result = await prisma.customers.create({
    data: {
      shop_id: input.shopId,
      name,
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
    },
    select: { id: true },
  });

  return { id: result.id };
}

// ----------------------------------------------
// LIST CUSTOMERS (ORDER BY DUE)
// ----------------------------------------------
export async function getCustomersByShop(shopId: string) {
  const user = await requireUser();
  await assertShopBelongsToUser(shopId, user.id);

  return prisma.customers.findMany({
    where: { shop_id: shopId },
    orderBy: { total_due: "desc" },
  });
}

// ----------------------------------------------
// ADD DUE ENTRY (SALE)
// ----------------------------------------------
export async function addDueSaleEntry(input: {
  shopId: string;
  customerId: string;
  amount: number;
  description?: string | null;
}) {
  const user = await requireUser();
  await assertShopBelongsToUser(input.shopId, user.id);

  const customer = await assertCustomerInShop(input.customerId, input.shopId);

  const amount = Number(input.amount);
  if (!amount || amount <= 0) throw new Error("Amount must be positive");

  await prisma.$transaction(async (tx) => {
    await tx.customer_ledger.create({
      data: {
        shop_id: input.shopId,
        customer_id: input.customerId,
        entry_type: "SALE",
        amount,
        description: input.description || "Due sale",
      },
    });

    await tx.customers.update({
      where: { id: customer.id },
      data: {
        total_due: customer.total_due + amount,
      },
    });
  });

  return { success: true };
}

// ----------------------------------------------
// RECORD PAYMENT
// ----------------------------------------------
export async function recordCustomerPayment(input: PaymentInput) {
  const user = await requireUser();
  await assertShopBelongsToUser(input.shopId, user.id);

  const customer = await assertCustomerInShop(input.customerId, input.shopId);

  const amount = Number(input.amount);
  if (!amount || amount <= 0) throw new Error("Amount must be positive");

  await prisma.$transaction(async (tx) => {
    await tx.customer_ledger.create({
      data: {
        shop_id: input.shopId,
        customer_id: input.customerId,
        entry_type: "PAYMENT",
        amount,
        description: input.description || "Payment",
      },
    });

    const newDue = Math.max(0, Number(customer.total_due) - amount);

    await tx.customers.update({
      where: { id: customer.id },
      data: {
        total_due: newDue,
        last_payment_at: new Date(),
      },
    });
  });

  return { success: true };
}

// ----------------------------------------------
// CUSTOMER STATEMENT
// ----------------------------------------------
export async function getCustomerStatement(shopId: string, customerId: string) {
  const user = await requireUser();
  await assertShopBelongsToUser(shopId, user.id);
  await assertCustomerInShop(customerId, shopId);

  return prisma.customer_ledger.findMany({
    where: {
      shop_id: shopId,
      customer_id: customerId,
    },
    orderBy: { entry_date: "asc" },
  });
}

// ----------------------------------------------
// DUE SUMMARY
// ----------------------------------------------
export async function getDueSummary(shopId: string) {
  const user = await requireUser();
  await assertShopBelongsToUser(shopId, user.id);

  const customersList = await prisma.customers.findMany({
    where: { shop_id: shopId },
    orderBy: { total_due: "desc" },
  });

  const totalDue = customersList.reduce(
    (sum, c) => sum + Number(c.total_due || 0),
    0
  );

  const topDue = customersList.slice(0, 5).map((c) => ({
    id: c.id,
    name: c.name,
    totalDue: Number(c.total_due),
    phone: c.phone,
  }));

  return { totalDue, topDue, customers: customersList };
}
