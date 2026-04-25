// app/dashboard/admin/business-product-library/page.tsx

import Link from "next/link";
import {
  createBusinessProductTemplate,
  deleteBusinessProductTemplate,
  importBusinessProductTemplates,
  listBusinessProductTemplatesAdmin,
  updateBusinessProductTemplate,
} from "@/app/actions/business-product-templates";
import type {
  BusinessProductTemplateImportInput,
  BusinessProductTemplateImportResult,
} from "@/app/actions/business-product-templates";
import { listBusinessTypes } from "@/app/actions/business-types";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth-session";
import { isSuperAdmin } from "@/lib/rbac";
import BusinessProductLibraryClient from "./BusinessProductLibraryClient";

export const dynamic = "force-dynamic";

function parseCsvList(value: FormDataEntryValue | null) {
  const raw = typeof value === "string" ? value : "";
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseOptionalNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim();
  if (!cleaned) return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function handleCreateTemplate(formData: FormData) {
  "use server";
  const businessType = (formData.get("businessType") as string | null) || "";
  const name = (formData.get("name") as string | null) || "";
  const brand = (formData.get("brand") as string | null) || null;
  const category = (formData.get("category") as string | null) || null;
  const packSize = (formData.get("packSize") as string | null) || null;
  const defaultSellPrice = formData.get("defaultSellPrice") as string | null;
  const defaultBarcode = (formData.get("defaultBarcode") as string | null) || null;
  const defaultBaseUnit = (formData.get("defaultBaseUnit") as string | null) || null;
  const hasDefaultTrackStock = formData.has("defaultTrackStock");
  const defaultTrackStock = hasDefaultTrackStock
    ? formData.get("defaultTrackStock") === "on"
    : undefined;
  const aliases = parseCsvList(formData.get("aliasesCsv"));
  const keywords = parseCsvList(formData.get("keywordsCsv"));
  const rawVariantsJson = (formData.get("variantsJson") as string | null) || "";
  const imageUrl = (formData.get("imageUrl") as string | null) || null;
  const popularityScore = parseOptionalNumber(formData.get("popularityScore"));
  let variants: Array<{
    label?: string | null;
    sellPrice?: string | number | null;
    sku?: string | null;
    barcode?: string | null;
    sortOrder?: number | null;
    isActive?: boolean | null;
  }> | null = null;
  if (rawVariantsJson.trim()) {
    try {
      const parsed = JSON.parse(rawVariantsJson);
      variants = Array.isArray(parsed) ? parsed : null;
    } catch {
      variants = null;
    }
  }
  const isActive = formData.get("isActive") === "on";

  await createBusinessProductTemplate({
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
  revalidatePath("/dashboard/admin/business-product-library");
}

async function handleUpdateTemplate(formData: FormData) {
  "use server";
  const id = (formData.get("id") as string | null) || "";
  const name = formData.get("name") as string | null;
  const brand = formData.get("brand") as string | null;
  const category = formData.get("category") as string | null;
  const packSize = formData.get("packSize") as string | null;
  const defaultSellPrice = formData.get("defaultSellPrice") as string | null;
  const defaultBarcode = formData.get("defaultBarcode") as string | null;
  const defaultBaseUnit = formData.get("defaultBaseUnit") as string | null;
  const hasDefaultTrackStock = formData.has("defaultTrackStock");
  const defaultTrackStock = hasDefaultTrackStock
    ? formData.get("defaultTrackStock") === "on"
    : undefined;
  const aliases = parseCsvList(formData.get("aliasesCsv"));
  const keywords = parseCsvList(formData.get("keywordsCsv"));
  const rawVariantsJson = (formData.get("variantsJson") as string | null) || "";
  const imageUrl = formData.get("imageUrl") as string | null;
  const popularityScore = parseOptionalNumber(formData.get("popularityScore"));
  let variants:
    | Array<{
        label?: string | null;
        sellPrice?: string | number | null;
        sku?: string | null;
        barcode?: string | null;
        sortOrder?: number | null;
        isActive?: boolean | null;
      }>
    | undefined;
  if (rawVariantsJson.trim()) {
    try {
      const parsed = JSON.parse(rawVariantsJson);
      variants = Array.isArray(parsed) ? parsed : undefined;
    } catch {
      variants = undefined;
    }
  }
  const isActive = formData.get("isActive") === "on";

  await updateBusinessProductTemplate(id, {
    name: name ?? undefined,
    brand: brand ?? undefined,
    category: category ?? undefined,
    packSize: packSize ?? undefined,
    defaultSellPrice: defaultSellPrice ?? undefined,
    defaultBarcode: defaultBarcode ?? undefined,
    defaultBaseUnit: defaultBaseUnit ?? undefined,
    defaultTrackStock,
    aliases,
    keywords,
    variants,
    imageUrl: imageUrl ?? undefined,
    popularityScore,
    isActive,
  });
  revalidatePath("/dashboard/admin/business-product-library");
}

async function handleDeleteTemplate(formData: FormData) {
  "use server";
  const id = (formData.get("id") as string | null) || "";
  await deleteBusinessProductTemplate(id);
  revalidatePath("/dashboard/admin/business-product-library");
}

async function handleImportTemplates(
  input: BusinessProductTemplateImportInput,
): Promise<BusinessProductTemplateImportResult> {
  "use server";
  const result = await importBusinessProductTemplates(input);
  revalidatePath("/dashboard/admin/business-product-library");
  return result;
}

export default async function BusinessProductLibraryPage() {
  const user = await requireUser();
  if (!isSuperAdmin(user)) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">Business Product Library</h1>
        <p className="mb-2 text-danger font-semibold">অ্যাকসেস সীমাবদ্ধ</p>
        <p className="mb-6 text-muted-foreground">
          এই পেজ শুধুমাত্র <code>super_admin</code> এর জন্য।
        </p>
        <Link
          href="/dashboard"
          className="inline-block px-6 py-3 bg-primary-soft text-primary border border-primary/30 rounded-lg font-medium hover:bg-primary/15 hover:border-primary/40 transition-colors"
        >
          ড্যাশবোর্ডে ফিরুন
        </Link>
      </div>
    );
  }

  let templates: Awaited<ReturnType<typeof listBusinessProductTemplatesAdmin>> = [];
  let error: string | null = null;

  try {
    templates = await listBusinessProductTemplatesAdmin();
  } catch (err: any) {
    error = err?.message || "Unable to load templates (Super Admin only).";
  }

  let businessTypes: Awaited<ReturnType<typeof listBusinessTypes>> = [];
  try {
    businessTypes = await listBusinessTypes();
  } catch {
    businessTypes = [];
  }

  return (
    <BusinessProductLibraryClient
      initialTemplates={templates || []}
      initialBusinessTypes={businessTypes || []}
      error={error}
      onCreateTemplate={handleCreateTemplate}
      onUpdateTemplate={handleUpdateTemplate}
      onDeleteTemplate={handleDeleteTemplate}
      onImportTemplates={handleImportTemplates}
    />
  );
}
