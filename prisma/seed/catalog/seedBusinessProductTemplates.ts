import { PrismaClient } from "@prisma/client";
import { toMoney } from "../utils";
import {
  STARTER_BUSINESS_PRODUCT_TEMPLATES,
  type StarterBusinessProductTemplate,
} from "./starterBusinessProductTemplates";

function normalizeCode(value?: string | null) {
  if (!value) return null;
  const cleaned = value.trim().replace(/\s+/g, "").toUpperCase();
  return cleaned || null;
}

function normalizeList(values?: string[] | null) {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const cleaned = String(value || "").trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(cleaned);
  }

  return normalized;
}

function toTemplateCreateInput(template: StarterBusinessProductTemplate) {
  return {
    businessType: template.businessType,
    name: template.name,
    brand: template.brand ?? null,
    modelName: template.modelName ?? null,
    category: template.category ?? null,
    packSize: template.packSize ?? null,
    compatibility: template.compatibility ?? null,
    warrantyDays:
      template.warrantyDays === undefined || template.warrantyDays === null
        ? null
        : Math.max(0, Math.floor(Number(template.warrantyDays))),
    defaultBuyPrice:
      template.defaultBuyPrice === undefined || template.defaultBuyPrice === null
        ? null
        : toMoney(template.defaultBuyPrice),
    defaultSellPrice:
      template.defaultSellPrice === undefined || template.defaultSellPrice === null
        ? null
        : toMoney(template.defaultSellPrice),
    defaultOpeningStock:
      template.defaultOpeningStock === undefined || template.defaultOpeningStock === null
        ? null
        : toMoney(template.defaultOpeningStock),
    defaultBarcode: normalizeCode(template.defaultBarcode),
    defaultBaseUnit: template.defaultBaseUnit ?? null,
    defaultTrackStock: template.defaultTrackStock === true,
    aliasesJson: normalizeList(template.aliases),
    keywordsJson: normalizeList(template.keywords),
    variantsJson: (template.variants ?? []).map((variant, index) => ({
      label: variant.label.trim(),
      buyPrice:
        variant.buyPrice === undefined || variant.buyPrice === null
          ? null
          : toMoney(variant.buyPrice),
      sellPrice: toMoney(variant.sellPrice),
      openingStock:
        variant.openingStock === undefined || variant.openingStock === null
          ? null
          : toMoney(variant.openingStock),
      sku: normalizeCode(variant.sku),
      barcode: normalizeCode(variant.barcode),
      sortOrder:
        Number.isFinite(Number(variant.sortOrder)) && Number(variant.sortOrder) >= 0
          ? Number(variant.sortOrder)
          : index,
      isActive: variant.isActive !== false,
    })),
    imageUrl: template.imageUrl ?? null,
    popularityScore: Number(template.popularityScore ?? 0) || 0,
    isActive: template.isActive !== false,
  };
}

export async function seedBusinessProductTemplates(prisma: PrismaClient) {
  let seededCount = 0;

  for (const template of STARTER_BUSINESS_PRODUCT_TEMPLATES) {
    const data = toTemplateCreateInput(template);
    await prisma.businessProductTemplate.upsert({
      where: {
        businessType_name: {
          businessType: data.businessType,
          name: data.name,
        },
      },
      create: data,
      update: data,
    });
    seededCount += 1;
  }

  return {
    seededCount,
    businessTypes: Array.from(
      new Set(STARTER_BUSINESS_PRODUCT_TEMPLATES.map((item) => item.businessType)),
    ).length,
  };
}
