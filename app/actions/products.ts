// app/actions/products.ts

"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { hasAnyPermission, requirePermission } from "@/lib/rbac";
import { assertShopAccess } from "@/lib/shop-access";
import { Prisma, ProductSourceType } from "@prisma/client";
import { revalidateReportsForProduct } from "@/lib/reports/revalidate";
import { getDhakaBusinessDate } from "@/lib/dhaka-date";
import { buildProductSearchTerms } from "@/lib/product-search";

import { type CursorToken } from "@/lib/cursor-pagination";

// ---------------------------------
// TYPES
// ---------------------------------
type CreateProductInput = {
  id?: string;
  shopId: string;
  catalogProductId?: string | null;
  productSource?:
    | ProductSourceType
    | "manual"
    | "template"
    | "catalog"
    | "barcode"
    | null;
  name: string;
  category: string;
  sku?: string | null;
  barcode?: string | null;
  baseUnit?: string | null;
  buyPrice?: string | number | null;
  sellPrice: string;
  stockQty: string;
  isActive: boolean;
  trackStock?: boolean;
  reorderPoint?: number | null;
  businessType?: string;
  expiryDate?: string | null;
  size?: string | null;
  variants?: ProductVariantInput[] | null;
};

type UpdateProductInput = {
  catalogProductId?: string | null;
  productSource?:
    | ProductSourceType
    | "manual"
    | "template"
    | "catalog"
    | "barcode"
    | null;
  name?: string;
  category?: string;
  sku?: string | null;
  barcode?: string | null;
  baseUnit?: string | null;
  buyPrice?: string | number | null;
  sellPrice?: string;
  stockQty?: string;
  isActive?: boolean;
  trackStock?: boolean;
  reorderPoint?: number | null;
  businessType?: string;
  expiryDate?: string | null;
  size?: string | null;
  variants?: ProductVariantInput[] | null;
};

export type ProductVariantInput = {
  id?: string;
  label: string;
  sellPrice: string | number;
  stockQty?: string | number | null;
  sku?: string | null;
  barcode?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

type ProductListRow = {
  id: string;
  name: string;
  category: string;
  sku?: string | null;
  barcode?: string | null;
  baseUnit?: string;
  expiryDate?: string | null;
  size?: string | null;
  buyPrice?: string | null;
  sellPrice: string;
  stockQty: string;
  trackStock: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  variants?: Array<{
    id: string;
    label: string;
    sellPrice: string;
    stockQty: string;
    sku?: string | null;
    barcode?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  }>;
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

function normalizeProductSourceInput(
  value:
    | ProductSourceType
    | "manual"
    | "template"
    | "catalog"
    | "barcode"
    | null
    | undefined,
  fallback = ProductSourceType.manual
) {
  if (value === undefined || value === null) return fallback;
  switch (value) {
    case ProductSourceType.template:
      return ProductSourceType.template;
    case ProductSourceType.catalog:
      return ProductSourceType.catalog;
    case ProductSourceType.barcode:
      return ProductSourceType.barcode;
    default:
      return ProductSourceType.manual;
  }
}

const BANGLA_DIGIT_MAP: Record<string, string> = {
  "০": "0",
  "১": "1",
  "২": "2",
  "৩": "3",
  "৪": "4",
  "৫": "5",
  "৬": "6",
  "৭": "7",
  "৮": "8",
  "৯": "9",
};

const BANGLA_CHAR_MAP: Record<string, string> = {
  "অ": "A",
  "আ": "A",
  "ই": "I",
  "ঈ": "I",
  "উ": "U",
  "ঊ": "U",
  "ঋ": "RI",
  "এ": "E",
  "ঐ": "OI",
  "ও": "O",
  "ঔ": "OU",
  "ক": "K",
  "খ": "KH",
  "গ": "G",
  "ঘ": "GH",
  "ঙ": "NG",
  "চ": "CH",
  "ছ": "CHH",
  "জ": "J",
  "ঝ": "JH",
  "ঞ": "NY",
  "ট": "T",
  "ঠ": "TH",
  "ড": "D",
  "ঢ": "DH",
  "ণ": "N",
  "ত": "T",
  "থ": "TH",
  "দ": "D",
  "ধ": "DH",
  "ন": "N",
  "প": "P",
  "ফ": "F",
  "ব": "B",
  "ভ": "BH",
  "ম": "M",
  "য": "Y",
  "র": "R",
  "ল": "L",
  "শ": "SH",
  "ষ": "SH",
  "স": "S",
  "হ": "H",
  "ড়": "R",
  "ঢ়": "RH",
  "য়": "Y",
  "ৎ": "T",
  "ং": "N",
  "ঃ": "H",
  "ঁ": "N",
  "া": "A",
  "ি": "I",
  "ী": "I",
  "ু": "U",
  "ূ": "U",
  "ৃ": "RI",
  "ে": "E",
  "ৈ": "OI",
  "ো": "O",
  "ৌ": "OU",
  "্": "",
};

function transliterateProductName(value: string) {
  let output = "";
  for (const char of value) {
    if (BANGLA_DIGIT_MAP[char]) {
      output += BANGLA_DIGIT_MAP[char];
      continue;
    }
    if (BANGLA_CHAR_MAP[char] !== undefined) {
      output += BANGLA_CHAR_MAP[char];
      continue;
    }
    output += char;
  }
  return output;
}

function buildSuggestedSkuBase(name: string) {
  const transliterated = transliterateProductName(name);
  const ascii = transliterated
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x00-\x7F]/g, "");

  const cleaned = ascii
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const compact = cleaned
    .split("-")
    .filter(Boolean)
    .slice(0, 2)
    .join("-")
    .slice(0, 18);

  return compact || "PRD";
}

function buildSuggestedBarcodeBase(name: string) {
  const skuLikeBase = buildSuggestedSkuBase(name).replace(/-/g, "").slice(0, 8);
  return skuLikeBase || "ITEM";
}

function hashBarcodeShopSegment(shopId: string) {
  let hash = 0;
  for (const char of shopId) {
    hash = (hash * 31 + char.charCodeAt(0)) % 10000;
  }
  return String(hash).padStart(4, "0");
}

function computeEan13CheckDigit(twelveDigits: string) {
  if (!/^\d{12}$/.test(twelveDigits)) {
    throw new Error("EAN-13 body must contain exactly 12 digits");
  }

  let sum = 0;
  for (let i = 0; i < twelveDigits.length; i += 1) {
    const digit = Number(twelveDigits[i]);
    sum += i % 2 === 0 ? digit : digit * 3;
  }

  return String((10 - (sum % 10)) % 10);
}

function normalizeBaseUnitInput(
  value: unknown,
  options?: { defaultValue?: string }
) {
  if (value === undefined) {
    return options?.defaultValue ?? undefined;
  }
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 40);
  return normalized || options?.defaultValue || "pcs";
}

function normalizeNullableTextInput(value: unknown, maxLength = 80) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = String(value).trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizeDateOnlyInput(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("Expiry date must be a valid date");
  }
  return parsed;
}

type NormalizedProductVariant = {
  id?: string;
  label: string;
  sellPrice: string;
  stockQty: string;
  sku: string | null;
  barcode: string | null;
  sortOrder: number;
  isActive: boolean;
};

function normalizeVariantInputs(
  variants: unknown,
  options?: { fieldPrefix?: string }
) {
  if (variants === undefined) return undefined;
  if (variants === null) return [] as NormalizedProductVariant[];
  if (!Array.isArray(variants)) {
    throw new Error(`${options?.fieldPrefix ?? "Variants"} must be an array`);
  }

  const normalized: NormalizedProductVariant[] = [];
  const labelSet = new Set<string>();

  for (let index = 0; index < variants.length; index += 1) {
    const row = variants[index] as Record<string, unknown>;
    const label = normalizeNullableTextInput(row?.label, 80) ?? "";
    if (!label) continue;

    const labelKey = label.toLowerCase();
    if (labelSet.has(labelKey)) {
      throw new Error("Variant labels must be unique for a product");
    }
    labelSet.add(labelKey);

    const sellPrice = normalizeNumberInput(
      row?.sellPrice as string | number | null | undefined,
      {
      field: `Variant sell price (${label})`,
      }
    );
    const sku = normalizeProductCodeInput(row?.sku) ?? null;
    const barcode = normalizeProductCodeInput(row?.barcode) ?? null;
    const sortOrderRaw = Number(row?.sortOrder ?? index);
    const sortOrder = Number.isFinite(sortOrderRaw)
      ? Math.max(0, Math.floor(sortOrderRaw))
      : index;
    const isActive = row?.isActive === undefined ? true : Boolean(row?.isActive);
    const id =
      typeof row?.id === "string" && row.id.trim().length > 0
        ? row.id.trim()
        : undefined;

    const stockQtyRaw = normalizeNumberInput(
      row?.stockQty as string | number | null | undefined,
      { defaultValue: "0", field: `Variant stock (${label})` }
    );
    const stockQty = stockQtyRaw ?? "0";

    normalized.push({
      id,
      label,
      sellPrice,
      stockQty,
      sku,
      barcode,
      sortOrder,
      isActive,
    });
  }

  return normalized;
}

async function assertNoCodeCollisionsInShop(params: {
  shopId: string;
  excludeProductId?: string;
  productSku?: string | null;
  productBarcode?: string | null;
  variants?: NormalizedProductVariant[] | undefined;
}) {
  const codes = new Set<string>();
  const addCode = (value: string | null | undefined) => {
    if (!value) return;
    if (codes.has(value)) {
      throw new Error(`Duplicate SKU/Barcode "${value}" in this product`);
    }
    codes.add(value);
  };

  addCode(params.productSku ?? null);
  addCode(params.productBarcode ?? null);
  for (const variant of params.variants ?? []) {
    addCode(variant.sku);
    addCode(variant.barcode);
  }

  const allCodes = Array.from(codes);
  if (allCodes.length === 0) return;

  const [productHits, variantHits] = await Promise.all([
    prisma.product.findMany({
      where: {
        shopId: params.shopId,
        ...(params.excludeProductId ? { id: { not: params.excludeProductId } } : {}),
        OR: [{ sku: { in: allCodes } }, { barcode: { in: allCodes } }],
      },
      select: { sku: true, barcode: true },
      take: 50,
    }),
    prisma.productVariant.findMany({
      where: {
        shopId: params.shopId,
        ...(params.excludeProductId ? { productId: { not: params.excludeProductId } } : {}),
        OR: [{ sku: { in: allCodes } }, { barcode: { in: allCodes } }],
      },
      select: { sku: true, barcode: true },
      take: 50,
    }),
  ]);

  const conflicts = new Set<string>();
  for (const row of productHits) {
    if (row.sku && codes.has(row.sku)) conflicts.add(row.sku);
    if (row.barcode && codes.has(row.barcode)) conflicts.add(row.barcode);
  }
  for (const row of variantHits) {
    if (row.sku && codes.has(row.sku)) conflicts.add(row.sku);
    if (row.barcode && codes.has(row.barcode)) conflicts.add(row.barcode);
  }

  if (conflicts.size > 0) {
    const code = Array.from(conflicts)[0];
    throw new Error(`SKU/Barcode "${code}" already exists in this shop`);
  }
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
    if (target.some((item) => String(item).includes("product_variants_shop_sku"))) {
      throw new Error("Variant SKU already exists in this shop");
    }
    if (
      target.some((item) =>
        String(item).includes("product_variants_shop_barcode")
      )
    ) {
      throw new Error("Variant barcode already exists in this shop");
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
  const baseUnit = normalizeBaseUnitInput(input.baseUnit, { defaultValue: "pcs" });
  const expiryDate = normalizeDateOnlyInput(input.expiryDate);
  const size = normalizeNullableTextInput(input.size, 80);
  const variants = normalizeVariantInputs(input.variants, {
    fieldPrefix: "Variants",
  });
  const productSource = normalizeProductSourceInput(input.productSource);

  await assertNoCodeCollisionsInShop({
    shopId: input.shopId,
    productSku: sku ?? null,
    productBarcode: barcode ?? null,
    variants,
  });

  const data: any = {
    shopId: input.shopId,
    catalogProductId: input.catalogProductId ?? null,
    productSource,
    name: input.name,
    category: input.category || "Uncategorized",
    sku: sku === undefined ? undefined : sku,
    barcode: barcode === undefined ? undefined : barcode,
    baseUnit: baseUnit ?? "pcs",
    expiryDate: expiryDate === undefined ? undefined : expiryDate,
    size: size === undefined ? undefined : size,
    buyPrice: buyPrice === null ? null : buyPrice ?? undefined,
    sellPrice,
    stockQty,
    isActive: input.isActive,
    trackStock,
    reorderPoint: trackStock && input.reorderPoint != null ? input.reorderPoint : null,
  };

  if (input.id) {
    data.id = input.id;
  }

  let created: { id: string };
  try {
    created = await prisma.$transaction(async (tx) => {
      const createdProduct = await tx.product.create({ data });
      if (variants && variants.length > 0) {
        await tx.productVariant.createMany({
          data: variants.map((variant, index) => ({
            id: variant.id,
            shopId: input.shopId,
            productId: createdProduct.id,
            label: variant.label,
            sellPrice: variant.sellPrice,
            stockQty: variant.stockQty ?? "0",
            sku: variant.sku,
            barcode: variant.barcode,
            sortOrder: variant.sortOrder ?? index,
            isActive: variant.isActive,
          })),
        });
      }
      return { id: createdProduct.id };
    });
  } catch (err) {
    throwFriendlyCodeConflict(err);
  }

  revalidateReportsForProduct();
  return { success: true, id: created.id };
}

export async function suggestProductSku(
  shopId: string,
  productName: string,
  excludeProductId?: string | null
) {
  const user = await requireUser();
  if (!hasAnyPermission(user, ["view_products", "create_product", "update_product"])) {
    throw new Error("Forbidden: missing product access permission");
  }
  await assertShopAccess(shopId, user);

  const normalizedName = String(productName || "").trim();
  if (!normalizedName) {
    return { sku: "" };
  }

  const base = buildSuggestedSkuBase(normalizedName);
  const rows = await prisma.product.findMany({
    where: {
      shopId,
      ...(excludeProductId ? { id: { not: excludeProductId } } : {}),
      sku: {
        startsWith: base,
        mode: "insensitive",
      },
    },
    select: { sku: true },
    take: 200,
  });

  const variantRows = await prisma.productVariant.findMany({
    where: {
      shopId,
      ...(excludeProductId ? { productId: { not: excludeProductId } } : {}),
      sku: {
        startsWith: base,
        mode: "insensitive",
      },
    },
    select: { sku: true },
    take: 200,
  });

  const used = new Set(
    [...rows.map((row) => row.sku), ...variantRows.map((row) => row.sku)]
      .map((code) => normalizeProductCodeInput(code))
      .filter((value): value is string => Boolean(value))
  );

  if (!used.has(base)) {
    return { sku: base };
  }

  let maxSequence = 0;
  const pattern = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d{3,})$`);

  for (const sku of used) {
    const match = sku.match(pattern);
    if (!match) continue;
    const seq = Number(match[1]);
    if (Number.isFinite(seq) && seq > maxSequence) {
      maxSequence = seq;
    }
  }

  const nextSequence = String(maxSequence + 1).padStart(3, "0");
  return { sku: `${base}-${nextSequence}` };
}

export async function generateProductBarcode(
  shopId: string,
  productName: string,
  excludeProductId?: string | null
) {
  const user = await requireUser();
  if (!hasAnyPermission(user, ["view_products", "create_product", "update_product"])) {
    throw new Error("Forbidden: missing product access permission");
  }
  await assertShopAccess(shopId, user);

  const normalizedName = String(productName || "").trim();
  const shopSegment = hashBarcodeShopSegment(shopId);
  const prefix = `29${shopSegment}`;

  const rows = await prisma.product.findMany({
    where: {
      shopId,
      ...(excludeProductId ? { id: { not: excludeProductId } } : {}),
      barcode: {
        startsWith: prefix,
        mode: "insensitive",
      },
    },
    select: { barcode: true },
    take: 500,
  });

  const variantRows = await prisma.productVariant.findMany({
    where: {
      shopId,
      ...(excludeProductId ? { productId: { not: excludeProductId } } : {}),
      barcode: {
        startsWith: prefix,
        mode: "insensitive",
      },
    },
    select: { barcode: true },
    take: 500,
  });

  const used = new Set(
    [...rows.map((row) => row.barcode), ...variantRows.map((row) => row.barcode)]
      .map((code) => normalizeProductCodeInput(code))
      .filter((value): value is string => Boolean(value))
  );

  let maxSequence = 0;
  const pattern = new RegExp(`^${prefix}(\\d{6})(\\d)$`);

  for (const barcode of used) {
    const match = barcode.match(pattern);
    if (!match) continue;
    const seq = Number(match[1]);
    if (Number.isFinite(seq) && seq > maxSequence) {
      maxSequence = seq;
    }
  }

  const nextSequence = String(maxSequence + 1).padStart(6, "0");
  const body = `${prefix}${nextSequence}`;
  const checkDigit = computeEan13CheckDigit(body);

  return { barcode: `${body}${checkDigit}` };
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
      baseUnit: true,
      expiryDate: true,
      size: true,
      buyPrice: true,
      sellPrice: true,
      stockQty: true,
      isActive: true,
      trackStock: true,
      createdAt: true,
      updatedAt: true,
      variants: {
        where: { isActive: true },
        select: { id: true, label: true, stockQty: true },
        orderBy: { sortOrder: "asc" },
      },
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
  const searchTerms = buildProductSearchTerms(normalizedQuery);
  const where: any = { shopId };

  if (status === "active") {
    where.isActive = true;
  } else if (status === "inactive") {
    where.isActive = false;
  }

  if (searchTerms.length > 0) {
    where.OR = searchTerms.flatMap((term) => [
      { name: { contains: term, mode: "insensitive" } },
      { category: { contains: term, mode: "insensitive" } },
      { sku: { contains: term, mode: "insensitive" } },
      { barcode: { contains: term, mode: "insensitive" } },
      { catalogProduct: { is: { name: { contains: term, mode: "insensitive" } } } },
      { catalogProduct: { is: { brand: { contains: term, mode: "insensitive" } } } },
      {
        catalogProduct: {
          is: {
            aliases: {
              some: { alias: { contains: term, mode: "insensitive" } },
            },
          },
        },
      },
      {
        catalogProduct: {
          is: {
            barcodes: {
              some: { code: { contains: term, mode: "insensitive" } },
            },
          },
        },
      },
    ]);
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
      baseUnit: true,
      expiryDate: true,
      size: true,
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
    baseUnit: (product as any).baseUnit ?? "pcs",
    expiryDate: product.expiryDate ? product.expiryDate.toISOString().slice(0, 10) : null,
    size: (product as any).size ?? null,
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
  const searchTerms = buildProductSearchTerms(normalizedQuery);

  const baseWhere: any = { shopId };
  if (status === "active") {
    baseWhere.isActive = true;
  } else if (status === "inactive") {
    baseWhere.isActive = false;
  }

  if (searchTerms.length > 0) {
    baseWhere.OR = searchTerms.flatMap((term) => [
      { name: { contains: term, mode: "insensitive" } },
      { category: { contains: term, mode: "insensitive" } },
      { sku: { contains: term, mode: "insensitive" } },
      { barcode: { contains: term, mode: "insensitive" } },
      { catalogProduct: { is: { name: { contains: term, mode: "insensitive" } } } },
      { catalogProduct: { is: { brand: { contains: term, mode: "insensitive" } } } },
      {
        catalogProduct: {
          is: {
            aliases: {
              some: { alias: { contains: term, mode: "insensitive" } },
            },
          },
        },
      },
      {
        catalogProduct: {
          is: {
            barcodes: {
              some: { code: { contains: term, mode: "insensitive" } },
            },
          },
        },
      },
    ]);
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
        baseUnit: true,
        expiryDate: true,
        size: true,
        buyPrice: true,
        sellPrice: true,
        stockQty: true,
        trackStock: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        variants: {
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
          select: {
            id: true,
            label: true,
            sellPrice: true,
            stockQty: true,
            sku: true,
            barcode: true,
            sortOrder: true,
            isActive: true,
          },
        },
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
    baseUnit: (p as any).baseUnit ?? "pcs",
    expiryDate: p.expiryDate ? p.expiryDate.toISOString().slice(0, 10) : null,
    size: (p as any).size ?? null,
    buyPrice: p.buyPrice?.toString?.() ?? (p as any).buyPrice ?? null,
    sellPrice: p.sellPrice?.toString?.() ?? (p as any).sellPrice ?? "0",
    stockQty: p.stockQty?.toString?.() ?? (p as any).stockQty ?? "0",
    trackStock: Boolean(p.trackStock),
    isActive: p.isActive,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    variants: (p.variants || []).map((variant) => ({
      id: variant.id,
      label: variant.label,
      sellPrice: variant.sellPrice?.toString?.() ?? String(variant.sellPrice ?? "0"),
      stockQty: variant.stockQty?.toString?.() ?? (variant as any).stockQty ?? "0",
      sku: variant.sku ?? null,
      barcode: variant.barcode ?? null,
      sortOrder:
        typeof variant.sortOrder === "number" ? variant.sortOrder : undefined,
      isActive: variant.isActive,
    })),
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
    include: {
      variants: {
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      },
    },
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
  const baseUnit =
    data.baseUnit !== undefined
      ? normalizeBaseUnitInput(data.baseUnit, { defaultValue: "pcs" })
      : undefined;
  const catalogProductId =
    data.catalogProductId !== undefined
      ? normalizeNullableTextInput(data.catalogProductId, 36)
      : undefined;
  const productSource =
    data.productSource !== undefined
      ? normalizeProductSourceInput(data.productSource)
      : undefined;
  const expiryDate =
    data.expiryDate !== undefined
      ? normalizeDateOnlyInput(data.expiryDate)
      : undefined;
  const size =
    data.size !== undefined ? normalizeNullableTextInput(data.size, 80) : undefined;
  const variants = normalizeVariantInputs(data.variants, {
    fieldPrefix: "Variants",
  });
  const existingVariantsForCollisionCheck =
    variants === undefined
      ? await prisma.productVariant.findMany({
          where: { productId: id },
          select: {
            id: true,
            label: true,
            sellPrice: true,
            sku: true,
            barcode: true,
            sortOrder: true,
            isActive: true,
          },
        })
      : [];
  const collisionVariants =
    variants ??
    existingVariantsForCollisionCheck.map((variant) => ({
      id: variant.id,
      label: variant.label,
      sellPrice: variant.sellPrice.toString(),
      sku: variant.sku ?? null,
      barcode: variant.barcode ?? null,
      sortOrder: variant.sortOrder,
      isActive: variant.isActive,
      stockQty: "0",
    }));
  const resolvedStockQty = trackStockFlag ? stockQty : "0";
  const payload: Record<string, any> = {};

  if (catalogProductId !== undefined && catalogProductId !== null) {
    const catalogProduct = await prisma.catalogProduct.findUnique({
      where: { id: catalogProductId },
      select: { id: true },
    });
    if (!catalogProduct) {
      throw new Error("Catalog product not found");
    }
  }

  if (data.name !== undefined) payload.name = data.name;
  if (data.category !== undefined) payload.category = data.category;
  if (catalogProductId !== undefined) payload.catalogProductId = catalogProductId;
  if (productSource !== undefined) {
    payload.productSource = productSource;
  } else if (catalogProductId !== undefined) {
    payload.productSource = catalogProductId
      ? ProductSourceType.catalog
      : ProductSourceType.manual;
  }
  if (sku !== undefined) payload.sku = sku;
  if (barcode !== undefined) payload.barcode = barcode;
  if (baseUnit !== undefined) payload.baseUnit = baseUnit;
  if (expiryDate !== undefined) payload.expiryDate = expiryDate;
  if (size !== undefined) payload.size = size;
  if (data.isActive !== undefined) payload.isActive = data.isActive;
  if (data.trackStock !== undefined) payload.trackStock = data.trackStock;
  if (buyPrice !== undefined) payload.buyPrice = buyPrice;
  if (sellPrice !== undefined) payload.sellPrice = sellPrice;
  if (resolvedStockQty !== undefined) payload.stockQty = resolvedStockQty;
  if (data.reorderPoint !== undefined) payload.reorderPoint = data.reorderPoint ?? null;

  await assertNoCodeCollisionsInShop({
    shopId: product.shopId,
    excludeProductId: id,
    productSku: sku !== undefined ? sku : product.sku,
    productBarcode: barcode !== undefined ? barcode : product.barcode,
    variants: collisionVariants,
  });

  try {
    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: payload,
      });

      if (variants !== undefined) {
        await tx.productVariant.deleteMany({ where: { productId: id } });
        if (variants.length > 0) {
          await tx.productVariant.createMany({
            data: variants.map((variant, index) => ({
              id: variant.id,
              shopId: product.shopId,
              productId: id,
              label: variant.label,
              sellPrice: variant.sellPrice,
              stockQty: variant.stockQty ?? "0",
              sku: variant.sku,
              barcode: variant.barcode,
              sortOrder: variant.sortOrder ?? index,
              isActive: variant.isActive,
            })),
          });
        }
      }
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
      baseUnit: true,
      expiryDate: true,
      size: true,
      sellPrice: true,
      stockQty: true,
      trackStock: true,
      variants: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
        select: {
          id: true,
          label: true,
          sellPrice: true,
          stockQty: true,
          sku: true,
          barcode: true,
          sortOrder: true,
          isActive: true,
        },
      },
    },
  });

  // Convert Prisma Decimal values to serializable primitives for client components
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    sku: (p as any).sku ?? null,
    barcode: (p as any).barcode ?? null,
    baseUnit: (p as any).baseUnit ?? "pcs",
    expiryDate: p.expiryDate ? p.expiryDate.toISOString().slice(0, 10) : null,
    size: (p as any).size ?? null,
    sellPrice: p.sellPrice.toString(),
    stockQty: p.stockQty?.toString() ?? "0",
    trackStock: p.trackStock,
    variants: (p.variants || []).map((variant) => ({
      id: variant.id,
      label: variant.label,
      sellPrice: variant.sellPrice.toString(),
      stockQty: variant.stockQty?.toString() ?? "0",
      sku: variant.sku ?? null,
      barcode: variant.barcode ?? null,
      sortOrder: variant.sortOrder,
      isActive: variant.isActive,
    })),
  }));
}
