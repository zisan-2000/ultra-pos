// app/actions/products.ts

"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { requirePermission } from "@/lib/rbac";
import { assertShopAccess } from "@/lib/shop-access";
import { Prisma } from "@prisma/client";
import { revalidateReportsForProduct } from "@/lib/reports/revalidate";
import { getDhakaBusinessDate } from "@/lib/dhaka-date";

import { type CursorToken } from "@/lib/cursor-pagination";

// ---------------------------------
// TYPES
// ---------------------------------
type CreateProductInput = {
  id?: string;
  shopId: string;
  name: string;
  category: string;
  sku?: string | null;
  barcode?: string | null;
  buyPrice?: string | number | null;
  sellPrice: string;
  stockQty: string;
  isActive: boolean;
  trackStock?: boolean;
  businessType?: string;
  expiryDate?: string | null;
  size?: string | null;
};

type UpdateProductInput = {
  name?: string;
  category?: string;
  sku?: string | null;
  barcode?: string | null;
  buyPrice?: string | number | null;
  sellPrice?: string;
  stockQty?: string;
  isActive?: boolean;
  trackStock?: boolean;
  businessType?: string;
  expiryDate?: string | null;
  size?: string | null;
};

type ProductListRow = {
  id: string;
  name: string;
  category: string;
  sku?: string | null;
  barcode?: string | null;
  buyPrice?: string | null;
  sellPrice: string;
  stockQty: string;
  trackStock: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  metrics?: ProductCardMetrics;
};

export type ProductCardMetrics = {
  soldQtyToday: string;
  returnedQtyToday: string;
  exchangeQtyToday: string;
  netQtyToday: string;
  soldQty30d: string;
  returnedQty30d: string;
  returnRate30d: string;
  lastReturnAt: string | null;
};

export type ProductReturnInsightEvent = {
  id: string;
  returnId: string;
  returnNo: string;
  kind: "returned" | "exchange_out";
  saleId: string;
  saleInvoiceNo: string | null;
  businessDate: string | null;
  createdAt: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  reason: string | null;
  note: string | null;
};

export type ProductReturnInsight = {
  productId: string;
  metrics: ProductCardMetrics;
  totals: {
    returnedQty: string;
    exchangeQty: string;
    netQty: string;
    returnedAmount: string;
    exchangeAmount: string;
  };
  events: ProductReturnInsightEvent[];
};

type ProductStatusFilter = "all" | "active" | "inactive";

type GetProductsByShopPaginatedInput = {
  shopId: string;
  page?: number;
  pageSize?: number;
  query?: string | null;
  status?: ProductStatusFilter;
};

type GetProductsByShopCursorPaginatedInput = {
  shopId: string;
  limit?: number;
  cursor?: { createdAt: Date; id: string } | null;
  query?: string | null;
  status?: ProductStatusFilter;
};

// ---------------------------------
// HELPERS
// ---------------------------------
function normalizeMoneyInput(value?: string | number | null) {
  if (value === undefined) return undefined;
  const str = value === null ? "" : value.toString().trim();
  if (!str) return null;
  const parsed = Number(str);
  return Number.isFinite(parsed) ? str : null;
}

function normalizeNumberInput(
  value: string | number | null | undefined,
  options?: { defaultValue?: string; field?: string }
) {
  const str =
    value === undefined || value === null ? "" : value.toString().trim();

  if (!str) {
    if (options?.defaultValue !== undefined) return options.defaultValue;
    throw new Error(`${options?.field ?? "Value"} is required`);
  }

  const parsed = Number(str);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${options?.field ?? "Value"} must be a valid number`);
  }

  return parsed.toString();
}

function normalizeProductCodeInput(value: unknown) {
  if (value === undefined) return undefined;
  const raw = value === null ? "" : String(value);
  const normalized = raw.trim().replace(/\s+/g, "").toUpperCase().slice(0, 80);
  return normalized || null;
}

function throwFriendlyCodeConflict(err: unknown): never {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002"
  ) {
    const target = Array.isArray(err.meta?.target) ? err.meta?.target : [];
    if (target.some((item) => String(item).includes("sku"))) {
      throw new Error("SKU already exists in this shop");
    }
    if (target.some((item) => String(item).includes("barcode"))) {
      throw new Error("Barcode already exists in this shop");
    }
  }
  throw err instanceof Error ? err : new Error("Product save failed");
}

function toSafeNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toFixedDecimal(value: number, digits = 2) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return (0).toFixed(digits);
  return n.toFixed(digits);
}

function emptyProductCardMetrics(): ProductCardMetrics {
  return {
    soldQtyToday: "0.00",
    returnedQtyToday: "0.00",
    exchangeQtyToday: "0.00",
    netQtyToday: "0.00",
    soldQty30d: "0.00",
    returnedQty30d: "0.00",
    returnRate30d: "0.0",
    lastReturnAt: null,
  };
}

async function buildProductCardMetrics(
  shopId: string,
  productIds: string[]
): Promise<Map<string, ProductCardMetrics>> {
  const metricsByProduct = new Map<string, ProductCardMetrics>();
  if (productIds.length === 0) return metricsByProduct;

  const today = getDhakaBusinessDate();
  const start30d = new Date(today);
  start30d.setUTCDate(start30d.getUTCDate() - 29);

  const [
    salesTodayRows,
    returnTodayRows,
    exchangeTodayRows,
    sales30Rows,
    return30Rows,
    lastReturnItemRows,
    lastExchangeRows,
  ] = await Promise.all([
    prisma.saleItem.groupBy({
      by: ["productId"],
      where: {
        productId: { in: productIds },
        sale: {
          shopId,
          status: { not: "VOIDED" },
          businessDate: { gte: today, lte: today },
        },
      },
      _sum: { quantity: true },
    }),
    prisma.saleReturnItem.groupBy({
      by: ["productId"],
      where: {
        productId: { in: productIds },
        saleReturn: {
          shopId,
          status: "completed",
          businessDate: { gte: today, lte: today },
        },
      },
      _sum: { quantity: true },
    }),
    prisma.saleReturnExchangeItem.groupBy({
      by: ["productId"],
      where: {
        productId: { in: productIds },
        saleReturn: {
          shopId,
          status: "completed",
          businessDate: { gte: today, lte: today },
        },
      },
      _sum: { quantity: true },
    }),
    prisma.saleItem.groupBy({
      by: ["productId"],
      where: {
        productId: { in: productIds },
        sale: {
          shopId,
          status: { not: "VOIDED" },
          businessDate: { gte: start30d, lte: today },
        },
      },
      _sum: { quantity: true },
    }),
    prisma.saleReturnItem.groupBy({
      by: ["productId"],
      where: {
        productId: { in: productIds },
        saleReturn: {
          shopId,
          status: "completed",
          businessDate: { gte: start30d, lte: today },
        },
      },
      _sum: { quantity: true },
    }),
    prisma.saleReturnItem.groupBy({
      by: ["productId"],
      where: {
        productId: { in: productIds },
        saleReturn: { shopId, status: "completed" },
      },
      _max: { createdAt: true },
    }),
    prisma.saleReturnExchangeItem.groupBy({
      by: ["productId"],
      where: {
        productId: { in: productIds },
        saleReturn: { shopId, status: "completed" },
      },
      _max: { createdAt: true },
    }),
  ]);

  const salesToday = new Map(
    salesTodayRows.map((row) => [row.productId, toSafeNumber(row._sum.quantity)])
  );
  const returnToday = new Map(
    returnTodayRows.map((row) => [row.productId, toSafeNumber(row._sum.quantity)])
  );
  const exchangeToday = new Map(
    exchangeTodayRows.map((row) => [row.productId, toSafeNumber(row._sum.quantity)])
  );
  const sales30 = new Map(
    sales30Rows.map((row) => [row.productId, toSafeNumber(row._sum.quantity)])
  );
  const returns30 = new Map(
    return30Rows.map((row) => [row.productId, toSafeNumber(row._sum.quantity)])
  );

  const lastReturnAt = new Map<string, Date>();
  for (const row of lastReturnItemRows) {
    if (!row._max.createdAt) continue;
    lastReturnAt.set(row.productId, row._max.createdAt);
  }
  for (const row of lastExchangeRows) {
    if (!row._max.createdAt) continue;
    const prev = lastReturnAt.get(row.productId);
    if (!prev || row._max.createdAt.getTime() > prev.getTime()) {
      lastReturnAt.set(row.productId, row._max.createdAt);
    }
  }

  for (const productId of productIds) {
    const soldQtyToday = salesToday.get(productId) ?? 0;
    const returnedQtyToday = returnToday.get(productId) ?? 0;
    const exchangeQtyToday = exchangeToday.get(productId) ?? 0;
    const soldQty30d = sales30.get(productId) ?? 0;
    const returnedQty30d = returns30.get(productId) ?? 0;
    const netQtyToday = soldQtyToday - returnedQtyToday + exchangeQtyToday;
    const returnRate30d =
      soldQty30d > 0 ? (returnedQty30d / soldQty30d) * 100 : 0;

    metricsByProduct.set(productId, {
      soldQtyToday: toFixedDecimal(soldQtyToday, 2),
      returnedQtyToday: toFixedDecimal(returnedQtyToday, 2),
      exchangeQtyToday: toFixedDecimal(exchangeQtyToday, 2),
      netQtyToday: toFixedDecimal(netQtyToday, 2),
      soldQty30d: toFixedDecimal(soldQty30d, 2),
      returnedQty30d: toFixedDecimal(returnedQty30d, 2),
      returnRate30d: toFixedDecimal(returnRate30d, 1),
      lastReturnAt: lastReturnAt.get(productId)?.toISOString() ?? null,
    });
  }

  return metricsByProduct;
}

function normalizeUnitCreate(input: {
  baseUnit?: string;
  displayUnit?: string | null;
  conversion?: string | number;
}) {
  const baseUnit = input.baseUnit?.toString().trim().toLowerCase() || "pcs";

  const displayUnit =
    input.displayUnit === undefined
      ? null
      : input.displayUnit === null
      ? null
      : input.displayUnit.toString().trim().toLowerCase() || null;

  const convNum = Number(input.conversion);
  const conversion =
    Number.isFinite(convNum) && convNum > 0 ? convNum.toString() : "1";

  return { baseUnit, displayUnit, conversion };
}

function normalizeUnitUpdate(
  input: {
    baseUnit?: string;
    displayUnit?: string | null;
    conversion?: string | number;
  },
  existing: { conversion?: string | null }
) {
  const patch: any = {};

  if (input.baseUnit !== undefined) {
    patch.baseUnit = input.baseUnit.toString().trim().toLowerCase() || "pcs";
  }

  if (input.displayUnit !== undefined) {
    patch.displayUnit =
      input.displayUnit === null
        ? null
        : input.displayUnit.toString().trim().toLowerCase() || null;
  }

  if (input.conversion !== undefined) {
    const convNum = Number(input.conversion);
    patch.conversion =
      Number.isFinite(convNum) && convNum > 0
        ? convNum.toString()
        : existing.conversion ?? "1";
  }

  return patch;
}

// ---------------------------------
// CREATE PRODUCT
// ---------------------------------
export async function createProduct(input: CreateProductInput) {
  const user = await requireUser();
  requirePermission(user, "create_product");
  await assertShopAccess(input.shopId, user);

  const buyPrice = normalizeMoneyInput(input.buyPrice);
  const sellPrice = normalizeNumberInput(input.sellPrice, {
    field: "Sell price",
  });
  const normalizedStock = normalizeNumberInput(input.stockQty, {
    defaultValue: "0",
    field: "Stock quantity",
  });
  const trackStock =
    input.trackStock === undefined ? false : Boolean(input.trackStock);
  const stockQty = trackStock ? normalizedStock : "0";
  const sku = normalizeProductCodeInput(input.sku);
  const barcode = normalizeProductCodeInput(input.barcode);

  const data: any = {
    shopId: input.shopId,
    name: input.name,
    category: input.category || "Uncategorized",
    sku: sku === undefined ? undefined : sku,
    barcode: barcode === undefined ? undefined : barcode,
    buyPrice: buyPrice === null ? null : buyPrice ?? undefined,
    sellPrice,
    stockQty,
    isActive: input.isActive,
    trackStock,
  };

  if (input.id) {
    data.id = input.id;
  }

  let created: { id: string };
  try {
    created = await prisma.product.create({ data });
  } catch (err) {
    throwFriendlyCodeConflict(err);
  }

  revalidateReportsForProduct();
  return { success: true, id: created.id };
}

// ---------------------------------
// GET PRODUCTS BY SHOP
// ---------------------------------
export async function getProductsByShop(shopId: string) {
  const user = await requireUser();
  requirePermission(user, "view_products");
  await assertShopAccess(shopId, user);

  return prisma.product.findMany({
    where: { shopId },
    select: {
      id: true,
      name: true,
      category: true,
      sku: true,
      barcode: true,
      buyPrice: true,
      sellPrice: true,
      stockQty: true,
      isActive: true,
      trackStock: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

// ---------------------------------
// GET PRODUCTS BY SHOP (PAGINATED + SEARCH)
// ---------------------------------
export async function getProductsByShopPaginated({
  shopId,
  page = 1,
  pageSize = 12,
  query,
  status = "all",
}: GetProductsByShopPaginatedInput) {
  const user = await requireUser();
  requirePermission(user, "view_products");
  await assertShopAccess(shopId, user);

  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.max(1, Math.min(Math.floor(pageSize), 100));
  const normalizedQuery = (query || "").trim();
  const where: any = { shopId };

  if (status === "active") {
    where.isActive = true;
  } else if (status === "inactive") {
    where.isActive = false;
  }

  if (normalizedQuery) {
    where.OR = [
      { name: { contains: normalizedQuery, mode: "insensitive" } },
      { category: { contains: normalizedQuery, mode: "insensitive" } },
      { sku: { contains: normalizedQuery, mode: "insensitive" } },
      { barcode: { contains: normalizedQuery, mode: "insensitive" } },
    ];
  }

  const totalCount = await prisma.product.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));
  const resolvedPage = Math.min(safePage, totalPages);
  const skip = (resolvedPage - 1) * safePageSize;

  const rows = await prisma.product.findMany({
    where,
    select: {
      id: true,
      name: true,
      category: true,
      sku: true,
      barcode: true,
      buyPrice: true,
      sellPrice: true,
      stockQty: true,
      trackStock: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip,
    take: safePageSize,
  });

  const items: ProductListRow[] = rows.map((product) => ({
    id: product.id,
    name: product.name,
    category: product.category,
    sku: (product as any).sku ?? null,
    barcode: (product as any).barcode ?? null,
    buyPrice:
      product.buyPrice === null ? null : product.buyPrice?.toString() ?? null,
    sellPrice: product.sellPrice.toString(),
    stockQty: product.stockQty.toString(),
    trackStock: Boolean(product.trackStock),
    isActive: product.isActive,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  }));

  return {
    items,
    totalCount,
    totalPages,
    page: resolvedPage,
    pageSize: safePageSize,
  };
}

// ---------------------------------
// GET PRODUCTS BY SHOP (CURSOR PAGINATED + SEARCH)
// ---------------------------------
export async function getProductsByShopCursorPaginated({
  shopId,
  limit = 12,
  cursor,
  query,
  status = "all",
}: GetProductsByShopCursorPaginatedInput): Promise<{
  items: ProductListRow[];
  totalCount: number;
  nextCursor: CursorToken | null;
  hasMore: boolean;
}> {
  const user = await requireUser();
  requirePermission(user, "view_products");
  await assertShopAccess(shopId, user);

  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 100));
  const normalizedQuery = (query || "").trim();

  const baseWhere: any = { shopId };
  if (status === "active") {
    baseWhere.isActive = true;
  } else if (status === "inactive") {
    baseWhere.isActive = false;
  }

  if (normalizedQuery) {
    baseWhere.OR = [
      { name: { contains: normalizedQuery, mode: "insensitive" } },
      { category: { contains: normalizedQuery, mode: "insensitive" } },
      { sku: { contains: normalizedQuery, mode: "insensitive" } },
      { barcode: { contains: normalizedQuery, mode: "insensitive" } },
    ];
  }

  const where: any = { ...baseWhere };

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

  const [rows, totalCount] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: safeLimit + 1,
      select: {
        id: true,
        name: true,
        category: true,
        sku: true,
        barcode: true,
        buyPrice: true,
        sellPrice: true,
        stockQty: true,
        trackStock: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.product.count({ where: baseWhere }),
  ]);

  const hasMore = rows.length > safeLimit;
  const pageRows = rows.slice(0, safeLimit);
  const metricsByProduct = await buildProductCardMetrics(
    shopId,
    pageRows.map((row) => row.id)
  );

  const items: ProductListRow[] = pageRows.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    sku: (p as any).sku ?? null,
    barcode: (p as any).barcode ?? null,
    buyPrice: p.buyPrice?.toString?.() ?? (p as any).buyPrice ?? null,
    sellPrice: p.sellPrice?.toString?.() ?? (p as any).sellPrice ?? "0",
    stockQty: p.stockQty?.toString?.() ?? (p as any).stockQty ?? "0",
    trackStock: Boolean(p.trackStock),
    isActive: p.isActive,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    metrics: metricsByProduct.get(p.id) ?? emptyProductCardMetrics(),
  }));

  const last = pageRows[pageRows.length - 1];
  const nextCursor: CursorToken | null =
    hasMore && last
      ? { createdAt: last.createdAt.toISOString(), id: last.id }
      : null;

  return { items, totalCount, nextCursor, hasMore };
}

// ---------------------------------
// PRODUCT RETURN / EXCHANGE INSIGHTS
// ---------------------------------
export async function getProductReturnInsights(
  productId: string,
  limit = 12
): Promise<ProductReturnInsight> {
  const user = await requireUser();
  requirePermission(user, "view_products");

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, shopId: true },
  });

  if (!product) {
    throw new Error("Product not found");
  }

  await assertShopAccess(product.shopId, user);

  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 50));
  const metricsMap = await buildProductCardMetrics(product.shopId, [product.id]);
  const metrics = metricsMap.get(product.id) ?? emptyProductCardMetrics();

  const rows = await prisma.saleReturn.findMany({
    where: {
      shopId: product.shopId,
      status: "completed",
      OR: [
        { items: { some: { productId: product.id } } },
        { exchangeItems: { some: { productId: product.id } } },
      ],
    },
    select: {
      id: true,
      returnNo: true,
      saleId: true,
      businessDate: true,
      createdAt: true,
      reason: true,
      note: true,
      sale: {
        select: {
          invoiceNo: true,
        },
      },
      items: {
        where: { productId: product.id },
        select: {
          id: true,
          quantity: true,
          unitPrice: true,
          lineTotal: true,
        },
      },
      exchangeItems: {
        where: { productId: product.id },
        select: {
          id: true,
          quantity: true,
          unitPrice: true,
          lineTotal: true,
        },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: safeLimit * 3,
  });

  const events: ProductReturnInsightEvent[] = [];
  for (const row of rows) {
    for (const item of row.items) {
      events.push({
        id: `${row.id}:returned:${item.id}`,
        returnId: row.id,
        returnNo: row.returnNo,
        kind: "returned",
        saleId: row.saleId,
        saleInvoiceNo: row.sale?.invoiceNo ?? null,
        businessDate: row.businessDate?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        lineTotal: item.lineTotal.toString(),
        reason: row.reason ?? null,
        note: row.note ?? null,
      });
    }

    for (const item of row.exchangeItems) {
      events.push({
        id: `${row.id}:exchange:${item.id}`,
        returnId: row.id,
        returnNo: row.returnNo,
        kind: "exchange_out",
        saleId: row.saleId,
        saleInvoiceNo: row.sale?.invoiceNo ?? null,
        businessDate: row.businessDate?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        lineTotal: item.lineTotal.toString(),
        reason: row.reason ?? null,
        note: row.note ?? null,
      });
    }
  }

  events.sort((a, b) => {
    const byDate =
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (byDate !== 0) return byDate;
    return b.id.localeCompare(a.id);
  });

  const limitedEvents = events.slice(0, safeLimit);

  let returnedQty = 0;
  let exchangeQty = 0;
  let returnedAmount = 0;
  let exchangeAmount = 0;

  for (const event of limitedEvents) {
    const qty = toSafeNumber(event.quantity);
    const amount = toSafeNumber(event.lineTotal);
    if (event.kind === "returned") {
      returnedQty += qty;
      returnedAmount += amount;
    } else {
      exchangeQty += qty;
      exchangeAmount += amount;
    }
  }

  return {
    productId: product.id,
    metrics,
    totals: {
      returnedQty: toFixedDecimal(returnedQty, 2),
      exchangeQty: toFixedDecimal(exchangeQty, 2),
      netQty: toFixedDecimal(exchangeQty - returnedQty, 2),
      returnedAmount: toFixedDecimal(returnedAmount, 2),
      exchangeAmount: toFixedDecimal(exchangeAmount, 2),
    },
    events: limitedEvents,
  };
}

// ---------------------------------
// GET SINGLE PRODUCT
// ---------------------------------
export async function getProduct(id: string) {
  const user = await requireUser();

  const product = await prisma.product.findUnique({
    where: { id },
  });

  if (!product) throw new Error("Product not found");

  requirePermission(user, "view_products");
  await assertShopAccess(product.shopId, user);

  return product;
}

// ---------------------------------
// UPDATE PRODUCT
// ---------------------------------
export async function updateProduct(id: string, data: UpdateProductInput) {
  const product = await prisma.product.findUnique({
    where: { id },
  });

  if (!product) throw new Error("Product not found");
  const user = await requireUser();
  requirePermission(user, "update_product");
  await assertShopAccess(product.shopId, user);

  const buyPrice = normalizeMoneyInput(data.buyPrice);
  const sellPrice =
    data.sellPrice !== undefined
      ? normalizeNumberInput(data.sellPrice, { field: "Sell price" })
      : undefined;
  const stockQty =
    data.stockQty !== undefined
      ? normalizeNumberInput(data.stockQty, {
          defaultValue: "0",
          field: "Stock quantity",
        })
      : undefined;
  const trackStockFlag =
    data.trackStock !== undefined
      ? data.trackStock
      : product.trackStock ?? false;
  const sku = normalizeProductCodeInput(data.sku);
  const barcode = normalizeProductCodeInput(data.barcode);
  const resolvedStockQty = trackStockFlag ? stockQty : "0";
  const payload: Record<string, any> = {};

  if (data.name !== undefined) payload.name = data.name;
  if (data.category !== undefined) payload.category = data.category;
  if (sku !== undefined) payload.sku = sku;
  if (barcode !== undefined) payload.barcode = barcode;
  if (data.isActive !== undefined) payload.isActive = data.isActive;
  if (data.trackStock !== undefined) payload.trackStock = data.trackStock;
  if (buyPrice !== undefined) payload.buyPrice = buyPrice;
  if (sellPrice !== undefined) payload.sellPrice = sellPrice;
  if (resolvedStockQty !== undefined) payload.stockQty = resolvedStockQty;

  try {
    await prisma.product.update({
      where: { id },
      data: payload,
    });
  } catch (err) {
    throwFriendlyCodeConflict(err);
  }

  revalidateReportsForProduct();
  return { success: true };
}

// ---------------------------------
// DELETE PRODUCT
// ---------------------------------
export async function deleteProduct(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    select: { id: true, shopId: true },
  });

  if (!product) throw new Error("Product not found");

  const user = await requireUser();
  requirePermission(user, "delete_product");
  await assertShopAccess(product.shopId, user);

  const saleItemsCount = await prisma.saleItem.count({
    where: { productId: id },
  });

  if (saleItemsCount > 0) {
    await prisma.product.update({
      where: { id },
      data: {
        isActive: false,
        trackStock: false,
      },
    });

    revalidateReportsForProduct();
    return {
      success: true,
      deleted: false,
      archived: true,
      message:
        "This product has existing sales and was marked inactive instead of deleting to keep your sale history intact.",
    };
  }

  await prisma.product.delete({ where: { id } });

  revalidateReportsForProduct();
  return { success: true, deleted: true };
}

// ---------------------------------
// ACTIVE PRODUCTS (POS)
// ---------------------------------
export async function getActiveProductsByShop(shopId: string) {
  const user = await requireUser();
  requirePermission(user, "view_products");
  await assertShopAccess(shopId, user);

  const rows = await prisma.product.findMany({
    where: { shopId, isActive: true },
    select: {
      id: true,
      name: true,
      category: true,
      sku: true,
      barcode: true,
      sellPrice: true,
      stockQty: true,
      trackStock: true,
    },
  });

  // Convert Prisma Decimal values to serializable primitives for client components
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    sku: (p as any).sku ?? null,
    barcode: (p as any).barcode ?? null,
    sellPrice: p.sellPrice.toString(),
    stockQty: p.stockQty?.toString() ?? "0",
    trackStock: p.trackStock,
  }));
}
