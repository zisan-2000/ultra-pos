// app/dashboard/admin/business-types/page.tsx

import {
  listBusinessTypes,
  syncDefaultBusinessTypes,
  upsertBusinessType,
  getBusinessType,
  setBusinessTypeActive,
  deleteBusinessType,
  getBusinessTypeUsage,
} from "@/app/actions/business-types";
import {
  businessFieldConfig as STATIC_CONFIGS,
  type BusinessType,
  type Field,
} from "@/lib/productFormConfig";
import { revalidatePath } from "next/cache";
import BusinessTypesClient from "./BusinessTypesClient";

export const dynamic = "force-dynamic";

async function handleSyncDefaults() {
  "use server";
  await syncDefaultBusinessTypes();
  revalidatePath("/dashboard/admin/business-types");
}

async function handleCreateFromStatic(formData: FormData) {
  "use server";
  const key = (formData.get("key") as string | null)?.trim() as BusinessType | null;
  if (!key) return;

  const config = STATIC_CONFIGS[key] ?? STATIC_CONFIGS.mini_grocery;
  const label = formData.get("label")?.toString().trim() || key;

  await upsertBusinessType({
    key,
    label,
    isActive: true,
    fieldRules: config.fields,
    stockRules: config.stock,
    unitRules: config.unit,
  });
  revalidatePath("/dashboard/admin/business-types");
}

async function handleToggleActive(formData: FormData) {
  "use server";
  const key = (formData.get("key") as string | null)?.trim();
  const activeRaw = formData.get("isActive") as string | null;
  if (!key) return;
  const isActive = activeRaw === "true";
  await setBusinessTypeActive(key, isActive);
  revalidatePath("/dashboard/admin/business-types");
}

async function handleDeleteBusinessType(formData: FormData) {
  "use server";
  const key = (formData.get("key") as string | null)?.trim();
  if (!key) return;
  await deleteBusinessType(key);
  revalidatePath("/dashboard/admin/business-types");
}

// Structured edit (no JSON needed)
const ALL_FIELDS: Field[] = ["name", "sellPrice", "buyPrice", "unit", "expiry", "size"];

async function handleStructuredEdit(formData: FormData) {
  "use server";
  const key = (formData.get("key") as string | null)?.trim();
  if (!key) return;

  const existing = (await getBusinessType(key)) ?? null;
  const fallbackConfig = STATIC_CONFIGS[key as BusinessType] ?? STATIC_CONFIGS.mini_grocery;

  const label = (formData.get("label") as string | null)?.trim() || existing?.label || key;
  const isActive = formData.get("isActive") === "on";

  const fieldRules: Record<Field, any> = {} as any;
  for (const f of ALL_FIELDS) {
    fieldRules[f] = {
      required: formData.get(`req:${f}`) === "on",
      hidden: formData.get(`hid:${f}`) === "on",
    };
  }

  const stockRules = {
    enabledByDefault: formData.get("stock:enabledByDefault") === "on",
    requiredWhenEnabled: formData.get("stock:requiredWhenEnabled") === "on",
  };

  const unitEnabled = formData.get("unit:enabled") === "on";
  const rawOptions = (formData.get("unitOptions") as string | null) || "";
  const unitOptions = Array.from(
    new Set(
      rawOptions
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
  const existingUnit = (existing?.unitRules as any) ?? fallbackConfig.unit;
  const unitDefault =
    (formData.get("unitDefault") as string | null)?.trim().toLowerCase() ||
    existingUnit.default ||
    unitOptions[0] ||
    "";

  const unitRules = {
    enabled: unitEnabled,
    options: unitOptions.length ? unitOptions : existingUnit.options || [],
    default: unitDefault || undefined,
    keywordRules: existingUnit.keywordRules || [],
  };

  await upsertBusinessType({
    key,
    label,
    isActive,
    fieldRules,
    stockRules,
    unitRules,
  });

  revalidatePath("/dashboard/admin/business-types");
}

export default async function BusinessTypesAdminPage() {
  let types: Awaited<ReturnType<typeof listBusinessTypes>> | null = null;
  let error: string | null = null;
  let usage: Awaited<ReturnType<typeof getBusinessTypeUsage>> = {};

  try {
    types = await listBusinessTypes();
    usage = await getBusinessTypeUsage();
  } catch (err: any) {
    error = err?.message || "Unable to load business types (Super Admin only).";
  }

  return (
    <BusinessTypesClient
      initialTypes={types || []}
      initialUsage={usage || {}}
      error={error}
      onSyncDefaults={handleSyncDefaults}
      onCreateFromStatic={handleCreateFromStatic}
      onToggleActive={handleToggleActive}
      onDeleteBusinessType={handleDeleteBusinessType}
      onStructuredEdit={handleStructuredEdit}
    />
  );
}
