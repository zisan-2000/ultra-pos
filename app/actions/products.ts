// app/actions/products.ts

"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";

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

// ---------------------------------
// AUTH HELPERS
// ---------------------------------
async function assertShopBelongsToUser(shopId: string, userId: string) {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
  });

  if (!shop || shop.ownerId !== userId) {
    throw new Error("Unauthorized access to this shop");
  }

  return shop;
}

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
  const baseUnit =
    input.baseUnit?.toString().trim().toLowerCase() || "pcs";

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
  await assertShopBelongsToUser(input.shopId, user.id);

  const buyPrice = normalizeMoneyInput(input.buyPrice);
  const sellPrice = normalizeNumberInput(input.sellPrice, {
    field: "Sell price",
  });
  const normalizedStock = normalizeNumberInput(input.stockQty, {
    defaultValue: "0",
    field: "Stock quantity",
  });
  const trackStock = input.trackStock === undefined ? false : Boolean(input.trackStock);
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
  await assertShopBelongsToUser(shopId, user.id);

  return prisma.product.findMany({
    where: { shopId },
  });
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

  await assertShopBelongsToUser(product.shopId, user.id);

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
  await assertShopBelongsToUser(product.shopId, user.id);

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
  const { trackStock, ...rest } = data;
  const payload: any = {
    ...rest,
    ...(buyPrice !== undefined ? { buyPrice } : {}),
    ...(sellPrice !== undefined ? { sellPrice } : {}),
    ...(resolvedStockQty !== undefined ? { stockQty: resolvedStockQty } : {}),
  };

  if (trackStock !== undefined) {
    payload.trackStock = trackStock;
  }

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
  });

  if (!product) throw new Error("Product not found");

  const user = await requireUser();
  await assertShopBelongsToUser(product.shopId, user.id);

  await prisma.product.delete({ where: { id } });

  return { success: true };
}

// ---------------------------------
// ACTIVE PRODUCTS (POS)
// ---------------------------------
export async function getActiveProductsByShop(shopId: string) {
  const user = await requireUser();
  await assertShopBelongsToUser(shopId, user.id);

  return prisma.product.findMany({
    where: { shopId, isActive: true },
  });
}
