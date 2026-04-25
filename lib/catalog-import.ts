import type { CatalogImportPayloadFormat, CatalogProductSource } from "@prisma/client";
import { generateCSV } from "./utils/csv";

const PRODUCT_SOURCE_VALUES: CatalogProductSource[] = [
  "curated",
  "imported",
  "user_submitted",
];

export type CatalogImportItemInput = {
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
  aliases?:
    | Array<{
        alias?: string | null;
        isPrimary?: boolean | null;
      }>
    | null;
  barcodes?:
    | Array<{
        code?: string | null;
        isPrimary?: boolean | null;
      }>
    | null;
  isActive?: boolean;
};

export type ParsedCatalogImportPayload = {
  items: CatalogImportItemInput[];
  errors: string[];
  duplicateCount: number;
};

export function normalizeCatalogCodeInput(value: string) {
  return value.trim().replace(/\s+/g, "").toUpperCase().slice(0, 80);
}

export function splitCatalogMultiValueCell(value: string) {
  return value
    .split(/[|;]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseCatalogBooleanLike(value: unknown, fallback = true) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return fallback;
}

export function parseCatalogCsvMatrix(raw: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    const next = raw[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.length > 0)) {
    rows.push(row);
  }

  return rows;
}

export function normalizeCatalogImportRecord(
  record: Record<string, unknown>,
  rowNumber: number,
  defaultBusinessType?: string | null,
) {
  const businessTypeSource =
    typeof record.businessType === "string"
      ? record.businessType.trim()
      : typeof record.business_type === "string"
        ? record.business_type.trim()
        : defaultBusinessType?.trim() || "";
  const name = typeof record.name === "string" ? record.name.trim() : "";

  if (!name) {
    return { error: `Row ${rowNumber}: name is required` } as const;
  }

  const aliasValues =
    Array.isArray(record.aliases)
      ? record.aliases.filter((item): item is string => typeof item === "string")
      : typeof record.aliases === "string"
        ? splitCatalogMultiValueCell(record.aliases)
        : [];
  const barcodeValues =
    Array.isArray(record.barcodes)
      ? record.barcodes.filter((item): item is string => typeof item === "string")
      : typeof record.barcodes === "string"
        ? splitCatalogMultiValueCell(record.barcodes)
        : [];
  const sourceTypeRaw =
    typeof record.sourceType === "string"
      ? record.sourceType.trim().toLowerCase()
      : typeof record.source_type === "string"
        ? record.source_type.trim().toLowerCase()
        : "";

  return {
    item: {
      businessType: businessTypeSource || null,
      name,
      brand: typeof record.brand === "string" ? record.brand.trim() || null : null,
      category: typeof record.category === "string" ? record.category.trim() || null : null,
      packSize:
        typeof record.packSize === "string"
          ? record.packSize.trim() || null
          : typeof record.pack_size === "string"
            ? record.pack_size.trim() || null
            : null,
      defaultBaseUnit:
        typeof record.defaultBaseUnit === "string"
          ? record.defaultBaseUnit.trim() || null
          : typeof record.default_base_unit === "string"
            ? record.default_base_unit.trim() || null
            : typeof record.baseUnit === "string"
              ? record.baseUnit.trim() || null
              : null,
      imageUrl:
        typeof record.imageUrl === "string"
          ? record.imageUrl.trim() || null
          : typeof record.image_url === "string"
            ? record.image_url.trim() || null
            : null,
      popularityScore:
        typeof record.popularityScore === "number" ||
        typeof record.popularityScore === "string"
          ? record.popularityScore
          : typeof record.popularity_score === "number" ||
              typeof record.popularity_score === "string"
            ? record.popularity_score
            : null,
      sourceType: PRODUCT_SOURCE_VALUES.includes(sourceTypeRaw as CatalogProductSource)
        ? (sourceTypeRaw as CatalogProductSource)
        : null,
      importSourceId:
        typeof record.importSourceId === "string"
          ? record.importSourceId.trim() || null
          : typeof record.import_source_id === "string"
            ? record.import_source_id.trim() || null
            : null,
      externalRef:
        typeof record.externalRef === "string"
          ? record.externalRef.trim() || null
          : typeof record.external_ref === "string"
            ? record.external_ref.trim() || null
            : null,
      aliases: aliasValues.length
        ? aliasValues.map((alias, aliasIndex) => ({
            alias: alias.trim(),
            isPrimary: aliasIndex === 0,
          }))
        : undefined,
      barcodes: barcodeValues.length
        ? barcodeValues
            .map((value) => normalizeCatalogCodeInput(value))
            .filter(Boolean)
            .map((code, barcodeIndex) => ({
              code,
              isPrimary: barcodeIndex === 0,
            }))
        : undefined,
      isActive: parseCatalogBooleanLike(record.isActive ?? record.is_active, true),
    } satisfies CatalogImportItemInput,
  } as const;
}

export function parseCatalogImportPayload(
  raw: string,
  payloadFormat: CatalogImportPayloadFormat,
  defaultBusinessType?: string | null,
): ParsedCatalogImportPayload {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      items: [],
      errors: [`Paste ${payloadFormat.toUpperCase()} first.`],
      duplicateCount: 0,
    };
  }

  const items: CatalogImportItemInput[] = [];
  const errors: string[] = [];
  const seenNames = new Set<string>();
  let duplicateCount = 0;

  if (payloadFormat === "json") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return {
        items: [],
        errors: ["Invalid JSON."],
        duplicateCount: 0,
      };
    }

    if (!Array.isArray(parsed)) {
      return {
        items: [],
        errors: ["JSON must be an array of objects."],
        duplicateCount: 0,
      };
    }

    parsed.forEach((entry, index) => {
      const rowNumber = index + 1;
      if (!entry || typeof entry !== "object") {
        errors.push(`Row ${rowNumber}: must be an object`);
        return;
      }

      const normalized = normalizeCatalogImportRecord(
        entry as Record<string, unknown>,
        rowNumber,
        defaultBusinessType,
      );
      const parsedError = "error" in normalized ? normalized.error : null;
      if (parsedError) {
        errors.push(parsedError);
        return;
      }

      const normalizedItem = normalized.item;
      if (!normalizedItem) return;
      const nameKey = `${normalizedItem.businessType || "__global__"}|${normalizedItem.name.toLowerCase()}`;
      if (seenNames.has(nameKey)) {
        duplicateCount += 1;
        return;
      }
      seenNames.add(nameKey);
      items.push(normalizedItem);
    });

    return { items, errors, duplicateCount };
  }

  const rows = parseCatalogCsvMatrix(trimmed);
  if (rows.length < 2) {
    return {
      items: [],
      errors: ["CSV must include a header row and at least one data row."],
      duplicateCount: 0,
    };
  }

  const normalizedHeaders = rows[0].map((value) => value.trim().toLowerCase());
  const nameIndex = normalizedHeaders.findIndex((value) => value === "name" || value === "product_name");

  if (nameIndex < 0) {
    return {
      items: [],
      errors: ["CSV header must include a `name` column."],
      duplicateCount: 0,
    };
  }

  rows.slice(1).forEach((values, index) => {
    const rowNumber = index + 2;
    const originalHeaders = rows[0].map((value) => value.trim());
    const record = originalHeaders.reduce<Record<string, unknown>>((accumulator, header, headerIndex) => {
      const value = values[headerIndex]?.trim() ?? "";
      accumulator[header] = value;
      accumulator[header.toLowerCase()] = value;
      return accumulator;
    }, {});

    const normalized = normalizeCatalogImportRecord(record, rowNumber, defaultBusinessType);
    const parsedError = "error" in normalized ? normalized.error : null;
    if (parsedError) {
      errors.push(parsedError);
      return;
    }

    const normalizedItem = normalized.item;
    if (!normalizedItem) return;
    const nameKey = `${normalizedItem.businessType || "__global__"}|${normalizedItem.name.toLowerCase()}`;
    if (seenNames.has(nameKey)) {
      duplicateCount += 1;
      return;
    }
    seenNames.add(nameKey);
    items.push(normalizedItem);
  });

  return { items, errors, duplicateCount };
}

export function createCatalogImportTemplate(businessType?: string | null) {
  return [
    {
      businessType: businessType || null,
      name: "Premium Tea 250g",
      brand: "House Blend",
      category: "Tea",
      packSize: "250g",
      defaultBaseUnit: "pack",
      popularityScore: 80,
      sourceType: "imported",
      externalRef: "demo-tea-250g",
      aliases: ["Premium Tea", "Tea Gold"],
      barcodes: ["8801234567890"],
      isActive: true,
    },
    {
      businessType: businessType || null,
      name: "Milk Powder 500g",
      brand: "DairyCo",
      category: "Dairy",
      packSize: "500g",
      defaultBaseUnit: "pack",
      popularityScore: 65,
      sourceType: "imported",
      externalRef: "demo-milk-500g",
      aliases: ["Milk Powder", "Dairy Milk Powder"],
      barcodes: ["8909876543210"],
      isActive: true,
    },
  ];
}

export function createCatalogImportCsvTemplate(businessType?: string | null) {
  return generateCSV(
    [
      "businessType",
      "name",
      "brand",
      "category",
      "packSize",
      "defaultBaseUnit",
      "popularityScore",
      "sourceType",
      "externalRef",
      "aliases",
      "barcodes",
      "isActive",
    ],
    createCatalogImportTemplate(businessType).map((item) => ({
      businessType: item.businessType ?? "",
      name: item.name,
      brand: item.brand ?? "",
      category: item.category ?? "",
      packSize: item.packSize ?? "",
      defaultBaseUnit: item.defaultBaseUnit ?? "",
      popularityScore: item.popularityScore ?? "",
      sourceType: item.sourceType ?? "",
      externalRef: item.externalRef ?? "",
      aliases: item.aliases.join(" | "),
      barcodes: item.barcodes.join(" | "),
      isActive: item.isActive ? "true" : "false",
    })),
  );
}
