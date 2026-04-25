import Link from "next/link";
import { revalidatePath } from "next/cache";
import {
  CatalogImportSourceType,
  CatalogPriceKind,
  CatalogProductSource,
} from "@prisma/client";
import { requireUser } from "@/lib/auth-session";
import { isSuperAdmin } from "@/lib/rbac";
import { listBusinessTypes } from "@/app/actions/business-types";
import {
  type CatalogBulkSetActiveStateInput,
  type CatalogBulkUpdateMetadataInput,
  type CatalogBulkImportInput,
  type CatalogBulkDeleteResult,
  type CatalogBulkRestoreResult,
  type CatalogDuplicateCandidateRow,
  type CatalogImportRunRow,
  type CatalogProductMergeAuditRow,
  type RestoreCatalogProductResult,
  type CatalogImportSourceSummaryRow,
  type MergeCatalogProductsInput,
  type CatalogPriceSnapshotRow,
  bulkSetCatalogProductsActiveState,
  bulkDeleteCatalogProductsAdmin,
  bulkRestoreArchivedCatalogProductsAdmin,
  bulkUpdateCatalogProductsMetadata,
  createCatalogImportSource,
  createCatalogPriceSnapshot,
  createCatalogProduct,
  deleteCatalogProduct,
  importCatalogProductsAdmin,
  listCatalogImportSourceSummaryAdmin,
  listCatalogImportSourcesAdmin,
  listCatalogImportRunsAdmin,
  listCatalogDuplicateCandidatesAdmin,
  listCatalogProductMergeActionsAdmin,
  listCatalogPriceSnapshotsAdmin,
  listCatalogProductsAdmin,
  mergeCatalogProductsAdmin,
  previewCatalogProductsImportAdmin,
  restoreArchivedCatalogProductAdmin,
  updateCatalogProduct,
} from "@/app/actions/catalog";
import CatalogAdminClient from "./CatalogAdminClient";

export const dynamic = "force-dynamic";

const CATALOG_PATH = "/dashboard/admin/catalog";
const IMPORT_SOURCE_TYPES = Object.values(CatalogImportSourceType);
const PRODUCT_SOURCE_TYPES = Object.values(CatalogProductSource);
const PRICE_KIND_OPTIONS = Object.values(CatalogPriceKind);

type CatalogAdminPageProps = {
  searchParams?: Promise<{
    q?: string;
    businessType?: string;
    sourceType?: string;
    activity?: string;
    mergeState?: string;
    productId?: string;
  } | undefined>;
};

function parseText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function parseOptionalText(value: FormDataEntryValue | null) {
  const parsed = parseText(value);
  return parsed || null;
}

function parseOptionalNumber(value: FormDataEntryValue | null) {
  const parsed = parseText(value);
  if (!parsed) return undefined;
  const numberValue = Number(parsed);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function parseList(value: FormDataEntryValue | null) {
  return parseText(value)
    .split(/[\r\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseCatalogAliases(value: FormDataEntryValue | null) {
  return parseList(value).map((alias, index) => ({
    alias,
    isPrimary: index === 0,
  }));
}

function parseCatalogBarcodes(value: FormDataEntryValue | null) {
  return parseList(value).map((code, index) => ({
    code,
    isPrimary: index === 0,
  }));
}

function parseEnumValue<T extends string>(
  value: FormDataEntryValue | null,
  options: readonly T[],
  fallback?: T,
) {
  const parsed = parseText(value) as T;
  if (options.includes(parsed)) return parsed;
  return fallback;
}

async function handleCreateImportSource(formData: FormData) {
  "use server";

  const slug = parseText(formData.get("slug"));
  const name = parseText(formData.get("name"));
  if (!slug || !name) return;

  await createCatalogImportSource({
    slug,
    name,
    type:
      parseEnumValue(
        formData.get("type"),
        IMPORT_SOURCE_TYPES,
        CatalogImportSourceType.manual,
      ) ?? CatalogImportSourceType.manual,
    notes: parseOptionalText(formData.get("notes")),
    importedAt: parseOptionalText(formData.get("importedAt")),
  });

  revalidatePath(CATALOG_PATH);
}

async function handleCreateCatalogProduct(formData: FormData) {
  "use server";

  const name = parseText(formData.get("name"));
  if (!name) return;

  await createCatalogProduct({
    businessType: parseOptionalText(formData.get("businessType")),
    name,
    brand: parseOptionalText(formData.get("brand")),
    category: parseOptionalText(formData.get("category")),
    packSize: parseOptionalText(formData.get("packSize")),
    defaultBaseUnit: parseOptionalText(formData.get("defaultBaseUnit")),
    imageUrl: parseOptionalText(formData.get("imageUrl")),
    popularityScore: parseOptionalNumber(formData.get("popularityScore")),
    sourceType:
      parseEnumValue(
        formData.get("sourceType"),
        PRODUCT_SOURCE_TYPES,
        CatalogProductSource.curated,
      ) ?? CatalogProductSource.curated,
    importSourceId: parseOptionalText(formData.get("importSourceId")),
    externalRef: parseOptionalText(formData.get("externalRef")),
    aliases: parseCatalogAliases(formData.get("aliasesCsv")),
    barcodes: parseCatalogBarcodes(formData.get("barcodesCsv")),
    isActive: formData.get("isActive") === "on",
  });

  revalidatePath(CATALOG_PATH);
}

async function handleUpdateCatalogProduct(formData: FormData) {
  "use server";

  const id = parseText(formData.get("id"));
  const name = parseText(formData.get("name"));
  if (!id || !name) return;

  await updateCatalogProduct(id, {
    businessType: parseOptionalText(formData.get("businessType")),
    name,
    brand: parseOptionalText(formData.get("brand")),
    category: parseOptionalText(formData.get("category")),
    packSize: parseOptionalText(formData.get("packSize")),
    defaultBaseUnit: parseOptionalText(formData.get("defaultBaseUnit")),
    imageUrl: parseOptionalText(formData.get("imageUrl")),
    popularityScore: parseOptionalNumber(formData.get("popularityScore")),
    sourceType:
      parseEnumValue(
        formData.get("sourceType"),
        PRODUCT_SOURCE_TYPES,
        CatalogProductSource.curated,
      ) ?? CatalogProductSource.curated,
    importSourceId: parseOptionalText(formData.get("importSourceId")),
    externalRef: parseOptionalText(formData.get("externalRef")),
    aliases: parseCatalogAliases(formData.get("aliasesCsv")),
    barcodes: parseCatalogBarcodes(formData.get("barcodesCsv")),
    isActive: formData.get("isActive") === "on",
  });

  revalidatePath(CATALOG_PATH);
}

async function handleDeleteCatalogProduct(formData: FormData) {
  "use server";

  const id = parseText(formData.get("id"));
  if (!id) return;

  await deleteCatalogProduct(id);
  revalidatePath(CATALOG_PATH);
}

async function handleCreatePriceSnapshot(formData: FormData) {
  "use server";

  const catalogProductId = parseText(formData.get("catalogProductId"));
  const price = parseText(formData.get("price"));
  if (!catalogProductId || !price) return;

  await createCatalogPriceSnapshot({
    catalogProductId,
    businessType: parseOptionalText(formData.get("businessType")),
    regionCode: parseOptionalText(formData.get("regionCode")),
    priceKind:
      parseEnumValue(
        formData.get("priceKind"),
        PRICE_KIND_OPTIONS,
        CatalogPriceKind.retail,
      ) ?? CatalogPriceKind.retail,
    price,
    currency: parseOptionalText(formData.get("currency")) ?? "BDT",
    importSourceId: parseOptionalText(formData.get("importSourceId")),
    sourceLabel: parseOptionalText(formData.get("sourceLabel")),
    observedAt: parseOptionalText(formData.get("observedAt")),
  });

  revalidatePath(CATALOG_PATH);
}

async function handlePreviewImport(input: CatalogBulkImportInput) {
  "use server";

  return previewCatalogProductsImportAdmin(input);
}

async function handleImportCatalogProducts(input: CatalogBulkImportInput) {
  "use server";

  const result = await importCatalogProductsAdmin(input);
  revalidatePath(CATALOG_PATH);
  return result;
}

async function handleBulkSetCatalogProductsActiveState(
  input: CatalogBulkSetActiveStateInput,
) {
  "use server";

  const result = await bulkSetCatalogProductsActiveState(input);
  revalidatePath(CATALOG_PATH);
  return result;
}

async function handleBulkUpdateCatalogProductsMetadata(
  input: CatalogBulkUpdateMetadataInput,
) {
  "use server";

  const result = await bulkUpdateCatalogProductsMetadata(input);
  revalidatePath(CATALOG_PATH);
  return result;
}

async function handleBulkRestoreArchivedCatalogProducts(
  ids: string[],
): Promise<CatalogBulkRestoreResult> {
  "use server";

  const result = await bulkRestoreArchivedCatalogProductsAdmin(ids);
  revalidatePath(CATALOG_PATH);
  return result;
}

async function handleBulkDeleteCatalogProducts(ids: string[]): Promise<CatalogBulkDeleteResult> {
  "use server";

  const result = await bulkDeleteCatalogProductsAdmin(ids);
  revalidatePath(CATALOG_PATH);
  return result;
}

async function handleMergeCatalogProducts(input: MergeCatalogProductsInput) {
  "use server";

  const result = await mergeCatalogProductsAdmin(input);
  revalidatePath(CATALOG_PATH);
  return result;
}

async function handleRestoreArchivedCatalogProduct(id: string): Promise<RestoreCatalogProductResult> {
  "use server";

  const result = await restoreArchivedCatalogProductAdmin(id);
  revalidatePath(CATALOG_PATH);
  return result;
}

export default async function CatalogAdminPage({
  searchParams,
}: CatalogAdminPageProps) {
  const user = await requireUser();

  if (!isSuperAdmin(user)) {
    return (
      <div className="py-12 text-center">
        <h1 className="mb-4 text-2xl font-bold text-foreground">Catalog Admin</h1>
        <p className="mb-2 font-semibold text-danger">অ্যাকসেস সীমাবদ্ধ</p>
        <p className="mb-6 text-muted-foreground">
          এই পেজ শুধুমাত্র <code>super_admin</code> এর জন্য।
        </p>
        <Link
          href="/dashboard"
          className="inline-block rounded-lg border border-primary/30 bg-primary-soft px-6 py-3 font-medium text-primary transition-colors hover:border-primary/40 hover:bg-primary/15"
        >
          ড্যাশবোর্ডে ফিরুন
        </Link>
      </div>
    );
  }

  let error: string | null = null;
  let catalogProducts: Awaited<ReturnType<typeof listCatalogProductsAdmin>> = [];
  let importSources: Awaited<ReturnType<typeof listCatalogImportSourcesAdmin>> = [];
  let importSourceSummary: CatalogImportSourceSummaryRow[] = [];
  let importRuns: CatalogImportRunRow[] = [];
  let mergeAudits: CatalogProductMergeAuditRow[] = [];
  let duplicateCandidates: CatalogDuplicateCandidateRow[] = [];
  let businessTypes: Awaited<ReturnType<typeof listBusinessTypes>> = [];
  let priceSnapshots: CatalogPriceSnapshotRow[] = [];

  const resolvedSearch = await searchParams;
  const query = typeof resolvedSearch?.q === "string" ? resolvedSearch.q.trim() : "";
  const rawBusinessType =
    typeof resolvedSearch?.businessType === "string"
      ? resolvedSearch.businessType.trim()
      : "";
  const businessTypeFilter = rawBusinessType || "all";
  const globalOnly = businessTypeFilter === "__global__";
  const businessTypeQuery =
    businessTypeFilter !== "all" && businessTypeFilter !== "__global__"
      ? businessTypeFilter
      : null;
  const rawSourceType =
    typeof resolvedSearch?.sourceType === "string"
      ? resolvedSearch.sourceType.trim()
      : "";
  const sourceType = PRODUCT_SOURCE_TYPES.includes(rawSourceType as CatalogProductSource)
    ? (rawSourceType as CatalogProductSource)
    : null;
  const rawActivity =
    typeof resolvedSearch?.activity === "string" ? resolvedSearch.activity.trim() : "";
  const activityFilter =
    rawActivity === "inactive" || rawActivity === "all" ? rawActivity : "active";
  const isActive =
    activityFilter === "all" ? null : activityFilter === "active";
  const rawMergeState =
    typeof resolvedSearch?.mergeState === "string" ? resolvedSearch.mergeState.trim() : "";
  const mergeState =
    rawMergeState === "merged" || rawMergeState === "all" ? rawMergeState : "active";
  const requestedProductId =
    typeof resolvedSearch?.productId === "string"
      ? resolvedSearch.productId.trim()
      : "";

  try {
    const [productsResult, sourcesResult, sourceSummaryResult, importRunsResult, mergeAuditResult, businessTypesResult] =
      await Promise.all([
      listCatalogProductsAdmin({
        limit: 200,
        query: query || null,
        businessType: businessTypeQuery,
        globalOnly,
        sourceType,
        isActive,
        mergeState,
      }),
      listCatalogImportSourcesAdmin(),
      listCatalogImportSourceSummaryAdmin(),
      listCatalogImportRunsAdmin({ limit: 12 }),
      listCatalogProductMergeActionsAdmin({ limit: 10 }),
      listBusinessTypes(),
    ]);
    catalogProducts = productsResult;
    importSources = sourcesResult;
    importSourceSummary = sourceSummaryResult;
    importRuns = importRunsResult;
    mergeAudits = mergeAuditResult;
    businessTypes = businessTypesResult;

    const selectedProductId =
      (requestedProductId &&
        catalogProducts.some((product) => product.id === requestedProductId) &&
        requestedProductId) ||
      catalogProducts[0]?.id ||
      null;

    if (selectedProductId) {
      const [snapshotResult, duplicateCandidateResult] = await Promise.all([
        listCatalogPriceSnapshotsAdmin({
          catalogProductId: selectedProductId,
          limit: 12,
        }),
        listCatalogDuplicateCandidatesAdmin({
          catalogProductId: selectedProductId,
          limit: 8,
        }),
      ]);
      priceSnapshots = snapshotResult;
      duplicateCandidates = duplicateCandidateResult;
    }
  } catch (err: any) {
    error = err?.message || "Unable to load catalog admin data.";
  }

  return (
    <CatalogAdminClient
      error={error}
      initialProducts={catalogProducts}
      initialImportSources={importSources.map((source) => ({
        id: source.id,
        slug: source.slug,
        name: source.name,
        type: source.type,
        notes: source.notes ?? null,
        importedAt: source.importedAt?.toISOString?.() ?? null,
        createdAt: source.createdAt.toISOString(),
        updatedAt: source.updatedAt.toISOString(),
      }))}
      initialImportSourceSummary={importSourceSummary}
      initialImportRuns={importRuns}
      initialMergeAudits={mergeAudits}
      initialDuplicateCandidates={duplicateCandidates}
      businessTypes={businessTypes.map((item) => ({
        key: item.key,
        label: item.label,
        isActive: item.isActive,
      }))}
      initialSelectedProductId={
        (requestedProductId &&
          catalogProducts.some((product) => product.id === requestedProductId) &&
          requestedProductId) ||
        catalogProducts[0]?.id ||
        null
      }
      initialPriceSnapshots={priceSnapshots}
      initialFilters={{
        query,
        businessType: businessTypeFilter,
        sourceType: sourceType ?? "all",
        activity: activityFilter,
        mergeState,
      }}
      importSourceTypeOptions={IMPORT_SOURCE_TYPES}
      productSourceTypeOptions={PRODUCT_SOURCE_TYPES}
      priceKindOptions={PRICE_KIND_OPTIONS}
      onCreateImportSource={handleCreateImportSource}
      onCreateProduct={handleCreateCatalogProduct}
      onPreviewImport={handlePreviewImport}
      onImportProducts={handleImportCatalogProducts}
      onBulkSetProductActiveState={handleBulkSetCatalogProductsActiveState}
      onBulkUpdateProductMetadata={handleBulkUpdateCatalogProductsMetadata}
      onBulkRestoreArchivedProducts={handleBulkRestoreArchivedCatalogProducts}
      onBulkDeleteProducts={handleBulkDeleteCatalogProducts}
      onMergeProducts={handleMergeCatalogProducts}
      onRestoreArchivedProduct={handleRestoreArchivedCatalogProduct}
      onUpdateProduct={handleUpdateCatalogProduct}
      onDeleteProduct={handleDeleteCatalogProduct}
      onCreatePriceSnapshot={handleCreatePriceSnapshot}
    />
  );
}
