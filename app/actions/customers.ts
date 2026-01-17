// app/actions/customers.ts

"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { assertShopAccess } from "@/lib/shop-access";

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

/* --------------------------------------------------
   AUTH HELPERS
-------------------------------------------------- */
async function getCurrentUser() {
  return requireUser();
}

async function assertCustomerInShop(customerId: string, shopId: string) {
  const row = await prisma.customer.findFirst({
    where: { id: customerId, shopId },
  });

  if (!row) {
    throw new Error("Customer not found in this shop");
  }

  return row;
}

/* --------------------------------------------------
   CREATE CUSTOMER
-------------------------------------------------- */
export async function createCustomer(input: CreateCustomerInput) {
  const user = await getCurrentUser();
  await assertShopAccess(input.shopId, user);

  const name = input.name?.trim();
  if (!name) throw new Error("Name is required");

  const inserted = await prisma.customer.create({
    data: {
      shopId: input.shopId,
      name,
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
    },
    select: { id: true },
  });

  return { id: inserted.id };
}

/* --------------------------------------------------
   LIST CUSTOMERS (WITH DUE)
-------------------------------------------------- */
export async function getCustomersByShop(shopId: string) {
  const user = await getCurrentUser();
  await assertShopAccess(shopId, user);

  const rows = await prisma.customer.findMany({
    where: { shopId },
    select: {
      id: true,
      name: true,
      phone: true,
      address: true,
      totalDue: true,
      lastPaymentAt: true,
      createdAt: true,
    },
    orderBy: { totalDue: "desc" },
  });

  // Strip Prisma Decimal/Date instances so we can pass the data into Client Components
  return rows.map((c) => ({
    ...c,
    totalDue: Number(c.totalDue || 0),
    lastPaymentAt: c.lastPaymentAt ? c.lastPaymentAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
  }));
}

/* --------------------------------------------------
   ADD DUE (SALE) ENTRY
-------------------------------------------------- */
export async function addDueSaleEntry(input: {
  shopId: string;
  customerId: string;
  amount: number;
  description?: string | null;
}) {
  const user = await getCurrentUser();
  await assertShopAccess(input.shopId, user);
  const customer = await assertCustomerInShop(input.customerId, input.shopId);

  const amount = Number(input.amount || 0);
  if (!amount || amount <= 0) throw new Error("Amount must be positive");

  await prisma.$transaction(async (tx) => {
    await tx.customerLedger.create({
      data: {
        shopId: input.shopId,
        customerId: input.customerId,
        entryType: "SALE",
        amount: amount.toFixed(2),
        description: input.description || "Due sale",
      },
    });

    const current = await tx.customer.findUnique({
      where: { id: customer.id },
      select: { totalDue: true },
    });
    const currentDue = new Prisma.Decimal(current?.totalDue ?? 0);
    const newDue = currentDue.add(new Prisma.Decimal(amount));

    await tx.customer.update({
      where: { id: customer.id },
      data: {
        totalDue: newDue.toFixed(2),
      },
    });
  });

  return { success: true };
}

/* --------------------------------------------------
   RECORD PAYMENT
-------------------------------------------------- */
export async function recordCustomerPayment(input: PaymentInput) {
  const user = await getCurrentUser();
  await assertShopAccess(input.shopId, user);
  const customer = await assertCustomerInShop(input.customerId, input.shopId);

  const amount = Number(input.amount || 0);
  if (!amount || amount <= 0) throw new Error("Amount must be positive");

  await prisma.$transaction(async (tx) => {
    await tx.customerLedger.create({
      data: {
        shopId: input.shopId,
        customerId: input.customerId,
        entryType: "PAYMENT",
        amount: amount.toFixed(2),
        description: input.description || "Payment",
      },
    });

    await tx.cashEntry.create({
      data: {
        shopId: input.shopId,
        entryType: "IN",
        amount: amount.toFixed(2),
        reason: `Due payment from customer #${customer.id}`,
      },
    });

    const current = await tx.customer.findUnique({
      where: { id: customer.id },
      select: { totalDue: true },
    });
    const currentDue = new Prisma.Decimal(current?.totalDue ?? 0);
    const updated = currentDue.sub(new Prisma.Decimal(amount));
    const newDue = updated.lessThan(0) ? new Prisma.Decimal(0) : updated;

    await tx.customer.update({
      where: { id: customer.id },
      data: {
        totalDue: newDue.toFixed(2),
        lastPaymentAt: new Date(),
      },
    });
  });

  return { success: true };
}

/* --------------------------------------------------
   CUSTOMER STATEMENT
-------------------------------------------------- */
export async function getCustomerStatement(shopId: string, customerId: string) {
  const user = await getCurrentUser();
  await assertShopAccess(shopId, user);
  await assertCustomerInShop(customerId, shopId);

  return prisma.customerLedger.findMany({
    where: { shopId, customerId },
    orderBy: { entryDate: "asc" },
  });
}

/* --------------------------------------------------
   DUE SUMMARY (SHOP)
-------------------------------------------------- */
export async function getDueSummary(shopId: string) {
  const user = await getCurrentUser();
  await assertShopAccess(shopId, user);

  const rows = await prisma.customer.findMany({
    where: { shopId },
    orderBy: { totalDue: "desc" },
  });

  const customers = rows.map((c) => ({
    ...c,
    totalDue: Number(c.totalDue || 0),
    lastPaymentAt: c.lastPaymentAt ? c.lastPaymentAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
  }));

  const totalDue = customers.reduce(
    (sum, c: any) => sum + Number(c.totalDue || 0),
    0
  );

  const topDue = customers.slice(0, 5).map((c) => ({
    id: c.id,
    name: c.name,
    totalDue: Number(c.totalDue || 0),
    phone: c.phone,
  }));

  return { totalDue, topDue, customers };
}
