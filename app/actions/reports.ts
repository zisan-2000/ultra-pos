// app/actions/reports.ts

"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";

// --------------------------------------------------
// DATE HELPERS
// --------------------------------------------------
function parseRange(from?: string, to?: string) {
  const start = from ? new Date(from) : undefined;
  const end = to ? new Date(to) : undefined;

  if (start) start.setUTCHours(0, 0, 0, 0);
  if (end) end.setUTCHours(23, 59, 59, 999);

  return { start, end };
}

// --------------------------------------------------
// LOW STOCK PRODUCTS
// --------------------------------------------------
export async function getLowStockProducts(shopId: string, limit = 10) {
  await requireUser();

  const rows = await prisma.products.findMany({
    where: {
      shop_id: shopId,
      is_active: true,
      stock_qty: { lte: limit },
    },
    orderBy: { stock_qty: "asc" },
    take: 50,
  });

  return rows.map((p) => ({
    ...p,
    stock_qty: Number(p.stock_qty),
  }));
}

// --------------------------------------------------
// PAYMENT METHOD SUMMARY
// --------------------------------------------------
export async function getPaymentMethodSummary(shopId: string) {
  await requireUser();

  const rows = await prisma.sales.findMany({
    where: { shop_id: shopId },
  });

  const grouped: Record<string, number> = {};

  rows.forEach((s) => {
    const method = s.payment_method || "cash";
    if (!grouped[method]) grouped[method] = 0;
    grouped[method] += Number(s.total_amount);
  });

  return Object.entries(grouped).map(([name, value]) => ({
    name,
    value,
  }));
}

// --------------------------------------------------
// TOP PRODUCTS
// --------------------------------------------------
export async function getTopProducts(shopId: string, limit = 10) {
  await requireUser();

  const items = await prisma.sale_items.findMany({
    where: {
      sales: { shop_id: shopId },
    },
    include: { products: true },
  });

  const map: Record<string, { name: string; qty: number; revenue: number }> =
    {};

  for (const item of items) {
    const id = item.product_id;
    if (!map[id]) {
      map[id] = {
        name: item.products.name,
        qty: 0,
        revenue: 0,
      };
    }

    const qty = Number(item.quantity);
    const price = Number(item.unit_price);

    map[id].qty += qty;
    map[id].revenue += qty * price;
  }

  return Object.values(map)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, limit);
}

// --------------------------------------------------
// PROFIT TREND
// --------------------------------------------------
export async function getProfitTrend(
  shopId: string,
  from?: string,
  to?: string
) {
  await requireUser();

  const { start, end } = parseRange(from, to);

  const salesRows = await prisma.sales.findMany({
    where: {
      shop_id: shopId,
      sale_date: {
        gte: start,
        lte: end,
      },
    },
  });

  const expenseRows = await prisma.expenses.findMany({
    where: {
      shop_id: shopId,
      expense_date: {
        gte: start,
        lte: end,
      },
    },
  });

  const map: Record<string, { sales: number; expense: number }> = {};

  const fmt = (d: Date) => d.toISOString().split("T")[0];

  // accumulate sales
  salesRows.forEach((s) => {
    const day = fmt(s.sale_date);
    if (!map[day]) map[day] = { sales: 0, expense: 0 };
    map[day].sales += Number(s.total_amount);
  });

  // accumulate expenses
  expenseRows.forEach((e) => {
    const day = fmt(e.expense_date);
    if (!map[day]) map[day] = { sales: 0, expense: 0 };
    map[day].expense += Number(e.amount);
  });

  // add COGS
  // (Reuse your existing COGS logic)
  return Object.entries(map).map(([date, v]) => ({
    date,
    sales: v.sales,
    expense: v.expense,
  }));
}

// --------------------------------------------------
// TODAY MINI REPORT
// --------------------------------------------------
export async function getTodayMiniSummary(shopId: string) {
  await requireUser();

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const todayDate = today.toISOString().split("T")[0];

  const salesRows = await prisma.sales.findMany({
    where: {
      shop_id: shopId,
      sale_date: { gte: today },
    },
  });

  const expenseRows = await prisma.expenses.findMany({
    where: {
      shop_id: shopId,
      expense_date: todayDate,
    },
  });

  const cashRows = await prisma.cash_entries.findMany({
    where: {
      shop_id: shopId,
      created_at: { gte: today },
    },
  });

  return {
    sales: salesRows,
    expenses: expenseRows,
    cash: cashRows,
  };
}

// --------------------------------------------------
// SALES WITH FILTER
// --------------------------------------------------
export async function getSalesWithFilter(
  shopId: string,
  from?: string,
  to?: string
) {
  await requireUser();

  const start = from ? new Date(from) : undefined;
  const end = to ? new Date(to) : undefined;

  if (start) start.setUTCHours(0, 0, 0, 0);
  if (end) end.setUTCHours(23, 59, 59, 999);

  return await prisma.sales.findMany({
    where: {
      shop_id: shopId,
      sale_date: { gte: start, lte: end },
    },
    orderBy: { sale_date: "desc" },
  });
}

// --------------------------------------------------
// EXPENSES WITH FILTER
// --------------------------------------------------
export async function getExpensesWithFilter(
  shopId: string,
  from?: string,
  to?: string
) {
  await requireUser();

  const start = from ? new Date(from) : undefined;
  const end = to ? new Date(to) : undefined;

  if (start) start.setUTCHours(0, 0, 0, 0);
  if (end) end.setUTCHours(23, 59, 59, 999);

  return await prisma.expenses.findMany({
    where: {
      shop_id: shopId,
      expense_date: { gte: start, lte: end },
    },
    orderBy: { expense_date: "desc" },
  });
}

// --------------------------------------------------
// CASH WITH FILTER
// --------------------------------------------------
export async function getCashWithFilter(
  shopId: string,
  from?: string,
  to?: string
) {
  await requireUser();

  const start = from ? new Date(from) : undefined;
  const end = to ? new Date(to) : undefined;

  if (start) start.setUTCHours(0, 0, 0, 0);
  if (end) end.setUTCHours(23, 59, 59, 999);

  return await prisma.cash_entries.findMany({
    where: {
      shop_id: shopId,
      created_at: { gte: start, lte: end },
    },
    orderBy: { created_at: "desc" },
  });
}

// --------------------------------------------------
// TODAY SUMMARY WITH PROFIT
// --------------------------------------------------
export async function getTodaySummary(shopId: string) {
  await requireUser();

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const todayDate = today.toISOString().split("T")[0];
  const todayEnd = new Date(today);
  todayEnd.setUTCHours(23, 59, 59, 999);

  const salesRows = await prisma.sales.findMany({
    where: {
      shop_id: shopId,
      sale_date: { gte: today },
    },
  });

  const expensesRows = await prisma.expenses.findMany({
    where: {
      shop_id: shopId,
      expense_date: todayDate,
    },
  });

  const totalSales = salesRows.reduce(
    (sum, s) => sum + Number(s.total_amount),
    0
  );

  const totalExpenses = expensesRows.reduce(
    (sum, e) => sum + Number(e.amount),
    0
  );

  // TODO: Add COGS if needed (your existing logic)

  return {
    sales: totalSales,
    expenses: totalExpenses,
    profit: totalSales - totalExpenses,
  };
}
