// app/actions/business-product-templates.ts

"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { isSuperAdmin, requirePermission } from "@/lib/rbac";
import { assertShopAccess } from "@/lib/shop-access";

type TemplateInput = {
  id?: string;
  businessType: string;
  name: string;
  category?: string | null;
  defaultSellPrice?: string | number | null;
  isActive?: boolean;
};

export type BusinessProductTemplateImportItem = {
  businessType?: string | null;
  name?: string | null;
  category?: string | null;
  defaultSellPrice?: string | number | null;
  isActive?: boolean | null;
};

export type BusinessProductTemplateImportInput = {
  items: BusinessProductTemplateImportItem[];
  defaultBusinessType?: string | null;
};

export type BusinessProductTemplateImportResult = {
  createdCount: number;
  skippedCount: number;
  invalidCount: number;
};

type TemplateListRow = {
  id: string;
  businessType: string;
  name: string;
  category: string | null;
  defaultSellPrice: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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

function normalizeOptionalText(value?: string | null) {
  if (value === undefined) return undefined;
  const cleaned = value === null ? "" : value.toString().trim();
  return cleaned ? cleaned : null;
}

function normalizeOptionalMoney(value?: string | number | null) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const cleaned = value.toString().trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("Default sell price must be a valid non-negative number");
  }
  return parsed.toString();
}

function mapTemplateRow(row: {
  id: string;
  businessType: string;
  name: string;
  category: string | null;
  defaultSellPrice: any;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): TemplateListRow {
  return {
    id: row.id,
    businessType: row.businessType,
    name: row.name,
    category: row.category,
    defaultSellPrice: row.defaultSellPrice?.toString?.() ?? null,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ------------------------------
// ADMIN: LIST ALL TEMPLATES
// ------------------------------
export async function listBusinessProductTemplatesAdmin() {
  const user = await requireUser();
  assertSuperAdmin(user);

  const rows = await prisma.businessProductTemplate.findMany({
    orderBy: [{ businessType: "asc" }, { name: "asc" }],
  });

  return rows.map(mapTemplateRow);
}

// ------------------------------
// ADMIN: CREATE TEMPLATE
// ------------------------------
export async function createBusinessProductTemplate(input: TemplateInput) {
  const user = await requireUser();
  assertSuperAdmin(user);

  const id = input.id?.toString().trim() || undefined;
  const businessType = normalizeRequiredText(input.businessType, "Business type");
  const name = normalizeRequiredText(input.name, "Name");
  const category = normalizeOptionalText(input.category);
  const defaultSellPrice = normalizeOptionalMoney(input.defaultSellPrice);
  const isActive = input.isActive ?? true;

  if (id) {
    await prisma.businessProductTemplate.upsert({
      where: { id },
      create: {
        id,
        businessType,
        name,
        category: category ?? null,
        defaultSellPrice: defaultSellPrice === undefined ? null : defaultSellPrice,
        isActive,
      },
      update: {
        businessType,
        name,
        category: category ?? null,
        defaultSellPrice: defaultSellPrice === undefined ? null : defaultSellPrice,
        isActive,
      },
    });
  } else {
    await prisma.businessProductTemplate.create({
      data: {
        businessType,
        name,
        category: category ?? null,
        defaultSellPrice: defaultSellPrice === undefined ? null : defaultSellPrice,
        isActive,
      },
    });
  }

  return { success: true };
}

// ------------------------------
// ADMIN: UPDATE TEMPLATE
// ------------------------------
export async function updateBusinessProductTemplate(
  id: string,
  input: Partial<TemplateInput>,
) {
  const user = await requireUser();
  assertSuperAdmin(user);

  if (!id) {
    throw new Error("Template id is required");
  }

  const data: Record<string, any> = {};

  if (input.businessType !== undefined) {
    data.businessType = normalizeRequiredText(input.businessType, "Business type");
  }
  if (input.name !== undefined) {
    data.name = normalizeRequiredText(input.name, "Name");
  }
  if (input.category !== undefined) {
    data.category = normalizeOptionalText(input.category);
  }
  if (input.defaultSellPrice !== undefined) {
    data.defaultSellPrice = normalizeOptionalMoney(input.defaultSellPrice);
  }
  if (input.isActive !== undefined) {
    data.isActive = Boolean(input.isActive);
  }

  await prisma.businessProductTemplate.update({
    where: { id },
    data,
  });

  return { success: true };
}

// ------------------------------
// ADMIN: DELETE TEMPLATE
// ------------------------------
export async function deleteBusinessProductTemplate(id: string) {
  const user = await requireUser();
  assertSuperAdmin(user);
  if (!id) {
    throw new Error("Template id is required");
  }
  await prisma.businessProductTemplate.delete({ where: { id } });
  return { success: true };
}

// ------------------------------
// ADMIN: IMPORT TEMPLATES (JSON)
// ------------------------------
export async function importBusinessProductTemplates(
  input: BusinessProductTemplateImportInput,
): Promise<BusinessProductTemplateImportResult> {
  const user = await requireUser();
  assertSuperAdmin(user);

  const items = Array.isArray(input.items) ? input.items : [];
  if (items.length === 0) {
    return { createdCount: 0, skippedCount: 0, invalidCount: 0 };
  }

  const defaultBusinessType = normalizeOptionalText(input.defaultBusinessType) ?? null;
  const normalized: Array<{
    businessType: string;
    name: string;
    category: string | null;
    defaultSellPrice: string | null;
    isActive: boolean;
  }> = [];

  let invalidCount = 0;
  let firstError: string | null = null;

  items.forEach((item, index) => {
    try {
      const businessTypeValue = item.businessType ?? defaultBusinessType ?? "";
      const businessType = normalizeRequiredText(
        String(businessTypeValue),
        "Business type",
      );
      const name = normalizeRequiredText(String(item.name ?? ""), "Name");
      const category = normalizeOptionalText(item.category);
      const defaultSellPrice = normalizeOptionalMoney(item.defaultSellPrice);
      const isActive = item.isActive ?? true;

      normalized.push({
        businessType,
        name,
        category: category ?? null,
        defaultSellPrice: defaultSellPrice === undefined ? null : defaultSellPrice,
        isActive: Boolean(isActive),
      });
    } catch (err) {
      invalidCount += 1;
      if (!firstError) {
        const message = err instanceof Error ? err.message : "Invalid row";
        firstError = `Row ${index + 1}: ${message}`;
      }
    }
  });

  if (invalidCount > 0) {
    const suffix = firstError ? ` ${firstError}` : "";
    throw new Error(
      `Import failed: ${invalidCount} invalid row${invalidCount > 1 ? "s" : ""}.${suffix}`,
    );
  }

  if (normalized.length === 0) {
    return { createdCount: 0, skippedCount: 0, invalidCount: 0 };
  }

  const seen = new Set<string>();
  const deduped = normalized.filter((item) => {
    const key = `${item.businessType.toLowerCase()}|${item.name.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const result = await prisma.businessProductTemplate.createMany({
    data: deduped.map((item) => ({
      businessType: item.businessType,
      name: item.name,
      category: item.category,
      defaultSellPrice: item.defaultSellPrice,
      isActive: item.isActive,
    })),
    skipDuplicates: true,
  });

  return {
    createdCount: result.count,
    skippedCount: deduped.length - result.count,
    invalidCount: 0,
  };
}

// ------------------------------
// USER: LIST ACTIVE TEMPLATES FOR A BUSINESS TYPE
// ------------------------------
export async function listActiveBusinessProductTemplates(businessType: string) {
  const user = await requireUser();
  requirePermission(user, "view_products");

  const key = businessType?.toString().trim();
  if (!key) return [];

  const rows = await prisma.businessProductTemplate.findMany({
    where: { businessType: key, isActive: true },
    orderBy: [{ name: "asc" }],
  });

  return rows.map(mapTemplateRow);
}

// ------------------------------
// USER: APPLY SELECTED TEMPLATES TO A SHOP
// ------------------------------
export async function addBusinessProductTemplatesToShop(input: {
  shopId: string;
  templateIds: string[];
}) {
  const user = await requireUser();
  requirePermission(user, "create_product");

  const shop = await assertShopAccess(input.shopId, user);
  if (!shop.businessType) {
    return { createdCount: 0, skippedCount: 0, inactiveCount: 0 };
  }

  const uniqueIds = Array.from(new Set(input.templateIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return { createdCount: 0, skippedCount: 0, inactiveCount: 0 };
  }

  const templates = await prisma.businessProductTemplate.findMany({
    where: {
      id: { in: uniqueIds },
      isActive: true,
      businessType: shop.businessType,
    },
    orderBy: [{ name: "asc" }],
  });

  if (templates.length === 0) {
    return { createdCount: 0, skippedCount: uniqueIds.length, inactiveCount: 0 };
  }

  const seenNames = new Set<string>();
  const uniqueTemplates = templates.filter((template) => {
    const key = template.name.trim().toLowerCase();
    if (!key || seenNames.has(key)) return false;
    seenNames.add(key);
    return true;
  });

  const nameFilters = uniqueTemplates.map((template) => ({
    name: { equals: template.name, mode: "insensitive" as const },
  }));
  const existing = nameFilters.length
    ? await prisma.product.findMany({
        where: {
          shopId: shop.id,
          OR: nameFilters,
        },
        select: { name: true },
      })
    : [];

  const existingNames = new Set(
    existing.map((row) => row.name.trim().toLowerCase()),
  );

  const createData: any[] = [];
  let inactiveCount = 0;

  for (const template of uniqueTemplates) {
    const key = template.name.trim().toLowerCase();
    if (existingNames.has(key)) continue;

    const defaultPrice = template.defaultSellPrice?.toString();
    const numericPrice = defaultPrice ? Number(defaultPrice) : 0;
    const hasValidPrice = Number.isFinite(numericPrice) && numericPrice > 0;
    if (!hasValidPrice) {
      inactiveCount += 1;
    }

    createData.push({
      shopId: shop.id,
      name: template.name,
      category: template.category || "Uncategorized",
      buyPrice: null,
      sellPrice: defaultPrice || "0",
      stockQty: "0",
      isActive: hasValidPrice,
      trackStock: false,
    });
  }

  if (createData.length === 0) {
    return {
      createdCount: 0,
      skippedCount: uniqueTemplates.length,
      inactiveCount,
    };
  }

  await prisma.product.createMany({ data: createData });

  return {
    createdCount: createData.length,
    skippedCount: uniqueTemplates.length - createData.length,
    inactiveCount,
  };
}
