// app/actions/products.ts

"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { requirePermission } from "@/lib/rbac";
import { assertShopAccess } from "@/lib/shop-access";

import { type CursorToken } from "@/lib/cursor-pagination";

// ---------------------------------
// TYPES
// ---------------------------------
type CreateProductInput = {
  shopId: string;
  name: string;
  category: string;
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
  buyPrice?: string | null;
  sellPrice: string;
  stockQty: string;
  isActive: boolean;
  createdAt: string;
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

  await prisma.product.create({
    data: {
      shopId: input.shopId,
      name: input.name,
      category: input.category || "Uncategorized",
      buyPrice: buyPrice === null ? null : buyPrice ?? undefined,
      sellPrice,
      stockQty,
      isActive: input.isActive,
      trackStock,
    },
  });

  return { success: true };
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
      buyPrice: true,
      sellPrice: true,
      stockQty: true,
      isActive: true,
      trackStock: true,
      createdAt: true,
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
      buyPrice: true,
      sellPrice: true,
      stockQty: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip,
    take: safePageSize,
  });

  const items: ProductListRow[] = rows.map((product) => ({
    id: product.id,
    name: product.name,
    category: product.category,
    buyPrice:
      product.buyPrice === null ? null : product.buyPrice?.toString() ?? null,
    sellPrice: product.sellPrice.toString(),
    stockQty: product.stockQty.toString(),
    isActive: product.isActive,
    createdAt: product.createdAt.toISOString(),
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
        buyPrice: true,
        sellPrice: true,
        stockQty: true,
        isActive: true,
        createdAt: true,
      },
    }),
    prisma.product.count({ where: baseWhere }),
  ]);

  const hasMore = rows.length > safeLimit;
  const pageRows = rows.slice(0, safeLimit);

  const items: ProductListRow[] = pageRows.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    buyPrice: p.buyPrice?.toString?.() ?? (p as any).buyPrice ?? null,
    sellPrice: p.sellPrice?.toString?.() ?? (p as any).sellPrice ?? "0",
    stockQty: p.stockQty?.toString?.() ?? (p as any).stockQty ?? "0",
    isActive: p.isActive,
    createdAt: p.createdAt.toISOString(),
  }));

  const last = pageRows[pageRows.length - 1];
  const nextCursor: CursorToken | null =
    hasMore && last
      ? { createdAt: last.createdAt.toISOString(), id: last.id }
      : null;

  return { items, totalCount, nextCursor, hasMore };
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
  const resolvedStockQty = trackStockFlag ? stockQty : "0";
  const payload: Record<string, any> = {};

  if (data.name !== undefined) payload.name = data.name;
  if (data.category !== undefined) payload.category = data.category;
  if (data.isActive !== undefined) payload.isActive = data.isActive;
  if (data.trackStock !== undefined) payload.trackStock = data.trackStock;
  if (buyPrice !== undefined) payload.buyPrice = buyPrice;
  if (sellPrice !== undefined) payload.sellPrice = sellPrice;
  if (resolvedStockQty !== undefined) payload.stockQty = resolvedStockQty;

  await prisma.product.update({
    where: { id },
    data: payload,
  });

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

    return {
      success: true,
      deleted: false,
      archived: true,
      message:
        "This product has existing sales and was marked inactive instead of deleting to keep your sale history intact.",
    };
  }

  await prisma.product.delete({ where: { id } });

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
      shopId: true,
      name: true,
      category: true,
      buyPrice: true,
      sellPrice: true,
      stockQty: true,
      trackStock: true,
      isActive: true,
      createdAt: true,
    },
  });

  // Convert Prisma Decimal/Date values to plain serializable primitives for client components
  return rows.map((p) => ({
    ...p,
    buyPrice: p.buyPrice === null ? null : p.buyPrice.toString(),
    sellPrice: p.sellPrice.toString(),
    stockQty: p.stockQty.toString(),
    createdAt: p.createdAt.toISOString(),
  }));
}
