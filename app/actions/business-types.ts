// app/actions/business-types.ts

"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { isSuperAdmin } from "@/lib/rbac";
import {
  type BusinessFieldConfig,
  businessFieldConfig as STATIC_CONFIGS,
  businessOptions,
  validateConfig,
} from "@/lib/productFormConfig";

type UpsertBusinessTypeInput = {
  key: string;
  label: string;
  fieldRules: BusinessFieldConfig["fields"];
  stockRules: BusinessFieldConfig["stock"];
  unitRules: BusinessFieldConfig["unit"];
  isActive?: boolean;
};

function assertSuperAdmin(user: Awaited<ReturnType<typeof requireUser>>) {
  if (!isSuperAdmin(user)) {
    throw new Error("Forbidden: Super Admin only");
  }
}

function normalizeConfig(input: UpsertBusinessTypeInput): BusinessFieldConfig {
  const config: BusinessFieldConfig = {
    fields: input.fieldRules,
    stock: input.stockRules,
    unit: {
      ...input.unitRules,
      options: input.unitRules.options || [],
      keywordRules: input.unitRules.keywordRules || [],
    },
  };

  // validate to prevent bad configs from bricking the form
  validateConfig({ [input.key]: config });
  return config;
}

export async function listBusinessTypes() {
  const user = await requireUser();
  assertSuperAdmin(user);

  return prisma.businessType.findMany({
    orderBy: [{ isActive: "desc" }, { key: "asc" }],
  });
}

export async function getBusinessTypeConfig(
  key: string | null | undefined,
): Promise<BusinessFieldConfig | null> {
  if (!key) return null;
  try {
    const record = await prisma.businessType.findFirst({
      where: { key, isActive: true },
    });
    if (!record) return null;

    const config: BusinessFieldConfig = {
      fields: (record.fieldRules as any) ?? {},
      stock: (record.stockRules as any) ?? { enabledByDefault: false, requiredWhenEnabled: true },
      unit: (record.unitRules as any) ?? { enabled: false, options: [] },
    };

    validateConfig({ [key]: config });
    return config;
  } catch (err) {
    console.error("getBusinessTypeConfig failed", err);
    return null;
  }
}

export async function upsertBusinessType(input: UpsertBusinessTypeInput) {
  const user = await requireUser();
  assertSuperAdmin(user);

  const key = input.key.trim().toLowerCase();
  const label = input.label.trim() || key;
  const config = normalizeConfig({ ...input, key, label });

  await prisma.businessType.upsert({
    where: { key },
    create: {
      key,
      label,
      isActive: input.isActive ?? true,
      fieldRules: config.fields,
      stockRules: config.stock,
      unitRules: config.unit,
    },
    update: {
      label,
      isActive: input.isActive ?? true,
      fieldRules: config.fields,
      stockRules: config.stock,
      unitRules: config.unit,
    },
  });

  return { success: true };
}

export async function syncDefaultBusinessTypes() {
  const user = await requireUser();
  assertSuperAdmin(user);

  const labelMap = new Map<string, string>(
    businessOptions.map((b) => [b.id as string, b.label as string]),
  );

  for (const [key, config] of Object.entries(STATIC_CONFIGS)) {
    validateConfig({ [key]: config });
    await prisma.businessType.upsert({
      where: { key },
      create: {
        key,
        label: labelMap.get(key) || key,
        isActive: true,
        fieldRules: config.fields,
        stockRules: config.stock,
        unitRules: config.unit,
      },
      update: {
        label: labelMap.get(key) || key,
        fieldRules: config.fields,
        stockRules: config.stock,
        unitRules: config.unit,
      },
    });
  }

  return { success: true };
}

export async function setBusinessTypeActive(key: string, isActive: boolean) {
  const user = await requireUser();
  assertSuperAdmin(user);

  const existing = await prisma.businessType.findUnique({ where: { key } });
  if (!existing) throw new Error("Business type not found");

  await prisma.businessType.update({
    where: { key },
    data: { isActive },
  });
  return { success: true };
}

export async function getBusinessType(key: string) {
  const user = await requireUser();
  assertSuperAdmin(user);
  return prisma.businessType.findUnique({ where: { key } });
}

export async function listActiveBusinessTypes() {
  await requireUser();
  return prisma.businessType.findMany({
    where: { isActive: true },
    select: { key: true, label: true },
    orderBy: [{ label: "asc" }],
  });
}

export async function getBusinessTypeUsage() {
  const user = await requireUser();
  assertSuperAdmin(user);

  const [shopGroups, templateGroups] = await Promise.all([
    prisma.shop.groupBy({
      by: ["businessType"],
      _count: { _all: true },
    }),
    prisma.businessProductTemplate.groupBy({
      by: ["businessType"],
      _count: { _all: true },
    }),
  ]);

  const usage: Record<string, { shopCount: number; templateCount: number }> = {};

  for (const group of shopGroups) {
    const key = group.businessType?.toString() ?? "";
    if (!key) continue;
    usage[key] = {
      shopCount: group._count._all,
      templateCount: 0,
    };
  }

  for (const group of templateGroups) {
    const key = group.businessType?.toString() ?? "";
    if (!key) continue;
    const existing = usage[key] ?? { shopCount: 0, templateCount: 0 };
    usage[key] = {
      ...existing,
      templateCount: group._count._all,
    };
  }

  return usage;
}

export async function deleteBusinessType(key: string) {
  const user = await requireUser();
  assertSuperAdmin(user);

  const normalizedKey = key?.toString().trim().toLowerCase();
  if (!normalizedKey) {
    throw new Error("Business type key is required");
  }

  const [shopCount, templateCount] = await Promise.all([
    prisma.shop.count({ where: { businessType: normalizedKey } }),
    prisma.businessProductTemplate.count({
      where: { businessType: normalizedKey },
    }),
  ]);

  if (shopCount > 0) {
    throw new Error("Cannot delete: business type is used by shops");
  }
  if (templateCount > 0) {
    throw new Error("Cannot delete: templates exist for this business type");
  }

  await prisma.businessType.delete({ where: { key: normalizedKey } });
  return { success: true };
}
