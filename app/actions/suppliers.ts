// app/actions/suppliers.ts

"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { requirePermission } from "@/lib/rbac";
import { assertShopAccess } from "@/lib/shop-access";
import { parseDhakaDateOnlyRange } from "@/lib/dhaka-date";
import { shopHasInventoryModule } from "@/lib/accounting/cogs";

const SUPPLIER_AGE_BUCKETS = ["0-30", "31-60", "61-90", "90+"] as const;

type SupplierAgeBucket = (typeof SUPPLIER_AGE_BUCKETS)[number];

function getSupplierAgeBucket(days: number): SupplierAgeBucket {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

function createEmptyAgeingBuckets() {
  return {
    "0-30": 0,
    "31-60": 0,
    "61-90": 0,
    "90+": 0,
  } as Record<SupplierAgeBucket, number>;
}

async function loadSupplierMetricRows(shopId: string) {
  const suppliers = await prisma.supplier.findMany({
    where: { shopId },
    orderBy: [{ createdAt: "desc" }],
  });

  const [ledger, purchaseAgg, returnAgg, paymentAgg, purchasesDue] = await Promise.all([
    prisma.supplierLedger.groupBy({
      by: ["supplierId", "entryType"],
      where: { shopId },
      _sum: { amount: true },
    }),
    prisma.purchase.groupBy({
      by: ["supplierId"],
      where: { shopId, supplierId: { not: null } },
      _sum: { totalAmount: true, landedCostTotal: true },
      _count: { _all: true },
      _max: { purchaseDate: true },
    }),
    prisma.purchaseReturn.groupBy({
      by: ["supplierId"],
      where: { shopId, supplierId: { not: null } },
      _sum: { totalAmount: true, supplierCredit: true },
      _count: { _all: true },
      _max: { returnDate: true },
    }),
    prisma.purchasePayment.groupBy({
      by: ["supplierId"],
      where: { shopId },
      _sum: { amount: true },
      _max: { paidAt: true },
    }),
    prisma.purchase.findMany({
      where: { shopId, supplierId: { not: null }, dueAmount: { gt: 0 } },
      select: { supplierId: true, purchaseDate: true, dueAmount: true },
    }),
  ]);

  const ledgerTotals = new Map<
    string,
    { purchase: number; payment: number; purchaseReturn: number }
  >();
  for (const row of ledger) {
    const current = ledgerTotals.get(row.supplierId) || {
      purchase: 0,
      payment: 0,
      purchaseReturn: 0,
    };
    const amount = Number(row._sum.amount ?? 0);
    if (row.entryType === "PURCHASE") current.purchase += amount;
    if (row.entryType === "PAYMENT") current.payment += amount;
    if (row.entryType === "PURCHASE_RETURN") current.purchaseReturn += amount;
    ledgerTotals.set(row.supplierId, current);
  }

  const purchaseMap = new Map(
    purchaseAgg.map((row) => [
      row.supplierId!,
      {
        purchaseCount: row._count._all ?? 0,
        landedCostTotal: Number(row._sum.landedCostTotal ?? 0),
        lastPurchaseDate: row._max.purchaseDate,
      },
    ])
  );

  const returnMap = new Map(
    returnAgg.map((row) => [
      row.supplierId!,
      {
        purchaseReturnCount: row._count._all ?? 0,
        supplierCreditTotal: Number(row._sum.supplierCredit ?? 0),
        lastReturnDate: row._max.returnDate,
      },
    ])
  );

  const paymentMap = new Map(
    paymentAgg.map((row) => [
      row.supplierId,
      {
        lastPaymentDate: row._max.paidAt,
      },
    ])
  );

  const dueMap = new Map<
    string,
    {
      oldestDueDays: number;
      ageingAmounts: Record<SupplierAgeBucket, number>;
      ageingBucket: SupplierAgeBucket | null;
    }
  >();
  const today = new Date();
  for (const purchase of purchasesDue) {
    if (!purchase.supplierId) continue;
    const days = Math.max(
      0,
      Math.floor((today.getTime() - new Date(purchase.purchaseDate).getTime()) / (24 * 60 * 60 * 1000))
    );
    const bucket = getSupplierAgeBucket(days);
    const due = Number(purchase.dueAmount ?? 0);
    const current = dueMap.get(purchase.supplierId) || {
      oldestDueDays: 0,
      ageingAmounts: createEmptyAgeingBuckets(),
      ageingBucket: null as SupplierAgeBucket | null,
    };
    current.oldestDueDays = Math.max(current.oldestDueDays, days);
    current.ageingAmounts[bucket] = Number((current.ageingAmounts[bucket] + due).toFixed(2));
    current.ageingBucket = getSupplierAgeBucket(current.oldestDueDays);
    dueMap.set(purchase.supplierId, current);
  }

  return suppliers.map((supplier) => {
    const ledgerRow = ledgerTotals.get(supplier.id) || {
      purchase: 0,
      payment: 0,
      purchaseReturn: 0,
    };
    const purchaseRow = purchaseMap.get(supplier.id);
    const returnRow = returnMap.get(supplier.id);
    const paymentRow = paymentMap.get(supplier.id);
    const dueRow = dueMap.get(supplier.id);
    const purchaseTotal = Number(ledgerRow.purchase.toFixed(2));
    const paymentTotal = Number(ledgerRow.payment.toFixed(2));
    const purchaseReturnTotal = Number(ledgerRow.purchaseReturn.toFixed(2));
    const balance = Number((purchaseTotal - paymentTotal - purchaseReturnTotal).toFixed(2));
    const returnRatePercent =
      purchaseTotal > 0
        ? Number(((purchaseReturnTotal / purchaseTotal) * 100).toFixed(1))
        : 0;

    return {
      id: supplier.id,
      name: supplier.name,
      phone: supplier.phone,
      address: supplier.address,
      createdAt: supplier.createdAt?.toISOString?.() ?? supplier.createdAt,
      purchaseTotal,
      paymentTotal,
      purchaseReturnTotal,
      balance,
      purchaseCount: purchaseRow?.purchaseCount ?? 0,
      purchaseReturnCount: returnRow?.purchaseReturnCount ?? 0,
      landedCostTotal: Number((purchaseRow?.landedCostTotal ?? 0).toFixed(2)),
      supplierCreditTotal: Number((returnRow?.supplierCreditTotal ?? 0).toFixed(2)),
      lastPurchaseDate: purchaseRow?.lastPurchaseDate?.toISOString?.() ?? null,
      lastPaymentDate: paymentRow?.lastPaymentDate?.toISOString?.() ?? null,
      lastReturnDate: returnRow?.lastReturnDate?.toISOString?.() ?? null,
      oldestDueDays: dueRow?.oldestDueDays ?? 0,
      ageingBucket: dueRow?.ageingBucket ?? null,
      ageingAmounts: dueRow?.ageingAmounts ?? createEmptyAgeingBuckets(),
      returnRatePercent,
    };
  });
}

async function assertInventoryModuleEnabled(shopId: string) {
  const enabled = await shopHasInventoryModule(shopId);
  if (!enabled) {
    throw new Error(
      "Purchases/Suppliers module is disabled for this shop. Enable it from shop settings first."
    );
  }
}

export async function createSupplier(input: {
  shopId: string;
  name: string;
  phone?: string | null;
  address?: string | null;
}) {
  const user = await requireUser();
  requirePermission(user, "create_supplier");
  await assertShopAccess(input.shopId, user);
  await assertInventoryModuleEnabled(input.shopId);

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
  await assertInventoryModuleEnabled(shopId);
  return loadSupplierMetricRows(shopId);
}

export async function getSupplierPerformanceSummary(shopId: string) {
  const user = await requireUser();
  requirePermission(user, "view_suppliers");
  await assertShopAccess(shopId, user);
  await assertInventoryModuleEnabled(shopId);

  const rows = await loadSupplierMetricRows(shopId);
  const totals = rows.reduce(
    (acc, row) => {
      acc.totalPurchased += row.purchaseTotal;
      acc.totalReturned += row.purchaseReturnTotal;
      acc.totalPayments += row.paymentTotal;
      acc.totalPayable += row.balance;
      acc.totalLandedCost += row.landedCostTotal;
      if (row.balance > 0) acc.overdueSupplierCount += 1;
      for (const bucket of SUPPLIER_AGE_BUCKETS) {
        acc.ageingBuckets[bucket] = Number(
          (acc.ageingBuckets[bucket] + (row.ageingAmounts?.[bucket] ?? 0)).toFixed(2)
        );
      }
      return acc;
    },
    {
      totalPurchased: 0,
      totalReturned: 0,
      totalPayments: 0,
      totalPayable: 0,
      totalLandedCost: 0,
      overdueSupplierCount: 0,
      ageingBuckets: createEmptyAgeingBuckets(),
    }
  );

  const topPurchaseSupplier =
    rows
      .filter((row) => row.purchaseTotal > 0)
      .sort((a, b) => b.purchaseTotal - a.purchaseTotal)[0] ?? null;
  const topReturnSupplier =
    rows
      .filter((row) => row.purchaseReturnTotal > 0)
      .sort((a, b) => b.purchaseReturnTotal - a.purchaseReturnTotal)[0] ?? null;
  const topPayableSupplier =
    rows
      .filter((row) => row.balance > 0)
      .sort((a, b) => b.balance - a.balance)[0] ?? null;

  return {
    overview: {
      supplierCount: rows.length,
      totalPurchased: Number(totals.totalPurchased.toFixed(2)),
      totalReturned: Number(totals.totalReturned.toFixed(2)),
      totalPayments: Number(totals.totalPayments.toFixed(2)),
      totalPayable: Number(totals.totalPayable.toFixed(2)),
      totalLandedCost: Number(totals.totalLandedCost.toFixed(2)),
      overdueSupplierCount: totals.overdueSupplierCount,
      ageingBuckets: totals.ageingBuckets,
      topPurchaseSupplier: topPurchaseSupplier
        ? {
            id: topPurchaseSupplier.id,
            name: topPurchaseSupplier.name,
            amount: topPurchaseSupplier.purchaseTotal,
            purchaseCount: topPurchaseSupplier.purchaseCount,
          }
        : null,
      topReturnSupplier: topReturnSupplier
        ? {
            id: topReturnSupplier.id,
            name: topReturnSupplier.name,
            amount: topReturnSupplier.purchaseReturnTotal,
            returnRatePercent: topReturnSupplier.returnRatePercent,
          }
        : null,
      topPayableSupplier: topPayableSupplier
        ? {
            id: topPayableSupplier.id,
            name: topPayableSupplier.name,
            amount: topPayableSupplier.balance,
            oldestDueDays: topPayableSupplier.oldestDueDays,
          }
        : null,
    },
    rows,
  };
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
  await assertInventoryModuleEnabled(input.shopId);

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
  let purchaseReturnTotal = 0;
  totals.forEach((row) => {
    const amount = Number(row._sum.amount ?? 0);
    if (row.entryType === "PURCHASE") purchaseTotal += amount;
    if (row.entryType === "PAYMENT") paymentTotal += amount;
    if (row.entryType === "PURCHASE_RETURN") purchaseReturnTotal += amount;
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
      purchaseReturnTotal,
      balance: Number((purchaseTotal - paymentTotal - purchaseReturnTotal).toFixed(2)),
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
