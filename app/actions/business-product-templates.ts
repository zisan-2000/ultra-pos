// app/actions/business-product-templates.ts

"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { isSuperAdmin, requirePermission } from "@/lib/rbac";
import { assertShopAccess } from "@/lib/shop-access";
import { Prisma } from "@prisma/client";
import { getBusinessTypeTemplateCandidates } from "@/lib/business-types";

type TemplateInput = {
  id?: string;
  businessType: string;
  name: string;
  brand?: string | null;
  modelName?: string | null;
  category?: string | null;
  packSize?: string | null;
  compatibility?: string | null;
  warrantyDays?: number | null;
  defaultBuyPrice?: string | number | null;
  defaultSellPrice?: string | number | null;
  defaultOpeningStock?: string | number | null;
  defaultBarcode?: string | null;
  defaultBaseUnit?: string | null;
  defaultTrackStock?: boolean;
  aliases?: string[] | null;
  keywords?: string[] | null;
  variants?: TemplateVariantInput[] | null;
  imageUrl?: string | null;
  popularityScore?: number | null;
  isActive?: boolean;
};

type TemplateVariantInput = {
  label?: string | null;
  buyPrice?: string | number | null;
  sellPrice?: string | number | null;
  openingStock?: string | number | null;
  sku?: string | null;
  barcode?: string | null;
  sortOrder?: number | null;
  isActive?: boolean | null;
};

type NormalizedTemplateVariant = {
  label: string;
  buyPrice: string | null;
  sellPrice: string;
  openingStock: string | null;
  sku: string | null;
  barcode: string | null;
  sortOrder: number;
  isActive: boolean;
};

export type BusinessProductTemplateImportItem = {
  businessType?: string | null;
  name?: string | null;
  brand?: string | null;
  modelName?: string | null;
  category?: string | null;
  packSize?: string | null;
  compatibility?: string | null;
  warrantyDays?: number | null;
  defaultBuyPrice?: string | number | null;
  defaultSellPrice?: string | number | null;
  defaultOpeningStock?: string | number | null;
  defaultBarcode?: string | null;
  defaultBaseUnit?: string | null;
  defaultTrackStock?: boolean | null;
  aliases?: string[] | null;
  keywords?: string[] | null;
  variants?: TemplateVariantInput[] | null;
  imageUrl?: string | null;
  popularityScore?: number | null;
  isActive?: boolean | null;
};

export type BusinessProductTemplateImportInput = {
  items: BusinessProductTemplateImportItem[];
  defaultBusinessType?: string | null;
};

export type BusinessProductTemplateImportResult = {
  createdCount: number;
  skippedCount: number;
  invalidCount: number;
};

type TemplateListRow = {
  id: string;
  businessType: string;
  name: string;
  brand: string | null;
  modelName: string | null;
  category: string | null;
  packSize: string | null;
  compatibility: string | null;
  warrantyDays: number | null;
  defaultBuyPrice: string | null;
  defaultSellPrice: string | null;
  defaultOpeningStock: string | null;
  defaultBarcode: string | null;
  defaultBaseUnit: string | null;
  defaultTrackStock: boolean;
  aliases: string[];
  keywords: string[];
  variants: NormalizedTemplateVariant[];
  imageUrl: string | null;
  popularityScore: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type TemplateSetupVariantInput = {
  label: string;
  buyPrice?: string | number | null;
  openingStock?: string | number | null;
};

type TemplateSetupInput = {
  templateId: string;
  buyPrice?: string | number | null;
  openingStock?: string | number | null;
  variants?: TemplateSetupVariantInput[] | null;
};

function assertSuperAdmin(user: Awaited<ReturnType<typeof requireUser>>) {
  if (!isSuperAdmin(user)) {
    throw new Error("Forbidden: Super Admin only");
  }
}

function normalizeRequiredText(value: string, label: string) {
  const cleaned = value.toString().trim();
  if (!cleaned) {
    throw new Error(`${label} is required`);
  }
  return cleaned;
}

function normalizeOptionalText(value?: string | null) {
  if (value === undefined) return undefined;
  const cleaned = value === null ? "" : value.toString().trim();
  return cleaned ? cleaned : null;
}

function normalizeOptionalMoney(value?: string | number | null) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const cleaned = value.toString().trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("Default sell price must be a valid non-negative number");
  }
  return parsed.toString();
}

function normalizeProductCodeInput(value?: string | null) {
  if (value === undefined || value === null) return null;
  const cleaned = value.toString().trim().replace(/\s+/g, "").toUpperCase();
  if (!cleaned) return null;
  return cleaned.slice(0, 80);
}

function normalizeOptionalUnit(value?: string | null) {
  if (value === undefined) return undefined;
  const cleaned = value === null ? "" : value.toString().trim();
  if (!cleaned) return null;
  return cleaned.slice(0, 40);
}

function normalizeOptionalImageUrl(value?: string | null) {
  const cleaned = normalizeOptionalText(value);
  if (cleaned === undefined || cleaned === null) return cleaned;
  return cleaned.slice(0, 500);
}

function normalizeOptionalScore(value?: number | string | null) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("Popularity score must be a valid non-negative number");
  }
  return Math.floor(parsed);
}

function normalizeOptionalStringArray(value?: string[] | null) {
  if (value === undefined) return undefined;
  if (value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error("Expected an array of strings");
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const cleaned = typeof item === "string" ? item.trim() : "";
    if (!cleaned) continue;
    const normalizedItem = cleaned.slice(0, 80);
    const key = normalizedItem.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(normalizedItem);
  }

  return normalized;
}

function normalizeTemplateVariants(
  variants?: TemplateVariantInput[] | null,
): NormalizedTemplateVariant[] | undefined {
  if (variants === undefined) return undefined;
  if (variants === null) return [];
  if (!Array.isArray(variants)) {
    throw new Error("Variants must be an array");
  }

  const normalized: NormalizedTemplateVariant[] = [];
  const seenLabels = new Set<string>();

  for (let index = 0; index < variants.length; index += 1) {
    const row = variants[index] ?? {};
    const label = normalizeRequiredText(String(row.label ?? ""), "Variant label");
    const labelKey = label.toLowerCase();
    if (seenLabels.has(labelKey)) {
      throw new Error(`Duplicate variant label: ${label}`);
    }
    seenLabels.add(labelKey);

    const sellPrice = normalizeOptionalMoney(row.sellPrice) ?? "0";
    const numericPrice = Number(sellPrice);
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      throw new Error(`Invalid variant sellPrice for ${label}`);
    }

    normalized.push({
      label,
      buyPrice: normalizeOptionalMoney(row.buyPrice) ?? null,
      sellPrice,
      openingStock: normalizeOptionalMoney(row.openingStock) ?? null,
      sku: normalizeProductCodeInput(row.sku),
      barcode: normalizeProductCodeInput(row.barcode),
      sortOrder:
        Number.isFinite(Number(row.sortOrder)) && Number(row.sortOrder) >= 0
          ? Number(row.sortOrder)
          : index,
      isActive: row.isActive !== false,
    });
  }

  return normalized;
}

function parseTemplateVariantsFromJson(value?: unknown): NormalizedTemplateVariant[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    try {
      return normalizeTemplateVariants(value as TemplateVariantInput[]) ?? [];
    } catch {
      return [];
    }
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return normalizeTemplateVariants(parsed as TemplateVariantInput[]) ?? [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseStringArrayFromJson(value?: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    try {
      return normalizeOptionalStringArray(value as string[]) ?? [];
    } catch {
      return [];
    }
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return normalizeOptionalStringArray(parsed as string[]) ?? [];
    } catch {
      return [];
    }
  }
  return [];
}

function mapTemplateRow(row: {
  id: string;
  businessType: string;
  name: string;
  brand: string | null;
  modelName: string | null;
  category: string | null;
  packSize: string | null;
  compatibility: string | null;
  warrantyDays: number | null;
  defaultBuyPrice: any;
  defaultSellPrice: any;
  defaultOpeningStock: any;
  defaultBarcode: string | null;
  defaultBaseUnit: string | null;
  defaultTrackStock: boolean;
  aliasesJson: unknown;
  keywordsJson: unknown;
  variantsJson: unknown;
  imageUrl: string | null;
  popularityScore: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): TemplateListRow {
  return {
    id: row.id,
    businessType: row.businessType,
    name: row.name,
    brand: row.brand ?? null,
    modelName: row.modelName ?? null,
    category: row.category,
    packSize: row.packSize ?? null,
    compatibility: row.compatibility ?? null,
    warrantyDays:
      typeof row.warrantyDays === "number" ? row.warrantyDays : row.warrantyDays ?? null,
    defaultBuyPrice: row.defaultBuyPrice?.toString?.() ?? null,
    defaultSellPrice: row.defaultSellPrice?.toString?.() ?? null,
    defaultOpeningStock: row.defaultOpeningStock?.toString?.() ?? null,
    defaultBarcode: normalizeProductCodeInput(row.defaultBarcode) ?? null,
    defaultBaseUnit: row.defaultBaseUnit ?? null,
    defaultTrackStock: row.defaultTrackStock === true,
    aliases: parseStringArrayFromJson(row.aliasesJson),
    keywords: parseStringArrayFromJson(row.keywordsJson),
    variants: parseTemplateVariantsFromJson(row.variantsJson),
    imageUrl: row.imageUrl ?? null,
    popularityScore: Number.isFinite(Number(row.popularityScore))
      ? Number(row.popularityScore)
      : 0,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ------------------------------
// ADMIN: LIST ALL TEMPLATES
// ------------------------------
export async function listBusinessProductTemplatesAdmin() {
  const user = await requireUser();
  assertSuperAdmin(user);

  const rows = await prisma.businessProductTemplate.findMany({
    orderBy: [{ businessType: "asc" }, { popularityScore: "desc" }, { name: "asc" }],
  });

  return rows.map(mapTemplateRow);
}

// ------------------------------
// ADMIN: CREATE TEMPLATE
// ------------------------------
export async function createBusinessProductTemplate(input: TemplateInput) {
  const user = await requireUser();
  assertSuperAdmin(user);

  const id = input.id?.toString().trim() || undefined;
  const businessType = normalizeRequiredText(input.businessType, "Business type");
  const name = normalizeRequiredText(input.name, "Name");
  const brand = normalizeOptionalText(input.brand);
  const modelName = normalizeOptionalText(input.modelName);
  const category = normalizeOptionalText(input.category);
  const packSize = normalizeOptionalText(input.packSize);
  const compatibility = normalizeOptionalText(input.compatibility);
  const warrantyDays =
    input.warrantyDays === undefined
      ? undefined
      : input.warrantyDays === null
      ? null
      : Math.max(0, Math.floor(Number(input.warrantyDays)));
  const defaultBuyPrice = normalizeOptionalMoney(input.defaultBuyPrice);
  const defaultSellPrice = normalizeOptionalMoney(input.defaultSellPrice);
  const defaultOpeningStock = normalizeOptionalMoney(input.defaultOpeningStock);
  const defaultBarcode = normalizeProductCodeInput(input.defaultBarcode);
  const defaultBaseUnit = normalizeOptionalUnit(input.defaultBaseUnit);
  const defaultTrackStock = Boolean(input.defaultTrackStock);
  const aliases = normalizeOptionalStringArray(input.aliases);
  const keywords = normalizeOptionalStringArray(input.keywords);
  const variants = normalizeTemplateVariants(input.variants);
  const imageUrl = normalizeOptionalImageUrl(input.imageUrl);
  const popularityScore = normalizeOptionalScore(input.popularityScore) ?? 0;
  const isActive = input.isActive ?? true;

  if (id) {
    await prisma.businessProductTemplate.upsert({
      where: { id },
      create: {
        id,
        businessType,
        name,
        brand: brand ?? null,
        modelName: modelName ?? null,
        category: category ?? null,
        packSize: packSize ?? null,
        compatibility: compatibility ?? null,
        warrantyDays: warrantyDays ?? null,
        defaultBuyPrice: defaultBuyPrice === undefined ? null : defaultBuyPrice,
        defaultSellPrice: defaultSellPrice === undefined ? null : defaultSellPrice,
        defaultOpeningStock:
          defaultOpeningStock === undefined ? null : defaultOpeningStock,
        defaultBarcode,
        defaultBaseUnit: defaultBaseUnit === undefined ? null : defaultBaseUnit,
        defaultTrackStock,
        aliasesJson: aliases === undefined ? [] : aliases,
        keywordsJson: keywords === undefined ? [] : keywords,
        variantsJson: variants === undefined ? [] : variants,
        imageUrl: imageUrl ?? null,
        popularityScore,
        isActive,
      },
      update: {
        businessType,
        name,
        brand: brand ?? null,
        modelName: modelName ?? null,
        category: category ?? null,
        packSize: packSize ?? null,
        compatibility: compatibility ?? null,
        warrantyDays: warrantyDays ?? null,
        defaultBuyPrice: defaultBuyPrice === undefined ? null : defaultBuyPrice,
        defaultSellPrice: defaultSellPrice === undefined ? null : defaultSellPrice,
        defaultOpeningStock:
          defaultOpeningStock === undefined ? null : defaultOpeningStock,
        defaultBarcode,
        defaultBaseUnit: defaultBaseUnit === undefined ? null : defaultBaseUnit,
        defaultTrackStock,
        aliasesJson: aliases === undefined ? [] : aliases,
        keywordsJson: keywords === undefined ? [] : keywords,
        variantsJson: variants === undefined ? [] : variants,
        imageUrl: imageUrl ?? null,
        popularityScore,
        isActive,
      },
    });
  } else {
    await prisma.businessProductTemplate.create({
      data: {
        businessType,
        name,
        brand: brand ?? null,
        category: category ?? null,
        packSize: packSize ?? null,
        defaultBuyPrice: defaultBuyPrice === undefined ? null : defaultBuyPrice,
        defaultSellPrice: defaultSellPrice === undefined ? null : defaultSellPrice,
        defaultOpeningStock:
          defaultOpeningStock === undefined ? null : defaultOpeningStock,
        defaultBarcode,
        defaultBaseUnit: defaultBaseUnit === undefined ? null : defaultBaseUnit,
        defaultTrackStock,
        aliasesJson: aliases === undefined ? [] : aliases,
        keywordsJson: keywords === undefined ? [] : keywords,
        variantsJson: variants === undefined ? [] : variants,
        imageUrl: imageUrl ?? null,
        popularityScore,
        isActive,
      },
    });
  }

  return { success: true };
}

// ------------------------------
// ADMIN: UPDATE TEMPLATE
// ------------------------------
export async function updateBusinessProductTemplate(
  id: string,
  input: Partial<TemplateInput>,
) {
  const user = await requireUser();
  assertSuperAdmin(user);

  if (!id) {
    throw new Error("Template id is required");
  }

  const data: Record<string, any> = {};

  if (input.businessType !== undefined) {
    data.businessType = normalizeRequiredText(input.businessType, "Business type");
  }
  if (input.name !== undefined) {
    data.name = normalizeRequiredText(input.name, "Name");
  }
  if (input.brand !== undefined) {
    data.brand = normalizeOptionalText(input.brand);
  }
  if (input.modelName !== undefined) {
    data.modelName = normalizeOptionalText(input.modelName);
  }
  if (input.category !== undefined) {
    data.category = normalizeOptionalText(input.category);
  }
  if (input.packSize !== undefined) {
    data.packSize = normalizeOptionalText(input.packSize);
  }
  if (input.compatibility !== undefined) {
    data.compatibility = normalizeOptionalText(input.compatibility);
  }
  if (input.warrantyDays !== undefined) {
    data.warrantyDays =
      input.warrantyDays === null
        ? null
        : Math.max(0, Math.floor(Number(input.warrantyDays)));
  }
  if (input.defaultBuyPrice !== undefined) {
    data.defaultBuyPrice = normalizeOptionalMoney(input.defaultBuyPrice);
  }
  if (input.defaultSellPrice !== undefined) {
    data.defaultSellPrice = normalizeOptionalMoney(input.defaultSellPrice);
  }
  if (input.defaultOpeningStock !== undefined) {
    data.defaultOpeningStock = normalizeOptionalMoney(input.defaultOpeningStock);
  }
  if (input.defaultBarcode !== undefined) {
    data.defaultBarcode = normalizeProductCodeInput(input.defaultBarcode);
  }
  if (input.defaultBaseUnit !== undefined) {
    data.defaultBaseUnit = normalizeOptionalUnit(input.defaultBaseUnit);
  }
  if (input.defaultTrackStock !== undefined) {
    data.defaultTrackStock = Boolean(input.defaultTrackStock);
  }
  if (input.aliases !== undefined) {
    data.aliasesJson = normalizeOptionalStringArray(input.aliases) ?? [];
  }
  if (input.keywords !== undefined) {
    data.keywordsJson = normalizeOptionalStringArray(input.keywords) ?? [];
  }
  if (input.variants !== undefined) {
    data.variantsJson = normalizeTemplateVariants(input.variants) ?? [];
  }
  if (input.imageUrl !== undefined) {
    data.imageUrl = normalizeOptionalImageUrl(input.imageUrl);
  }
  if (input.popularityScore !== undefined) {
    data.popularityScore = normalizeOptionalScore(input.popularityScore) ?? 0;
  }
  if (input.isActive !== undefined) {
    data.isActive = Boolean(input.isActive);
  }

  await prisma.businessProductTemplate.update({
    where: { id },
    data,
  });

  return { success: true };
}

// ------------------------------
// ADMIN: DELETE TEMPLATE
// ------------------------------
export async function deleteBusinessProductTemplate(id: string) {
  const user = await requireUser();
  assertSuperAdmin(user);
  if (!id) {
    throw new Error("Template id is required");
  }
  await prisma.businessProductTemplate.delete({ where: { id } });
  return { success: true };
}

// ------------------------------
// ADMIN: IMPORT TEMPLATES (JSON)
// ------------------------------
export async function importBusinessProductTemplates(
  input: BusinessProductTemplateImportInput,
): Promise<BusinessProductTemplateImportResult> {
  const user = await requireUser();
  assertSuperAdmin(user);

  const items = Array.isArray(input.items) ? input.items : [];
  if (items.length === 0) {
    return { createdCount: 0, skippedCount: 0, invalidCount: 0 };
  }

  const defaultBusinessType = normalizeOptionalText(input.defaultBusinessType) ?? null;
  const normalized: Array<{
    businessType: string;
    name: string;
    brand: string | null;
    modelName: string | null;
    category: string | null;
    packSize: string | null;
    compatibility: string | null;
    warrantyDays: number | null;
    defaultBuyPrice: string | null;
    defaultSellPrice: string | null;
    defaultOpeningStock: string | null;
    defaultBarcode: string | null;
    defaultBaseUnit: string | null;
    defaultTrackStock: boolean;
    aliases: string[];
    keywords: string[];
    variants: NormalizedTemplateVariant[];
    imageUrl: string | null;
    popularityScore: number;
    isActive: boolean;
  }> = [];

  let invalidCount = 0;
  let firstError: string | null = null;

  items.forEach((item, index) => {
    try {
      const businessTypeValue = item.businessType ?? defaultBusinessType ?? "";
      const businessType = normalizeRequiredText(
        String(businessTypeValue),
        "Business type",
      );
      const name = normalizeRequiredText(String(item.name ?? ""), "Name");
      const brand = normalizeOptionalText(item.brand);
      const modelName = normalizeOptionalText(item.modelName);
      const category = normalizeOptionalText(item.category);
      const packSize = normalizeOptionalText(item.packSize);
      const compatibility = normalizeOptionalText(item.compatibility);
      const warrantyDays =
        item.warrantyDays === undefined
          ? null
          : item.warrantyDays === null
          ? null
          : Math.max(0, Math.floor(Number(item.warrantyDays)));
      const defaultBuyPrice = normalizeOptionalMoney(item.defaultBuyPrice);
      const defaultSellPrice = normalizeOptionalMoney(item.defaultSellPrice);
      const defaultOpeningStock = normalizeOptionalMoney(item.defaultOpeningStock);
      const defaultBarcode = normalizeProductCodeInput(item.defaultBarcode);
      const defaultBaseUnit = normalizeOptionalUnit(item.defaultBaseUnit);
      const defaultTrackStock = item.defaultTrackStock === true;
      const aliases = normalizeOptionalStringArray(item.aliases) ?? [];
      const keywords = normalizeOptionalStringArray(item.keywords) ?? [];
      const variants = normalizeTemplateVariants(item.variants) ?? [];
      const imageUrl = normalizeOptionalImageUrl(item.imageUrl);
      const popularityScore = normalizeOptionalScore(item.popularityScore) ?? 0;
      const isActive = item.isActive ?? true;

      normalized.push({
        businessType,
        name,
        brand: brand ?? null,
        modelName: modelName ?? null,
        category: category ?? null,
        packSize: packSize ?? null,
        compatibility: compatibility ?? null,
        warrantyDays,
        defaultBuyPrice: defaultBuyPrice === undefined ? null : defaultBuyPrice,
        defaultSellPrice: defaultSellPrice === undefined ? null : defaultSellPrice,
        defaultOpeningStock:
          defaultOpeningStock === undefined ? null : defaultOpeningStock,
        defaultBarcode,
        defaultBaseUnit: defaultBaseUnit === undefined ? null : defaultBaseUnit,
        defaultTrackStock,
        aliases,
        keywords,
        variants,
        imageUrl: imageUrl ?? null,
        popularityScore,
        isActive: Boolean(isActive),
      });
    } catch (err) {
      invalidCount += 1;
      if (!firstError) {
        const message = err instanceof Error ? err.message : "Invalid row";
        firstError = `Row ${index + 1}: ${message}`;
      }
    }
  });

  if (invalidCount > 0) {
    const suffix = firstError ? ` ${firstError}` : "";
    throw new Error(
      `Import failed: ${invalidCount} invalid row${invalidCount > 1 ? "s" : ""}.${suffix}`,
    );
  }

  if (normalized.length === 0) {
    return { createdCount: 0, skippedCount: 0, invalidCount: 0 };
  }

  const seen = new Set<string>();
  const deduped = normalized.filter((item) => {
    const key = `${item.businessType.toLowerCase()}|${item.name.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const result = await prisma.businessProductTemplate.createMany({
    data: deduped.map((item) => ({
      businessType: item.businessType,
      name: item.name,
      brand: item.brand,
      modelName: item.modelName,
      category: item.category,
      packSize: item.packSize,
      compatibility: item.compatibility,
      warrantyDays: item.warrantyDays,
      defaultBuyPrice: item.defaultBuyPrice,
      defaultSellPrice: item.defaultSellPrice,
      defaultOpeningStock: item.defaultOpeningStock,
      defaultBarcode: item.defaultBarcode,
      defaultBaseUnit: item.defaultBaseUnit,
      defaultTrackStock: item.defaultTrackStock,
      aliasesJson: item.aliases,
      keywordsJson: item.keywords,
      variantsJson: item.variants,
      imageUrl: item.imageUrl,
      popularityScore: item.popularityScore,
      isActive: item.isActive,
    })),
    skipDuplicates: true,
  });

  return {
    createdCount: result.count,
    skippedCount: deduped.length - result.count,
    invalidCount: 0,
  };
}

// ------------------------------
// USER: LIST ACTIVE TEMPLATES FOR A BUSINESS TYPE
// ------------------------------
export async function listActiveBusinessProductTemplates(businessType: string) {
  const user = await requireUser();
  requirePermission(user, "view_products");

  const keys = getBusinessTypeTemplateCandidates(businessType);
  if (keys.length === 0) return [];

  const rows = await prisma.businessProductTemplate.findMany({
    where: { businessType: { in: keys }, isActive: true },
    orderBy: [{ popularityScore: "desc" }, { name: "asc" }],
  });

  return rows.map(mapTemplateRow);
}

// ------------------------------
// USER: APPLY SELECTED TEMPLATES TO A SHOP
// ------------------------------
export async function addBusinessProductTemplatesToShop(input: {
  shopId: string;
  templateIds: string[];
  setups?: TemplateSetupInput[] | null;
}) {
  const user = await requireUser();
  requirePermission(user, "create_product");

  const shop = await assertShopAccess(input.shopId, user);
  if (!shop.businessType) {
    return { createdCount: 0, skippedCount: 0, inactiveCount: 0 };
  }

  const uniqueIds = Array.from(new Set(input.templateIds.filter(Boolean)));
  const setupMap = new Map<string, TemplateSetupInput>();
  for (const setup of input.setups ?? []) {
    const templateId = String(setup?.templateId || "").trim();
    if (!templateId) continue;
    setupMap.set(templateId, setup);
  }
  if (uniqueIds.length === 0) {
    return { createdCount: 0, skippedCount: 0, inactiveCount: 0 };
  }

  const templateBusinessTypeKeys = getBusinessTypeTemplateCandidates(shop.businessType);
  const templates = await prisma.businessProductTemplate.findMany({
    where: {
      id: { in: uniqueIds },
      isActive: true,
      businessType: { in: templateBusinessTypeKeys },
    },
    orderBy: [{ name: "asc" }],
  });

  if (templates.length === 0) {
    return { createdCount: 0, skippedCount: uniqueIds.length, inactiveCount: 0 };
  }

  const seenNames = new Set<string>();
  const uniqueTemplates = templates.filter((template) => {
    const key = template.name.trim().toLowerCase();
    if (!key || seenNames.has(key)) return false;
    seenNames.add(key);
    return true;
  });

  const nameFilters = uniqueTemplates.map((template) => ({
    name: { equals: template.name, mode: "insensitive" as const },
  }));
  const existing = nameFilters.length
    ? await prisma.product.findMany({
        where: {
          shopId: shop.id,
          OR: nameFilters,
        },
        select: { name: true },
      })
    : [];

  const existingNames = new Set(
    existing.map((row) => row.name.trim().toLowerCase()),
  );

  const [productCodes, variantCodes] = await Promise.all([
    prisma.product.findMany({
      where: { shopId: shop.id },
      select: { sku: true, barcode: true },
    }),
    prisma.productVariant.findMany({
      where: { shopId: shop.id },
      select: { sku: true, barcode: true },
    }),
  ]);

  const usedSkus = new Set<string>();
  const usedBarcodes = new Set<string>();
  productCodes.forEach((row) => {
    const sku = normalizeProductCodeInput(row.sku);
    const barcode = normalizeProductCodeInput(row.barcode);
    if (sku) usedSkus.add(sku);
    if (barcode) usedBarcodes.add(barcode);
  });
  variantCodes.forEach((row) => {
    const sku = normalizeProductCodeInput(row.sku);
    const barcode = normalizeProductCodeInput(row.barcode);
    if (sku) usedSkus.add(sku);
    if (barcode) usedBarcodes.add(barcode);
  });

  let createdCount = 0;
  let inactiveCount = 0;
  let skippedCount = 0;
  let adjustedCodeCount = 0;

  for (const template of uniqueTemplates) {
    const key = template.name.trim().toLowerCase();
    if (existingNames.has(key)) {
      skippedCount += 1;
      continue;
    }

    const defaultPrice = template.defaultSellPrice?.toString();
    const numericPrice = defaultPrice ? Number(defaultPrice) : 0;
    const setup = setupMap.get(template.id);
    const resolvedBuyPrice =
      normalizeOptionalMoney(setup?.buyPrice) ??
      normalizeOptionalMoney((template as any).defaultBuyPrice) ??
      null;
    const resolvedOpeningStock =
      normalizeOptionalMoney(setup?.openingStock) ??
      normalizeOptionalMoney((template as any).defaultOpeningStock) ??
      "0";
    let productBarcode = normalizeProductCodeInput((template as any).defaultBarcode);
    if (productBarcode && usedBarcodes.has(productBarcode)) {
      productBarcode = null;
      adjustedCodeCount += 1;
    } else if (productBarcode) {
      usedBarcodes.add(productBarcode);
    }
    const rawVariants = parseTemplateVariantsFromJson(
      (template as any).variantsJson,
    );
    const variantSetupMap = new Map(
      (setup?.variants ?? [])
        .map((variant) => ({
          label: normalizeRequiredText(String(variant.label ?? ""), "Variant label"),
          buyPrice: normalizeOptionalMoney(variant.buyPrice) ?? null,
          openingStock: normalizeOptionalMoney(variant.openingStock) ?? null,
        }))
        .map((variant) => [variant.label.toLowerCase(), variant] as const)
    );
    const preparedVariants = rawVariants.map((variant, index) => {
      let sku = normalizeProductCodeInput(variant.sku);
      let barcode = normalizeProductCodeInput(variant.barcode);
      if (sku && usedSkus.has(sku)) {
        sku = null;
        adjustedCodeCount += 1;
      } else if (sku) {
        usedSkus.add(sku);
      }
      if (barcode && usedBarcodes.has(barcode)) {
        barcode = null;
        adjustedCodeCount += 1;
      } else if (barcode) {
        usedBarcodes.add(barcode);
      }
      const variantSetup = variantSetupMap.get(variant.label.toLowerCase()) ?? null;
      return {
        ...variant,
        buyPrice: variantSetup?.buyPrice ?? variant.buyPrice ?? null,
        openingStock: variantSetup?.openingStock ?? variant.openingStock ?? null,
        sku,
        barcode,
        sortOrder:
          Number.isFinite(Number(variant.sortOrder)) && Number(variant.sortOrder) >= 0
            ? Number(variant.sortOrder)
            : index,
      };
    });
    const hasVariantPrice = preparedVariants.some((variant) => {
      const price = Number(variant.sellPrice);
      return variant.isActive !== false && Number.isFinite(price) && price > 0;
    });
    const hasValidPrice =
      (Number.isFinite(numericPrice) && numericPrice > 0) || hasVariantPrice;
    if (!hasValidPrice) {
      inactiveCount += 1;
    }

    const defaultUnit = normalizeOptionalUnit(
      (template as any).defaultBaseUnit,
    );
    const packSize = normalizeOptionalText((template as any).packSize);
    const resolvedSellPrice =
      defaultPrice ||
      preparedVariants.find((variant) => Number(variant.sellPrice) > 0)?.sellPrice ||
      "0";

    try {
      await prisma.$transaction(async (tx) => {
        const createdProduct = await tx.product.create({
          data: {
            shopId: shop.id,
            name: template.name,
            category: template.category || "Uncategorized",
            barcode: productBarcode,
            brand: (template as any).brand ?? null,
            modelName: (template as any).modelName ?? null,
            size: packSize ?? null,
            compatibility: (template as any).compatibility ?? null,
            warrantyDays: (template as any).warrantyDays ?? null,
            buyPrice: resolvedBuyPrice,
            sellPrice: resolvedSellPrice,
            stockQty: resolvedOpeningStock,
            isActive: hasValidPrice,
            trackStock: (template as any).defaultTrackStock === true,
            baseUnit: defaultUnit || "pcs",
          },
        });

        if (preparedVariants.length > 0) {
          await tx.productVariant.createMany({
            data: preparedVariants.map((variant, index) => ({
              shopId: shop.id,
              productId: createdProduct.id,
              label: variant.label,
              buyPrice: variant.buyPrice,
              sellPrice: variant.sellPrice,
              stockQty: variant.openingStock ?? "0",
              sku: variant.sku,
              barcode: variant.barcode,
              sortOrder: variant.sortOrder ?? index,
              isActive: variant.isActive !== false,
            })),
          });
        }
      });
      createdCount += 1;
      existingNames.add(key);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        skippedCount += 1;
        continue;
      }
      throw err;
    }
  }

  return {
    createdCount,
    skippedCount,
    inactiveCount,
    adjustedCodeCount,
  };
}
