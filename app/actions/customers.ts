// app/actions/customers.ts

"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { assertShopAccess } from "@/lib/shop-access";
import { requirePermission } from "@/lib/rbac";
import { toDhakaBusinessDate } from "@/lib/dhaka-date";

type CreateCustomerInput = {
  shopId: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  creditLimit?: number | null;
};

type PaymentInput = {
  shopId: string;
  customerId: string;
  amount: number;
  description?: string | null;
};

export type DueSaleRow = {
  saleId: string;
  invoiceNo: string | null;
  saleDate: string;
  dueDate: string | null;
  totalAmount: string;
  paidAmount: string;
  remainingAmount: string;
  daysOverdue: number | null;
  agingBucket: "current" | "1-30" | "31-60" | "61-90" | "90+" | null;
};

export type AgingReportRow = {
  customerId: string;
  customerName: string;
  phone: string | null;
  current: string;
  b1_30: string;
  b31_60: string;
  b61_90: string;
  b90plus: string;
  totalDue: string;
};

export type AgingReport = {
  asOf: string;
  totals: {
    current: string;
    b1_30: string;
    b31_60: string;
    b61_90: string;
    b90plus: string;
    total: string;
  };
  rows: AgingReportRow[];
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
   AGING BUCKET HELPER
-------------------------------------------------- */
function computeAgingBucket(
  dueDate: Date | null
): { bucket: DueSaleRow["agingBucket"]; daysOverdue: number | null } {
  if (!dueDate) return { bucket: null, daysOverdue: null };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);

  const diffMs = today.getTime() - due.getTime();
  const daysLate = Math.floor(diffMs / 86400000);

  if (daysLate <= 0) return { bucket: "current", daysOverdue: 0 };
  if (daysLate <= 30) return { bucket: "1-30", daysOverdue: daysLate };
  if (daysLate <= 60) return { bucket: "31-60", daysOverdue: daysLate };
  if (daysLate <= 90) return { bucket: "61-90", daysOverdue: daysLate };
  return { bucket: "90+", daysOverdue: daysLate };
}

/* --------------------------------------------------
   CREATE CUSTOMER
-------------------------------------------------- */
export async function createCustomer(input: CreateCustomerInput) {
  const user = await getCurrentUser();
  requirePermission(user, "create_customer");
  await assertShopAccess(input.shopId, user);

  const name = input.name?.trim();
  if (!name) throw new Error("Name is required");

  const creditLimit =
    typeof input.creditLimit === "number" && input.creditLimit > 0
      ? input.creditLimit
      : null;

  const inserted = await prisma.customer.create({
    data: {
      shopId: input.shopId,
      name,
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
      creditLimit: creditLimit !== null ? creditLimit.toFixed(2) : null,
    },
    select: { id: true },
  });

  return { id: inserted.id };
}

/* --------------------------------------------------
   UPDATE CREDIT LIMIT
-------------------------------------------------- */
export async function updateCustomerCreditLimit(input: {
  shopId: string;
  customerId: string;
  creditLimit: number | null;
}) {
  const user = await getCurrentUser();
  requirePermission(user, "create_customer");
  await assertShopAccess(input.shopId, user);
  await assertCustomerInShop(input.customerId, input.shopId);

  const creditLimit =
    typeof input.creditLimit === "number" && input.creditLimit > 0
      ? input.creditLimit.toFixed(2)
      : null;

  await prisma.customer.update({
    where: { id: input.customerId },
    data: { creditLimit },
  });

  return { success: true };
}

/* --------------------------------------------------
   LIST CUSTOMERS (WITH DUE + CREDIT LIMIT)
-------------------------------------------------- */
export async function getCustomersByShop(shopId: string) {
  const user = await getCurrentUser();
  requirePermission(user, "view_customers");
  await assertShopAccess(shopId, user);

  const rows = await prisma.customer.findMany({
    where: { shopId },
    select: {
      id: true,
      name: true,
      phone: true,
      address: true,
      totalDue: true,
      creditLimit: true,
      lastPaymentAt: true,
      createdAt: true,
    },
    orderBy: { totalDue: "desc" },
  });

  return rows.map((c) => ({
    ...c,
    totalDue: Number(c.totalDue || 0),
    creditLimit: c.creditLimit !== null ? Number(c.creditLimit) : null,
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
  requirePermission(user, "create_due_entry");
  await assertShopAccess(input.shopId, user);
  const customer = await assertCustomerInShop(input.customerId, input.shopId);

  const amount = Number(input.amount || 0);
  if (!amount || amount <= 0) throw new Error("Amount must be positive");

  await prisma.$transaction(async (tx) => {
    const businessDate = toDhakaBusinessDate();
    await tx.customerLedger.create({
      data: {
        shopId: input.shopId,
        customerId: input.customerId,
        entryType: "SALE",
        amount: amount.toFixed(2),
        description: input.description || "Due sale",
        businessDate,
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
  requirePermission(user, "take_due_payment");
  await assertShopAccess(input.shopId, user);
  const customer = await assertCustomerInShop(input.customerId, input.shopId);

  const amount = Number(input.amount || 0);
  if (!amount || amount <= 0) throw new Error("Amount must be positive");

  await prisma.$transaction(async (tx) => {
    const businessDate = toDhakaBusinessDate();

    await tx.customerLedger.create({
      data: {
        shopId: input.shopId,
        customerId: input.customerId,
        entryType: "PAYMENT",
        amount: amount.toFixed(2),
        description: input.description || "Payment",
        businessDate,
      },
    });

    await tx.cashEntry.create({
      data: {
        shopId: input.shopId,
        entryType: "IN",
        amount: amount.toFixed(2),
        reason: `Due payment from customer: ${customer.name}`,
        businessDate,
      },
    });

    // FIFO allocation: apply payment to oldest unpaid invoices first
    const unpaidSales = await tx.sale.findMany({
      where: {
        shopId: input.shopId,
        customerId: input.customerId,
        paymentMethod: "due",
        status: "COMPLETED",
      },
      select: { id: true, totalAmount: true, paidAmount: true },
      orderBy: { saleDate: "asc" },
    });

    let remaining = new Prisma.Decimal(amount);

    for (const sale of unpaidSales) {
      if (remaining.lessThanOrEqualTo(0)) break;

      const invoiceRemaining = new Prisma.Decimal(sale.totalAmount).sub(
        new Prisma.Decimal(sale.paidAmount)
      );
      if (invoiceRemaining.lessThanOrEqualTo(0)) continue;

      const apply = remaining.lessThan(invoiceRemaining)
        ? remaining
        : invoiceRemaining;

      await tx.sale.update({
        where: { id: sale.id },
        data: {
          paidAmount: new Prisma.Decimal(sale.paidAmount).add(apply).toFixed(2),
        },
      });

      remaining = remaining.sub(apply);
    }

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
   CUSTOMER STATEMENT (with invoice/due date)
-------------------------------------------------- */
export async function getCustomerStatement(shopId: string, customerId: string) {
  const user = await getCurrentUser();
  requirePermission(user, "view_customer_due");
  await assertShopAccess(shopId, user);
  await assertCustomerInShop(customerId, shopId);

  const rows = await prisma.customerLedger.findMany({
    where: { shopId, customerId },
    orderBy: { entryDate: "asc" },
    select: {
      id: true,
      entryType: true,
      amount: true,
      description: true,
      entryDate: true,
      businessDate: true,
      saleId: true,
      sale: {
        select: {
          dueDate: true,
          invoiceNo: true,
        },
      },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    entryType: r.entryType,
    amount: r.amount.toFixed(2),
    description: r.description,
    entryDate: r.entryDate.toISOString(),
    businessDate: r.businessDate ? r.businessDate.toISOString().split("T")[0] : null,
    saleId: r.saleId ?? null,
    dueDate: r.sale?.dueDate
      ? r.sale.dueDate.toISOString().split("T")[0]
      : null,
    invoiceNo: r.sale?.invoiceNo ?? null,
  }));
}

/* --------------------------------------------------
   CUSTOMER DUE SALES (per-invoice breakdown)
-------------------------------------------------- */
export async function getCustomerDueSales(
  shopId: string,
  customerId: string
): Promise<DueSaleRow[]> {
  const user = await getCurrentUser();
  requirePermission(user, "view_customer_due");
  await assertShopAccess(shopId, user);
  await assertCustomerInShop(customerId, shopId);

  const sales = await prisma.sale.findMany({
    where: {
      shopId,
      customerId,
      paymentMethod: "due",
      status: "COMPLETED",
    },
    select: {
      id: true,
      invoiceNo: true,
      saleDate: true,
      dueDate: true,
      totalAmount: true,
      paidAmount: true,
    },
    orderBy: { saleDate: "desc" },
  });

  return sales
    .map((s) => {
      const total = Number(s.totalAmount);
      const paid = Number(s.paidAmount);
      const remaining = Math.max(0, total - paid);
      const { bucket, daysOverdue } = computeAgingBucket(s.dueDate);

      return {
        saleId: s.id,
        invoiceNo: s.invoiceNo ?? null,
        saleDate: s.saleDate.toISOString(),
        dueDate: s.dueDate ? s.dueDate.toISOString().split("T")[0] : null,
        totalAmount: total.toFixed(2),
        paidAmount: paid.toFixed(2),
        remainingAmount: remaining.toFixed(2),
        daysOverdue,
        agingBucket: bucket,
      };
    })
    .filter((r) => parseFloat(r.remainingAmount) > 0.001);
}

/* --------------------------------------------------
   AGING REPORT (shop-wide)
-------------------------------------------------- */
export async function getAgingReport(shopId: string): Promise<AgingReport> {
  const user = await getCurrentUser();
  requirePermission(user, "view_due_summary");
  await assertShopAccess(shopId, user);

  const sales = await prisma.sale.findMany({
    where: {
      shopId,
      paymentMethod: "due",
      status: "COMPLETED",
    },
    select: {
      id: true,
      dueDate: true,
      totalAmount: true,
      paidAmount: true,
      customer: {
        select: { id: true, name: true, phone: true },
      },
    },
  });

  // Group by customer, compute bucket sums
  const customerMap = new Map<
    string,
    {
      customerId: string;
      customerName: string;
      phone: string | null;
      current: number;
      b1_30: number;
      b31_60: number;
      b61_90: number;
      b90plus: number;
    }
  >();

  for (const s of sales) {
    if (!s.customer) continue;
    const remaining = Number(s.totalAmount) - Number(s.paidAmount);
    if (remaining <= 0.001) continue;

    const { bucket } = computeAgingBucket(s.dueDate);
    const cid = s.customer.id;

    if (!customerMap.has(cid)) {
      customerMap.set(cid, {
        customerId: cid,
        customerName: s.customer.name,
        phone: s.customer.phone ?? null,
        current: 0,
        b1_30: 0,
        b31_60: 0,
        b61_90: 0,
        b90plus: 0,
      });
    }

    const entry = customerMap.get(cid)!;
    if (bucket === "current" || bucket === null) entry.current += remaining;
    else if (bucket === "1-30") entry.b1_30 += remaining;
    else if (bucket === "31-60") entry.b31_60 += remaining;
    else if (bucket === "61-90") entry.b61_90 += remaining;
    else if (bucket === "90+") entry.b90plus += remaining;
  }

  const rows: AgingReportRow[] = Array.from(customerMap.values())
    .map((c) => ({
      customerId: c.customerId,
      customerName: c.customerName,
      phone: c.phone,
      current: c.current.toFixed(2),
      b1_30: c.b1_30.toFixed(2),
      b31_60: c.b31_60.toFixed(2),
      b61_90: c.b61_90.toFixed(2),
      b90plus: c.b90plus.toFixed(2),
      totalDue: (
        c.current +
        c.b1_30 +
        c.b31_60 +
        c.b61_90 +
        c.b90plus
      ).toFixed(2),
    }))
    .sort((a, b) => parseFloat(b.totalDue) - parseFloat(a.totalDue));

  const totals = rows.reduce(
    (acc, r) => ({
      current: acc.current + parseFloat(r.current),
      b1_30: acc.b1_30 + parseFloat(r.b1_30),
      b31_60: acc.b31_60 + parseFloat(r.b31_60),
      b61_90: acc.b61_90 + parseFloat(r.b61_90),
      b90plus: acc.b90plus + parseFloat(r.b90plus),
    }),
    { current: 0, b1_30: 0, b31_60: 0, b61_90: 0, b90plus: 0 }
  );

  const grandTotal =
    totals.current +
    totals.b1_30 +
    totals.b31_60 +
    totals.b61_90 +
    totals.b90plus;

  return {
    asOf: new Date().toISOString().split("T")[0],
    totals: {
      current: totals.current.toFixed(2),
      b1_30: totals.b1_30.toFixed(2),
      b31_60: totals.b31_60.toFixed(2),
      b61_90: totals.b61_90.toFixed(2),
      b90plus: totals.b90plus.toFixed(2),
      total: grandTotal.toFixed(2),
    },
    rows,
  };
}

/* --------------------------------------------------
   DUE SUMMARY (SHOP)
-------------------------------------------------- */
export async function getDueSummary(shopId: string) {
  const user = await getCurrentUser();
  requirePermission(user, "view_due_summary");
  await assertShopAccess(shopId, user);

  const rows = await prisma.customer.findMany({
    where: { shopId },
    orderBy: { totalDue: "desc" },
  });

  const customers = rows.map((c) => ({
    ...c,
    totalDue: Number(c.totalDue || 0),
    creditLimit: c.creditLimit !== null ? Number(c.creditLimit) : null,
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
