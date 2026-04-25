"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { isSuperAdmin, requirePermission } from "@/lib/rbac";
import { assertShopAccess } from "@/lib/shop-access";
import {
  classifyCatalogBulkDeleteCandidates,
  computeCatalogNameSimilarityScore,
  formatCatalogProductRef,
  mergeCatalogMatchedBy,
  normalizeCatalogComparisonKey,
  tokenizeCatalogComparisonText,
} from "@/lib/catalog-admin-utils";
import {
  CatalogImportMode,
  CatalogImportPayloadFormat,
  CatalogImportSourceType,
  CatalogPriceKind,
  CatalogProductMergeMode,
  CatalogProductSource,
  Prisma,
  ProductSourceType,
} from "@prisma/client";

type CatalogAliasInput = {
  alias?: string | null;
  locale?: string | null;
  isPrimary?: boolean | null;
};

type CatalogBarcodeInput = {
  code?: string | null;
  format?: string | null;
  isPrimary?: boolean | null;
};

export type CatalogImportSourceInput = {
  slug: string;
  name: string;
  type: CatalogImportSourceType;
  notes?: string | null;
  importedAt?: string | Date | null;
};

export type CatalogProductInput = {
  businessType?: string | null;
  name: string;
  brand?: string | null;
  category?: string | null;
  packSize?: string | null;
  defaultBaseUnit?: string | null;
  imageUrl?: string | null;
  popularityScore?: number | string | null;
  sourceType?: CatalogProductSource | null;
  importSourceId?: string | null;
  externalRef?: string | null;
  aliases?: CatalogAliasInput[] | null;
  barcodes?: CatalogBarcodeInput[] | null;
  isActive?: boolean;
};

export type CatalogPriceSnapshotInput = {
  catalogProductId: string;
  businessType?: string | null;
  regionCode?: string | null;
  priceKind?: CatalogPriceKind | null;
  price: string | number;
  currency?: string | null;
  importSourceId?: string | null;
  sourceLabel?: string | null;
  observedAt?: string | Date | null;
};

export type CatalogProductQueryInput = {
  businessType?: string | null;
  globalOnly?: boolean | null;
  query?: string | null;
  isActive?: boolean | null;
  mergeState?: "active" | "merged" | "all" | null;
  sourceType?: CatalogProductSource | null;
  limit?: number | null;
};

export type RestoreCatalogProductResult = {
  id: string;
  restored: true;
};

export type CatalogPriceSnapshotRow = {
  id: string;
  catalogProductId: string;
  businessType: string | null;
  regionCode: string | null;
  priceKind: CatalogPriceKind;
  price: string;
  currency: string;
  sourceLabel: string | null;
  observedAt: string;
  createdAt: string;
  importSource: {
    id: string;
    slug: string;
    name: string;
    type: CatalogImportSourceType;
  } | null;
};

export type CatalogImportSourceSummaryRow = {
  id: string;
  slug: string;
  name: string;
  type: CatalogImportSourceType;
  productCount: number;
  activeProductCount: number;
  snapshotCount: number;
  latestCatalogUpdateAt: string | null;
  latestSnapshotObservedAt: string | null;
};

export type CatalogProductMergeAuditRow = {
  id: string;
  sourceCatalogProductId: string | null;
  sourceProductNameSnapshot: string;
  sourceBusinessTypeSnapshot: string | null;
  targetCatalogProductId: string | null;
  targetProductNameSnapshot: string;
  targetBusinessTypeSnapshot: string | null;
  mergeMode: CatalogProductMergeMode;
  movedTemplateCount: number;
  movedShopProductCount: number;
  movedSnapshotCount: number;
  movedAliasCount: number;
  movedBarcodeCount: number;
  mergedByUserId: string | null;
  mergedByLabel: string | null;
  note: string | null;
  createdAt: string;
};

export type CatalogDuplicateCandidateRow = {
  product: ReturnType<typeof mapCatalogProductRow>;
  score: number;
  reasons: string[];
};

export type CatalogSearchInput = {
  shopId: string;
  query?: string | null;
  barcode?: string | null;
  businessType?: string | null;
  limit?: number | null;
};

export type AddCatalogProductsToShopInput = {
  shopId: string;
  catalogProductIds: string[];
};

export type CatalogBulkImportMode = "skip" | "upsert";

export type CatalogBulkImportInput = {
  items: CatalogProductInput[];
  defaultBusinessType?: string | null;
  defaultImportSourceId?: string | null;
  defaultSourceType?: CatalogProductSource | null;
  payloadFormat?: CatalogImportPayloadFormat | null;
  mode?: CatalogBulkImportMode;
};

export type CatalogImportPreviewItem = {
  rowNumber: number;
  name: string;
  businessType: string | null;
  action: "create" | "update" | "skip";
  matchedBy: "name" | "barcode" | "externalRef" | "mixed" | null;
  matchedProductId: string | null;
  reasons: string[];
};

export type CatalogImportPreviewResult = {
  validCount: number;
  invalidCount: number;
  duplicateInputCount: number;
  createCount: number;
  updateCount: number;
  skipCount: number;
  items: CatalogImportPreviewItem[];
  errors: string[];
};

export type CatalogImportResult = {
  importRunId: string;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  invalidCount: number;
  duplicateInputCount: number;
  errors: string[];
};

export type CatalogImportRunRow = {
  id: string;
  payloadFormat: CatalogImportPayloadFormat;
  importMode: CatalogImportMode;
  submittedCount: number;
  validCount: number;
  invalidCount: number;
  duplicateInputCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  defaultBusinessType: string | null;
  defaultImportSourceLabel: string | null;
  defaultSourceType: CatalogProductSource | null;
  importedByUserId: string | null;
  importedByLabel: string | null;
  errorSummary: string | null;
  createdAt: string;
  defaultImportSource: {
    id: string;
    slug: string;
    name: string;
    type: CatalogImportSourceType;
  } | null;
};

export type CatalogBulkSetActiveStateInput = {
  ids: string[];
  isActive: boolean;
};

export type CatalogBulkUpdateMetadataInput = {
  ids: string[];
  importSourceId?: string | null;
  sourceType?: CatalogProductSource | null;
};

export type CatalogBulkUpdateMetadataResult = {
  updatedCount: number;
  importSourceId: string | null;
  sourceType: CatalogProductSource | null;
};

export type CatalogBulkRestoreResult = {
  restoredCount: number;
};

export type CatalogBulkDeleteResult = {
  deletedCount: number;
  skippedCount: number;
  linkedCount: number;
  protectedCount: number;
};

export type MergeCatalogProductsInput = {
  targetProductId: string;
  sourceProductId: string;
  mode?: CatalogProductMergeMode | null;
  note?: string | null;
};

export type MergeCatalogProductsResult = {
  targetProductId: string;
  sourceProductId: string;
  mergeMode: CatalogProductMergeMode;
  movedTemplateCount: number;
  movedShopProductCount: number;
  movedSnapshotCount: number;
  movedAliasCount: number;
  movedBarcodeCount: number;
  auditActionId: string;
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

function normalizeOptionalText(value?: string | null, maxLength = 255) {
  if (value === undefined) return undefined;
  const cleaned = value === null ? "" : value.toString().trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function normalizeOptionalBusinessType(value?: string | null) {
  const cleaned = normalizeOptionalText(value, 80);
  if (cleaned === undefined || cleaned === null) return cleaned;
  return cleaned.toLowerCase();
}

function normalizeSlug(value: string) {
  return normalizeRequiredText(value, "Slug")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function normalizeOptionalImageUrl(value?: string | null) {
  return normalizeOptionalText(value, 500);
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

function normalizeOptionalMoney(value?: string | number | null, label = "Price") {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const cleaned = value.toString().trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a valid non-negative number`);
  }
  return parsed.toString();
}

function normalizeOptionalCode(value?: string | null) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const cleaned = value.toString().trim().replace(/\s+/g, "").toUpperCase();
  return cleaned ? cleaned.slice(0, 80) : null;
}

function normalizeOptionalUnit(value?: string | null) {
  return normalizeOptionalText(value, 40);
}

function normalizeOptionalLocale(value?: string | null) {
  const cleaned = normalizeOptionalText(value, 16);
  if (cleaned === undefined || cleaned === null) return cleaned;
  return cleaned.toLowerCase();
}

function normalizeOptionalDate(value?: string | Date | null) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date value");
  }
  return date;
}

function normalizeMergeMode(value?: CatalogProductMergeMode | null) {
  return value === CatalogProductMergeMode.delete
    ? CatalogProductMergeMode.delete
    : CatalogProductMergeMode.archive;
}

function normalizeImportPayloadFormat(value?: CatalogImportPayloadFormat | null) {
  return value === CatalogImportPayloadFormat.csv
    ? CatalogImportPayloadFormat.csv
    : CatalogImportPayloadFormat.json;
}

function normalizeImportMode(value?: CatalogBulkImportMode | null) {
  return value === "upsert" ? CatalogImportMode.upsert : CatalogImportMode.skip;
}

function normalizeLimit(value?: number | null, fallback = 25, max = 100) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function normalizeAliases(input?: CatalogAliasInput[] | null) {
  if (input === undefined) return undefined;
  if (input === null) return [];
  if (!Array.isArray(input)) {
    throw new Error("Aliases must be an array");
  }

  const seen = new Set<string>();
  const normalized: Array<{ alias: string; locale: string | null; isPrimary: boolean }> = [];

  for (const row of input) {
    const alias = normalizeOptionalText(row?.alias, 120);
    if (!alias) continue;
    const key = alias.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({
      alias,
      locale: normalizeOptionalLocale(row?.locale) ?? null,
      isPrimary: row?.isPrimary === true,
    });
  }

  return normalized;
}

function normalizeBarcodes(input?: CatalogBarcodeInput[] | null) {
  if (input === undefined) return undefined;
  if (input === null) return [];
  if (!Array.isArray(input)) {
    throw new Error("Barcodes must be an array");
  }

  const seen = new Set<string>();
  const normalized: Array<{ code: string; format: string | null; isPrimary: boolean }> = [];

  for (const row of input) {
    const code = normalizeOptionalCode(row?.code);
    if (!code) continue;
    if (seen.has(code)) continue;
    seen.add(code);
    normalized.push({
      code,
      format: normalizeOptionalText(row?.format, 40) ?? null,
      isPrimary: row?.isPrimary === true,
    });
  }

  return normalized;
}

function buildCatalogProductPayload(input: CatalogProductInput) {
  const businessType = normalizeOptionalBusinessType(input.businessType);
  const name = normalizeRequiredText(input.name, "Name");
  const brand = normalizeOptionalText(input.brand, 120);
  const category = normalizeOptionalText(input.category, 120);
  const packSize = normalizeOptionalText(input.packSize, 80);
  const defaultBaseUnit = normalizeOptionalUnit(input.defaultBaseUnit);
  const imageUrl = normalizeOptionalImageUrl(input.imageUrl);
  const popularityScore = normalizeOptionalScore(input.popularityScore) ?? 0;
  const sourceType = input.sourceType ?? CatalogProductSource.curated;
  const importSourceId = normalizeOptionalText(input.importSourceId, 36);
  const externalRef = normalizeOptionalText(input.externalRef, 120);
  const aliases = normalizeAliases(input.aliases) ?? [];
  const barcodes = normalizeBarcodes(input.barcodes) ?? [];
  const isActive = input.isActive ?? true;

  return {
    businessType: businessType ?? null,
    name,
    brand: brand ?? null,
    category: category ?? null,
    packSize: packSize ?? null,
    defaultBaseUnit: defaultBaseUnit ?? null,
    imageUrl: imageUrl ?? null,
    popularityScore,
    sourceType,
    importSourceId: importSourceId ?? null,
    externalRef: externalRef ?? null,
    aliases,
    barcodes,
    isActive,
  };
}

type NormalizedCatalogImportRow = {
  rowNumber: number;
  original: CatalogProductInput;
  payload: ReturnType<typeof buildCatalogProductPayload>;
  nameKey: string;
  barcodeKeys: string[];
  externalRefKey: string | null;
};

type CatalogImportPlanItem = CatalogImportPreviewItem & {
  row?: NormalizedCatalogImportRow;
};

async function buildCatalogImportPlan(
  input: CatalogBulkImportInput,
): Promise<CatalogImportPreviewResult & { plan: CatalogImportPlanItem[] }> {
  const defaultBusinessType = normalizeOptionalBusinessType(input.defaultBusinessType) ?? null;
  const defaultImportSourceId = normalizeOptionalText(input.defaultImportSourceId, 36) ?? null;
  const defaultSourceType = input.defaultSourceType ?? null;
  const mode: CatalogBulkImportMode = input.mode === "upsert" ? "upsert" : "skip";
  const errors: string[] = [];
  const normalizedRows: NormalizedCatalogImportRow[] = [];
  let invalidCount = 0;

  input.items.forEach((item, index) => {
    try {
      const payload = buildCatalogProductPayload({
        ...item,
        businessType:
          item.businessType === undefined ? defaultBusinessType : item.businessType,
        importSourceId:
          item.importSourceId === undefined ? defaultImportSourceId : item.importSourceId,
        sourceType:
          item.sourceType === undefined ? defaultSourceType ?? undefined : item.sourceType,
      });

      normalizedRows.push({
        rowNumber: index + 1,
        original: item,
        payload,
        nameKey: `${payload.businessType ?? "__global__"}|${payload.name.toLowerCase()}`,
        barcodeKeys: payload.barcodes.map((barcode) => barcode.code),
        externalRefKey: payload.externalRef?.toLowerCase() ?? null,
      });
    } catch (err: any) {
      invalidCount += 1;
      errors.push(`Row ${index + 1}: ${err?.message || "Invalid product"}`);
    }
  });

  if (normalizedRows.length === 0) {
    return {
      validCount: 0,
      invalidCount,
      duplicateInputCount: 0,
      createCount: 0,
      updateCount: 0,
      skipCount: 0,
      items: [],
      errors,
      plan: [],
    };
  }

  const nameKeys = Array.from(new Set(normalizedRows.map((row) => row.nameKey)));
  const barcodeKeys = Array.from(
    new Set(normalizedRows.flatMap((row) => row.barcodeKeys).filter(Boolean)),
  );
  const externalRefKeys = Array.from(
    new Set(normalizedRows.map((row) => row.externalRefKey).filter(Boolean)),
  );

  const existingProducts = await prisma.catalogProduct.findMany({
    where: {
      OR: [
        ...(nameKeys.length
          ? nameKeys.map((key) => {
              const [businessTypeKey, ...nameParts] = key.split("|");
              return {
                businessType:
                  businessTypeKey === "__global__" ? null : businessTypeKey,
                name: {
                  equals: nameParts.join("|"),
                  mode: "insensitive" as const,
                },
              };
            })
          : []),
        ...(externalRefKeys.length
          ? externalRefKeys.map((externalRef) => ({
              externalRef: { equals: externalRef, mode: "insensitive" as const },
            }))
          : []),
        ...(barcodeKeys.length
          ? [
              {
                barcodes: {
                  some: {
                    code: { in: barcodeKeys },
                  },
                },
              },
            ]
          : []),
      ],
    },
    include: {
      barcodes: {
        select: { code: true },
      },
    },
  });

  const existingByName = new Map<string, string>();
  const existingByExternalRef = new Map<string, string>();
  const existingByBarcode = new Map<string, string>();
  const existingById = new Map<
    string,
    {
      id: string;
      name: string;
      businessType: string | null;
    }
  >();
  existingProducts.forEach((product) => {
    existingById.set(product.id, {
      id: product.id,
      name: product.name,
      businessType: product.businessType ?? null,
    });
    existingByName.set(
      `${product.businessType ?? "__global__"}|${product.name.toLowerCase()}`,
      product.id,
    );
    if (product.externalRef) {
      existingByExternalRef.set(product.externalRef.toLowerCase(), product.id);
    }
    product.barcodes.forEach((barcode) => {
      existingByBarcode.set(barcode.code, product.id);
    });
  });

  const seenInputNameKeys = new Set<string>();
  const seenInputBarcodeKeys = new Set<string>();
  const plan: CatalogImportPlanItem[] = [];
  let duplicateInputCount = 0;
  let createCount = 0;
  let updateCount = 0;
  let skipCount = 0;

  for (const row of normalizedRows) {
    const reasons: string[] = [];
    const matchReasons: string[] = [];
    const matchedIds = new Set<string>();
    let matchedBy: CatalogImportPlanItem["matchedBy"] = null;

    if (seenInputNameKeys.has(row.nameKey)) {
      reasons.push("Duplicate name/businessType inside import payload");
    } else {
      seenInputNameKeys.add(row.nameKey);
    }

    for (const barcodeKey of row.barcodeKeys) {
      if (seenInputBarcodeKeys.has(barcodeKey)) {
        reasons.push(`Duplicate barcode in payload: ${barcodeKey}`);
      } else {
        seenInputBarcodeKeys.add(barcodeKey);
      }
    }

    const nameMatchId = existingByName.get(row.nameKey) ?? null;
    if (nameMatchId) {
      matchedIds.add(nameMatchId);
      matchedBy = mergeCatalogMatchedBy(matchedBy, "name");
      matchReasons.push(
        `Name matched ${formatCatalogProductRef(existingById.get(nameMatchId))}`,
      );
    }

    const externalRefMatchId = row.externalRefKey
      ? existingByExternalRef.get(row.externalRefKey) ?? null
      : null;
    if (externalRefMatchId) {
      matchedIds.add(externalRefMatchId);
      matchedBy = mergeCatalogMatchedBy(matchedBy, "externalRef");
      matchReasons.push(
        `External ref matched ${formatCatalogProductRef(
          existingById.get(externalRefMatchId),
        )}`,
      );
    }

    const barcodeMatchDetails: string[] = [];
    for (const barcodeKey of row.barcodeKeys) {
      const barcodeMatchId = existingByBarcode.get(barcodeKey) ?? null;
      if (barcodeMatchId) {
        matchedIds.add(barcodeMatchId);
        barcodeMatchDetails.push(
          `${barcodeKey} -> ${formatCatalogProductRef(existingById.get(barcodeMatchId))}`,
        );
      }
    }
    if (barcodeMatchDetails.length > 0) {
      matchedBy = mergeCatalogMatchedBy(matchedBy, "barcode");
      matchReasons.push(`Barcode matched ${barcodeMatchDetails.join(" | ")}`);
    }

    if (reasons.length > 0) {
      duplicateInputCount += 1;
      skipCount += 1;
      plan.push({
        rowNumber: row.rowNumber,
        name: row.payload.name,
        businessType: row.payload.businessType,
        action: "skip",
        matchedBy,
        matchedProductId: matchedIds.size === 1 ? Array.from(matchedIds)[0] : null,
        reasons: [...reasons, ...matchReasons],
      });
      continue;
    }

    if (matchedIds.size > 1) {
      const conflictingRefs = Array.from(matchedIds).map((id) =>
        formatCatalogProductRef(existingById.get(id)),
      );
      skipCount += 1;
      plan.push({
        rowNumber: row.rowNumber,
        name: row.payload.name,
        businessType: row.payload.businessType,
        action: "skip",
        matchedBy: "mixed",
        matchedProductId: null,
        reasons: [
          "Conflicting existing matches found for this row",
          ...matchReasons,
          `Conflicts: ${conflictingRefs.join(" | ")}`,
        ],
      });
      continue;
    }

    if (matchedIds.size === 1) {
      const matchedProductId = Array.from(matchedIds)[0];
      const isUpsert = mode === "upsert";
      if (isUpsert) {
        updateCount += 1;
      } else {
        skipCount += 1;
      }
      plan.push({
        rowNumber: row.rowNumber,
        name: row.payload.name,
        businessType: row.payload.businessType,
        action: isUpsert ? "update" : "skip",
        matchedBy,
        matchedProductId,
        reasons: [
          isUpsert
            ? `Matched existing product by ${matchedBy ?? "existing key"}`
            : `Existing product already matched by ${matchedBy ?? "existing key"}`,
          ...matchReasons,
        ],
        row,
      });
      continue;
    }

    createCount += 1;
    plan.push({
      rowNumber: row.rowNumber,
      name: row.payload.name,
      businessType: row.payload.businessType,
      action: "create",
      matchedBy: null,
      matchedProductId: null,
      reasons: ["No existing match found"],
      row,
    });
  }

  return {
    validCount: normalizedRows.length,
    invalidCount,
    duplicateInputCount,
    createCount,
    updateCount,
    skipCount,
    items: plan.map(({ row, ...item }) => item),
    errors,
    plan,
  };
}

function mapCatalogProductRow(row: {
  id: string;
  businessType: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  packSize: string | null;
  defaultBaseUnit: string | null;
  imageUrl: string | null;
  popularityScore: number;
  sourceType: CatalogProductSource;
  externalRef: string | null;
  mergedIntoCatalogProductId?: string | null;
  mergedAt?: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  importSource?: { id: string; slug: string; name: string; type: CatalogImportSourceType } | null;
  mergedIntoCatalogProduct?: { id: string; name: string } | null;
  aliases?: Array<{ alias: string; locale: string | null; isPrimary: boolean }>;
  barcodes?: Array<{ code: string; format: string | null; isPrimary: boolean }>;
  priceSnapshots?: Array<{ price: Prisma.Decimal; priceKind: CatalogPriceKind; observedAt: Date }>;
}) {
  const latestPrice = row.priceSnapshots?.[0] ?? null;
  return {
    id: row.id,
    businessType: row.businessType ?? null,
    name: row.name,
    brand: row.brand ?? null,
    category: row.category ?? null,
    packSize: row.packSize ?? null,
    defaultBaseUnit: row.defaultBaseUnit ?? null,
    imageUrl: row.imageUrl ?? null,
    popularityScore: Number(row.popularityScore ?? 0),
    sourceType: row.sourceType,
    externalRef: row.externalRef ?? null,
    mergedIntoCatalogProductId: row.mergedIntoCatalogProductId ?? null,
    mergedIntoCatalogProductName: row.mergedIntoCatalogProduct?.name ?? null,
    mergedAt: row.mergedAt?.toISOString?.() ?? null,
    aliases: (row.aliases ?? []).map((item) => ({
      alias: item.alias,
      locale: item.locale ?? null,
      isPrimary: item.isPrimary === true,
    })),
    barcodes: (row.barcodes ?? []).map((item) => ({
      code: item.code,
      format: item.format ?? null,
      isPrimary: item.isPrimary === true,
    })),
    latestPrice: latestPrice?.price?.toString?.() ?? null,
    latestPriceKind: latestPrice?.priceKind ?? null,
    latestPriceObservedAt: latestPrice?.observedAt?.toISOString?.() ?? null,
    importSource: row.importSource
      ? {
          id: row.importSource.id,
          slug: row.importSource.slug,
          name: row.importSource.name,
          type: row.importSource.type,
        }
      : null,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapCatalogImportRunRow(row: {
  id: string;
  payloadFormat: CatalogImportPayloadFormat;
  importMode: CatalogImportMode;
  submittedCount: number;
  validCount: number;
  invalidCount: number;
  duplicateInputCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  defaultBusinessType: string | null;
  defaultImportSourceLabel: string | null;
  defaultSourceType: CatalogProductSource | null;
  importedByUserId: string | null;
  importedByLabel: string | null;
  errorSummary: string | null;
  createdAt: Date;
  defaultImportSource?: { id: string; slug: string; name: string; type: CatalogImportSourceType } | null;
}): CatalogImportRunRow {
  return {
    id: row.id,
    payloadFormat: row.payloadFormat,
    importMode: row.importMode,
    submittedCount: row.submittedCount,
    validCount: row.validCount,
    invalidCount: row.invalidCount,
    duplicateInputCount: row.duplicateInputCount,
    createdCount: row.createdCount,
    updatedCount: row.updatedCount,
    skippedCount: row.skippedCount,
    errorCount: row.errorCount,
    defaultBusinessType: row.defaultBusinessType ?? null,
    defaultImportSourceLabel: row.defaultImportSourceLabel ?? null,
    defaultSourceType: row.defaultSourceType ?? null,
    importedByUserId: row.importedByUserId ?? null,
    importedByLabel: row.importedByLabel ?? null,
    errorSummary: row.errorSummary ?? null,
    createdAt: row.createdAt.toISOString(),
    defaultImportSource: row.defaultImportSource
      ? {
          id: row.defaultImportSource.id,
          slug: row.defaultImportSource.slug,
          name: row.defaultImportSource.name,
          type: row.defaultImportSource.type,
        }
      : null,
  };
}

export async function listCatalogImportSourcesAdmin() {
  const user = await requireUser();
  assertSuperAdmin(user);

  return prisma.catalogImportSource.findMany({
    orderBy: [{ name: "asc" }],
  });
}

export async function listCatalogImportSourceSummaryAdmin(): Promise<
  CatalogImportSourceSummaryRow[]
> {
  const user = await requireUser();
  assertSuperAdmin(user);

  const sources = await prisma.catalogImportSource.findMany({
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      type: true,
    },
  });

  if (sources.length === 0) {
    return [];
  }

  const sourceIds = sources.map((source) => source.id);
  const [productGroups, activeProductGroups, snapshotGroups] = await Promise.all([
    prisma.catalogProduct.groupBy({
      by: ["importSourceId"],
      where: {
        importSourceId: {
          in: sourceIds,
        },
      },
      _count: {
        _all: true,
      },
      _max: {
        updatedAt: true,
      },
    }),
    prisma.catalogProduct.groupBy({
      by: ["importSourceId"],
      where: {
        importSourceId: {
          in: sourceIds,
        },
        isActive: true,
      },
      _count: {
        _all: true,
      },
    }),
    prisma.catalogPriceSnapshot.groupBy({
      by: ["importSourceId"],
      where: {
        importSourceId: {
          in: sourceIds,
        },
      },
      _count: {
        _all: true,
      },
      _max: {
        observedAt: true,
      },
    }),
  ]);

  const productGroupById = new Map(
    productGroups
      .filter((group): group is typeof group & { importSourceId: string } => Boolean(group.importSourceId))
      .map((group) => [group.importSourceId, group]),
  );
  const activeProductGroupById = new Map(
    activeProductGroups
      .filter((group): group is typeof group & { importSourceId: string } => Boolean(group.importSourceId))
      .map((group) => [group.importSourceId, group]),
  );
  const snapshotGroupById = new Map(
    snapshotGroups
      .filter((group): group is typeof group & { importSourceId: string } => Boolean(group.importSourceId))
      .map((group) => [group.importSourceId, group]),
  );

  return sources.map((source) => ({
    id: source.id,
    slug: source.slug,
    name: source.name,
    type: source.type,
    productCount: productGroupById.get(source.id)?._count._all ?? 0,
    activeProductCount: activeProductGroupById.get(source.id)?._count._all ?? 0,
    snapshotCount: snapshotGroupById.get(source.id)?._count._all ?? 0,
    latestCatalogUpdateAt:
      productGroupById.get(source.id)?._max.updatedAt?.toISOString() ?? null,
    latestSnapshotObservedAt:
      snapshotGroupById.get(source.id)?._max.observedAt?.toISOString() ?? null,
  }));
}

export async function listCatalogImportRunsAdmin(input?: {
  limit?: number | null;
}): Promise<CatalogImportRunRow[]> {
  const user = await requireUser();
  assertSuperAdmin(user);

  const limit = normalizeLimit(input?.limit, 12, 50);
  const rows = await prisma.catalogImportRun.findMany({
    include: {
      defaultImportSource: {
        select: { id: true, slug: true, name: true, type: true },
      },
    },
    orderBy: [{ createdAt: "desc" }],
    take: limit,
  });

  return rows.map(mapCatalogImportRunRow);
}

export async function listCatalogProductMergeActionsAdmin(input?: {
  limit?: number | null;
}): Promise<CatalogProductMergeAuditRow[]> {
  const user = await requireUser();
  assertSuperAdmin(user);

  const limit = normalizeLimit(input?.limit, 12, 50);
  const rows = await prisma.catalogProductMergeAction.findMany({
    orderBy: [{ createdAt: "desc" }],
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    sourceCatalogProductId: row.sourceCatalogProductId ?? null,
    sourceProductNameSnapshot: row.sourceProductNameSnapshot,
    sourceBusinessTypeSnapshot: row.sourceBusinessTypeSnapshot ?? null,
    targetCatalogProductId: row.targetCatalogProductId ?? null,
    targetProductNameSnapshot: row.targetProductNameSnapshot,
    targetBusinessTypeSnapshot: row.targetBusinessTypeSnapshot ?? null,
    mergeMode: row.mergeMode,
    movedTemplateCount: row.movedTemplateCount,
    movedShopProductCount: row.movedShopProductCount,
    movedSnapshotCount: row.movedSnapshotCount,
    movedAliasCount: row.movedAliasCount,
    movedBarcodeCount: row.movedBarcodeCount,
    mergedByUserId: row.mergedByUserId ?? null,
    mergedByLabel: row.mergedByLabel ?? null,
    note: row.note ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function createCatalogImportSource(input: CatalogImportSourceInput) {
  const user = await requireUser();
  assertSuperAdmin(user);

  const slug = normalizeSlug(input.slug);
  const name = normalizeRequiredText(input.name, "Name");
  const notes = normalizeOptionalText(input.notes, 1000);
  const importedAt = normalizeOptionalDate(input.importedAt);

  await prisma.catalogImportSource.upsert({
    where: { slug },
    create: {
      slug,
      name,
      type: input.type,
      notes: notes ?? null,
      importedAt: importedAt ?? null,
    },
    update: {
      name,
      type: input.type,
      notes: notes ?? null,
      importedAt: importedAt ?? null,
    },
  });

  return { success: true };
}

export async function listCatalogProductsAdmin(input: CatalogProductQueryInput = {}) {
  const user = await requireUser();
  assertSuperAdmin(user);

  const businessType = normalizeOptionalBusinessType(input.businessType);
  const globalOnly = input.globalOnly === true;
  const query = normalizeOptionalText(input.query, 120);
  const mergeState =
    input.mergeState === "merged" || input.mergeState === "all"
      ? input.mergeState
      : "active";
  const limit = normalizeLimit(input.limit, 50, 200);

  const rows = await prisma.catalogProduct.findMany({
    where: {
      ...(mergeState === "active"
        ? { mergedIntoCatalogProductId: null }
        : mergeState === "merged"
          ? { mergedIntoCatalogProductId: { not: null } }
          : {}),
      ...(globalOnly ? { businessType: null } : businessType ? { businessType } : {}),
      ...(input.isActive === null || input.isActive === undefined
        ? {}
        : { isActive: input.isActive }),
      ...(input.sourceType ? { sourceType: input.sourceType } : {}),
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { brand: { contains: query, mode: "insensitive" } },
              { category: { contains: query, mode: "insensitive" } },
              { externalRef: { contains: query, mode: "insensitive" } },
              {
                aliases: {
                  some: { alias: { contains: query, mode: "insensitive" } },
                },
              },
              {
                barcodes: {
                  some: { code: { contains: query.replace(/\s+/g, ""), mode: "insensitive" } },
                },
              },
            ],
          }
        : {}),
    },
    include: {
      importSource: {
        select: { id: true, slug: true, name: true, type: true },
      },
      mergedIntoCatalogProduct: {
        select: { id: true, name: true },
      },
      aliases: {
        select: { alias: true, locale: true, isPrimary: true },
        orderBy: [{ isPrimary: "desc" }, { alias: "asc" }],
      },
      barcodes: {
        select: { code: true, format: true, isPrimary: true },
        orderBy: [{ isPrimary: "desc" }, { code: "asc" }],
      },
      priceSnapshots: {
        select: { price: true, priceKind: true, observedAt: true },
        orderBy: [{ observedAt: "desc" }],
        take: 1,
      },
    },
    orderBy: [{ popularityScore: "desc" }, { name: "asc" }],
    take: limit,
  });

  return rows.map(mapCatalogProductRow);
}

export async function listCatalogDuplicateCandidatesAdmin(input: {
  catalogProductId: string;
  limit?: number | null;
}): Promise<CatalogDuplicateCandidateRow[]> {
  const user = await requireUser();
  assertSuperAdmin(user);

  const catalogProductId = normalizeRequiredText(input.catalogProductId, "Catalog product id");
  const limit = normalizeLimit(input.limit, 8, 20);
  const target = await prisma.catalogProduct.findUnique({
    where: { id: catalogProductId },
    include: {
      aliases: {
        select: { alias: true },
      },
      barcodes: {
        select: { code: true },
      },
    },
  });

  if (!target) {
    throw new Error("Catalog product not found");
  }

  const targetNameKey = normalizeCatalogComparisonKey(target.name);
  const targetBrandKey = normalizeCatalogComparisonKey(target.brand);
  const targetCategoryKey = normalizeCatalogComparisonKey(target.category);
  const targetExternalRefKey = normalizeCatalogComparisonKey(target.externalRef);
  const targetPackSizeKey = normalizeCatalogComparisonKey(target.packSize);
  const targetAliasKeys = target.aliases
    .map((item) => normalizeCatalogComparisonKey(item.alias))
    .filter(Boolean);
  const targetBarcodeKeys = target.barcodes
    .map((item) => normalizeCatalogComparisonKey(item.code))
    .filter(Boolean);
  const targetNameTokens = tokenizeCatalogComparisonText(target.name);
  const targetPrimaryToken = targetNameTokens[0] ?? "";
  const targetNamePrefix = targetNameKey.slice(0, Math.min(targetNameKey.length, 8));

  const candidates = await prisma.catalogProduct.findMany({
    where: {
      id: {
        not: catalogProductId,
      },
      mergedIntoCatalogProductId: null,
      OR: [
        { businessType: target.businessType ?? null },
        { name: { equals: target.name, mode: "insensitive" } },
        ...(targetNamePrefix.length >= 4
          ? [{ name: { contains: targetNamePrefix, mode: "insensitive" as const } }]
          : []),
        ...(targetPrimaryToken.length >= 3
          ? [{ name: { contains: targetPrimaryToken, mode: "insensitive" as const } }]
          : []),
        ...(target.brand
          ? [{ brand: { equals: target.brand, mode: "insensitive" as const } }]
          : []),
        ...(target.category
          ? [{ category: { equals: target.category, mode: "insensitive" as const } }]
          : []),
        ...(target.externalRef
          ? [{ externalRef: { equals: target.externalRef, mode: "insensitive" as const } }]
          : []),
        ...(targetAliasKeys.length > 0
          ? [
              {
                aliases: {
                  some: {
                    alias: {
                      in: targetAliasKeys,
                    },
                  },
                },
              },
            ]
          : []),
        ...(targetBarcodeKeys.length > 0
          ? [
              {
                barcodes: {
                  some: {
                    code: {
                      in: targetBarcodeKeys,
                    },
                  },
                },
              },
            ]
          : []),
      ],
    },
    include: {
      importSource: {
        select: { id: true, slug: true, name: true, type: true },
      },
      mergedIntoCatalogProduct: {
        select: { id: true, name: true },
      },
      aliases: {
        select: { alias: true, locale: true, isPrimary: true },
        orderBy: [{ isPrimary: "desc" }, { alias: "asc" }],
      },
      barcodes: {
        select: { code: true, format: true, isPrimary: true },
        orderBy: [{ isPrimary: "desc" }, { code: "asc" }],
      },
      priceSnapshots: {
        select: { price: true, priceKind: true, observedAt: true },
        orderBy: [{ observedAt: "desc" }],
        take: 1,
      },
    },
    take: 50,
  });

  return candidates
    .map((candidate) => {
      let score = 0;
      const reasons: string[] = [];
      const sameBusinessType =
        normalizeCatalogComparisonKey(candidate.businessType) ===
        normalizeCatalogComparisonKey(target.businessType);

      if (sameBusinessType) {
        score += 1;
        reasons.push("same business type");
      }

      const nameSimilarity = computeCatalogNameSimilarityScore(candidate.name, target.name);
      if (nameSimilarity.score > 0) {
        score += nameSimilarity.score;
        reasons.push(...nameSimilarity.reasons);
      }

      if (targetBrandKey && normalizeCatalogComparisonKey(candidate.brand) === targetBrandKey) {
        score += 2;
        reasons.push("same brand");
      }

      if (
        targetCategoryKey &&
        normalizeCatalogComparisonKey(candidate.category) === targetCategoryKey
      ) {
        score += 1;
        reasons.push("same category");
      }

      if (
        targetPackSizeKey &&
        normalizeCatalogComparisonKey(candidate.packSize) === targetPackSizeKey
      ) {
        score += 2;
        reasons.push("same pack size");
      }

      if (
        targetExternalRefKey &&
        normalizeCatalogComparisonKey(candidate.externalRef) === targetExternalRefKey
      ) {
        score += 5;
        reasons.push("same external ref");
      }

      const overlappingAliases = candidate.aliases
        .map((item) => normalizeCatalogComparisonKey(item.alias))
        .filter((alias) => targetAliasKeys.includes(alias));
      if (overlappingAliases.length > 0) {
        score += overlappingAliases.length * 3;
        reasons.push(`shared aliases: ${overlappingAliases.slice(0, 3).join(", ")}`);
      }

      const overlappingBarcodes = candidate.barcodes
        .map((item) => normalizeCatalogComparisonKey(item.code))
        .filter((code) => targetBarcodeKeys.includes(code));
      if (overlappingBarcodes.length > 0) {
        score += overlappingBarcodes.length * 4;
        reasons.push(`shared barcodes: ${overlappingBarcodes.slice(0, 3).join(", ")}`);
      }

      return {
        product: mapCatalogProductRow(candidate),
        score,
        reasons,
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.product.name.localeCompare(right.product.name);
    })
    .slice(0, limit);
}

export async function listCatalogPriceSnapshotsAdmin(input: {
  catalogProductId: string;
  limit?: number | null;
}): Promise<CatalogPriceSnapshotRow[]> {
  const user = await requireUser();
  assertSuperAdmin(user);

  const catalogProductId = normalizeRequiredText(
    input.catalogProductId,
    "Catalog product id",
  );
  const limit = normalizeLimit(input.limit, 12, 50);

  const rows = await prisma.catalogPriceSnapshot.findMany({
    where: { catalogProductId },
    include: {
      importSource: {
        select: { id: true, slug: true, name: true, type: true },
      },
    },
    orderBy: [{ observedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    catalogProductId: row.catalogProductId,
    businessType: row.businessType ?? null,
    regionCode: row.regionCode ?? null,
    priceKind: row.priceKind,
    price: row.price.toString(),
    currency: row.currency,
    sourceLabel: row.sourceLabel ?? null,
    observedAt: row.observedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    importSource: row.importSource
      ? {
          id: row.importSource.id,
          slug: row.importSource.slug,
          name: row.importSource.name,
          type: row.importSource.type,
        }
      : null,
  }));
}

export async function createCatalogProduct(input: CatalogProductInput) {
  const user = await requireUser();
  assertSuperAdmin(user);

  const payload = buildCatalogProductPayload(input);

  const row = await prisma.catalogProduct.create({
    data: {
      businessType: payload.businessType,
      name: payload.name,
      brand: payload.brand,
      category: payload.category,
      packSize: payload.packSize,
      defaultBaseUnit: payload.defaultBaseUnit,
      imageUrl: payload.imageUrl,
      popularityScore: payload.popularityScore,
      sourceType: payload.sourceType,
      importSourceId: payload.importSourceId,
      externalRef: payload.externalRef,
      isActive: payload.isActive,
      aliases: payload.aliases.length
        ? {
            createMany: {
              data: payload.aliases,
            },
          }
        : undefined,
      barcodes: payload.barcodes.length
        ? {
            createMany: {
              data: payload.barcodes,
            },
          }
        : undefined,
    },
    include: {
      importSource: {
        select: { id: true, slug: true, name: true, type: true },
      },
      mergedIntoCatalogProduct: {
        select: { id: true, name: true },
      },
      aliases: {
        select: { alias: true, locale: true, isPrimary: true },
        orderBy: [{ isPrimary: "desc" }, { alias: "asc" }],
      },
      barcodes: {
        select: { code: true, format: true, isPrimary: true },
        orderBy: [{ isPrimary: "desc" }, { code: "asc" }],
      },
      priceSnapshots: {
        select: { price: true, priceKind: true, observedAt: true },
        orderBy: [{ observedAt: "desc" }],
        take: 1,
      },
    },
  });

  return mapCatalogProductRow(row);
}

export async function updateCatalogProduct(id: string, input: Partial<CatalogProductInput>) {
  const user = await requireUser();
  assertSuperAdmin(user);

  const catalogProductId = normalizeRequiredText(id, "Catalog product id");
  const current = await prisma.catalogProduct.findUnique({
    where: { id: catalogProductId },
  });
  if (!current) {
    throw new Error("Catalog product not found");
  }

  const payload = buildCatalogProductPayload({
    name: input.name ?? current.name,
    businessType: input.businessType ?? current.businessType,
    brand: input.brand ?? current.brand,
    category: input.category ?? current.category,
    packSize: input.packSize ?? current.packSize,
    defaultBaseUnit: input.defaultBaseUnit ?? current.defaultBaseUnit,
    imageUrl: input.imageUrl ?? current.imageUrl,
    popularityScore: input.popularityScore ?? current.popularityScore,
    sourceType: input.sourceType ?? current.sourceType,
    importSourceId: input.importSourceId ?? current.importSourceId,
    externalRef: input.externalRef ?? current.externalRef,
    aliases: input.aliases,
    barcodes: input.barcodes,
    isActive: input.isActive ?? current.isActive,
  });

  const row = await prisma.$transaction(async (tx) => {
    if (input.aliases !== undefined) {
      await tx.catalogProductAlias.deleteMany({
        where: { catalogProductId },
      });
    }
    if (input.barcodes !== undefined) {
      await tx.catalogProductBarcode.deleteMany({
        where: { catalogProductId },
      });
    }

    await tx.catalogProduct.update({
      where: { id: catalogProductId },
      data: {
        businessType: payload.businessType,
        name: payload.name,
        brand: payload.brand,
        category: payload.category,
        packSize: payload.packSize,
        defaultBaseUnit: payload.defaultBaseUnit,
        imageUrl: payload.imageUrl,
        popularityScore: payload.popularityScore,
        sourceType: payload.sourceType,
        importSourceId: payload.importSourceId,
        externalRef: payload.externalRef,
        isActive: payload.isActive,
      },
    });

    if (input.aliases !== undefined && payload.aliases.length > 0) {
      await tx.catalogProductAlias.createMany({
        data: payload.aliases.map((item) => ({
          catalogProductId,
          ...item,
        })),
      });
    }

    if (input.barcodes !== undefined && payload.barcodes.length > 0) {
      await tx.catalogProductBarcode.createMany({
        data: payload.barcodes.map((item) => ({
          catalogProductId,
          ...item,
        })),
      });
    }

    return tx.catalogProduct.findUniqueOrThrow({
      where: { id: catalogProductId },
      include: {
        importSource: {
          select: { id: true, slug: true, name: true, type: true },
        },
        aliases: {
          select: { alias: true, locale: true, isPrimary: true },
          orderBy: [{ isPrimary: "desc" }, { alias: "asc" }],
        },
        barcodes: {
          select: { code: true, format: true, isPrimary: true },
          orderBy: [{ isPrimary: "desc" }, { code: "asc" }],
        },
        priceSnapshots: {
          select: { price: true, priceKind: true, observedAt: true },
          orderBy: [{ observedAt: "desc" }],
          take: 1,
        },
      },
    });
  });

  return mapCatalogProductRow(row);
}

export async function deleteCatalogProduct(id: string) {
  const user = await requireUser();
  assertSuperAdmin(user);

  const catalogProductId = normalizeRequiredText(id, "Catalog product id");
  const [templateCount, productCount] = await Promise.all([
    prisma.businessProductTemplate.count({ where: { catalogProductId } }),
    prisma.product.count({ where: { catalogProductId } }),
  ]);

  if (templateCount > 0 || productCount > 0) {
    throw new Error("Cannot delete: catalog product is linked to templates or shop products");
  }

  await prisma.catalogProduct.delete({
    where: { id: catalogProductId },
  });

  return { success: true };
}

export async function restoreArchivedCatalogProductAdmin(
  id: string,
): Promise<RestoreCatalogProductResult> {
  const user = await requireUser();
  assertSuperAdmin(user);

  const catalogProductId = normalizeRequiredText(id, "Catalog product id");
  const product = await prisma.catalogProduct.findUnique({
    where: { id: catalogProductId },
    select: {
      id: true,
      mergedIntoCatalogProductId: true,
    },
  });

  if (!product) {
    throw new Error("Catalog product not found");
  }

  if (!product.mergedIntoCatalogProductId) {
    throw new Error("Catalog product is not archived under a merge");
  }

  await prisma.catalogProduct.update({
    where: { id: catalogProductId },
    data: {
      mergedIntoCatalogProductId: null,
      mergedAt: null,
      isActive: true,
    },
  });

  return {
    id: catalogProductId,
    restored: true,
  };
}

export async function bulkSetCatalogProductsActiveState(
  input: CatalogBulkSetActiveStateInput,
) {
  const user = await requireUser();
  assertSuperAdmin(user);

  const ids = Array.from(
    new Set(
      (input.ids ?? [])
        .map((id) => normalizeOptionalText(id, 36))
        .filter((id): id is string => Boolean(id)),
    ),
  );

  if (ids.length === 0) {
    throw new Error("At least one catalog product is required");
  }

  const result = await prisma.catalogProduct.updateMany({
    where: {
      id: {
        in: ids,
      },
    },
    data: {
      isActive: input.isActive,
    },
  });

  return {
    updatedCount: result.count,
    isActive: input.isActive,
  };
}

export async function bulkUpdateCatalogProductsMetadata(
  input: CatalogBulkUpdateMetadataInput,
): Promise<CatalogBulkUpdateMetadataResult> {
  const user = await requireUser();
  assertSuperAdmin(user);

  const ids = Array.from(
    new Set(
      (input.ids ?? [])
        .map((id) => normalizeOptionalText(id, 36))
        .filter((id): id is string => Boolean(id)),
    ),
  );

  if (ids.length === 0) {
    throw new Error("At least one catalog product is required");
  }

  const importSourceId =
    input.importSourceId === undefined
      ? undefined
      : normalizeOptionalText(input.importSourceId, 36) ?? null;
  const sourceType = input.sourceType ?? undefined;

  if (importSourceId === undefined && sourceType === undefined) {
    throw new Error("Provide at least one metadata field to update");
  }

  if (importSourceId) {
    const source = await prisma.catalogImportSource.findUnique({
      where: { id: importSourceId },
      select: { id: true },
    });
    if (!source) {
      throw new Error("Import source not found");
    }
  }

  const result = await prisma.catalogProduct.updateMany({
    where: {
      id: { in: ids },
    },
    data: {
      ...(importSourceId !== undefined ? { importSourceId } : {}),
      ...(sourceType !== undefined ? { sourceType } : {}),
    },
  });

  return {
    updatedCount: result.count,
    importSourceId: importSourceId ?? null,
    sourceType: sourceType ?? null,
  };
}

export async function bulkRestoreArchivedCatalogProductsAdmin(
  ids: string[],
): Promise<CatalogBulkRestoreResult> {
  const user = await requireUser();
  assertSuperAdmin(user);

  const normalizedIds = Array.from(
    new Set(
      (ids ?? [])
        .map((id) => normalizeOptionalText(id, 36))
        .filter((id): id is string => Boolean(id)),
    ),
  );

  if (normalizedIds.length === 0) {
    throw new Error("At least one catalog product is required");
  }

  const result = await prisma.catalogProduct.updateMany({
    where: {
      id: { in: normalizedIds },
      mergedIntoCatalogProductId: { not: null },
    },
    data: {
      mergedIntoCatalogProductId: null,
      mergedAt: null,
      isActive: true,
    },
  });

  return {
    restoredCount: result.count,
  };
}

export async function bulkDeleteCatalogProductsAdmin(
  ids: string[],
): Promise<CatalogBulkDeleteResult> {
  const user = await requireUser();
  assertSuperAdmin(user);

  const normalizedIds = Array.from(
    new Set(
      (ids ?? [])
        .map((id) => normalizeOptionalText(id, 36))
        .filter((id): id is string => Boolean(id)),
    ),
  );

  if (normalizedIds.length === 0) {
    throw new Error("At least one catalog product is required");
  }

  const rows = await prisma.catalogProduct.findMany({
    where: {
      id: { in: normalizedIds },
    },
    select: {
      id: true,
      _count: {
        select: {
          templates: true,
          products: true,
          mergedFromCatalogProducts: true,
        },
      },
    },
  });

  const deletePlan = classifyCatalogBulkDeleteCandidates(
    rows.map((row) => ({
      id: row.id,
      templateCount: row._count.templates,
      productCount: row._count.products,
      mergedChildCount: row._count.mergedFromCatalogProducts,
    })),
  );

  let deletedCount = 0;
  if (deletePlan.deletableIds.length > 0) {
    const deleteResult = await prisma.catalogProduct.deleteMany({
      where: {
        id: { in: deletePlan.deletableIds },
      },
    });
    deletedCount = deleteResult.count;
  }

  return {
    deletedCount,
    skippedCount: rows.length - deletedCount,
    linkedCount: deletePlan.linkedCount,
    protectedCount: deletePlan.protectedCount,
  };
}

export async function mergeCatalogProductsAdmin(
  input: MergeCatalogProductsInput,
): Promise<MergeCatalogProductsResult> {
  const user = await requireUser();
  assertSuperAdmin(user);

  const targetProductId = normalizeRequiredText(input.targetProductId, "Target product id");
  const sourceProductId = normalizeRequiredText(input.sourceProductId, "Source product id");
  const mergeMode = normalizeMergeMode(input.mode);
  const note = normalizeOptionalText(input.note, 500) ?? null;
  const mergedByLabel = user.name?.trim() || user.email?.trim() || user.id;

  if (targetProductId === sourceProductId) {
    throw new Error("Source and target catalog products must be different");
  }

  const [target, source] = await Promise.all([
    prisma.catalogProduct.findUnique({
      where: { id: targetProductId },
      include: {
        aliases: {
          select: { id: true, alias: true, locale: true, isPrimary: true },
        },
        barcodes: {
          select: { id: true, code: true, format: true, isPrimary: true },
        },
      },
    }),
    prisma.catalogProduct.findUnique({
      where: { id: sourceProductId },
      include: {
        aliases: {
          select: { id: true, alias: true, locale: true, isPrimary: true },
        },
        barcodes: {
          select: { id: true, code: true, format: true, isPrimary: true },
        },
      },
    }),
  ]);

  if (!target || !source) {
    throw new Error("Catalog product not found");
  }
  if (target.mergedIntoCatalogProductId) {
    throw new Error("Target catalog product is already archived under another merge");
  }
  if (source.mergedIntoCatalogProductId) {
    throw new Error("Source catalog product has already been merged");
  }

  const existingAliasKeys = new Set(
    target.aliases.map((item) => item.alias.trim().toLowerCase()),
  );
  const aliasesToMove = source.aliases.filter((item) => {
    const key = item.alias.trim().toLowerCase();
    if (!key || existingAliasKeys.has(key)) return false;
    existingAliasKeys.add(key);
    return true;
  });
  const duplicateAliasIds = source.aliases
    .filter((item) => !aliasesToMove.some((candidate) => candidate.id === item.id))
    .map((item) => item.id);

  const barcodesToMove = source.barcodes;

  const result = await prisma.$transaction(async (tx) => {
    const [movedTemplateResult, movedShopProductResult, movedSnapshotResult] =
      await Promise.all([
        tx.businessProductTemplate.updateMany({
          where: { catalogProductId: sourceProductId },
          data: { catalogProductId: targetProductId },
        }),
        tx.product.updateMany({
          where: { catalogProductId: sourceProductId },
          data: { catalogProductId: targetProductId },
        }),
        tx.catalogPriceSnapshot.updateMany({
          where: { catalogProductId: sourceProductId },
          data: { catalogProductId: targetProductId },
        }),
      ]);

    if (aliasesToMove.length > 0) {
      await tx.catalogProductAlias.updateMany({
        where: {
          id: {
            in: aliasesToMove.map((item) => item.id),
          },
        },
        data: {
          catalogProductId: targetProductId,
        },
      });
    }

    if (duplicateAliasIds.length > 0) {
      await tx.catalogProductAlias.deleteMany({
        where: {
          id: {
            in: duplicateAliasIds,
          },
        },
      });
    }

    if (barcodesToMove.length > 0) {
      await tx.catalogProductBarcode.updateMany({
        where: {
          id: {
            in: barcodesToMove.map((item) => item.id),
          },
        },
        data: {
          catalogProductId: targetProductId,
        },
      });
    }

    await tx.catalogProduct.update({
      where: { id: targetProductId },
      data: {
        brand: target.brand ?? source.brand,
        category: target.category ?? source.category,
        packSize: target.packSize ?? source.packSize,
        defaultBaseUnit: target.defaultBaseUnit ?? source.defaultBaseUnit,
        imageUrl: target.imageUrl ?? source.imageUrl,
        popularityScore: Math.max(target.popularityScore, source.popularityScore),
        importSourceId: target.importSourceId ?? source.importSourceId,
        externalRef: target.externalRef ?? source.externalRef,
        isActive: target.isActive || source.isActive,
      },
    });

    if (mergeMode === CatalogProductMergeMode.delete) {
      await tx.catalogProduct.delete({
        where: { id: sourceProductId },
      });
    } else {
      await tx.catalogProduct.update({
        where: { id: sourceProductId },
        data: {
          mergedIntoCatalogProductId: targetProductId,
          mergedAt: new Date(),
          isActive: false,
        },
      });
    }

    const audit = await tx.catalogProductMergeAction.create({
      data: {
        sourceCatalogProductId:
          mergeMode === CatalogProductMergeMode.delete ? null : sourceProductId,
        sourceProductNameSnapshot: source.name,
        sourceBusinessTypeSnapshot: source.businessType ?? null,
        targetCatalogProductId: targetProductId,
        targetProductNameSnapshot: target.name,
        targetBusinessTypeSnapshot: target.businessType ?? null,
        mergeMode,
        movedTemplateCount: movedTemplateResult.count,
        movedShopProductCount: movedShopProductResult.count,
        movedSnapshotCount: movedSnapshotResult.count,
        movedAliasCount: aliasesToMove.length,
        movedBarcodeCount: barcodesToMove.length,
        mergedByUserId: user.id,
        mergedByLabel,
        note,
      },
    });

    return {
      auditActionId: audit.id,
      movedTemplateCount: movedTemplateResult.count,
      movedShopProductCount: movedShopProductResult.count,
      movedSnapshotCount: movedSnapshotResult.count,
    };
  });

  return {
    targetProductId,
    sourceProductId,
    mergeMode,
    movedTemplateCount: result.movedTemplateCount,
    movedShopProductCount: result.movedShopProductCount,
    movedSnapshotCount: result.movedSnapshotCount,
    movedAliasCount: aliasesToMove.length,
    movedBarcodeCount: barcodesToMove.length,
    auditActionId: result.auditActionId,
  };
}

export async function createCatalogPriceSnapshot(input: CatalogPriceSnapshotInput) {
  const user = await requireUser();
  assertSuperAdmin(user);

  const catalogProductId = normalizeRequiredText(input.catalogProductId, "Catalog product id");
  const price = normalizeOptionalMoney(input.price, "Price");
  if (!price) {
    throw new Error("Price is required");
  }

  const row = await prisma.catalogPriceSnapshot.create({
    data: {
      catalogProductId,
      businessType: normalizeOptionalBusinessType(input.businessType) ?? null,
      regionCode: normalizeOptionalText(input.regionCode, 40) ?? null,
      priceKind: input.priceKind ?? CatalogPriceKind.retail,
      price,
      currency: normalizeOptionalText(input.currency, 8) ?? "BDT",
      importSourceId: normalizeOptionalText(input.importSourceId, 36) ?? null,
      sourceLabel: normalizeOptionalText(input.sourceLabel, 120) ?? null,
      observedAt: normalizeOptionalDate(input.observedAt) ?? new Date(),
    },
  });

  return {
    id: row.id,
    catalogProductId: row.catalogProductId,
    businessType: row.businessType ?? null,
    regionCode: row.regionCode ?? null,
    priceKind: row.priceKind,
    price: row.price.toString(),
    currency: row.currency,
    sourceLabel: row.sourceLabel ?? null,
    observedAt: row.observedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function previewCatalogProductsImportAdmin(
  input: CatalogBulkImportInput,
): Promise<CatalogImportPreviewResult> {
  const user = await requireUser();
  assertSuperAdmin(user);

  const result = await buildCatalogImportPlan(input);
  return {
    validCount: result.validCount,
    invalidCount: result.invalidCount,
    duplicateInputCount: result.duplicateInputCount,
    createCount: result.createCount,
    updateCount: result.updateCount,
    skipCount: result.skipCount,
    items: result.items,
    errors: result.errors,
  };
}

export async function importCatalogProductsAdmin(
  input: CatalogBulkImportInput,
): Promise<CatalogImportResult> {
  const user = await requireUser();
  assertSuperAdmin(user);

  const result = await buildCatalogImportPlan(input);
  const payloadFormat = normalizeImportPayloadFormat(input.payloadFormat);
  const importMode = normalizeImportMode(input.mode);
  const defaultImportSourceId = normalizeOptionalText(input.defaultImportSourceId, 36) ?? null;
  const defaultBusinessType = normalizeOptionalBusinessType(input.defaultBusinessType) ?? null;
  const defaultSourceType = input.defaultSourceType ?? null;
  const importedByLabel = user.name?.trim() || user.email?.trim() || user.id;

  let createdCount = 0;
  let updatedCount = 0;

  for (const item of result.plan) {
    if (!item.row) continue;

    if (item.action === "create") {
      await prisma.catalogProduct.create({
        data: {
          businessType: item.row.payload.businessType,
          name: item.row.payload.name,
          brand: item.row.payload.brand,
          category: item.row.payload.category,
          packSize: item.row.payload.packSize,
          defaultBaseUnit: item.row.payload.defaultBaseUnit,
          imageUrl: item.row.payload.imageUrl,
          popularityScore: item.row.payload.popularityScore,
          sourceType: item.row.payload.sourceType,
          importSourceId: item.row.payload.importSourceId,
          externalRef: item.row.payload.externalRef,
          isActive: item.row.payload.isActive,
          aliases: item.row.payload.aliases.length
            ? {
                createMany: {
                  data: item.row.payload.aliases,
                },
              }
            : undefined,
          barcodes: item.row.payload.barcodes.length
            ? {
                createMany: {
                  data: item.row.payload.barcodes,
                },
              }
            : undefined,
        },
      });
      createdCount += 1;
      continue;
    }

    if (item.action === "update" && item.matchedProductId) {
      const matchedProductId = item.matchedProductId;
      await prisma.$transaction(async (tx) => {
        if (item.row?.original.aliases !== undefined) {
          await tx.catalogProductAlias.deleteMany({
            where: { catalogProductId: matchedProductId },
          });
        }
        if (item.row?.original.barcodes !== undefined) {
          await tx.catalogProductBarcode.deleteMany({
            where: { catalogProductId: matchedProductId },
          });
        }

        await tx.catalogProduct.update({
          where: { id: matchedProductId },
          data: {
            businessType: item.row!.payload.businessType,
            name: item.row!.payload.name,
            brand: item.row!.payload.brand,
            category: item.row!.payload.category,
            packSize: item.row!.payload.packSize,
            defaultBaseUnit: item.row!.payload.defaultBaseUnit,
            imageUrl: item.row!.payload.imageUrl,
            popularityScore: item.row!.payload.popularityScore,
            sourceType: item.row!.payload.sourceType,
            importSourceId: item.row!.payload.importSourceId,
            externalRef: item.row!.payload.externalRef,
            isActive: item.row!.payload.isActive,
          },
        });

        if (
          item.row?.original.aliases !== undefined &&
          item.row.payload.aliases.length > 0
        ) {
          await tx.catalogProductAlias.createMany({
            data: item.row.payload.aliases.map((alias) => ({
              catalogProductId: matchedProductId,
              ...alias,
            })),
          });
        }

        if (
          item.row?.original.barcodes !== undefined &&
          item.row.payload.barcodes.length > 0
        ) {
          await tx.catalogProductBarcode.createMany({
            data: item.row.payload.barcodes.map((barcode) => ({
              catalogProductId: matchedProductId,
              ...barcode,
            })),
          });
        }
      });
      updatedCount += 1;
    }
  }

  const defaultImportSource = defaultImportSourceId
    ? await prisma.catalogImportSource.findUnique({
        where: { id: defaultImportSourceId },
        select: { id: true, name: true },
      })
    : null;
  const importRun = await prisma.catalogImportRun.create({
    data: {
      payloadFormat,
      importMode,
      submittedCount: input.items.length,
      validCount: result.validCount,
      invalidCount: result.invalidCount,
      duplicateInputCount: result.duplicateInputCount,
      createdCount,
      updatedCount,
      skippedCount: result.skipCount,
      errorCount: result.errors.length,
      defaultBusinessType,
      defaultImportSourceId: defaultImportSource?.id ?? null,
      defaultImportSourceLabel: defaultImportSource?.name ?? null,
      defaultSourceType,
      importedByUserId: user.id,
      importedByLabel,
      errorSummary:
        result.errors.length > 0
          ? result.errors.slice(0, 5).join(" | ").slice(0, 2000)
          : null,
    },
    select: { id: true },
  });

  return {
    importRunId: importRun.id,
    createdCount,
    updatedCount,
    skippedCount: result.skipCount,
    invalidCount: result.invalidCount,
    duplicateInputCount: result.duplicateInputCount,
    errors: result.errors,
  };
}

export async function searchCatalogProductsForShop(input: CatalogSearchInput) {
  const user = await requireUser();
  requirePermission(user, "view_products");
  const shop = await assertShopAccess(input.shopId, user);

  const query = normalizeOptionalText(input.query, 120);
  const barcode = normalizeOptionalCode(input.barcode);
  const inferredBarcode = barcode ?? normalizeOptionalCode(query);
  const businessType =
    normalizeOptionalBusinessType(input.businessType) ??
    normalizeOptionalBusinessType(shop.businessType) ??
    null;
  const limit = normalizeLimit(input.limit, 20, 50);

  const rows = await prisma.catalogProduct.findMany({
    where: {
      isActive: true,
      ...(businessType
        ? {
            OR: [{ businessType }, { businessType: null }],
          }
        : {}),
      ...(!query && !inferredBarcode
        ? {}
        : {
            AND: [
              ...(businessType
                ? [
                    {
                      OR: [{ businessType }, { businessType: null }],
                    },
                  ]
                : []),
              {
                OR: [
              ...(query
                ? [
                    { name: { contains: query, mode: "insensitive" as const } },
                    { brand: { contains: query, mode: "insensitive" as const } },
                    { category: { contains: query, mode: "insensitive" as const } },
                    {
                      aliases: {
                        some: { alias: { contains: query, mode: "insensitive" as const } },
                      },
                    },
                  ]
                : []),
              ...(inferredBarcode
                ? [{ barcodes: { some: { code: inferredBarcode } } }]
                : []),
            ],
              },
            ],
          }),
    },
    include: {
      importSource: {
        select: { id: true, slug: true, name: true, type: true },
      },
      aliases: {
        select: { alias: true, locale: true, isPrimary: true },
        orderBy: [{ isPrimary: "desc" }, { alias: "asc" }],
      },
      barcodes: {
        select: { code: true, format: true, isPrimary: true },
        orderBy: [{ isPrimary: "desc" }, { code: "asc" }],
      },
      priceSnapshots: {
        select: { price: true, priceKind: true, observedAt: true },
        where: {
          ...(businessType ? { businessType } : {}),
        },
        orderBy: [{ observedAt: "desc" }],
        take: 1,
      },
    },
    orderBy: [{ popularityScore: "desc" }, { name: "asc" }],
    take: limit,
  });

  return rows.map(mapCatalogProductRow);
}

export async function getCatalogProductByBarcodeForShop(input: {
  shopId: string;
  barcode: string;
}) {
  const user = await requireUser();
  requirePermission(user, "view_products");
  const shop = await assertShopAccess(input.shopId, user);
  const barcode = normalizeOptionalCode(input.barcode);
  if (!barcode) return null;

  const businessType = normalizeOptionalBusinessType(shop.businessType) ?? null;
  const row = await prisma.catalogProduct.findFirst({
    where: {
      isActive: true,
      ...(businessType
        ? {
            OR: [{ businessType }, { businessType: null }],
          }
        : {}),
      barcodes: {
        some: { code: barcode },
      },
    },
    include: {
      importSource: {
        select: { id: true, slug: true, name: true, type: true },
      },
      aliases: {
        select: { alias: true, locale: true, isPrimary: true },
        orderBy: [{ isPrimary: "desc" }, { alias: "asc" }],
      },
      barcodes: {
        select: { code: true, format: true, isPrimary: true },
        orderBy: [{ isPrimary: "desc" }, { code: "asc" }],
      },
      priceSnapshots: {
        select: { price: true, priceKind: true, observedAt: true },
        orderBy: [{ observedAt: "desc" }],
        take: 1,
      },
    },
  });

  return row ? mapCatalogProductRow(row) : null;
}

export async function addCatalogProductsToShop(input: AddCatalogProductsToShopInput) {
  const user = await requireUser();
  requirePermission(user, "create_product");

  const shop = await assertShopAccess(input.shopId, user);
  const uniqueIds = Array.from(new Set(input.catalogProductIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return {
      createdCount: 0,
      skippedCount: 0,
      inactiveCount: 0,
      adjustedCodeCount: 0,
    };
  }

  const businessType = normalizeOptionalBusinessType(shop.businessType) ?? null;
  const catalogProducts = await prisma.catalogProduct.findMany({
    where: {
      id: { in: uniqueIds },
      isActive: true,
      ...(businessType
        ? {
            OR: [{ businessType }, { businessType: null }],
          }
        : {}),
    },
    include: {
      barcodes: {
        select: { code: true, isPrimary: true },
        orderBy: [{ isPrimary: "desc" }, { code: "asc" }],
      },
      priceSnapshots: {
        select: { price: true, businessType: true, observedAt: true },
        where: businessType
          ? {
              OR: [{ businessType }, { businessType: null }],
            }
          : {},
        orderBy: [
          { observedAt: "desc" },
          { createdAt: "desc" },
        ],
      },
    },
    orderBy: [{ popularityScore: "desc" }, { name: "asc" }],
  });

  if (catalogProducts.length === 0) {
    return {
      createdCount: 0,
      skippedCount: uniqueIds.length,
      inactiveCount: 0,
      adjustedCodeCount: 0,
    };
  }

  const seenNames = new Set<string>();
  const uniqueCatalogProducts = catalogProducts.filter((item) => {
    const key = item.name.trim().toLowerCase();
    if (!key || seenNames.has(key)) return false;
    seenNames.add(key);
    return true;
  });

  const nameFilters = uniqueCatalogProducts.map((item) => ({
    name: { equals: item.name, mode: "insensitive" as const },
  }));
  const existingProducts = nameFilters.length
    ? await prisma.product.findMany({
        where: {
          shopId: shop.id,
          OR: nameFilters,
        },
        select: { name: true, sku: true, barcode: true },
      })
    : [];

  const existingNames = new Set(
    existingProducts.map((row) => row.name.trim().toLowerCase()),
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

  const usedBarcodes = new Set<string>();
  productCodes.forEach((row) => {
    const barcode = normalizeOptionalCode(row.barcode);
    if (barcode) usedBarcodes.add(barcode);
  });
  variantCodes.forEach((row) => {
    const barcode = normalizeOptionalCode(row.barcode);
    if (barcode) usedBarcodes.add(barcode);
  });

  let createdCount = 0;
  let skippedCount = 0;
  let inactiveCount = 0;
  let adjustedCodeCount = 0;

  for (const item of uniqueCatalogProducts) {
    const key = item.name.trim().toLowerCase();
    if (existingNames.has(key)) {
      skippedCount += 1;
      continue;
    }

    const latestPrice = item.priceSnapshots.find((snapshot) => {
      if (!businessType) return true;
      return snapshot.businessType === businessType || snapshot.businessType === null;
    });
    const sellPrice = latestPrice?.price?.toString?.() ?? "0";
    const hasValidPrice = Number.isFinite(Number(sellPrice)) && Number(sellPrice) > 0;
    if (!hasValidPrice) {
      inactiveCount += 1;
    }

    let resolvedBarcode: string | null = null;
    for (const barcodeRow of item.barcodes) {
      const normalized = normalizeOptionalCode(barcodeRow.code);
      if (!normalized) continue;
      if (usedBarcodes.has(normalized)) {
        adjustedCodeCount += 1;
        continue;
      }
      resolvedBarcode = normalized;
      usedBarcodes.add(normalized);
      break;
    }

    try {
      await prisma.product.create({
        data: {
          shopId: shop.id,
          catalogProductId: item.id,
          productSource: ProductSourceType.catalog,
          name: item.name,
          category: item.category || "Uncategorized",
          barcode: resolvedBarcode,
          baseUnit: item.defaultBaseUnit || "pcs",
          size: item.packSize ?? null,
          buyPrice: null,
          sellPrice,
          stockQty: "0",
          trackStock: false,
          isActive: hasValidPrice,
        },
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

export async function linkBusinessProductTemplateToCatalog(input: {
  templateId: string;
  catalogProductId?: string | null;
}) {
  const user = await requireUser();
  assertSuperAdmin(user);

  const templateId = normalizeRequiredText(input.templateId, "Template id");
  const catalogProductId = normalizeOptionalText(input.catalogProductId, 36);

  if (catalogProductId) {
    const exists = await prisma.catalogProduct.findUnique({
      where: { id: catalogProductId },
      select: { id: true },
    });
    if (!exists) {
      throw new Error("Catalog product not found");
    }
  }

  await prisma.businessProductTemplate.update({
    where: { id: templateId },
    data: {
      catalogProductId: catalogProductId ?? null,
    },
  });

  return { success: true };
}

export async function linkShopProductToCatalog(input: {
  productId: string;
  catalogProductId?: string | null;
  productSource?: ProductSourceType | null;
}) {
  const user = await requireUser();
  requirePermission(user, "update_product");

  const productId = normalizeRequiredText(input.productId, "Product id");
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, shopId: true },
  });
  if (!product) {
    throw new Error("Product not found");
  }
  await assertShopAccess(product.shopId, user);

  const catalogProductId = normalizeOptionalText(input.catalogProductId, 36);
  if (catalogProductId) {
    const exists = await prisma.catalogProduct.findUnique({
      where: { id: catalogProductId },
      select: { id: true },
    });
    if (!exists) {
      throw new Error("Catalog product not found");
    }
  }

  await prisma.product.update({
    where: { id: productId },
    data: {
      catalogProductId: catalogProductId ?? null,
      productSource:
        input.productSource ?? (catalogProductId ? ProductSourceType.catalog : ProductSourceType.manual),
    },
  });

  return { success: true };
}
