"use client";

import { useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createCatalogImportCsvTemplate,
  createCatalogImportTemplate,
  parseCatalogImportPayload,
  type CatalogImportItemInput,
} from "@/lib/catalog-import";
import type {
  CatalogImportPayloadFormat,
  CatalogImportSourceType,
  CatalogPriceKind,
  CatalogProductSource,
} from "@prisma/client";

type ImportSourceRow = {
  id: string;
  slug: string;
  name: string;
  type: CatalogImportSourceType;
  notes: string | null;
  importedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ImportSourceSummaryRow = {
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

type CatalogProductRow = {
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
  mergedIntoCatalogProductId: string | null;
  mergedIntoCatalogProductName: string | null;
  mergedAt: string | null;
  aliases: Array<{
    alias: string;
    locale: string | null;
    isPrimary: boolean;
  }>;
  barcodes: Array<{
    code: string;
    format: string | null;
    isPrimary: boolean;
  }>;
  latestPrice: string | null;
  latestPriceKind: CatalogPriceKind | null;
  latestPriceObservedAt: string | null;
  importSource: {
    id: string;
    slug: string;
    name: string;
    type: CatalogImportSourceType;
  } | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type BusinessTypeOption = {
  key: string;
  label: string;
  isActive: boolean;
};

type PriceSnapshotRow = {
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

type CatalogImportPreviewItem = {
  rowNumber: number;
  name: string;
  businessType: string | null;
  action: "create" | "update" | "skip";
  matchedBy: "name" | "barcode" | "externalRef" | "mixed" | null;
  matchedProductId: string | null;
  reasons: string[];
};

type CatalogImportPreviewResult = {
  validCount: number;
  invalidCount: number;
  duplicateInputCount: number;
  createCount: number;
  updateCount: number;
  skipCount: number;
  items: CatalogImportPreviewItem[];
  errors: string[];
};

type CatalogImportResult = {
  importRunId: string;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  invalidCount: number;
  duplicateInputCount: number;
  errors: string[];
};

type CatalogImportRunRow = {
  id: string;
  payloadFormat: CatalogImportPayloadFormat;
  importMode: "skip" | "upsert";
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

type CatalogBulkSetActiveStateResult = {
  updatedCount: number;
  isActive: boolean;
};

type CatalogBulkUpdateMetadataResult = {
  updatedCount: number;
  importSourceId: string | null;
  sourceType: CatalogProductSource | null;
};

type CatalogBulkRestoreResult = {
  restoredCount: number;
};

type CatalogBulkDeleteResult = {
  deletedCount: number;
  skippedCount: number;
  linkedCount: number;
  protectedCount: number;
};

type MergeCatalogProductsResult = {
  auditActionId: string;
  mergeMode: "archive" | "delete";
  targetProductId: string;
  sourceProductId: string;
  movedTemplateCount: number;
  movedShopProductCount: number;
  movedSnapshotCount: number;
  movedAliasCount: number;
  movedBarcodeCount: number;
};

type CatalogProductMergeAuditRow = {
  id: string;
  sourceCatalogProductId: string | null;
  sourceProductNameSnapshot: string;
  sourceBusinessTypeSnapshot: string | null;
  targetCatalogProductId: string | null;
  targetProductNameSnapshot: string;
  targetBusinessTypeSnapshot: string | null;
  mergeMode: "archive" | "delete";
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

type CatalogDuplicateCandidateRow = {
  product: CatalogProductRow;
  score: number;
  reasons: string[];
};

type RestoreCatalogProductResult = {
  id: string;
  restored: true;
};

type Props = {
  error?: string | null;
  initialProducts: CatalogProductRow[];
  initialImportSources: ImportSourceRow[];
  initialImportSourceSummary: ImportSourceSummaryRow[];
  initialImportRuns: CatalogImportRunRow[];
  initialMergeAudits: CatalogProductMergeAuditRow[];
  initialDuplicateCandidates: CatalogDuplicateCandidateRow[];
  businessTypes: BusinessTypeOption[];
  initialSelectedProductId: string | null;
  initialPriceSnapshots: PriceSnapshotRow[];
  initialFilters: {
    query: string;
    businessType: string;
    sourceType: string;
    activity: string;
    mergeState: string;
  };
  importSourceTypeOptions: CatalogImportSourceType[];
  productSourceTypeOptions: CatalogProductSource[];
  priceKindOptions: CatalogPriceKind[];
  onCreateImportSource: (formData: FormData) => Promise<void> | void;
  onCreateProduct: (formData: FormData) => Promise<void> | void;
  onPreviewImport: (input: {
    items: CatalogImportItemInput[];
    defaultBusinessType?: string | null;
    defaultImportSourceId?: string | null;
    defaultSourceType?: CatalogProductSource | null;
    payloadFormat?: CatalogImportPayloadFormat | null;
    mode?: "skip" | "upsert";
  }) => Promise<CatalogImportPreviewResult>;
  onImportProducts: (input: {
    items: CatalogImportItemInput[];
    defaultBusinessType?: string | null;
    defaultImportSourceId?: string | null;
    defaultSourceType?: CatalogProductSource | null;
    payloadFormat?: CatalogImportPayloadFormat | null;
    mode?: "skip" | "upsert";
  }) => Promise<CatalogImportResult>;
  onBulkSetProductActiveState: (input: {
    ids: string[];
    isActive: boolean;
  }) => Promise<CatalogBulkSetActiveStateResult>;
  onBulkUpdateProductMetadata: (input: {
    ids: string[];
    importSourceId?: string | null;
    sourceType?: CatalogProductSource | null;
  }) => Promise<CatalogBulkUpdateMetadataResult>;
  onBulkRestoreArchivedProducts: (ids: string[]) => Promise<CatalogBulkRestoreResult>;
  onBulkDeleteProducts: (ids: string[]) => Promise<CatalogBulkDeleteResult>;
  onMergeProducts: (input: {
    targetProductId: string;
    sourceProductId: string;
    mode?: "archive" | "delete";
    note?: string | null;
  }) => Promise<MergeCatalogProductsResult>;
  onRestoreArchivedProduct: (id: string) => Promise<RestoreCatalogProductResult>;
  onUpdateProduct: (formData: FormData) => Promise<void> | void;
  onDeleteProduct: (formData: FormData) => Promise<void> | void;
  onCreatePriceSnapshot: (formData: FormData) => Promise<void> | void;
};

const MAX_IMPORT_ERRORS = 6;
const PRODUCT_PAGE_SIZE = 24;
const PREVIEW_PAGE_SIZE = 12;
const SNAPSHOT_PAGE_SIZE = 6;
const IMPORT_PAYLOAD_FORMATS = ["json", "csv"] as const;
const KEEP_BULK_VALUE = "__keep__";
const CLEAR_BULK_VALUE = "__clear__";
const ADMIN_TABS = [
  { id: "overview", label: "Overview" },
  { id: "products", label: "Products" },
  { id: "imports", label: "Imports" },
  { id: "duplicates", label: "Duplicates" },
  { id: "prices", label: "Price Snapshots" },
] as const;

type AdminTab = (typeof ADMIN_TABS)[number]["id"];

const INPUT_CLASS =
  "rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30";
const TEXTAREA_CLASS =
  "w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30";
const MUTED_BUTTON_CLASS =
  "rounded-2xl border border-border bg-muted px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted/70";
const PRIMARY_BUTTON_CLASS =
  "rounded-2xl border border-primary/30 bg-primary-soft px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/15";
const SOLID_PRIMARY_BUTTON_CLASS =
  "rounded-2xl border border-primary/30 bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground";
const DANGER_BUTTON_CLASS =
  "rounded-2xl border border-danger/30 bg-danger-soft px-4 py-2.5 text-sm font-semibold text-danger hover:border-danger/50";

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: value.includes("T") ? "short" : undefined,
  }).format(date);
}

function joinLines(values: string[]) {
  return values.join("\n");
}

function escapeCsvCell(value: string | number | boolean | null | undefined) {
  const stringValue = value == null ? "" : String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function createCsv(
  rows: Array<Record<string, string | number | boolean | null | undefined>>,
) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvCell(row[header])).join(",")),
  ].join("\n");
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function PaginationControls({
  currentPage,
  totalPages,
  onChange,
}: {
  currentPage: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, currentPage - 1))}
        disabled={currentPage <= 1}
        className="rounded-md border border-border bg-muted px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Previous
      </button>
      <div className="text-xs text-muted-foreground">
        Page {currentPage} / {totalPages}
      </div>
      <button
        type="button"
        onClick={() => onChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage >= totalPages}
        className="rounded-md border border-border bg-muted px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/70 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Next
      </button>
    </div>
  );
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function MetricCard({
  label,
  value,
  helper,
  tone = "default",
}: {
  label: string;
  value: string | number;
  helper?: string;
  tone?: "default" | "success" | "warning";
}) {
  const valueClassName =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : "text-foreground";

  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className={`mt-3 text-3xl font-bold ${valueClassName}`}>{value}</div>
      {helper ? <div className="mt-2 text-sm text-muted-foreground">{helper}</div> : null}
    </div>
  );
}

function EmptyState({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-8 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export default function CatalogAdminClient({
  error,
  initialProducts,
  initialImportSources,
  initialImportSourceSummary,
  initialImportRuns,
  initialMergeAudits,
  initialDuplicateCandidates,
  businessTypes,
  initialSelectedProductId,
  initialPriceSnapshots,
  initialFilters,
  importSourceTypeOptions,
  productSourceTypeOptions,
  priceKindOptions,
  onCreateImportSource,
  onCreateProduct,
  onPreviewImport,
  onImportProducts,
  onBulkSetProductActiveState,
  onBulkUpdateProductMetadata,
  onBulkRestoreArchivedProducts,
  onBulkDeleteProducts,
  onMergeProducts,
  onRestoreArchivedProduct,
  onUpdateProduct,
  onDeleteProduct,
  onCreatePriceSnapshot,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [productDrawerMode, setProductDrawerMode] = useState<"create" | "edit">("create");
  const [isProductDrawerOpen, setProductDrawerOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [importPayload, setImportPayload] = useState("");
  const [importPayloadFormat, setImportPayloadFormat] =
    useState<CatalogImportPayloadFormat>("json");
  const [bulkImportSourceId, setBulkImportSourceId] = useState(KEEP_BULK_VALUE);
  const [bulkSourceType, setBulkSourceType] = useState(KEEP_BULK_VALUE);
  const [importDefaultBusinessType, setImportDefaultBusinessType] = useState("");
  const [importDefaultImportSourceId, setImportDefaultImportSourceId] = useState("");
  const [importDefaultSourceType, setImportDefaultSourceType] =
    useState<CatalogProductSource>("imported");
  const [importMode, setImportMode] = useState<"skip" | "upsert">("skip");
  const [importError, setImportError] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<CatalogImportPreviewResult | null>(null);
  const [mergeNote, setMergeNote] = useState("");
  const [selectedMergeAuditId, setSelectedMergeAuditId] = useState<string | null>(null);
  const [productPage, setProductPage] = useState(() => {
    const selectedIndex = initialProducts.findIndex(
      (product) => product.id === initialSelectedProductId,
    );
    return selectedIndex < 0 ? 1 : Math.floor(selectedIndex / PRODUCT_PAGE_SIZE) + 1;
  });
  const [previewPage, setPreviewPage] = useState(1);
  const [snapshotPage, setSnapshotPage] = useState(1);

  const selectedProduct =
    initialProducts.find((product) => product.id === initialSelectedProductId) ??
    initialProducts[0] ??
    null;
  const editingSource =
    initialImportSources.find((source) => source.id === editingSourceId) ?? null;
  const selectedMergeAudit =
    initialMergeAudits.find((audit) => audit.id === selectedMergeAuditId) ?? null;
  const duplicateCandidates = initialDuplicateCandidates;
  const activeBusinessTypes = businessTypes.filter((item) => item.isActive);
  const activeProductCount = initialProducts.filter((item) => item.isActive).length;
  const archivedProductCount = initialProducts.filter(
    (item) => item.mergedIntoCatalogProductId,
  ).length;
  const productsWithPricesCount = initialProducts.filter((item) => item.latestPrice).length;
  const selectedProductIsArchived = Boolean(selectedProduct?.mergedIntoCatalogProductId);

  const paginatedProducts = useMemo(() => {
    const start = (productPage - 1) * PRODUCT_PAGE_SIZE;
    return initialProducts.slice(start, start + PRODUCT_PAGE_SIZE);
  }, [initialProducts, productPage]);

  const paginatedPreviewItems = useMemo(() => {
    if (!importPreview) return [];
    const start = (previewPage - 1) * PREVIEW_PAGE_SIZE;
    return importPreview.items.slice(start, start + PREVIEW_PAGE_SIZE);
  }, [importPreview, previewPage]);

  const paginatedSnapshots = useMemo(() => {
    const start = (snapshotPage - 1) * SNAPSHOT_PAGE_SIZE;
    return initialPriceSnapshots.slice(start, start + SNAPSHOT_PAGE_SIZE);
  }, [initialPriceSnapshots, snapshotPage]);

  const productTotalPages = Math.max(1, Math.ceil(initialProducts.length / PRODUCT_PAGE_SIZE));
  const previewTotalPages = Math.max(
    1,
    Math.ceil((importPreview?.items.length ?? 0) / PREVIEW_PAGE_SIZE),
  );
  const snapshotTotalPages = Math.max(
    1,
    Math.ceil(initialPriceSnapshots.length / SNAPSHOT_PAGE_SIZE),
  );

  const importEditorPlaceholder =
    importPayloadFormat === "csv"
      ? `name,businessType,brand,category,packSize,defaultBaseUnit,popularityScore,sourceType,externalRef,aliases,barcodes,isActive
Fresh Milk,mini_grocery,Farm Fresh,Dairy,1L,liter,80,imported,feed-001,milk | fresh milk,8901234567890,true`
      : `[
  {
    "name": "Fresh Milk",
    "businessType": "mini_grocery",
    "brand": "Farm Fresh",
    "category": "Dairy",
    "packSize": "1L",
    "defaultBaseUnit": "liter",
    "barcodes": ["8901234567890"],
    "aliases": ["milk", "fresh milk"],
    "externalRef": "feed-001"
  }
]`;

  async function runAction(
    action: (formData: FormData) => Promise<void> | void,
    formData: FormData,
    successMessage: string,
    resetForm?: HTMLFormElement | null,
    afterSuccess?: () => void,
  ) {
    setStatus(null);

    startTransition(async () => {
      try {
        await action(formData);
        resetForm?.reset();
        afterSuccess?.();
        setStatus(successMessage);
        router.refresh();
      } catch (err: any) {
        setStatus(err?.message || "Action failed.");
      }
    });
  }

  function buildNextUrl(updates: Record<string, string | null | undefined>) {
    const params = new URLSearchParams(searchParams?.toString() || "");

    for (const [key, value] of Object.entries(updates)) {
      const cleaned = value?.trim();
      if (!cleaned) {
        params.delete(key);
        continue;
      }
      params.set(key, cleaned);
    }

    const next = params.toString();
    return next ? `${pathname}?${next}` : pathname;
  }

  function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const query = formData.get("q")?.toString() ?? "";
    const businessType = formData.get("businessType")?.toString() ?? "all";
    const sourceType = formData.get("sourceType")?.toString() ?? "all";
    const activity = formData.get("activity")?.toString() ?? "active";
    const mergeState = formData.get("mergeState")?.toString() ?? "active";

    startTransition(() => {
      router.push(
        buildNextUrl({
          q: query || null,
          businessType: businessType === "all" ? null : businessType,
          sourceType: sourceType === "all" ? null : sourceType,
          activity: activity === "active" ? null : activity,
          mergeState: mergeState === "active" ? null : mergeState,
          productId: null,
        }),
      );
    });
  }

  function handleQuickSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const query = formData.get("q")?.toString() ?? "";

    startTransition(() => {
      router.push(
        buildNextUrl({
          q: query || null,
          productId: null,
        }),
      );
    });
  }

  function handleResetFilters() {
    startTransition(() => {
      router.push(pathname);
    });
  }

  function handleSelectProduct(productId: string) {
    startTransition(() => {
      setSnapshotPage(1);
      setMergeNote("");
      router.push(buildNextUrl({ productId }));
    });
  }

  function openCreateProductDrawer() {
    setProductDrawerMode("create");
    setProductDrawerOpen(true);
    setActiveTab("products");
  }

  function openEditProductDrawer(productId?: string) {
    if (productId) handleSelectProduct(productId);
    setProductDrawerMode("edit");
    setProductDrawerOpen(true);
    setActiveTab("products");
  }

  function handleCreateSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runAction(
      onCreateImportSource,
      new FormData(event.currentTarget),
      "Import source saved.",
      event.currentTarget,
      () => setEditingSourceId(null),
    );
  }

  function handleCreateProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runAction(
      onCreateProduct,
      new FormData(event.currentTarget),
      "Catalog product created.",
      event.currentTarget,
      () => setProductDrawerOpen(false),
    );
  }

  function resetImportFeedback() {
    setImportError(null);
    setImportNotice(null);
  }

  function handlePreviewCatalogImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetImportFeedback();
    setImportPreview(null);

    const defaultBusinessType = importDefaultBusinessType.trim() || null;
    const { items, errors, duplicateCount } = parseCatalogImportPayload(
      importPayload,
      importPayloadFormat,
      defaultBusinessType,
    );

    if (errors.length > 0) {
      setImportError(errors.slice(0, MAX_IMPORT_ERRORS).join(" | "));
      return;
    }

    if (items.length === 0) {
      setImportError(
        `No valid catalog products found in the ${importPayloadFormat.toUpperCase()} payload.`,
      );
      return;
    }

    startTransition(async () => {
      try {
        const preview = await onPreviewImport({
          items,
          defaultBusinessType,
          defaultImportSourceId: importDefaultImportSourceId || null,
          defaultSourceType: importDefaultSourceType,
          payloadFormat: importPayloadFormat,
          mode: importMode,
        });
        setImportPreview(preview);
        setPreviewPage(1);
        const parts = [
          `${preview.createCount} create`,
          `${preview.updateCount} update`,
          `${preview.skipCount} skip`,
        ];
        if (duplicateCount > 0) {
          parts.push(`${duplicateCount} duplicate rows removed locally`);
        }
        setImportNotice(`Preview ready: ${parts.join(" · ")}.`);
      } catch (err: any) {
        setImportError(err?.message || "Import preview failed.");
      }
    });
  }

  function handleApplyCatalogImport() {
    resetImportFeedback();

    const defaultBusinessType = importDefaultBusinessType.trim() || null;
    const { items, errors } = parseCatalogImportPayload(
      importPayload,
      importPayloadFormat,
      defaultBusinessType,
    );

    if (errors.length > 0) {
      setImportError(errors.slice(0, MAX_IMPORT_ERRORS).join(" | "));
      return;
    }

    if (items.length === 0) {
      setImportError(
        `No valid catalog products found in the ${importPayloadFormat.toUpperCase()} payload.`,
      );
      return;
    }

    startTransition(async () => {
      try {
        const result = await onImportProducts({
          items,
          defaultBusinessType,
          defaultImportSourceId: importDefaultImportSourceId || null,
          defaultSourceType: importDefaultSourceType,
          payloadFormat: importPayloadFormat,
          mode: importMode,
        });
        const parts = [
          `${result.createdCount} created`,
          `${result.updatedCount} updated`,
          `${result.skippedCount} skipped`,
        ];
        if (result.invalidCount > 0) {
          parts.push(`${result.invalidCount} invalid`);
        }
        setImportNotice(`Import complete: ${parts.join(" · ")}. Logged to recent import history.`);
        setImportPreview(null);
        setPreviewPage(1);
        setImportPayload("");
        router.refresh();
      } catch (err: any) {
        setImportError(err?.message || "Catalog import failed.");
      }
    });
  }

  function handleUpdateProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runAction(
      onUpdateProduct,
      new FormData(event.currentTarget),
      "Catalog product updated.",
      undefined,
      () => setProductDrawerOpen(false),
    );
  }

  function handleCreateSnapshot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runAction(
      onCreatePriceSnapshot,
      new FormData(event.currentTarget),
      "Price snapshot added.",
      event.currentTarget,
    );
  }

  function handleDeleteProduct() {
    if (!selectedProduct) return;
    if (!window.confirm(`Delete catalog product "${selectedProduct.name}"?`)) return;

    const formData = new FormData();
    formData.set("id", selectedProduct.id);
    void runAction(onDeleteProduct, formData, "Catalog product deleted.", undefined, () =>
      setProductDrawerOpen(false),
    );
  }

  function handleRestoreArchivedProduct() {
    if (!selectedProduct?.mergedIntoCatalogProductId) return;
    if (
      !window.confirm(
        `Restore archived catalog product "${selectedProduct.name}" as an active standalone record?`,
      )
    ) {
      return;
    }

    setStatus(null);
    startTransition(async () => {
      try {
        await onRestoreArchivedProduct(selectedProduct.id);
        setStatus(`Catalog product "${selectedProduct.name}" restored from archive.`);
        router.refresh();
      } catch (err: any) {
        setStatus(err?.message || "Restore failed.");
      }
    });
  }

  function handleDownloadImportTemplate() {
    const templateBusinessType =
      importDefaultBusinessType || activeBusinessTypes[0]?.key || null;
    if (importPayloadFormat === "csv") {
      downloadTextFile(
        "catalog-import-template.csv",
        createCatalogImportCsvTemplate(templateBusinessType),
        "text/csv;charset=utf-8",
      );
      return;
    }

    const template = createCatalogImportTemplate(templateBusinessType);
    downloadTextFile(
      "catalog-import-template.json",
      JSON.stringify(template, null, 2),
      "application/json;charset=utf-8",
    );
  }

  function handleLoadImportTemplate() {
    const templateBusinessType =
      importDefaultBusinessType || activeBusinessTypes[0]?.key || null;
    if (importPayloadFormat === "csv") {
      setImportPayload(createCatalogImportCsvTemplate(templateBusinessType));
    } else {
      const template = createCatalogImportTemplate(templateBusinessType);
      setImportPayload(JSON.stringify(template, null, 2));
    }
    setImportPreview(null);
    setPreviewPage(1);
    setImportError(null);
    setImportNotice(
      `${importPayloadFormat.toUpperCase()} sample import template loaded into the editor.`,
    );
  }

  function handleBulkSetLoadedProducts(isActive: boolean) {
    if (initialProducts.length === 0) return;
    const label = isActive ? "activate" : "deactivate";
    if (!window.confirm(`Apply ${label} to all ${initialProducts.length} loaded products?`)) {
      return;
    }

    setStatus(null);
    startTransition(async () => {
      try {
        const result = await onBulkSetProductActiveState({
          ids: initialProducts.map((product) => product.id),
          isActive,
        });
        setStatus(
          `${result.updatedCount} catalog products marked as ${
            result.isActive ? "active" : "inactive"
          }.`,
        );
        router.refresh();
      } catch (err: any) {
        setStatus(err?.message || "Bulk catalog update failed.");
      }
    });
  }

  function handleBulkUpdateLoadedMetadata() {
    if (initialProducts.length === 0) return;

    const sourceType =
      bulkSourceType === KEEP_BULK_VALUE
        ? undefined
        : (bulkSourceType as CatalogProductSource);
    const importSourceId =
      bulkImportSourceId === KEEP_BULK_VALUE
        ? undefined
        : bulkImportSourceId === CLEAR_BULK_VALUE
          ? null
          : bulkImportSourceId;

    if (sourceType === undefined && importSourceId === undefined) {
      setStatus("Choose a source type or import source change first.");
      return;
    }

    if (
      !window.confirm(
        `Apply metadata updates to all ${initialProducts.length} loaded catalog products?`,
      )
    ) {
      return;
    }

    setStatus(null);
    startTransition(async () => {
      try {
        const result = await onBulkUpdateProductMetadata({
          ids: initialProducts.map((product) => product.id),
          ...(importSourceId !== undefined ? { importSourceId } : {}),
          ...(sourceType !== undefined ? { sourceType } : {}),
        });
        const parts = [`${result.updatedCount} products updated`];
        if (importSourceId !== undefined) {
          parts.push(importSourceId ? "import source reassigned" : "import source cleared");
        }
        if (sourceType !== undefined) {
          parts.push(`source type set to ${sourceType}`);
        }
        setStatus(parts.join(" · "));
        router.refresh();
      } catch (err: any) {
        setStatus(err?.message || "Bulk metadata update failed.");
      }
    });
  }

  function handleBulkRestoreLoadedArchivedProducts() {
    const archivedIds = initialProducts
      .filter((product) => product.mergedIntoCatalogProductId)
      .map((product) => product.id);

    if (archivedIds.length === 0) {
      setStatus("No archived products in the loaded list.");
      return;
    }

    if (
      !window.confirm(
        `Restore ${archivedIds.length} archived catalog products from the loaded list?`,
      )
    ) {
      return;
    }

    setStatus(null);
    startTransition(async () => {
      try {
        const result = await onBulkRestoreArchivedProducts(archivedIds);
        setStatus(`${result.restoredCount} archived catalog products restored.`);
        router.refresh();
      } catch (err: any) {
        setStatus(err?.message || "Bulk restore failed.");
      }
    });
  }

  function handleBulkDeleteLoadedProducts() {
    if (initialProducts.length === 0) return;

    if (
      !window.confirm(
        "Delete loaded catalog products only where safe? Linked or protected products will be skipped.",
      )
    ) {
      return;
    }

    setStatus(null);
    startTransition(async () => {
      try {
        const result = await onBulkDeleteProducts(initialProducts.map((product) => product.id));
        const parts = [`${result.deletedCount} deleted`, `${result.skippedCount} skipped`];
        if (result.linkedCount > 0) parts.push(`${result.linkedCount} linked`);
        if (result.protectedCount > 0) {
          parts.push(`${result.protectedCount} protected by merged children`);
        }
        setStatus(`Bulk cleanup complete: ${parts.join(" · ")}.`);
        router.refresh();
      } catch (err: any) {
        setStatus(err?.message || "Bulk cleanup failed.");
      }
    });
  }

  function handleMergeIntoSelected(
    sourceProductId: string,
    sourceProductName: string,
    mode: "archive" | "delete",
  ) {
    if (!selectedProduct) return;
    if (
      !window.confirm(
        mode === "delete"
          ? `Hard-merge "${sourceProductName}" into "${selectedProduct.name}"? This moves linked records and permanently deletes the source product.`
          : `Archive-merge "${sourceProductName}" into "${selectedProduct.name}"? This moves linked records and archives the source product for audit/history.`,
      )
    ) {
      return;
    }

    setStatus(null);
    startTransition(async () => {
      try {
        const result = await onMergeProducts({
          targetProductId: selectedProduct.id,
          sourceProductId,
          mode,
          note: mergeNote.trim() || null,
        });
        setStatus(
          `${mode === "delete" ? "Hard merge" : "Archive merge"} complete for "${
            selectedProduct.name
          }" · ${result.movedTemplateCount} templates, ${result.movedShopProductCount} shop products, ${result.movedSnapshotCount} snapshots moved.`,
        );
        setMergeNote("");
        router.refresh();
      } catch (err: any) {
        setStatus(err?.message || "Catalog merge failed.");
      }
    });
  }

  function handleExportImportSources(format: "json" | "csv") {
    if (format === "json") {
      downloadTextFile(
        "catalog-import-sources.json",
        JSON.stringify(initialImportSources, null, 2),
        "application/json;charset=utf-8",
      );
      return;
    }

    downloadTextFile(
      "catalog-import-sources.csv",
      createCsv(
        initialImportSources.map((source) => ({
          id: source.id,
          slug: source.slug,
          name: source.name,
          type: source.type,
          notes: source.notes ?? "",
          importedAt: source.importedAt ?? "",
          updatedAt: source.updatedAt,
        })),
      ),
      "text/csv;charset=utf-8",
    );
  }

  function handleExportImportRuns(format: "json" | "csv") {
    if (format === "json") {
      downloadTextFile(
        "catalog-import-runs.json",
        JSON.stringify(initialImportRuns, null, 2),
        "application/json;charset=utf-8",
      );
      return;
    }

    downloadTextFile(
      "catalog-import-runs.csv",
      createCsv(
        initialImportRuns.map((run) => ({
          id: run.id,
          createdAt: run.createdAt,
          payloadFormat: run.payloadFormat,
          importMode: run.importMode,
          submittedCount: run.submittedCount,
          validCount: run.validCount,
          invalidCount: run.invalidCount,
          duplicateInputCount: run.duplicateInputCount,
          createdCount: run.createdCount,
          updatedCount: run.updatedCount,
          skippedCount: run.skippedCount,
          errorCount: run.errorCount,
          defaultBusinessType: run.defaultBusinessType ?? "",
          defaultImportSource: run.defaultImportSource?.name ?? run.defaultImportSourceLabel ?? "",
          defaultSourceType: run.defaultSourceType ?? "",
          importedBy: run.importedByLabel ?? run.importedByUserId ?? "",
          errorSummary: run.errorSummary ?? "",
        })),
      ),
      "text/csv;charset=utf-8",
    );
  }

  function handleExportProducts(format: "json" | "csv") {
    if (format === "json") {
      downloadTextFile(
        "catalog-products.json",
        JSON.stringify(initialProducts, null, 2),
        "application/json;charset=utf-8",
      );
      return;
    }

    downloadTextFile(
      "catalog-products.csv",
      createCsv(
        initialProducts.map((product) => ({
          id: product.id,
          businessType: product.businessType ?? "",
          name: product.name,
          brand: product.brand ?? "",
          category: product.category ?? "",
          packSize: product.packSize ?? "",
          baseUnit: product.defaultBaseUnit ?? "",
          sourceType: product.sourceType,
          importSource: product.importSource?.name ?? "",
          externalRef: product.externalRef ?? "",
          aliases: product.aliases.map((item) => item.alias).join(" | "),
          barcodes: product.barcodes.map((item) => item.code).join(" | "),
          latestPrice: product.latestPrice ?? "",
          latestPriceKind: product.latestPriceKind ?? "",
          isActive: product.isActive,
          updatedAt: product.updatedAt,
        })),
      ),
      "text/csv;charset=utf-8",
    );
  }

  function handleExportSnapshots(format: "json" | "csv") {
    if (!selectedProduct) return;

    if (format === "json") {
      downloadTextFile(
        `catalog-price-snapshots-${selectedProduct.id}.json`,
        JSON.stringify(initialPriceSnapshots, null, 2),
        "application/json;charset=utf-8",
      );
      return;
    }

    downloadTextFile(
      `catalog-price-snapshots-${selectedProduct.id}.csv`,
      createCsv(
        initialPriceSnapshots.map((snapshot) => ({
          id: snapshot.id,
          businessType: snapshot.businessType ?? "",
          regionCode: snapshot.regionCode ?? "",
          priceKind: snapshot.priceKind,
          price: snapshot.price,
          currency: snapshot.currency,
          sourceLabel: snapshot.sourceLabel ?? "",
          importSource: snapshot.importSource?.name ?? "",
          observedAt: snapshot.observedAt,
          createdAt: snapshot.createdAt,
        })),
      ),
      "text/csv;charset=utf-8",
    );
  }

  function handleExportPreview(format: "json" | "csv") {
    if (!importPreview) return;

    if (format === "json") {
      downloadTextFile(
        "catalog-import-preview.json",
        JSON.stringify(importPreview, null, 2),
        "application/json;charset=utf-8",
      );
      return;
    }

    downloadTextFile(
      "catalog-import-preview.csv",
      createCsv(
        importPreview.items.map((item) => ({
          rowNumber: item.rowNumber,
          name: item.name,
          businessType: item.businessType ?? "",
          action: item.action,
          matchedBy: item.matchedBy ?? "",
          matchedProductId: item.matchedProductId ?? "",
          reasons: item.reasons.join(" | "),
        })),
      ),
      "text/csv;charset=utf-8",
    );
  }

  function renderOverviewTab() {
    return (
      <section className="space-y-6 py-2">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Catalog products"
            value={initialProducts.length}
            helper="Loaded result set after current filters."
          />
          <MetricCard
            label="Active products"
            value={activeProductCount}
            tone="success"
            helper="Ready for catalog-assisted shop creation flows."
          />
          <MetricCard
            label="Import sources"
            value={initialImportSources.length}
            helper="Tracked feeds and manual source records."
          />
          <MetricCard
            label="Price coverage"
            value={productsWithPricesCount}
            tone="warning"
            helper="Loaded products with at least one snapshot."
          />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr,0.85fr]">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-5">
              <h2 className="text-xl font-semibold text-foreground">Recent operational pulse</h2>
              <p className="text-sm text-muted-foreground">
                Imports and merge work now live in separate spaces, but the latest activity still
                stays visible here.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <div className="mb-3 text-sm font-semibold text-foreground">Latest import runs</div>
                {initialImportRuns.length === 0 ? (
                  <EmptyState>No import activity yet.</EmptyState>
                ) : (
                  <div className="space-y-3">
                    {initialImportRuns.slice(0, 5).map((run) => (
                      <div key={run.id} className="rounded-2xl border border-border bg-card p-4">
                        <div className="font-semibold text-foreground">
                          {run.payloadFormat.toUpperCase()} · {run.importMode}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {formatDate(run.createdAt)} ·{" "}
                          {run.importedByLabel || run.importedByUserId || "unknown"}
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          {run.createdCount} create · {run.updatedCount} update · {run.skippedCount} skip
                        </div>
                        {run.errorSummary ? (
                          <div className="mt-2 text-xs text-danger">Errors: {run.errorSummary}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <div className="mb-3 text-sm font-semibold text-foreground">Latest merge actions</div>
                {initialMergeAudits.length === 0 ? (
                  <EmptyState>No merge actions recorded yet.</EmptyState>
                ) : (
                  <div className="space-y-3">
                    {initialMergeAudits.slice(0, 5).map((audit) => (
                      <div key={audit.id} className="rounded-2xl border border-border bg-card p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-foreground">
                              {audit.sourceProductNameSnapshot} → {audit.targetProductNameSnapshot}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {formatDate(audit.createdAt)}
                            </div>
                          </div>
                          <div
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              audit.mergeMode === "archive"
                                ? "bg-primary-soft text-primary"
                                : "bg-danger-soft text-danger"
                            }`}
                          >
                            {audit.mergeMode}
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          {audit.movedTemplateCount} templates · {audit.movedShopProductCount} shop
                          products · {audit.movedSnapshotCount} snapshots moved
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-foreground">Alerts and next actions</h2>
                <p className="text-sm text-muted-foreground">
                  Hide everything else. Keep only what needs attention right now.
                </p>
              </div>
              <div className="space-y-3">
                <div className="rounded-2xl border border-border bg-muted/20 p-4">
                  <div className="text-sm font-semibold text-foreground">
                    {archivedProductCount} archived products in the loaded result
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Review merged rows from the duplicate workspace or restore if needed.
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-muted/20 p-4">
                  <div className="text-sm font-semibold text-foreground">
                    {duplicateCandidates.length} duplicate candidates for the selected product
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Duplicate review is now isolated from product editing, so merge decisions are
                    easier to compare.
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-muted/20 p-4">
                  <div className="text-sm font-semibold text-foreground">
                    {initialImportRuns.filter((run) => run.errorCount > 0).length} recent import
                    runs with errors
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Open the imports workspace to inspect payload issues without losing context.
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-foreground">Source footprint</h2>
                <p className="text-sm text-muted-foreground">
                  Quick source-level coverage without opening the import form.
                </p>
              </div>
              <div className="space-y-3">
                {initialImportSourceSummary.length === 0 ? (
                  <EmptyState>No source summary yet.</EmptyState>
                ) : (
                  initialImportSourceSummary.slice(0, 6).map((source) => (
                    <div key={source.id} className="rounded-2xl border border-border bg-muted/20 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-foreground">{source.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {source.slug} · {source.type}
                          </div>
                        </div>
                        <div className="text-right text-xs text-muted-foreground">
                          <div>Catalog {formatDate(source.latestCatalogUpdateAt)}</div>
                          <div>Snapshot {formatDate(source.latestSnapshotObservedAt)}</div>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span className="rounded-full border border-border px-3 py-1">
                          Products {source.productCount}
                        </span>
                        <span className="rounded-full border border-border px-3 py-1">
                          Active {source.activeProductCount}
                        </span>
                        <span className="rounded-full border border-border px-3 py-1">
                          Snapshots {source.snapshotCount}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  function renderProductsTab() {
    return (
      <section className="space-y-6 py-2">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr,0.8fr]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">Products workspace</h2>
                  <p className="text-sm text-muted-foreground">
                    The list stays full-width, and editing moves into a drawer so the page no
                    longer feels overloaded.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleBulkSetLoadedProducts(true)}
                    disabled={isPending}
                    className={PRIMARY_BUTTON_CLASS}
                  >
                    Activate loaded
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkSetLoadedProducts(false)}
                    disabled={isPending}
                    className={MUTED_BUTTON_CLASS}
                  >
                    Deactivate loaded
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportProducts("csv")}
                    className={MUTED_BUTTON_CLASS}
                  >
                    Export CSV
                  </button>
                </div>
              </div>

              <form
                key={`${initialFilters.query}:${initialFilters.businessType}:${initialFilters.sourceType}:${initialFilters.activity}:${initialFilters.mergeState}`}
                className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-6"
                onSubmit={handleApplyFilters}
              >
                <input
                  name="q"
                  type="text"
                  defaultValue={initialFilters.query}
                  placeholder="Search name, alias, barcode"
                  className={`${INPUT_CLASS} md:col-span-2`}
                />
                <select
                  name="businessType"
                  defaultValue={initialFilters.businessType}
                  className={INPUT_CLASS}
                >
                  <option value="all">All business types</option>
                  <option value="__global__">Global only</option>
                  {activeBusinessTypes.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  name="sourceType"
                  defaultValue={initialFilters.sourceType}
                  className={INPUT_CLASS}
                >
                  <option value="all">All sources</option>
                  {productSourceTypeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <select
                  name="activity"
                  defaultValue={initialFilters.activity}
                  className={INPUT_CLASS}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="all">All</option>
                </select>
                <select
                  name="mergeState"
                  defaultValue={initialFilters.mergeState}
                  className={INPUT_CLASS}
                >
                  <option value="active">Active only</option>
                  <option value="merged">Merged / archived only</option>
                  <option value="all">Active + merged</option>
                </select>
                <div className="md:col-span-6 flex flex-wrap gap-3">
                  <button type="submit" disabled={isPending} className={PRIMARY_BUTTON_CLASS}>
                    Apply filters
                  </button>
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    disabled={isPending}
                    className={MUTED_BUTTON_CLASS}
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={openCreateProductDrawer}
                    className={SOLID_PRIMARY_BUTTON_CLASS}
                  >
                    Add product
                  </button>
                </div>
              </form>

              <div className="mt-5 overflow-hidden rounded-2xl border border-border">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border text-sm">
                    <thead className="bg-muted/50">
                      <tr className="text-left text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        <th className="px-4 py-3">Product</th>
                        <th className="px-4 py-3">Business / source</th>
                        <th className="px-4 py-3">Signals</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Updated</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-card">
                      {paginatedProducts.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                            No catalog products match the current filters.
                          </td>
                        </tr>
                      ) : (
                        paginatedProducts.map((product) => {
                          const isSelected = selectedProduct?.id === product.id;
                          return (
                            <tr
                              key={product.id}
                              className={isSelected ? "bg-primary-soft/30" : "hover:bg-muted/30"}
                            >
                              <td className="px-4 py-4 align-top">
                                <div className="font-semibold text-foreground">{product.name}</div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {[product.brand, product.category, product.packSize]
                                    .filter(Boolean)
                                    .join(" · ") || "No brand/category/pack size"}
                                </div>
                              </td>
                              <td className="px-4 py-4 align-top text-xs text-muted-foreground">
                                <div>{product.businessType ?? "global"}</div>
                                <div className="mt-1">{product.sourceType}</div>
                                <div className="mt-1">
                                  {product.importSource?.name ?? "No import source"}
                                </div>
                              </td>
                              <td className="px-4 py-4 align-top text-xs text-muted-foreground">
                                <div>
                                  Aliases:{" "}
                                  {product.aliases.length
                                    ? product.aliases.slice(0, 3).map((item) => item.alias).join(", ")
                                    : "none"}
                                </div>
                                <div className="mt-1">
                                  Barcodes:{" "}
                                  {product.barcodes.length
                                    ? product.barcodes.slice(0, 3).map((item) => item.code).join(", ")
                                    : "none"}
                                </div>
                                <div className="mt-1">
                                  Price:{" "}
                                  {product.latestPrice
                                    ? `${product.latestPrice} ${product.latestPriceKind ?? ""}`
                                    : "none"}
                                </div>
                              </td>
                              <td className="px-4 py-4 align-top">
                                <span
                                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                    product.mergedIntoCatalogProductId
                                      ? "bg-warning-soft text-warning"
                                      : product.isActive
                                        ? "bg-success-soft text-success"
                                        : "bg-danger-soft text-danger"
                                  }`}
                                >
                                  {product.mergedIntoCatalogProductId
                                    ? "Merged / archived"
                                    : product.isActive
                                      ? "Active"
                                      : "Inactive"}
                                </span>
                                {product.mergedIntoCatalogProductId ? (
                                  <div className="mt-2 max-w-[15rem] text-xs text-warning">
                                    Under {product.mergedIntoCatalogProductName ?? "merge target"}
                                  </div>
                                ) : null}
                              </td>
                              <td className="px-4 py-4 align-top text-xs text-muted-foreground">
                                {formatDate(product.updatedAt)}
                              </td>
                              <td className="px-4 py-4 align-top">
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleSelectProduct(product.id)}
                                    className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
                                  >
                                    Select
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openEditProductDrawer(product.id)}
                                    className="rounded-xl border border-primary/30 bg-primary-soft px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/15"
                                  >
                                    Edit
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">
                  Showing {paginatedProducts.length} of {initialProducts.length} loaded products
                </div>
                <PaginationControls
                  currentPage={productPage}
                  totalPages={productTotalPages}
                  onChange={setProductPage}
                />
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-foreground">Bulk tools for loaded list</h3>
                <p className="text-sm text-muted-foreground">
                  Bulk actions stay separate from row-level editing and selection.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <select
                  value={bulkImportSourceId}
                  onChange={(event) => setBulkImportSourceId(event.currentTarget.value)}
                  className={INPUT_CLASS}
                >
                  <option value={KEEP_BULK_VALUE}>Keep import source</option>
                  <option value={CLEAR_BULK_VALUE}>Clear import source</option>
                  {initialImportSources.map((source) => (
                    <option key={source.id} value={source.id}>
                      Set import source: {source.name}
                    </option>
                  ))}
                </select>
                <select
                  value={bulkSourceType}
                  onChange={(event) => setBulkSourceType(event.currentTarget.value)}
                  className={INPUT_CLASS}
                >
                  <option value={KEEP_BULK_VALUE}>Keep source type</option>
                  {productSourceTypeOptions.map((option) => (
                    <option key={option} value={option}>
                      Set source type: {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleBulkUpdateLoadedMetadata}
                  disabled={isPending}
                  className={PRIMARY_BUTTON_CLASS}
                >
                  Update loaded metadata
                </button>
                <button
                  type="button"
                  onClick={handleBulkRestoreLoadedArchivedProducts}
                  disabled={isPending}
                  className={MUTED_BUTTON_CLASS}
                >
                  Restore loaded archived
                </button>
                <button
                  type="button"
                  onClick={handleBulkDeleteLoadedProducts}
                  disabled={isPending}
                  className={DANGER_BUTTON_CLASS}
                >
                  Safe cleanup delete
                </button>
              </div>

              <div className="mt-6 border-t border-border pt-6">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Selected product</h3>
                    <p className="text-sm text-muted-foreground">
                      Review here, then open the drawer only when you want to edit.
                    </p>
                  </div>
                  {selectedProduct ? (
                    <button
                      type="button"
                      onClick={() => openEditProductDrawer()}
                      className={PRIMARY_BUTTON_CLASS}
                    >
                      Edit in drawer
                    </button>
                  ) : null}
                </div>

                {!selectedProduct ? (
                  <EmptyState>Select a product from the table to inspect it here.</EmptyState>
                ) : (
                  <div className="space-y-4">
                    {selectedProductIsArchived ? (
                      <div className="rounded-2xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
                        Archived under {selectedProduct.mergedIntoCatalogProductName ?? "merge target"} on{" "}
                        {formatDate(selectedProduct.mergedAt)}.
                      </div>
                    ) : null}
                    <div>
                      <div className="text-xl font-semibold text-foreground">
                        {selectedProduct.name}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {(selectedProduct.businessType ?? "global") +
                          " · " +
                          selectedProduct.sourceType +
                          (selectedProduct.importSource ? ` · ${selectedProduct.importSource.name}` : "")}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border bg-muted/20 p-4 text-sm text-foreground">
                      <div>Brand: {selectedProduct.brand ?? "-"}</div>
                      <div className="mt-1">Category: {selectedProduct.category ?? "-"}</div>
                      <div className="mt-1">Pack size: {selectedProduct.packSize ?? "-"}</div>
                      <div className="mt-1">External ref: {selectedProduct.externalRef ?? "-"}</div>
                      <div className="mt-1">
                        Latest price:{" "}
                        {selectedProduct.latestPrice
                          ? `${selectedProduct.latestPrice} ${
                              selectedProduct.latestPriceKind ?? ""
                            } · ${formatDate(selectedProduct.latestPriceObservedAt)}`
                          : "none yet"}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => setActiveTab("duplicates")}
                        className={MUTED_BUTTON_CLASS}
                      >
                        Review duplicates
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab("prices")}
                        className={MUTED_BUTTON_CLASS}
                      >
                        Manage prices
                      </button>
                      {selectedProductIsArchived ? (
                        <button
                          type="button"
                          onClick={handleRestoreArchivedProduct}
                          disabled={isPending}
                          className={PRIMARY_BUTTON_CLASS}
                        >
                          Restore archived product
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  function renderImportsTab() {
    return (
      <section className="space-y-6 py-2">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr,1.2fr]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">Import sources</h2>
                  <p className="text-sm text-muted-foreground">
                    Source management is isolated from payload preview and product CRUD.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleExportImportSources("json")}
                    className={MUTED_BUTTON_CLASS}
                  >
                    Export JSON
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportImportSources("csv")}
                    className={MUTED_BUTTON_CLASS}
                  >
                    Export CSV
                  </button>
                </div>
              </div>

              <form
                key={editingSource?.id ?? "new-source"}
                className="space-y-3"
                onSubmit={handleCreateSource}
              >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <input
                    name="slug"
                    type="text"
                    required
                    placeholder="slug"
                    defaultValue={editingSource?.slug ?? ""}
                    className={INPUT_CLASS}
                  />
                  <input
                    name="name"
                    type="text"
                    required
                    placeholder="Human name"
                    defaultValue={editingSource?.name ?? ""}
                    className={INPUT_CLASS}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <select
                    name="type"
                    defaultValue={editingSource?.type ?? importSourceTypeOptions[0]}
                    className={INPUT_CLASS}
                  >
                    {importSourceTypeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <input
                    name="importedAt"
                    type="datetime-local"
                    defaultValue={editingSource?.importedAt ? editingSource.importedAt.slice(0, 16) : ""}
                    className={INPUT_CLASS}
                  />
                </div>
                <textarea
                  name="notes"
                  rows={3}
                  placeholder="Notes"
                  defaultValue={editingSource?.notes ?? ""}
                  className={TEXTAREA_CLASS}
                />
                <div className="flex flex-wrap gap-3">
                  <button type="submit" disabled={isPending} className={PRIMARY_BUTTON_CLASS}>
                    {editingSource ? "Update source" : "Save source"}
                  </button>
                  {editingSource ? (
                    <button
                      type="button"
                      onClick={() => setEditingSourceId(null)}
                      className={MUTED_BUTTON_CLASS}
                    >
                      Cancel edit
                    </button>
                  ) : null}
                </div>
              </form>

              <div className="mt-5 space-y-3">
                {initialImportSources.length === 0 ? (
                  <EmptyState>No import sources yet.</EmptyState>
                ) : (
                  initialImportSources.map((source) => (
                    <div key={source.id} className="rounded-2xl border border-border bg-muted/20 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-foreground">{source.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {source.slug} · {source.type}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setEditingSourceId(source.id)}
                          className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
                        >
                          Edit
                        </button>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        Updated {formatDate(source.updatedAt)} · Imported {formatDate(source.importedAt)}
                      </div>
                      {source.notes ? (
                        <div className="mt-2 text-sm text-muted-foreground">{source.notes}</div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-foreground">Source activity summary</h3>
                <p className="text-sm text-muted-foreground">
                  Review coverage without mixing this with the import payload editor.
                </p>
              </div>
              <div className="space-y-3">
                {initialImportSourceSummary.length === 0 ? (
                  <EmptyState>No source activity yet.</EmptyState>
                ) : (
                  initialImportSourceSummary.map((source) => (
                    <div key={source.id} className="rounded-2xl border border-border bg-muted/20 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-foreground">{source.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {source.slug} · {source.type}
                          </div>
                        </div>
                        <div className="text-right text-xs text-muted-foreground">
                          <div>Catalog {formatDate(source.latestCatalogUpdateAt)}</div>
                          <div>Snapshot {formatDate(source.latestSnapshotObservedAt)}</div>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span className="rounded-full border border-border px-3 py-1">
                          Products {source.productCount}
                        </span>
                        <span className="rounded-full border border-border px-3 py-1">
                          Active {source.activeProductCount}
                        </span>
                        <span className="rounded-full border border-border px-3 py-1">
                          Snapshots {source.snapshotCount}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">Import wizard</h2>
                  <p className="text-sm text-muted-foreground">
                    One path: defaults, payload, preview, validate, apply, result summary.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {["1. Source", "2. Payload", "3. Preview", "4. Validate", "5. Apply", "6. Result"].map(
                    (step) => (
                      <span
                        key={step}
                        className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground"
                      >
                        {step}
                      </span>
                    ),
                  )}
                </div>
              </div>

              <form className="space-y-5" onSubmit={handlePreviewCatalogImport}>
                <div className="rounded-2xl border border-border bg-muted/20 p-4">
                  <div className="mb-3 text-sm font-semibold text-foreground">Step 1 · Defaults</div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <select
                      value={importPayloadFormat}
                      onChange={(event) => {
                        const nextFormat = event.currentTarget.value as CatalogImportPayloadFormat;
                        setImportPayloadFormat(nextFormat);
                        setImportPreview(null);
                        setPreviewPage(1);
                        setImportError(null);
                        setImportNotice(null);
                      }}
                      className={INPUT_CLASS}
                    >
                      {IMPORT_PAYLOAD_FORMATS.map((option) => (
                        <option key={option} value={option}>
                          Format: {option.toUpperCase()}
                        </option>
                      ))}
                    </select>
                    <select
                      value={importDefaultBusinessType}
                      onChange={(event) => {
                        setImportDefaultBusinessType(event.currentTarget.value);
                        setImportPreview(null);
                        setPreviewPage(1);
                      }}
                      className={INPUT_CLASS}
                    >
                      <option value="">Default business type (optional)</option>
                      {activeBusinessTypes.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={importDefaultImportSourceId}
                      onChange={(event) => {
                        setImportDefaultImportSourceId(event.currentTarget.value);
                        setImportPreview(null);
                        setPreviewPage(1);
                      }}
                      className={INPUT_CLASS}
                    >
                      <option value="">Default import source (optional)</option>
                      {initialImportSources.map((source) => (
                        <option key={source.id} value={source.id}>
                          {source.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={importDefaultSourceType}
                      onChange={(event) => {
                        setImportDefaultSourceType(event.currentTarget.value as CatalogProductSource);
                        setImportPreview(null);
                        setPreviewPage(1);
                      }}
                      className={INPUT_CLASS}
                    >
                      {productSourceTypeOptions.map((option) => (
                        <option key={option} value={option}>
                          Default source: {option}
                        </option>
                      ))}
                    </select>
                    <select
                      value={importMode}
                      onChange={(event) => {
                        setImportMode(event.currentTarget.value as "skip" | "upsert");
                        setImportPreview(null);
                        setPreviewPage(1);
                      }}
                      className={INPUT_CLASS}
                    >
                      <option value="skip">Skip existing matches</option>
                      <option value="upsert">Update existing matches</option>
                    </select>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleLoadImportTemplate}
                        className={MUTED_BUTTON_CLASS}
                      >
                        Load sample
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadImportTemplate}
                        className={MUTED_BUTTON_CLASS}
                      >
                        Download template
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-muted/20 p-4">
                  <div className="mb-3 text-sm font-semibold text-foreground">Step 2 · Payload</div>
                  <textarea
                    value={importPayload}
                    onChange={(event) => {
                      setImportPayload(event.currentTarget.value);
                      setImportPreview(null);
                      setPreviewPage(1);
                    }}
                    rows={16}
                    placeholder={importEditorPlaceholder}
                    className="w-full rounded-2xl border border-border bg-card px-4 py-4 font-mono text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>

                <div className="rounded-2xl border border-border bg-muted/20 p-4">
                  <div className="mb-3 text-sm font-semibold text-foreground">
                    Step 3-5 · Preview, validate, apply
                  </div>
                  {importError ? (
                    <div className="mb-3 rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
                      {importError}
                    </div>
                  ) : null}
                  {importNotice ? (
                    <div className="mb-3 rounded-2xl border border-primary/30 bg-primary-soft px-4 py-3 text-sm text-primary">
                      {importNotice}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="submit"
                      disabled={isPending}
                      className={SOLID_PRIMARY_BUTTON_CLASS}
                    >
                      Preview import
                    </button>
                    <button
                      type="button"
                      onClick={handleApplyCatalogImport}
                      disabled={isPending}
                      className={MUTED_BUTTON_CLASS}
                    >
                      Apply import
                    </button>
                  </div>
                </div>
              </form>

              <div className="mt-5 rounded-2xl border border-border bg-muted/20 p-4">
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">Step 6 · Result summary</div>
                    <div className="text-xs text-muted-foreground">
                      Review create, update, and skip decisions before or after apply.
                    </div>
                  </div>
                  {importPreview ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleExportPreview("json")}
                        className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
                      >
                        Export JSON
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExportPreview("csv")}
                        className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
                      >
                        Export CSV
                      </button>
                    </div>
                  ) : null}
                </div>

                {importPreview ? (
                  <>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                      <MetricCard label="Valid rows" value={importPreview.validCount} />
                      <MetricCard label="Create" value={importPreview.createCount} tone="success" />
                      <MetricCard label="Update" value={importPreview.updateCount} />
                      <MetricCard label="Skip" value={importPreview.skipCount} tone="warning" />
                      <MetricCard label="Invalid" value={importPreview.invalidCount} />
                    </div>

                    <div className="mt-4 space-y-3">
                      {paginatedPreviewItems.map((item) => (
                        <div key={`${item.rowNumber}-${item.name}`} className="rounded-2xl border border-border bg-card p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="font-semibold text-foreground">
                                Row {item.rowNumber}: {item.name}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {item.businessType ?? "global"} · matched by {item.matchedBy ?? "none"}
                              </div>
                            </div>
                            <div
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                item.action === "create"
                                  ? "bg-success-soft text-success"
                                  : item.action === "update"
                                    ? "bg-primary-soft text-primary"
                                    : "bg-warning-soft text-warning"
                              }`}
                            >
                              {item.action}
                            </div>
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            {item.reasons.length > 0 ? item.reasons.join(" · ") : "No existing match found"}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm text-muted-foreground">
                        Preview rows: {importPreview.items.length}
                      </div>
                      <PaginationControls
                        currentPage={previewPage}
                        totalPages={previewTotalPages}
                        onChange={setPreviewPage}
                      />
                    </div>
                  </>
                ) : (
                  <EmptyState>Run a preview to see validation and create/update/skip decisions.</EmptyState>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Recent import history</h3>
                  <p className="text-sm text-muted-foreground">
                    Applied runs stay in their own audit surface instead of sitting beside live forms.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleExportImportRuns("json")}
                    className={MUTED_BUTTON_CLASS}
                  >
                    Export JSON
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExportImportRuns("csv")}
                    className={MUTED_BUTTON_CLASS}
                  >
                    Export CSV
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {initialImportRuns.length === 0 ? (
                  <EmptyState>No imports recorded yet.</EmptyState>
                ) : (
                  initialImportRuns.map((run) => (
                    <div key={run.id} className="rounded-2xl border border-border bg-muted/20 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-foreground">
                            {run.payloadFormat.toUpperCase()} · {run.importMode}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {formatDate(run.createdAt)} ·{" "}
                            {run.importedByLabel || run.importedByUserId || "unknown"}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span className="rounded-full border border-border px-3 py-1">
                            Create {run.createdCount}
                          </span>
                          <span className="rounded-full border border-border px-3 py-1">
                            Update {run.updatedCount}
                          </span>
                          <span className="rounded-full border border-border px-3 py-1">
                            Skip {run.skippedCount}
                          </span>
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        Defaults: {run.defaultBusinessType ?? "global"} ·{" "}
                        {run.defaultImportSource?.name ?? run.defaultImportSourceLabel ?? "no source"} ·{" "}
                        {run.defaultSourceType ?? "no source type"} · duplicate input{" "}
                        {run.duplicateInputCount}
                      </div>
                      {run.errorSummary ? (
                        <div className="mt-2 text-xs text-danger">Errors: {run.errorSummary}</div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  function renderDuplicatesTab() {
    if (!selectedProduct) {
      return (
        <section className="py-2">
          <EmptyState>
            Pick a catalog product from the Products tab first, then review its duplicate queue here.
          </EmptyState>
        </section>
      );
    }

    return (
      <section className="space-y-6 py-2">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.9fr,1.15fr]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">Merge queue</h2>
                  <p className="text-sm text-muted-foreground">
                    Selected product stays fixed on the left, while candidates stay in a clean queue.
                  </p>
                </div>
                <button type="button" onClick={() => openEditProductDrawer()} className={PRIMARY_BUTTON_CLASS}>
                  Edit selected
                </button>
              </div>

              {selectedProductIsArchived ? (
                <div className="mb-4 rounded-2xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
                  Archived under {selectedProduct.mergedIntoCatalogProductName ?? "merge target"} on{" "}
                  {formatDate(selectedProduct.mergedAt)}. Restore before running duplicate merges.
                </div>
              ) : null}

              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <div className="text-lg font-semibold text-foreground">{selectedProduct.name}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {(selectedProduct.businessType ?? "global") +
                    " · " +
                    (selectedProduct.brand ?? "no brand") +
                    " · " +
                    (selectedProduct.externalRef ?? "no external ref")}
                </div>
                <div className="mt-3 space-y-2 text-sm text-foreground">
                  <div>
                    Aliases:{" "}
                    {selectedProduct.aliases.length
                      ? selectedProduct.aliases.map((item) => item.alias).join(", ")
                      : "-"}
                  </div>
                  <div>
                    Barcodes:{" "}
                    {selectedProduct.barcodes.length
                      ? selectedProduct.barcodes.map((item) => item.code).join(", ")
                      : "-"}
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                <label className="block text-sm font-medium text-foreground">Merge note</label>
                <textarea
                  rows={4}
                  value={mergeNote}
                  onChange={(event) => setMergeNote(event.currentTarget.value)}
                  placeholder="Optional audit note for this merge"
                  className={TEXTAREA_CLASS}
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab("prices")}
                  className={MUTED_BUTTON_CLASS}
                >
                  Open price workspace
                </button>
                {selectedProductIsArchived ? (
                  <button
                    type="button"
                    onClick={handleRestoreArchivedProduct}
                    disabled={isPending}
                    className={PRIMARY_BUTTON_CLASS}
                  >
                    Restore archived product
                  </button>
                ) : null}
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-foreground">Recent merge audit</h3>
                <p className="text-sm text-muted-foreground">
                  The audit feed stays nearby while you work through the queue.
                </p>
              </div>

              {initialMergeAudits.length === 0 ? (
                <EmptyState>No catalog merges recorded yet.</EmptyState>
              ) : (
                <div className="space-y-3">
                  {initialMergeAudits.map((audit) => (
                    <div key={audit.id} className="rounded-2xl border border-border bg-muted/20 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-foreground">
                            {audit.sourceProductNameSnapshot} → {audit.targetProductNameSnapshot}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            By {audit.mergedByLabel || audit.mergedByUserId || "unknown"} ·{" "}
                            {formatDate(audit.createdAt)}
                          </div>
                        </div>
                        <div
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            audit.mergeMode === "archive"
                              ? "bg-primary-soft text-primary"
                              : "bg-danger-soft text-danger"
                          }`}
                        >
                          {audit.mergeMode}
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {audit.movedTemplateCount} templates · {audit.movedShopProductCount} shop
                        products · {audit.movedSnapshotCount} snapshots · {audit.movedAliasCount} aliases ·{" "}
                        {audit.movedBarcodeCount} barcodes
                      </div>
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => setSelectedMergeAuditId(audit.id)}
                          className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
                        >
                          View details
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-foreground">Potential duplicates</h2>
              <p className="text-sm text-muted-foreground">
                Compare one candidate at a time with confidence signals and explicit merge actions.
              </p>
            </div>

            {selectedProductIsArchived ? (
              <EmptyState>Restore this archived product before running duplicate merge actions again.</EmptyState>
            ) : duplicateCandidates.length === 0 ? (
              <EmptyState>No strong duplicate candidates found in the catalog for this product.</EmptyState>
            ) : (
              <div className="space-y-4">
                {duplicateCandidates.map(({ product, score, reasons }) => (
                  <div key={`duplicate-${product.id}`} className="rounded-2xl border border-border bg-muted/20 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold text-foreground">{product.name}</div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {(product.businessType ?? "global") +
                            " · " +
                            (product.brand ?? "no brand") +
                            " · confidence " +
                            score}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleMergeIntoSelected(product.id, product.name, "archive")}
                          disabled={isPending}
                          className={PRIMARY_BUTTON_CLASS}
                        >
                          Archive merge
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMergeIntoSelected(product.id, product.name, "delete")}
                          disabled={isPending}
                          className={DANGER_BUTTON_CLASS}
                        >
                          Hard delete merge
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border border-border bg-card p-4">
                        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Selected
                        </div>
                        <div className="space-y-1 text-sm text-foreground">
                          <div>Name: {selectedProduct.name}</div>
                          <div>Brand: {selectedProduct.brand ?? "-"}</div>
                          <div>External ref: {selectedProduct.externalRef ?? "-"}</div>
                          <div>
                            Aliases:{" "}
                            {selectedProduct.aliases.length
                              ? selectedProduct.aliases.slice(0, 4).map((item) => item.alias).join(", ")
                              : "-"}
                          </div>
                          <div>
                            Barcodes:{" "}
                            {selectedProduct.barcodes.length
                              ? selectedProduct.barcodes.slice(0, 4).map((item) => item.code).join(", ")
                              : "-"}
                          </div>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-border bg-card p-4">
                        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          Candidate
                        </div>
                        <div className="space-y-1 text-sm text-foreground">
                          <div>Name: {product.name}</div>
                          <div>Brand: {product.brand ?? "-"}</div>
                          <div>External ref: {product.externalRef ?? "-"}</div>
                          <div>
                            Aliases:{" "}
                            {product.aliases.length
                              ? product.aliases.slice(0, 4).map((item) => item.alias).join(", ")
                              : "-"}
                          </div>
                          <div>
                            Barcodes:{" "}
                            {product.barcodes.length
                              ? product.barcodes.slice(0, 4).map((item) => item.code).join(", ")
                              : "-"}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
                      Review signals: {reasons.join(" · ")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  function renderPricesTab() {
    if (!selectedProduct) {
      return (
        <section className="py-2">
          <EmptyState>
            Pick a catalog product from the Products tab first, then manage snapshots here.
          </EmptyState>
        </section>
      );
    }

    return (
      <section className="space-y-6 py-2">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[0.85fr,1.15fr]">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-foreground">Selected product pricing</h2>
                <p className="text-sm text-muted-foreground">
                  Price entry lives in its own workspace instead of competing with product forms and
                  duplicate cards.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleExportSnapshots("json")}
                  className={MUTED_BUTTON_CLASS}
                >
                  Export JSON
                </button>
                <button
                  type="button"
                  onClick={() => handleExportSnapshots("csv")}
                  className={MUTED_BUTTON_CLASS}
                >
                  Export CSV
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <div className="text-lg font-semibold text-foreground">{selectedProduct.name}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Latest snapshot:{" "}
                {selectedProduct.latestPrice
                  ? `${selectedProduct.latestPrice} ${
                      selectedProduct.latestPriceKind ?? ""
                    } · ${formatDate(selectedProduct.latestPriceObservedAt)}`
                  : "none yet"}
              </div>
            </div>

            <form
              key={`snapshot-${selectedProduct.id}`}
              className="mt-5 space-y-4"
              onSubmit={handleCreateSnapshot}
            >
              <input type="hidden" name="catalogProductId" value={selectedProduct.id} />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <input
                  name="price"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  placeholder="Price"
                  className={INPUT_CLASS}
                />
                <select name="priceKind" defaultValue={priceKindOptions[0]} className={INPUT_CLASS}>
                  {priceKindOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <select
                  name="businessType"
                  defaultValue={selectedProduct.businessType ?? ""}
                  className={INPUT_CLASS}
                >
                  <option value="">Global / no business type</option>
                  {activeBusinessTypes.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input name="regionCode" type="text" placeholder="Region code" className={INPUT_CLASS} />
                <input
                  name="currency"
                  type="text"
                  defaultValue="BDT"
                  placeholder="Currency"
                  className={INPUT_CLASS}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <select
                  name="importSourceId"
                  defaultValue={selectedProduct.importSource?.id ?? ""}
                  className={INPUT_CLASS}
                >
                  <option value="">No import source</option>
                  {initialImportSources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.name}
                    </option>
                  ))}
                </select>
                <input name="sourceLabel" type="text" placeholder="Source label" className={INPUT_CLASS} />
                <input name="observedAt" type="datetime-local" className={INPUT_CLASS} />
              </div>
              <button type="submit" disabled={isPending} className={PRIMARY_BUTTON_CLASS}>
                Add price snapshot
              </button>
            </form>
          </div>

          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-foreground">Recent history</h2>
              <p className="text-sm text-muted-foreground">
                Snapshot history gets a full-width review surface instead of a squeezed side card.
              </p>
            </div>

            {initialPriceSnapshots.length === 0 ? (
              <EmptyState>No snapshots recorded for this product yet.</EmptyState>
            ) : (
              <div className="space-y-3">
                {paginatedSnapshots.map((snapshot) => (
                  <div key={snapshot.id} className="rounded-2xl border border-border bg-muted/20 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-foreground">
                          {snapshot.price} {snapshot.currency}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {snapshot.priceKind}
                          {snapshot.businessType ? ` · ${snapshot.businessType}` : " · global"}
                          {snapshot.regionCode ? ` · ${snapshot.regionCode}` : ""}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Observed {formatDate(snapshot.observedAt)}
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Source: {snapshot.sourceLabel || snapshot.importSource?.name || "manual entry"}
                    </div>
                  </div>
                ))}
                <div className="pt-2">
                  <PaginationControls
                    currentPage={snapshotPage}
                    totalPages={snapshotTotalPages}
                    onChange={setSnapshotPage}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  function renderProductDrawer() {
    return (
      <div className="fixed inset-0 z-40 flex justify-end">
        <button
          type="button"
          aria-label="Close product editor"
          onClick={() => setProductDrawerOpen(false)}
          className="absolute inset-0 bg-black/35"
        />
        <div className="relative z-10 flex h-full w-full max-w-2xl flex-col border-l border-border bg-card shadow-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-5">
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                {productDrawerMode === "create" ? "Add catalog product" : "Edit catalog product"}
              </h2>
              <p className="text-sm text-muted-foreground">
                Required fields stay first; advanced metadata stays collapsed below.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setProductDrawerOpen(false)}
              className={MUTED_BUTTON_CLASS}
            >
              Close
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-6">
            {productDrawerMode === "create" ? (
              <form className="space-y-5" onSubmit={handleCreateProduct}>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <input name="name" type="text" required placeholder="Product name" className={INPUT_CLASS} />
                  <select name="businessType" defaultValue="" className={INPUT_CLASS}>
                    <option value="">All business types / global</option>
                    {activeBusinessTypes.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <input name="brand" type="text" placeholder="Brand" className={INPUT_CLASS} />
                  <input name="category" type="text" placeholder="Category" className={INPUT_CLASS} />
                  <input name="packSize" type="text" placeholder="Pack size" className={INPUT_CLASS} />
                </div>

                <details className="rounded-2xl border border-border bg-muted/20 p-4" open>
                  <summary className="cursor-pointer text-sm font-semibold text-foreground">
                    Advanced fields
                  </summary>
                  <div className="mt-4 space-y-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <input name="defaultBaseUnit" type="text" placeholder="Base unit" className={INPUT_CLASS} />
                      <select name="sourceType" defaultValue={productSourceTypeOptions[0]} className={INPUT_CLASS}>
                        {productSourceTypeOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <select name="importSourceId" defaultValue="" className={INPUT_CLASS}>
                        <option value="">No import source</option>
                        {initialImportSources.map((source) => (
                          <option key={source.id} value={source.id}>
                            {source.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <input name="externalRef" type="text" placeholder="External ref" className={INPUT_CLASS} />
                      <input
                        name="popularityScore"
                        type="number"
                        min="0"
                        step="1"
                        defaultValue="0"
                        placeholder="Popularity score"
                        className={INPUT_CLASS}
                      />
                      <input name="imageUrl" type="url" placeholder="Image URL" className={INPUT_CLASS} />
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <textarea
                        name="aliasesCsv"
                        rows={4}
                        placeholder={"Aliases, comma or newline separated\nFirst alias becomes primary"}
                        className={TEXTAREA_CLASS}
                      />
                      <textarea
                        name="barcodesCsv"
                        rows={4}
                        placeholder={"Barcodes, comma or newline separated\nFirst barcode becomes primary"}
                        className={TEXTAREA_CLASS}
                      />
                    </div>
                  </div>
                </details>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                  <label className="inline-flex items-center gap-2 text-sm text-foreground">
                    <input type="checkbox" name="isActive" className="h-4 w-4" defaultChecked />
                    <span>Active</span>
                  </label>
                  <button type="submit" disabled={isPending} className={SOLID_PRIMARY_BUTTON_CLASS}>
                    Create product
                  </button>
                </div>
              </form>
            ) : selectedProduct ? (
              <div className="space-y-5">
                {selectedProductIsArchived ? (
                  <div className="rounded-2xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
                    Archived under {selectedProduct.mergedIntoCatalogProductName ?? "merge target"} on{" "}
                    {formatDate(selectedProduct.mergedAt)}. Restore will bring this catalog product
                    back as an active standalone record, but moved templates, shop products, and
                    snapshots stay with the merge target.
                  </div>
                ) : null}

                <form key={selectedProduct.id} className="space-y-5" onSubmit={handleUpdateProduct}>
                  <input type="hidden" name="id" value={selectedProduct.id} />

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <input name="name" type="text" required defaultValue={selectedProduct.name} className={INPUT_CLASS} />
                    <select
                      name="businessType"
                      defaultValue={selectedProduct.businessType ?? ""}
                      className={INPUT_CLASS}
                    >
                      <option value="">All business types / global</option>
                      {activeBusinessTypes.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <input
                      name="brand"
                      type="text"
                      defaultValue={selectedProduct.brand ?? ""}
                      placeholder="Brand"
                      className={INPUT_CLASS}
                    />
                    <input
                      name="category"
                      type="text"
                      defaultValue={selectedProduct.category ?? ""}
                      placeholder="Category"
                      className={INPUT_CLASS}
                    />
                    <input
                      name="packSize"
                      type="text"
                      defaultValue={selectedProduct.packSize ?? ""}
                      placeholder="Pack size"
                      className={INPUT_CLASS}
                    />
                  </div>

                  <details className="rounded-2xl border border-border bg-muted/20 p-4" open>
                    <summary className="cursor-pointer text-sm font-semibold text-foreground">
                      Advanced fields
                    </summary>
                    <div className="mt-4 space-y-4">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <input
                          name="defaultBaseUnit"
                          type="text"
                          defaultValue={selectedProduct.defaultBaseUnit ?? ""}
                          placeholder="Base unit"
                          className={INPUT_CLASS}
                        />
                        <select name="sourceType" defaultValue={selectedProduct.sourceType} className={INPUT_CLASS}>
                          {productSourceTypeOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                        <select
                          name="importSourceId"
                          defaultValue={selectedProduct.importSource?.id ?? ""}
                          className={INPUT_CLASS}
                        >
                          <option value="">No import source</option>
                          {initialImportSources.map((source) => (
                            <option key={source.id} value={source.id}>
                              {source.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <input
                          name="externalRef"
                          type="text"
                          defaultValue={selectedProduct.externalRef ?? ""}
                          placeholder="External ref"
                          className={INPUT_CLASS}
                        />
                        <input
                          name="popularityScore"
                          type="number"
                          min="0"
                          step="1"
                          defaultValue={selectedProduct.popularityScore}
                          className={INPUT_CLASS}
                        />
                        <input
                          name="imageUrl"
                          type="url"
                          defaultValue={selectedProduct.imageUrl ?? ""}
                          placeholder="Image URL"
                          className={INPUT_CLASS}
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <textarea
                          name="aliasesCsv"
                          rows={4}
                          defaultValue={joinLines(selectedProduct.aliases.map((item) => item.alias))}
                          className={TEXTAREA_CLASS}
                        />
                        <textarea
                          name="barcodesCsv"
                          rows={4}
                          defaultValue={joinLines(selectedProduct.barcodes.map((item) => item.code))}
                          className={TEXTAREA_CLASS}
                        />
                      </div>
                    </div>
                  </details>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                    <label className="inline-flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        name="isActive"
                        className="h-4 w-4"
                        defaultChecked={selectedProduct.isActive}
                      />
                      <span>Active</span>
                    </label>
                    <div className="flex flex-wrap gap-3">
                      {selectedProductIsArchived ? (
                        <button
                          type="button"
                          onClick={handleRestoreArchivedProduct}
                          disabled={isPending}
                          className={PRIMARY_BUTTON_CLASS}
                        >
                          Restore archived
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={handleDeleteProduct}
                        disabled={isPending}
                        className={DANGER_BUTTON_CLASS}
                      >
                        Delete
                      </button>
                      <button type="submit" disabled={isPending} className={SOLID_PRIMARY_BUTTON_CLASS}>
                        Save changes
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            ) : (
              <EmptyState>Select a product first, then reopen the drawer in edit mode.</EmptyState>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderMergeAuditDrawer() {
    if (!selectedMergeAudit) return null;

    return (
      <div className="fixed inset-0 z-40 flex justify-end">
        <button
          type="button"
          aria-label="Close merge detail drawer"
          onClick={() => setSelectedMergeAuditId(null)}
          className="absolute inset-0 bg-black/30"
        />
        <div className="relative z-10 flex h-full w-full max-w-xl flex-col border-l border-border bg-card shadow-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Merge Details</h2>
              <p className="text-sm text-muted-foreground">
                {selectedMergeAudit.sourceProductNameSnapshot} →{" "}
                {selectedMergeAudit.targetProductNameSnapshot}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedMergeAuditId(null)}
              className="rounded-md border border-border bg-muted px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/70"
            >
              Close
            </button>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Mode</div>
                <div className="mt-1 font-semibold text-foreground">
                  {selectedMergeAudit.mergeMode}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Executed</div>
                <div className="mt-1 font-semibold text-foreground">
                  {formatDate(selectedMergeAudit.createdAt)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-muted/20 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Source snapshot
                </div>
                <div className="mt-2 text-sm text-foreground">
                  <div>{selectedMergeAudit.sourceProductNameSnapshot}</div>
                  <div className="mt-1 text-muted-foreground">
                    {selectedMergeAudit.sourceBusinessTypeSnapshot ?? "global"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    ID: {selectedMergeAudit.sourceCatalogProductId ?? "deleted"}
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted/20 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Target snapshot
                </div>
                <div className="mt-2 text-sm text-foreground">
                  <div>{selectedMergeAudit.targetProductNameSnapshot}</div>
                  <div className="mt-1 text-muted-foreground">
                    {selectedMergeAudit.targetBusinessTypeSnapshot ?? "global"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    ID: {selectedMergeAudit.targetCatalogProductId ?? "deleted"}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Templates moved</div>
                <div className="mt-1 font-semibold text-foreground">
                  {selectedMergeAudit.movedTemplateCount}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Shop products moved</div>
                <div className="mt-1 font-semibold text-foreground">
                  {selectedMergeAudit.movedShopProductCount}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Snapshots moved</div>
                <div className="mt-1 font-semibold text-foreground">
                  {selectedMergeAudit.movedSnapshotCount}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Aliases moved</div>
                <div className="mt-1 font-semibold text-foreground">
                  {selectedMergeAudit.movedAliasCount}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Barcodes moved</div>
                <div className="mt-1 font-semibold text-foreground">
                  {selectedMergeAudit.movedBarcodeCount}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">Merged by</div>
                <div className="mt-1 font-semibold text-foreground">
                  {selectedMergeAudit.mergedByLabel ||
                    selectedMergeAudit.mergedByUserId ||
                    "unknown"}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Audit note
              </div>
              <div className="mt-2 text-sm text-foreground">
                {selectedMergeAudit.note || "No note provided."}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Audit id
              </div>
              <div className="mt-2 break-all text-xs text-muted-foreground">
                {selectedMergeAudit.id}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-6">
      <div className="sticky top-0 z-30 -mx-4 border-b border-border bg-background/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto max-w-7xl space-y-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Catalog Admin
                </span>
                <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
                  Super Admin only
                </span>
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                  Catalog command center
                </h1>
                <p className="max-w-3xl text-sm text-muted-foreground">
                  Manage the global catalog through focused workspaces instead of one giant page:
                  overview, products, imports, duplicates, and price snapshots.
                </p>
              </div>
            </div>

            <div className="flex w-full flex-col gap-3 xl:max-w-3xl">
              <form className="flex flex-col gap-3 md:flex-row" onSubmit={handleQuickSearchSubmit}>
                <input
                  name="q"
                  defaultValue={initialFilters.query}
                  type="text"
                  placeholder="Search name, alias, barcode, or external ref"
                  className="min-w-0 flex-1 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <div className="flex flex-wrap gap-2">
                  <button type="submit" disabled={isPending} className={MUTED_BUTTON_CLASS}>
                    Search
                  </button>
                  <button type="button" onClick={openCreateProductDrawer} className={SOLID_PRIMARY_BUTTON_CLASS}>
                    Add product
                  </button>
                  <button type="button" onClick={() => setActiveTab("imports")} className={PRIMARY_BUTTON_CLASS}>
                    Import CSV / JSON
                  </button>
                  <button type="button" onClick={() => handleExportProducts("csv")} className={MUTED_BUTTON_CLASS}>
                    Export products
                  </button>
                </div>
              </form>

              <div className="flex flex-wrap gap-2">
                {ADMIN_TABS.map((tab) => (
                  <TabButton
                    key={tab.id}
                    active={activeTab === tab.id}
                    label={tab.label}
                    onClick={() => setActiveTab(tab.id)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-danger/30 bg-danger-soft p-4 text-danger">
          {error}
        </div>
      ) : null}

      {status ? (
        <div className="rounded-2xl border border-primary/30 bg-primary-soft p-4 text-sm font-medium text-primary">
          {status}
        </div>
      ) : null}

      {activeTab === "overview" ? renderOverviewTab() : null}
      {activeTab === "products" ? renderProductsTab() : null}
      {activeTab === "imports" ? renderImportsTab() : null}
      {activeTab === "duplicates" ? renderDuplicatesTab() : null}
      {activeTab === "prices" ? renderPricesTab() : null}

      {isProductDrawerOpen ? renderProductDrawer() : null}
      {renderMergeAuditDrawer()}
    </div>
  );
}
