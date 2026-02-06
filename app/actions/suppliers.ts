// app/actions/suppliers.ts

"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { requirePermission } from "@/lib/rbac";
import { assertShopAccess } from "@/lib/shop-access";
import { parseDhakaDateOnlyRange } from "@/lib/dhaka-date";

export async function createSupplier(input: {
  shopId: string;
  name: string;
  phone?: string | null;
  address?: string | null;
}) {
  const user = await requireUser();
  requirePermission(user, "create_supplier");
  await assertShopAccess(input.shopId, user);

  const name = input.name.trim();
  if (!name) throw new Error("Supplier name is required");

  const existing = await prisma.supplier.findFirst({
    where: { shopId: input.shopId, name },
    select: { id: true },
  });
  if (existing) {
    return { success: true, supplierId: existing.id, alreadyExists: true };
  }

  const created = await prisma.supplier.create({
    data: {
      shopId: input.shopId,
      name,
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
    },
    select: { id: true },
  });

  return { success: true, supplierId: created.id };
}

export async function getSuppliersByShop(shopId: string) {
  const user = await requireUser();
  requirePermission(user, "view_suppliers");
  await assertShopAccess(shopId, user);

  const suppliers = await prisma.supplier.findMany({
    where: { shopId },
    orderBy: [{ createdAt: "desc" }],
  });

  const ledger = await prisma.supplierLedger.groupBy({
    by: ["supplierId", "entryType"],
    where: { shopId },
    _sum: { amount: true },
  });

  const totals = new Map<
    string,
    { purchase: number; payment: number }
  >();
  ledger.forEach((row) => {
    const current = totals.get(row.supplierId) || { purchase: 0, payment: 0 };
    const amount = Number(row._sum.amount ?? 0);
    if (row.entryType === "PURCHASE") current.purchase += amount;
    if (row.entryType === "PAYMENT") current.payment += amount;
    totals.set(row.supplierId, current);
  });

  return suppliers.map((s) => {
    const t = totals.get(s.id) || { purchase: 0, payment: 0 };
    return {
      id: s.id,
      name: s.name,
      phone: s.phone,
      address: s.address,
      createdAt: s.createdAt?.toISOString?.() ?? s.createdAt,
      purchaseTotal: Number(t.purchase.toFixed(2)),
      paymentTotal: Number(t.payment.toFixed(2)),
      balance: Number((t.purchase - t.payment).toFixed(2)),
    };
  });
}

export async function getSupplierStatement(input: {
  shopId: string;
  supplierId: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}) {
  const user = await requireUser();
  requirePermission(user, "view_suppliers");
  await assertShopAccess(input.shopId, user);

  const supplier = await prisma.supplier.findFirst({
    where: { id: input.supplierId, shopId: input.shopId },
  });
  if (!supplier) throw new Error("Supplier not found");

  const useRange = Boolean(input.from || input.to);
  const { start, end } = parseDhakaDateOnlyRange(input.from, input.to, true);
  const rangeFilter = useRange
    ? {
        businessDate: {
          gte: start || undefined,
          lte: end || undefined,
        },
      }
    : undefined;

  const page = Math.max(1, Math.floor(input.page ?? 1));
  const pageSize = Math.max(1, Math.min(Math.floor(input.pageSize ?? 20), 100));
  const skip = (page - 1) * pageSize;

  const [ledgerRows, totalCount] = await Promise.all([
    prisma.supplierLedger.findMany({
      where: {
        shopId: input.shopId,
        supplierId: input.supplierId,
        ...(rangeFilter || {}),
      },
      orderBy: [{ entryDate: "desc" }],
      skip,
      take: pageSize,
    }),
    prisma.supplierLedger.count({
      where: {
        shopId: input.shopId,
        supplierId: input.supplierId,
        ...(rangeFilter || {}),
      },
    }),
  ]);

  const purchasesDue = await prisma.purchase.findMany({
    where: {
      shopId: input.shopId,
      supplierId: input.supplierId,
      dueAmount: { gt: 0 },
    },
    select: { purchaseDate: true, dueAmount: true },
  });

  const today = new Date();
  const buckets = {
    "0-7": 0,
    "8-30": 0,
    "31-60": 0,
    "61-90": 0,
    "90+": 0,
  } as Record<string, number>;

  purchasesDue.forEach((p) => {
    const date = new Date(p.purchaseDate);
    const days = Math.floor((today.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));
    const due = Number(p.dueAmount ?? 0);
    if (days <= 7) buckets["0-7"] += due;
    else if (days <= 30) buckets["8-30"] += due;
    else if (days <= 60) buckets["31-60"] += due;
    else if (days <= 90) buckets["61-90"] += due;
    else buckets["90+"] += due;
  });

  const totals = await prisma.supplierLedger.groupBy({
    by: ["entryType"],
    where: {
      shopId: input.shopId,
      supplierId: input.supplierId,
    },
    _sum: { amount: true },
  });

  let purchaseTotal = 0;
  let paymentTotal = 0;
  totals.forEach((row) => {
    const amount = Number(row._sum.amount ?? 0);
    if (row.entryType === "PURCHASE") purchaseTotal += amount;
    if (row.entryType === "PAYMENT") paymentTotal += amount;
  });

  const ageingPercent = (bucket: number, total: number) =>
    total > 0 ? Number(((bucket / total) * 100).toFixed(1)) : 0;

  const ageingTotal = Object.values(buckets).reduce((sum, v) => sum + v, 0);
  const ageingWithPercent = Object.fromEntries(
    Object.entries(buckets).map(([label, value]) => [
      label,
      {
        amount: Number(value.toFixed(2)),
        percent: ageingPercent(value, ageingTotal),
      },
    ])
  );

  return {
    supplier: {
      id: supplier.id,
      name: supplier.name,
      phone: supplier.phone,
      address: supplier.address,
    },
    totals: {
      purchaseTotal,
      paymentTotal,
      balance: Number((purchaseTotal - paymentTotal).toFixed(2)),
    },
    ageing: ageingWithPercent,
    ledger: ledgerRows.map((row) => ({
      id: row.id,
      entryType: row.entryType,
      amount: row.amount?.toString?.() ?? "0",
      note: row.note,
      entryDate: row.entryDate?.toISOString?.() ?? row.entryDate,
    })),
    ledgerMeta: {
      page,
      pageSize,
      total: totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    },
  };
}
