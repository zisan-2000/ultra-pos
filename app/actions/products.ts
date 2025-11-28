// app/actions/products.ts

"use server";

import { db } from "@/db/client";
import { products, shops } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { createServerClientForRoute } from "@/lib/supabase";

// ---------------------------------
// TYPES
// ---------------------------------
type CreateProductInput = {
  shopId: string;
  name: string;
  category: string;
  baseUnit?: string;
  displayUnit?: string | null;
  conversion?: string | number;
  buyPrice?: string | number | null;
  sellPrice: string;
  stockQty: string;
  isActive: boolean;
};

type UpdateProductInput = {
  name?: string;
  category?: string;
  baseUnit?: string;
  displayUnit?: string | null;
  conversion?: string | number;
  buyPrice?: string | number | null;
  sellPrice?: string;
  stockQty?: string;
  isActive?: boolean;
};

// ---------------------------------
// AUTH HELPERS
// ---------------------------------
async function getCurrentUser() {
  const cookieStore = await cookies();
  const supabase = createServerClientForRoute(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");
  return user;
}

async function assertShopBelongsToUser(shopId: string, userId: string) {
  const shop = await db.query.shops.findFirst({
    where: eq(shops.id, shopId),
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
  const user = await getCurrentUser();
  await assertShopBelongsToUser(input.shopId, user.id);

  const buyPrice = normalizeMoneyInput(input.buyPrice);
  const units = normalizeUnitCreate({
    baseUnit: input.baseUnit,
    displayUnit: input.displayUnit,
    conversion: input.conversion,
  });

  await db.insert(products).values({
    shopId: input.shopId,
    name: input.name,
    category: input.category || "Uncategorized",
    baseUnit: units.baseUnit,
    displayUnit: units.displayUnit,
    conversion: units.conversion,
    buyPrice,
    sellPrice: input.sellPrice,
    stockQty: input.stockQty,
    isActive: input.isActive,
  });

  return { success: true };
}

// ---------------------------------
// GET PRODUCTS BY SHOP
// ---------------------------------
export async function getProductsByShop(shopId: string) {
  const user = await getCurrentUser();
  await assertShopBelongsToUser(shopId, user.id);

  const rows = await db
    .select()
    .from(products)
    .where(eq(products.shopId, shopId));

  return rows;
}

// ---------------------------------
// GET SINGLE PRODUCT
// ---------------------------------
export async function getProduct(id: string) {
  const user = await getCurrentUser();

  const product = await db.query.products.findFirst({
    where: eq(products.id, id),
  });

  if (!product) throw new Error("Product not found");

  await assertShopBelongsToUser(product.shopId, user.id);

  return product;
}

// ---------------------------------
// UPDATE PRODUCT
// ---------------------------------
export async function updateProduct(id: string, data: UpdateProductInput) {
  const product = await db.query.products.findFirst({
    where: eq(products.id, id),
  });

  if (!product) throw new Error("Product not found");

  const user = await getCurrentUser();
  await assertShopBelongsToUser(product.shopId, user.id);

  const buyPrice = normalizeMoneyInput(data.buyPrice);
  const unitPatch = normalizeUnitUpdate(
    {
      baseUnit: data.baseUnit,
      displayUnit: data.displayUnit,
      conversion: data.conversion,
    },
    { conversion: product.conversion }
  );
  const payload = {
    ...data,
    ...(buyPrice !== undefined ? { buyPrice } : {}),
    ...unitPatch,
  };

  await db.update(products).set(payload).where(eq(products.id, id));

  return { success: true };
}

// ---------------------------------
// DELETE PRODUCT
// ---------------------------------
export async function deleteProduct(id: string) {
  const product = await db.query.products.findFirst({
    where: eq(products.id, id),
  });

  if (!product) throw new Error("Product not found");

  const user = await getCurrentUser();
  await assertShopBelongsToUser(product.shopId, user.id);

  await db.delete(products).where(eq(products.id, id));

  return { success: true };
}

// ---------------------------------
// ACTIVE PRODUCTS (POS)
// ---------------------------------
export async function getActiveProductsByShop(shopId: string) {
  const user = await getCurrentUser();
  await assertShopBelongsToUser(shopId, user.id);

  const rows = await db
    .select()
    .from(products)
    .where(
      and(eq(products.shopId, shopId), eq(products.isActive, true as any))
    );

  return rows;
}
