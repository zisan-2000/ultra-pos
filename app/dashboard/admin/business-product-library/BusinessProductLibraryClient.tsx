// app/dashboard/admin/business-product-library/BusinessProductLibraryClient.tsx

"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { useSyncStatus } from "@/lib/sync/sync-status";
import { queueAdminAction } from "@/lib/sync/queue";
import { businessOptions } from "@/lib/productFormConfig";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";

type BusinessTypeRow = { key: string; label: string };

type TemplateVariantDraft = {
  label: string;
  sellPrice: string;
  sku: string | null;
  barcode: string | null;
  sortOrder: number;
  isActive: boolean;
};

type TemplateRow = {
  id: string;
  businessType: string;
  name: string;
  brand?: string | null;
  category?: string | null;
  packSize?: string | null;
  defaultSellPrice?: string | number | null;
  defaultBarcode?: string | null;
  defaultBaseUnit?: string | null;
  defaultTrackStock?: boolean;
  aliases?: string[];
  keywords?: string[];
  variants?: TemplateVariantDraft[];
  imageUrl?: string | null;
  popularityScore?: number;
  isActive: boolean;
};

type ImportTemplateInput = {
  businessType?: string | null;
  name?: string | null;
  brand?: string | null;
  category?: string | null;
  packSize?: string | null;
  defaultSellPrice?: string | number | null;
  defaultBarcode?: string | null;
  defaultBaseUnit?: string | null;
  defaultTrackStock?: boolean | null;
  aliases?: string[] | null;
  keywords?: string[] | null;
  variants?: TemplateVariantDraft[] | null;
  imageUrl?: string | null;
  popularityScore?: number | null;
  isActive?: boolean | null;
};

type ImportResult = {
  createdCount: number;
  skippedCount: number;
  invalidCount: number;
};

type Props = {
  initialTemplates: TemplateRow[];
  initialBusinessTypes: BusinessTypeRow[];
  error?: string | null;
  onCreateTemplate: (formData: FormData) => void | Promise<void>;
  onUpdateTemplate: (formData: FormData) => void | Promise<void>;
  onDeleteTemplate: (formData: FormData) => void | Promise<void>;
  onImportTemplates: (input: {
    items: ImportTemplateInput[];
    defaultBusinessType?: string | null;
  }) => Promise<ImportResult>;
};

const MAX_IMPORT_ERRORS = 4;

const UNIT_OPTIONS = ["pcs", "packet", "box", "dozen", "kg", "gm", "liter", "ml"];

function scheduleStateUpdate(fn: () => void) {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(fn);
    return;
  }
  Promise.resolve().then(fn);
}

function normalizeCodeInput(value: string) {
  return value.trim().replace(/\s+/g, "").toUpperCase().slice(0, 80);
}

function parseCsvInput(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatCsvInput(items?: string[] | null) {
  return Array.isArray(items) ? items.join(", ") : "";
}

function createVariantDraft(seed?: Partial<TemplateVariantDraft>): TemplateVariantDraft {
  return {
    label: seed?.label ?? "",
    sellPrice: seed?.sellPrice ?? "",
    sku: seed?.sku ?? null,
    barcode: seed?.barcode ?? null,
    sortOrder: seed?.sortOrder ?? 0,
    isActive: seed?.isActive ?? true,
  };
}

function sanitizeVariantsForSubmit(variants: TemplateVariantDraft[]) {
  return variants
    .map((variant, index) => ({
      label: variant.label.trim(),
      sellPrice: String(variant.sellPrice ?? "").trim() || "0",
      sku: normalizeCodeInput(variant.sku || "") || null,
      barcode: normalizeCodeInput(variant.barcode || "") || null,
      sortOrder: Number.isFinite(Number(variant.sortOrder))
        ? Number(variant.sortOrder)
        : index,
      isActive: variant.isActive !== false,
    }))
    .filter((variant) => variant.label.length > 0);
}

function parseImportPayload(raw: string, defaultBusinessType?: string | null) {
  const errors: string[] = [];
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      items: [] as ImportTemplateInput[],
      errors: ["Paste JSON first."],
      duplicateCount: 0,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      items: [] as ImportTemplateInput[],
      errors: ["Invalid JSON."],
      duplicateCount: 0,
    };
  }

  if (!Array.isArray(parsed)) {
    return {
      items: [] as ImportTemplateInput[],
      errors: ["JSON must be an array of objects."],
      duplicateCount: 0,
    };
  }

  const items: ImportTemplateInput[] = [];
  const seen = new Set<string>();
  let duplicateCount = 0;

  parsed.forEach((entry, index) => {
    const row = index + 1;
    if (!entry || typeof entry !== "object") {
      errors.push(`Row ${row}: must be an object`);
      return;
    }

    const record = entry as Record<string, unknown>;
    const itemErrors: string[] = [];

    const rawBusinessType = record.businessType ?? defaultBusinessType ?? "";
    const businessType =
      typeof rawBusinessType === "string" ? rawBusinessType.trim() : "";
    if (!businessType) {
      itemErrors.push("businessType is required");
    }

    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (!name) {
      itemErrors.push("name is required");
    }

    let brand: string | null = null;
    if (record.brand !== undefined) {
      if (record.brand === null || record.brand === "") {
        brand = null;
      } else if (typeof record.brand === "string") {
        const trimmedBrand = record.brand.trim();
        brand = trimmedBrand ? trimmedBrand.slice(0, 120) : null;
      } else {
        itemErrors.push("brand must be a string");
      }
    }

    let category: string | null = null;
    if (record.category !== undefined) {
      if (record.category === null) {
        category = null;
      } else if (typeof record.category === "string") {
        const trimmedCategory = record.category.trim();
        category = trimmedCategory ? trimmedCategory : null;
      } else {
        itemErrors.push("category must be a string");
      }
    }

    let packSize: string | null = null;
    if (record.packSize !== undefined) {
      if (record.packSize === null || record.packSize === "") {
        packSize = null;
      } else if (typeof record.packSize === "string") {
        const trimmedPackSize = record.packSize.trim();
        packSize = trimmedPackSize ? trimmedPackSize.slice(0, 80) : null;
      } else {
        itemErrors.push("packSize must be a string");
      }
    }

    let defaultSellPrice: string | number | null = null;
    if (record.defaultSellPrice !== undefined) {
      if (record.defaultSellPrice === null || record.defaultSellPrice === "") {
        defaultSellPrice = null;
      } else if (
        typeof record.defaultSellPrice === "number" ||
        typeof record.defaultSellPrice === "string"
      ) {
        const numericValue = Number(record.defaultSellPrice);
        if (!Number.isFinite(numericValue) || numericValue < 0) {
          itemErrors.push("defaultSellPrice must be a non-negative number");
        } else {
          defaultSellPrice = record.defaultSellPrice;
        }
      } else {
        itemErrors.push("defaultSellPrice must be a number or string");
      }
    }

    let defaultBarcode: string | null = null;
    if (record.defaultBarcode !== undefined) {
      if (record.defaultBarcode === null || record.defaultBarcode === "") {
        defaultBarcode = null;
      } else if (typeof record.defaultBarcode === "string") {
        defaultBarcode = normalizeCodeInput(record.defaultBarcode);
      } else {
        itemErrors.push("defaultBarcode must be a string");
      }
    }

    let defaultBaseUnit: string | null = null;
    if (record.defaultBaseUnit !== undefined) {
      if (record.defaultBaseUnit === null || record.defaultBaseUnit === "") {
        defaultBaseUnit = null;
      } else if (typeof record.defaultBaseUnit === "string") {
        const normalizedUnit = record.defaultBaseUnit.trim();
        defaultBaseUnit = normalizedUnit ? normalizedUnit.slice(0, 40) : null;
      } else {
        itemErrors.push("defaultBaseUnit must be a string");
      }
    }

    let defaultTrackStock = false;
    if (record.defaultTrackStock !== undefined && record.defaultTrackStock !== null) {
      if (typeof record.defaultTrackStock !== "boolean") {
        itemErrors.push("defaultTrackStock must be boolean");
      } else {
        defaultTrackStock = record.defaultTrackStock;
      }
    }

    const parseStringCollection = (
      rawValue: unknown,
      fieldName: string,
    ): string[] | null => {
      if (rawValue === undefined || rawValue === null || rawValue === "") return [];
      if (Array.isArray(rawValue)) {
        const items = rawValue
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean);
        if (items.length !== rawValue.filter((item) => typeof item === "string").length) {
          itemErrors.push(`${fieldName} must contain only strings`);
          return null;
        }
        return items;
      }
      if (typeof rawValue === "string") {
        return parseCsvInput(rawValue);
      }
      itemErrors.push(`${fieldName} must be an array or comma-separated string`);
      return null;
    };

    const aliases = parseStringCollection(record.aliases, "aliases");
    const keywords = parseStringCollection(record.keywords, "keywords");

    let variants: TemplateVariantDraft[] = [];
    if (record.variants !== undefined && record.variants !== null) {
      if (!Array.isArray(record.variants)) {
        itemErrors.push("variants must be an array");
      } else {
        variants = sanitizeVariantsForSubmit(record.variants as TemplateVariantDraft[]).map(
          (variant) => ({
            label: variant.label,
            sellPrice: variant.sellPrice,
            sku: variant.sku ?? "",
            barcode: variant.barcode ?? "",
            sortOrder: variant.sortOrder,
            isActive: variant.isActive !== false,
          }),
        );
      }
    }

    let imageUrl: string | null = null;
    if (record.imageUrl !== undefined) {
      if (record.imageUrl === null || record.imageUrl === "") {
        imageUrl = null;
      } else if (typeof record.imageUrl === "string") {
        const trimmedImageUrl = record.imageUrl.trim();
        imageUrl = trimmedImageUrl ? trimmedImageUrl.slice(0, 500) : null;
      } else {
        itemErrors.push("imageUrl must be a string");
      }
    }

    let popularityScore = 0;
    if (record.popularityScore !== undefined && record.popularityScore !== null) {
      const parsedScore = Number(record.popularityScore);
      if (!Number.isFinite(parsedScore) || parsedScore < 0) {
        itemErrors.push("popularityScore must be a non-negative number");
      } else {
        popularityScore = Math.floor(parsedScore);
      }
    }

    let isActive = true;
    if (record.isActive !== undefined && record.isActive !== null) {
      if (typeof record.isActive !== "boolean") {
        itemErrors.push("isActive must be boolean");
      } else {
        isActive = record.isActive;
      }
    }

    if (itemErrors.length > 0) {
      errors.push(`Row ${row}: ${itemErrors.join(", ")}`);
      return;
    }

    const key = `${businessType.toLowerCase()}|${name.toLowerCase()}`;
    if (seen.has(key)) {
      duplicateCount += 1;
      return;
    }
    seen.add(key);

    items.push({
      businessType,
      name,
      brand,
      category,
      packSize,
      defaultSellPrice,
      defaultBarcode,
      defaultBaseUnit,
      defaultTrackStock,
      aliases: aliases ?? [],
      keywords: keywords ?? [],
      variants,
      imageUrl,
      popularityScore,
      isActive,
    });
  });

  return { items, errors, duplicateCount };
}

export default function BusinessProductLibraryClient({
  initialTemplates,
  initialBusinessTypes,
  error,
  onCreateTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
  onImportTemplates,
}: Props) {
  const online = useOnlineStatus();
  const router = useRouter();
  const { pendingCount, syncing, lastSyncAt } = useSyncStatus();
  const [importing, startImport] = useTransition();
  const [templates, setTemplates] = useState<TemplateRow[]>(initialTemplates || []);
  const [businessTypes, setBusinessTypes] = useState<BusinessTypeRow[]>(
    initialBusinessTypes || []
  );
  const [advancedMode, setAdvancedMode] = useState(false);
  const [defaultBaseUnit, setDefaultBaseUnit] = useState("pcs");
  const [defaultTrackStock, setDefaultTrackStock] = useState(false);
  const [variantRows, setVariantRows] = useState<TemplateVariantDraft[]>([]);
  const [showVariantCodeFields, setShowVariantCodeFields] = useState(false);
  const [importPayload, setImportPayload] = useState("");
  const [importBusinessType, setImportBusinessType] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const refreshInFlightRef = useRef(false);
  const lastRefreshAtRef = useRef(0);
  const REFRESH_MIN_INTERVAL_MS = 15_000;
  const serverSnapshotRef = useRef({
    templates: initialTemplates,
    businessTypes: initialBusinessTypes,
  });

  const templatesKey = "admin:product-library:templates";
  const typesKey = "admin:product-library:types";

  const updateTemplates = useCallback(
    (updater: (prev: TemplateRow[]) => TemplateRow[]) => {
      setTemplates((prev) => {
        const next = updater(prev);
        try {
          safeLocalStorageSet(templatesKey, JSON.stringify(next));
        } catch {
          // ignore cache errors
        }
        return next;
      });
    },
    [templatesKey],
  );

  const sanitizedVariantPayload = useMemo(
    () => sanitizeVariantsForSubmit(variantRows),
    [variantRows],
  );

  function upsertVariantRow(index: number, patch: Partial<TemplateVariantDraft>) {
    setVariantRows((prev) =>
      prev.map((row, current) => (current === index ? { ...row, ...patch } : row)),
    );
  }

  function addVariantRow(seed?: Partial<TemplateVariantDraft>) {
    setVariantRows((prev) => [
      ...prev,
      createVariantDraft({
        ...seed,
        sortOrder: prev.length,
      }),
    ]);
  }

  function removeVariantRow(index: number) {
    setVariantRows((prev) =>
      prev
        .filter((_, current) => current !== index)
        .map((row, current) => ({ ...row, sortOrder: current })),
    );
  }

  function addPresetVariants(type: "size" | "volume") {
    const labels = type === "size" ? ["Small", "Medium", "Large"] : ["250ml", "500ml", "1L"];
    setVariantRows((prev) => {
      const existing = new Set(prev.map((row) => row.label.trim().toLowerCase()));
      const additions = labels
        .filter((label) => !existing.has(label.toLowerCase()))
        .map((label, index) =>
          createVariantDraft({
            label,
            sortOrder: prev.length + index,
          }),
        );
      return [...prev, ...additions];
    });
  }

  const handleOfflineCreate = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      if (online) return;
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const businessType = (formData.get("businessType") as string | null)?.trim();
      const name = (formData.get("name") as string | null)?.trim();
      if (!businessType || !name) return;
      const brand = (formData.get("brand") as string | null)?.trim() || null;
      const category = (formData.get("category") as string | null)?.trim() || null;
      const packSize = (formData.get("packSize") as string | null)?.trim() || null;
      const rawPrice = (formData.get("defaultSellPrice") as string | null)?.trim();
      const defaultSellPrice = rawPrice ? rawPrice : null;
      const defaultBarcode =
        normalizeCodeInput((formData.get("defaultBarcode") as string | null) || "") || null;
      const defaultBaseUnit = (formData.get("defaultBaseUnit") as string | null)?.trim() || null;
      const defaultTrackStock = formData.get("defaultTrackStock") === "on";
      const aliases = parseCsvInput((formData.get("aliasesCsv") as string | null) || "");
      const keywords = parseCsvInput((formData.get("keywordsCsv") as string | null) || "");
      const rawVariantsJson = (formData.get("variantsJson") as string | null) || "";
      const imageUrl = (formData.get("imageUrl") as string | null)?.trim() || null;
      const rawPopularityScore =
        (formData.get("popularityScore") as string | null)?.trim() || "";
      const popularityScore = rawPopularityScore
        ? Math.max(0, Math.floor(Number(rawPopularityScore) || 0))
        : 0;
      let variants: TemplateVariantDraft[] = [];
      if (rawVariantsJson.trim()) {
        try {
          const parsed = JSON.parse(rawVariantsJson);
          if (Array.isArray(parsed)) {
            variants = parsed.map((row, index) =>
              createVariantDraft({
                ...(row as Partial<TemplateVariantDraft>),
                sortOrder: index,
              }),
            );
          }
        } catch {
          variants = [];
        }
      }
      const isActive = formData.get("isActive") === "on";
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${businessType}-${Date.now()}`;

      updateTemplates((prev) => [
        ...prev,
        {
          id,
          businessType,
          name,
          brand,
          category,
          packSize,
          defaultSellPrice,
          defaultBarcode,
          defaultBaseUnit,
          defaultTrackStock,
          aliases,
          keywords,
          variants,
          imageUrl,
          popularityScore,
          isActive,
        },
      ]);

      await queueAdminAction("business_template_create", {
        id,
        businessType,
        name,
        brand,
        category,
        packSize,
        defaultSellPrice,
        defaultBarcode,
        defaultBaseUnit,
        defaultTrackStock,
        aliases,
        keywords,
        variants,
        imageUrl,
        popularityScore,
        isActive,
      });
      alert("Offline: template queued.");
      event.currentTarget.reset();
      setDefaultBaseUnit("pcs");
      setDefaultTrackStock(false);
      setVariantRows([]);
    },
    [online, updateTemplates],
  );

  const handleOfflineUpdate = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      if (online) return;
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const id = (formData.get("id") as string | null)?.trim();
      if (!id) return;
      const businessType = (formData.get("businessType") as string | null)?.trim();
      const name = (formData.get("name") as string | null)?.trim();
      const brand = (formData.get("brand") as string | null)?.trim() || null;
      const category = (formData.get("category") as string | null)?.trim() || null;
      const packSize = (formData.get("packSize") as string | null)?.trim() || null;
      const rawPrice = (formData.get("defaultSellPrice") as string | null)?.trim();
      const defaultSellPrice = rawPrice ? rawPrice : null;
      const defaultBarcode =
        normalizeCodeInput((formData.get("defaultBarcode") as string | null) || "") || null;
      const defaultBaseUnit = (formData.get("defaultBaseUnit") as string | null)?.trim() || null;
      const defaultTrackStock = formData.get("defaultTrackStock") === "on";
      const aliases = parseCsvInput((formData.get("aliasesCsv") as string | null) || "");
      const keywords = parseCsvInput((formData.get("keywordsCsv") as string | null) || "");
      const imageUrl = (formData.get("imageUrl") as string | null)?.trim() || null;
      const rawPopularityScore =
        (formData.get("popularityScore") as string | null)?.trim() || "";
      const popularityScore = rawPopularityScore
        ? Math.max(0, Math.floor(Number(rawPopularityScore) || 0))
        : 0;
      const isActive = formData.get("isActive") === "on";

      updateTemplates((prev) =>
        prev.map((template) =>
          template.id === id
            ? {
                ...template,
                businessType: businessType || template.businessType,
                name: name || template.name,
                brand,
                category,
                packSize,
                defaultSellPrice,
                defaultBarcode,
                defaultBaseUnit,
                defaultTrackStock,
                aliases,
                keywords,
                imageUrl,
                popularityScore,
                isActive,
              }
            : template,
        ),
      );

      await queueAdminAction("business_template_update", {
        id,
        businessType,
        name,
        brand,
        category,
        packSize,
        defaultSellPrice,
        defaultBarcode,
        defaultBaseUnit,
        defaultTrackStock,
        aliases,
        keywords,
        imageUrl,
        popularityScore,
        isActive,
      });
      alert("Offline: template update queued.");
    },
    [online, updateTemplates],
  );

  const handleOfflineDelete = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      if (online) return;
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const id = (formData.get("id") as string | null)?.trim();
      if (!id) return;
      updateTemplates((prev) => prev.filter((template) => template.id !== id));
      await queueAdminAction("business_template_delete", { id });
      alert("Offline: delete queued.");
    },
    [online, updateTemplates],
  );

  const handleImport = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setImportError(null);
      setImportNotice(null);

      const defaultType = importBusinessType.trim() || null;
      const { items, errors, duplicateCount } = parseImportPayload(
        importPayload,
        defaultType,
      );

      if (errors.length > 0) {
        setImportError(errors.slice(0, MAX_IMPORT_ERRORS).join(" | "));
        return;
      }

      if (items.length === 0) {
        setImportError("No valid templates found.");
        return;
      }

      if (!online) {
        const existing = new Set(
          templates.map(
            (template) =>
              `${template.businessType.toLowerCase()}|${template.name.toLowerCase()}`,
          ),
        );
        const created: TemplateRow[] = [];
        let skipped = 0;

        for (const item of items) {
          const businessType = item.businessType?.toString().trim() || "";
          const name = item.name?.toString().trim() || "";
          const key = `${businessType.toLowerCase()}|${name.toLowerCase()}`;
          if (!businessType || !name || existing.has(key)) {
            skipped += 1;
            continue;
          }
          existing.add(key);
          const id =
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${businessType}-${Date.now()}`;
          const category = item.category ?? null;
          const brand = item.brand ?? null;
          const packSize = item.packSize ?? null;
          const defaultSellPrice = item.defaultSellPrice ?? null;
          const defaultBarcode =
            typeof item.defaultBarcode === "string"
              ? normalizeCodeInput(item.defaultBarcode)
              : null;
          const defaultBaseUnit = item.defaultBaseUnit ?? null;
          const defaultTrackStock = item.defaultTrackStock === true;
          const aliases = Array.isArray(item.aliases) ? item.aliases : [];
          const keywords = Array.isArray(item.keywords) ? item.keywords : [];
          const variants = Array.isArray(item.variants)
            ? item.variants.map((variant, index) =>
                createVariantDraft({
                  ...variant,
                  sortOrder:
                    Number.isFinite(Number(variant.sortOrder)) &&
                    Number(variant.sortOrder) >= 0
                      ? Number(variant.sortOrder)
                      : index,
                }),
              )
            : [];
          const imageUrl = item.imageUrl ?? null;
          const popularityScore = Number(item.popularityScore ?? 0) || 0;
          const isActive = item.isActive ?? true;

          created.push({
            id,
            businessType,
            name,
            brand,
            category,
            packSize,
            defaultSellPrice,
            defaultBarcode,
            defaultBaseUnit,
            defaultTrackStock,
            aliases,
            keywords,
            variants,
            imageUrl,
            popularityScore,
            isActive,
          });
        }

        if (created.length > 0) {
          updateTemplates((prev) => [...prev, ...created]);
          await Promise.all(
            created.map((item) =>
              queueAdminAction("business_template_create", {
                id: item.id,
                businessType: item.businessType,
                name: item.name,
                brand: item.brand ?? null,
                category: item.category ?? null,
                packSize: item.packSize ?? null,
                defaultSellPrice: item.defaultSellPrice ?? null,
                defaultBarcode: item.defaultBarcode ?? null,
                defaultBaseUnit: item.defaultBaseUnit ?? null,
                defaultTrackStock: item.defaultTrackStock === true,
                aliases: Array.isArray(item.aliases) ? item.aliases : [],
                keywords: Array.isArray(item.keywords) ? item.keywords : [],
                variants: Array.isArray(item.variants)
                  ? sanitizeVariantsForSubmit(item.variants)
                  : [],
                imageUrl: item.imageUrl ?? null,
                popularityScore: Number(item.popularityScore ?? 0) || 0,
                isActive: item.isActive,
              }),
            ),
          );
        }

        const skippedTotal = skipped + duplicateCount;
        const parts = [`${created.length} templates queued`];
        if (skippedTotal) parts.push(`${skippedTotal} skipped`);
        setImportNotice(`Offline: ${parts.join(". ")}.`);
        setImportPayload("");
        return;
      }

      startImport(async () => {
        try {
          const result = await onImportTemplates({
            items,
            defaultBusinessType: defaultType,
          });
          const skippedTotal = result.skippedCount + duplicateCount;
          const parts = [`${result.createdCount} templates imported`];
          if (skippedTotal) parts.push(`${skippedTotal} skipped`);
          setImportNotice(parts.join(". ") + ".");
          setImportPayload("");
          router.refresh();
        } catch (err) {
          const message =
            err instanceof Error && err.message
              ? err.message
              : "Import failed.";
          setImportError(message);
        }
      });
    },
    [
      importBusinessType,
      importPayload,
      online,
      onImportTemplates,
      router,
      startImport,
      templates,
      updateTemplates,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    if (online) {
      if (Array.isArray(initialTemplates) && initialTemplates.length > 0) {
        scheduleStateUpdate(() => {
          if (cancelled) return;
          setTemplates(initialTemplates);
        });
        try {
          safeLocalStorageSet(templatesKey, JSON.stringify(initialTemplates));
        } catch {
          // ignore cache errors
        }
      } else if (error) {
        try {
          const raw = safeLocalStorageGet(templatesKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              scheduleStateUpdate(() => {
                if (cancelled) return;
                setTemplates(parsed);
              });
            }
          }
        } catch {
          // ignore cache errors
        }
      }

      if (Array.isArray(initialBusinessTypes) && initialBusinessTypes.length > 0) {
        scheduleStateUpdate(() => {
          if (cancelled) return;
          setBusinessTypes(initialBusinessTypes);
        });
        try {
          safeLocalStorageSet(typesKey, JSON.stringify(initialBusinessTypes));
        } catch {
          // ignore cache errors
        }
      }
      return () => {
        cancelled = true;
      };
    }

    try {
      const raw = safeLocalStorageGet(templatesKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          scheduleStateUpdate(() => {
            if (cancelled) return;
            setTemplates(parsed);
          });
        }
      }
    } catch {
      // ignore cache errors
    }

    try {
      const raw = safeLocalStorageGet(typesKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          scheduleStateUpdate(() => {
            if (cancelled) return;
            setBusinessTypes(parsed);
          });
        }
      }
    } catch {
      // ignore cache errors
    }
    return () => {
      cancelled = true;
    };
  }, [online, initialTemplates, initialBusinessTypes, error]);

  useEffect(() => {
    if (
      serverSnapshotRef.current.templates !== initialTemplates ||
      serverSnapshotRef.current.businessTypes !== initialBusinessTypes
    ) {
      serverSnapshotRef.current = {
        templates: initialTemplates,
        businessTypes: initialBusinessTypes,
      };
      refreshInFlightRef.current = false;
    }
  }, [initialTemplates, initialBusinessTypes]);

  useEffect(() => {
    if (!online || !lastSyncAt || syncing || pendingCount > 0) return;
    if (refreshInFlightRef.current) return;
    const now = Date.now();
    if (now - lastRefreshAtRef.current < REFRESH_MIN_INTERVAL_MS) return;
    lastRefreshAtRef.current = now;
    refreshInFlightRef.current = true;
    router.refresh();
  }, [online, lastSyncAt, syncing, pendingCount, router]);

  const mergedBusinessTypes = useMemo(() => {
    return [
      ...businessTypes.map((t) => ({ id: t.key, label: t.label })),
      ...businessOptions.filter((opt) => !businessTypes.some((t) => t.key === opt.id)),
    ];
  }, [businessTypes]);

  const labelMap = useMemo(
    () => new Map(mergedBusinessTypes.map((opt) => [opt.id, opt.label] as const)),
    [mergedBusinessTypes]
  );

  const grouped = useMemo(() => {
    return templates.reduce<Record<string, TemplateRow[]>>((acc, template) => {
      const key = template.businessType;
      if (!acc[key]) acc[key] = [];
      acc[key].push(template);
      return acc;
    }, {});
  }, [templates]);

  const showError = online && error;
  const showOfflineEmpty = !online && templates.length === 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6 py-6">
      {!online && (
        <div className="border border-warning/30 bg-warning-soft text-warning rounded-lg p-3 text-xs font-semibold">
          অফলাইন: আগের Business Product Library ডাটা দেখানো হচ্ছে।
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-foreground">Business Product Library</h1>
        <p className="text-muted-foreground">
          Super Admin can manage default products for each business type. These power quick add in
          the product list.
        </p>
      </div>

      {showError ? (
        <div className="border border-danger/30 bg-danger-soft text-danger rounded-lg p-4">
          {error}
        </div>
      ) : null}

      {showOfflineEmpty ? (
        <div className="border border-border rounded-lg p-4 text-sm text-muted-foreground">
          Offline: cached templates not available.
        </div>
      ) : null}

      <fieldset className="space-y-6">
        <div className="border border-border rounded-xl p-4 space-y-3 bg-card">
          <h2 className="text-lg font-semibold text-foreground">Add new template</h2>
          <form
            action={onCreateTemplate}
            onSubmit={handleOfflineCreate}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
              <select
                name="businessType"
                required
                className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                defaultValue=""
              >
                <option value="" disabled>
                  Business type
                </option>
                {mergedBusinessTypes.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label} ({opt.id})
                  </option>
                ))}
              </select>
              <input
                name="name"
                type="text"
                required
                className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Product name"
              />
              <input
                name="category"
                type="text"
                className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Category (optional)"
              />
              <input
                name="defaultSellPrice"
                type="number"
                step="0.01"
                min="0"
                className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Default sell price"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
              <input
                name="brand"
                type="text"
                className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Brand (optional)"
              />
              <input
                name="packSize"
                type="text"
                className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Pack size (500ml, 1kg)"
              />
              <input
                name="defaultBarcode"
                type="text"
                className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Default barcode"
              />
              <input
                name="popularityScore"
                type="number"
                min="0"
                step="1"
                className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Popularity score"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <input
                name="aliasesCsv"
                type="text"
                className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Aliases: chini, sugar, চিনি"
              />
              <input
                name="keywordsCsv"
                type="text"
                className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Keywords: grocery, staple, daily"
              />
            </div>

            <input
              name="imageUrl"
              type="text"
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Image URL (optional)"
            />

            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">
                  Mode: {advancedMode ? "Flexible template" : "Simple template"}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setAdvancedMode((prev) => !prev);
                    if (advancedMode) {
                      setVariantRows([]);
                      setShowVariantCodeFields(false);
                    }
                  }}
                  className="inline-flex h-8 items-center justify-center rounded-md border border-border px-3 text-xs font-semibold text-foreground hover:bg-card"
                >
                  {advancedMode ? "Use simple" : "Use flexible"}
                </button>
              </div>

              {advancedMode ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-muted-foreground">
                        Default unit
                      </span>
                      <select
                        name="defaultBaseUnit"
                        value={defaultBaseUnit}
                        onChange={(event) => setDefaultBaseUnit(event.currentTarget.value)}
                        className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground"
                      >
                        {UNIT_OPTIONS.map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="inline-flex items-center gap-2 pt-5 text-sm text-foreground">
                      <input
                        type="checkbox"
                        name="defaultTrackStock"
                        checked={defaultTrackStock}
                        onChange={(event) => setDefaultTrackStock(event.currentTarget.checked)}
                        className="h-4 w-4"
                      />
                      <span>Track stock by default</span>
                    </label>
                  </div>

                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => addPresetVariants("size")}
                        className="h-8 rounded-full border border-primary/30 bg-primary-soft px-3 text-xs font-semibold text-primary"
                      >
                        + Size preset
                      </button>
                      <button
                        type="button"
                        onClick={() => addPresetVariants("volume")}
                        className="h-8 rounded-full border border-primary/30 bg-primary-soft px-3 text-xs font-semibold text-primary"
                      >
                        + Volume preset
                      </button>
                      <button
                        type="button"
                        onClick={() => addVariantRow()}
                        className="h-8 rounded-full border border-border bg-card px-3 text-xs font-semibold text-foreground"
                      >
                        + Custom variant
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowVariantCodeFields((prev) => !prev)}
                        className="h-8 rounded-full border border-border bg-card px-3 text-xs font-semibold text-muted-foreground"
                      >
                        {showVariantCodeFields ? "SKU/Barcode hide" : "SKU/Barcode show"}
                      </button>
                    </div>
                    {variantRows.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Optional: variant add করলে template apply করার সময় product + variants তৈরি হবে।
                      </p>
                    ) : (
                      <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                        {variantRows.map((row, index) => (
                          <div
                            key={`${row.label}-${index}`}
                            className="rounded-md border border-border bg-card p-2 space-y-2"
                          >
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr,140px,auto]">
                              <input
                                type="text"
                                value={row.label}
                                onChange={(event) =>
                                  upsertVariantRow(index, { label: event.currentTarget.value })
                                }
                                placeholder="Label (Small, 500ml)"
                                className="h-9 rounded-md border border-border bg-card px-3 text-sm"
                              />
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={row.sellPrice}
                                onChange={(event) =>
                                  upsertVariantRow(index, { sellPrice: event.currentTarget.value })
                                }
                                placeholder="Price"
                                className="h-9 rounded-md border border-border bg-card px-3 text-sm"
                              />
                              <button
                                type="button"
                                onClick={() => removeVariantRow(index)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-danger/30 bg-danger-soft text-danger"
                              >
                                ✕
                              </button>
                            </div>
                            {showVariantCodeFields ? (
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <input
                                  type="text"
                                  value={row.sku ?? ""}
                                  onChange={(event) =>
                                    upsertVariantRow(index, {
                                      sku: normalizeCodeInput(event.currentTarget.value),
                                    })
                                  }
                                  placeholder="SKU (optional)"
                                  className="h-9 rounded-md border border-border bg-card px-3 text-xs"
                                />
                                <input
                                  type="text"
                                  value={row.barcode ?? ""}
                                  onChange={(event) =>
                                    upsertVariantRow(index, {
                                      barcode: normalizeCodeInput(event.currentTarget.value),
                                    })
                                  }
                                  placeholder="Barcode (optional)"
                                  className="h-9 rounded-md border border-border bg-card px-3 text-xs"
                                />
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <input type="hidden" name="defaultBaseUnit" value="" />
                  <input type="hidden" name="variantsJson" value="[]" />
                </>
              )}
            </div>

            {advancedMode ? (
              <input type="hidden" name="variantsJson" value={JSON.stringify(sanitizedVariantPayload)} />
            ) : null}

            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" name="isActive" className="w-4 h-4" defaultChecked />
                <span>Active</span>
              </label>
              <button
                type="submit"
                className="ml-auto px-4 py-2 rounded-md bg-primary-soft text-primary border border-primary/30 font-semibold hover:bg-primary/15 hover:border-primary/40"
              >
                Add
              </button>
            </div>
          </form>
        </div>

        <div className="border border-border rounded-xl p-4 space-y-3 bg-card">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Import templates (JSON)</h2>
            <p className="text-xs text-muted-foreground">
              Paste a JSON array. Supports brand, packSize, defaultBarcode, aliases, keywords,
              imageUrl, popularityScore too.
            </p>
          </div>
          <form onSubmit={handleImport} className="space-y-3">
            <select
              name="defaultBusinessType"
              className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={importBusinessType}
              onChange={(event) => {
                setImportBusinessType(event.currentTarget.value);
                if (importError) setImportError(null);
                if (importNotice) setImportNotice(null);
              }}
            >
              <option value="">Default business type (optional)</option>
              {mergedBusinessTypes.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label} ({opt.id})
                </option>
              ))}
            </select>

            <textarea
              name="payload"
              rows={8}
              spellCheck={false}
              className="w-full border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono"
              placeholder='[{"businessType":"grocery","name":"Rice","brand":"ACI","packSize":"5kg","aliases":["chal","rice"],"defaultSellPrice":50,"popularityScore":90,"isActive":true}]'
              value={importPayload}
              onChange={(event) => {
                setImportPayload(event.currentTarget.value);
                if (importError) setImportError(null);
                if (importNotice) setImportNotice(null);
              }}
            />

            {importError ? (
              <div className="border border-danger/30 bg-danger-soft text-danger rounded-lg p-3 text-xs font-semibold">
                {importError}
              </div>
            ) : null}

            {importNotice ? (
              <div className="border border-success/30 bg-success-soft text-success rounded-lg p-3 text-xs font-semibold">
                {importNotice}
              </div>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-[11px] text-muted-foreground">
                Duplicates are skipped. Prices accept numbers or strings.
              </span>
              <button
                type="submit"
                disabled={importing || importPayload.trim().length === 0}
                className="inline-flex items-center justify-center px-4 py-2 rounded-md bg-primary-soft text-primary border border-primary/30 font-semibold hover:bg-primary/15 hover:border-primary/40 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {importing ? "Importing..." : "Import JSON"}
              </button>
            </div>
          </form>
        </div>

        {templates.length === 0 ? (
          <div className="border border-border rounded-xl p-4 text-sm text-muted-foreground">
            No templates yet. Add a few above to enable quick add for shops.
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([businessType, items]) => (
              <div key={businessType} className="border border-border rounded-xl p-4 bg-card space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground font-mono">{businessType}</div>
                    <div className="text-lg font-semibold text-foreground">
                      {labelMap.get(businessType) || businessType}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">{items.length} templates</span>
                </div>

                <div className="space-y-3">
                  {items.map((template) => (
                    <div
                      key={template.id}
                      className="border border-border rounded-lg p-3 grid grid-cols-1 lg:grid-cols-6 gap-3 items-start"
                    >
                      <div className="lg:col-span-6 flex flex-wrap items-center gap-2 text-[11px]">
                        {template.brand ? (
                          <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-muted-foreground">
                            brand: {template.brand}
                          </span>
                        ) : null}
                        {template.packSize ? (
                          <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-muted-foreground">
                            pack: {template.packSize}
                          </span>
                        ) : null}
                        <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-muted-foreground">
                          unit: {template.defaultBaseUnit || "pcs"}
                        </span>
                        <span
                          className={`rounded-full border px-2 py-0.5 ${
                            template.defaultTrackStock
                              ? "border-primary/30 bg-primary-soft text-primary"
                              : "border-border bg-muted/40 text-muted-foreground"
                          }`}
                        >
                          stock: {template.defaultTrackStock ? "track on" : "track off"}
                        </span>
                        <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-muted-foreground">
                          variants: {Array.isArray(template.variants) ? template.variants.length : 0}
                        </span>
                        {template.defaultBarcode ? (
                          <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 font-mono text-muted-foreground">
                            barcode: {template.defaultBarcode}
                          </span>
                        ) : null}
                        {Number(template.popularityScore ?? 0) > 0 ? (
                          <span className="rounded-full border border-primary/30 bg-primary-soft px-2 py-0.5 text-primary">
                            popularity: {template.popularityScore}
                          </span>
                        ) : null}
                      </div>
                      <form
                        action={onUpdateTemplate}
                        onSubmit={handleOfflineUpdate}
                        className="grid grid-cols-1 lg:grid-cols-6 gap-3 lg:col-span-5"
                      >
                        <input type="hidden" name="id" value={template.id} />
                        <input type="hidden" name="defaultBaseUnit" value={template.defaultBaseUnit ?? ""} />
                        <input type="hidden" name="variantsJson" value={JSON.stringify(template.variants ?? [])} />
                        {template.defaultTrackStock ? (
                          <input type="hidden" name="defaultTrackStock" value="on" />
                        ) : null}
                        <input
                          name="name"
                          type="text"
                          className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                          defaultValue={template.name}
                        />
                        <input
                          name="category"
                          type="text"
                          className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                          defaultValue={template.category ?? ""}
                          placeholder="Category"
                        />
                        <input
                          name="brand"
                          type="text"
                          className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                          defaultValue={template.brand ?? ""}
                          placeholder="Brand"
                        />
                        <input
                          name="packSize"
                          type="text"
                          className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                          defaultValue={template.packSize ?? ""}
                          placeholder="Pack size"
                        />
                        <input
                          name="defaultSellPrice"
                          type="number"
                          step="0.01"
                          min="0"
                          className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                          defaultValue={template.defaultSellPrice ?? ""}
                          placeholder="Default price"
                        />
                        <input
                          name="defaultBarcode"
                          type="text"
                          className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                          defaultValue={template.defaultBarcode ?? ""}
                          placeholder="Barcode"
                        />
                        <input
                          name="popularityScore"
                          type="number"
                          min="0"
                          step="1"
                          className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                          defaultValue={template.popularityScore ?? 0}
                          placeholder="Popularity"
                        />
                        <input
                          name="aliasesCsv"
                          type="text"
                          className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 lg:col-span-2"
                          defaultValue={formatCsvInput(template.aliases)}
                          placeholder="Aliases"
                        />
                        <input
                          name="keywordsCsv"
                          type="text"
                          className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 lg:col-span-2"
                          defaultValue={formatCsvInput(template.keywords)}
                          placeholder="Keywords"
                        />
                        <input
                          name="imageUrl"
                          type="text"
                          className="border border-border rounded-md px-3 py-2 text-sm bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 lg:col-span-2"
                          defaultValue={template.imageUrl ?? ""}
                          placeholder="Image URL"
                        />
                        <label className="inline-flex items-center gap-2 text-sm text-foreground">
                          <input type="checkbox" name="isActive" className="w-4 h-4" defaultChecked={template.isActive} />
                          <span>Active</span>
                        </label>
                        {template.aliases && template.aliases.length > 0 ? (
                          <div className="lg:col-span-6 flex flex-wrap gap-1.5">
                            {template.aliases.slice(0, 6).map((alias) => (
                              <span
                                key={`${template.id}-alias-${alias}`}
                                className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                              >
                                {alias}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <button
                          type="submit"
                          className="px-3 py-2 rounded-md bg-primary-soft text-primary border border-primary/30 font-semibold hover:bg-primary/15 hover:border-primary/40"
                        >
                          Save
                        </button>
                      </form>
                      <form
                        action={onDeleteTemplate}
                        onSubmit={handleOfflineDelete}
                        className="lg:col-span-1 flex justify-end"
                      >
                        <input type="hidden" name="id" value={template.id} />
                        <button
                          type="submit"
                          className="px-3 py-2 rounded-md bg-danger-soft text-danger border border-danger/30 font-semibold hover:bg-danger/10 hover:border-danger/40"
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </fieldset>
    </div>
  );
}
