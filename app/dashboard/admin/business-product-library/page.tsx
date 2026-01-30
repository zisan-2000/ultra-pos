// app/dashboard/admin/business-product-library/page.tsx

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
import BusinessProductLibraryClient from "./BusinessProductLibraryClient";

export const dynamic = "force-dynamic";

async function handleCreateTemplate(formData: FormData) {
  "use server";
  const businessType = (formData.get("businessType") as string | null) || "";
  const name = (formData.get("name") as string | null) || "";
  const category = (formData.get("category") as string | null) || null;
  const defaultSellPrice = formData.get("defaultSellPrice") as string | null;
  const isActive = formData.get("isActive") === "on";

  await createBusinessProductTemplate({
    businessType,
    name,
    category,
    defaultSellPrice,
    isActive,
  });
  revalidatePath("/dashboard/admin/business-product-library");
}

async function handleUpdateTemplate(formData: FormData) {
  "use server";
  const id = (formData.get("id") as string | null) || "";
  const name = formData.get("name") as string | null;
  const category = formData.get("category") as string | null;
  const defaultSellPrice = formData.get("defaultSellPrice") as string | null;
  const isActive = formData.get("isActive") === "on";

  await updateBusinessProductTemplate(id, {
    name: name ?? undefined,
    category: category ?? undefined,
    defaultSellPrice: defaultSellPrice ?? undefined,
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
