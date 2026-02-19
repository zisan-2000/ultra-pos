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
