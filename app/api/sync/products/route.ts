// app/api/sync/products/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { assertShopAccess } from "@/lib/shop-access";
import { hasPermission } from "@/lib/rbac";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { withTracing } from "@/lib/tracing";
import { publishRealtimeEvent } from "@/lib/realtime/publisher";
import { REALTIME_EVENTS } from "@/lib/realtime/events";
import { revalidateReportsForProduct } from "@/lib/reports/revalidate";

const productCreateSchema = z.object({
  id: z.string().optional(),
  shopId: z.string(),
  name: z.string().optional(),
  category: z.string().optional(),
  sku: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  baseUnit: z.string().optional().nullable(),
  expiryDate: z.union([z.string(), z.date()]).optional().nullable(),
  size: z.string().optional().nullable(),
  variants: z
    .array(
      z.object({
        id: z.string().optional(),
        label: z.string(),
        sellPrice: z.union([z.string(), z.number()]),
        sku: z.string().optional().nullable(),
        barcode: z.string().optional().nullable(),
        sortOrder: z.number().int().nonnegative().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .optional()
    .nullable(),
  buyPrice: z.union([z.string(), z.number()]).optional().nullable(),
  sellPrice: z.union([z.string(), z.number()]).optional(),
  stockQty: z.union([z.string(), z.number()]).optional(),
  trackStock: z.boolean().optional(),
  isActive: z.boolean().optional(),
  updatedAt: z.union([z.string(), z.number(), z.date()]).optional(),
});

const productUpdateSchema = productCreateSchema.extend({
  id: z.string(),
  force: z.boolean().optional(),
});

const syncBodySchema = z.object({
  newItems: z.array(productCreateSchema).optional().default([]),
  updatedItems: z.array(productUpdateSchema).optional().default([]),
  deletedIds: z
    .array(
      z.union([
        z.string(),
        z.object({
          id: z.string(),
          updatedAt: z.union([z.string(), z.number(), z.date()]).optional(),
          force: z.boolean().optional(),
        }),
      ])
    )
    .optional()
    .default([]),
});

type IncomingProduct = Record<string, any>;

type SyncUpdatedRow = {
  id: string;
  updatedAt: string;
  isActive: boolean;
  trackStock: boolean;
};

function toMoneyString(
  value: string | number | null | undefined,
  field: string,
  options?: { allowNull?: boolean; defaultValue?: string }
) {
  if (value === null || value === undefined || value === "") {
    if (options?.allowNull) return null;
    if (options?.defaultValue !== undefined) return options.defaultValue;
    throw new Error(`${field} is required`);
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new Error(`${field} must be a valid number`);
  }
  return num.toFixed(2);
}

function normalizeCode(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = value.trim().replace(/\s+/g, "").toUpperCase().slice(0, 80);
  return normalized || null;
}

function normalizeBaseUnit(value: unknown, fallback = "pcs") {
  if (value === undefined) return fallback;
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 40);
  return normalized || fallback;
}

function normalizeNullableText(value: unknown, maxLength = 80) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = String(value).trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizeDateOnly(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("expiryDate must be a valid date");
  }
  return parsed;
}

function sanitizeVariants(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return [] as Array<{
    id?: string;
    label: string;
    sellPrice: string;
    sku: string | null;
    barcode: string | null;
    sortOrder: number;
    isActive: boolean;
  }>;
  if (!Array.isArray(value)) {
    throw new Error("variants must be an array");
  }

  const normalized: Array<{
    id?: string;
    label: string;
    sellPrice: string;
    sku: string | null;
    barcode: string | null;
    sortOrder: number;
    isActive: boolean;
  }> = [];
  const seenLabels = new Set<string>();

  for (let index = 0; index < value.length; index += 1) {
    const row = value[index] as Record<string, unknown>;
    const label = normalizeNullableText(row?.label, 80) ?? "";
    if (!label) continue;
    const labelKey = label.toLowerCase();
    if (seenLabels.has(labelKey)) {
      throw new Error("variant labels must be unique");
    }
    seenLabels.add(labelKey);
    const sortOrderRaw = Number(row?.sortOrder ?? index);
    normalized.push({
      id:
        typeof row?.id === "string" && row.id.trim().length > 0
          ? row.id.trim()
          : undefined,
      label,
      sellPrice: toMoneyString(
        row?.sellPrice as string | number | null | undefined,
        "variant sellPrice"
      ) as string,
      sku: normalizeCode(row?.sku as string | null | undefined) ?? null,
      barcode: normalizeCode(row?.barcode as string | null | undefined) ?? null,
      sortOrder: Number.isFinite(sortOrderRaw)
        ? Math.max(0, Math.floor(sortOrderRaw))
        : index,
      isActive: row?.isActive === undefined ? true : Boolean(row?.isActive),
    });
  }

  return normalized;
}

function sanitizeCreate(item: IncomingProduct) {
  const shopId = item.shopId;
  if (!shopId) throw new Error("shopId is required");

  const sellPrice = toMoneyString(item.sellPrice ?? "0", "sellPrice");
  const stockQty = toMoneyString(item.stockQty ?? "0", "stockQty", {
    defaultValue: "0.00",
  });
  const buyPrice = item.buyPrice !== undefined
    ? toMoneyString(item.buyPrice, "buyPrice", { allowNull: true })
    : undefined;
  const sku = normalizeCode(item.sku);
  const barcode = normalizeCode(item.barcode);
  const baseUnit = normalizeBaseUnit(item.baseUnit, "pcs");
  const expiryDate = normalizeDateOnly(item.expiryDate);
  const size = normalizeNullableText(item.size, 80);
  const variants = sanitizeVariants(item.variants);

  return {
    id: item.id, // keep client-generated id when present
    shopId,
    name: item.name || "Unnamed product",
    category: item.category || "Uncategorized",
    sku: sku === undefined ? undefined : sku,
    barcode: barcode === undefined ? undefined : barcode,
    baseUnit: baseUnit || "pcs",
    expiryDate: expiryDate === undefined ? undefined : expiryDate,
    size: size === undefined ? undefined : size,
    buyPrice: buyPrice === undefined ? undefined : buyPrice, // undefined omits field, null sets null
    sellPrice,
    stockQty,
    trackStock: Boolean(item.trackStock),
    isActive: item.isActive !== false,
    variants,
  };
}

function sanitizeUpdate(item: IncomingProduct) {
  const { id } = item;
  if (!id) throw new Error("id is required for update");

  const payload: Record<string, any> = {};

  if (item.name !== undefined) payload.name = item.name || "Unnamed product";
  if (item.category !== undefined) payload.category = item.category || "Uncategorized";
  if (item.sku !== undefined) payload.sku = normalizeCode(item.sku);
  if (item.barcode !== undefined) payload.barcode = normalizeCode(item.barcode);
  if (item.baseUnit !== undefined) payload.baseUnit = normalizeBaseUnit(item.baseUnit, "pcs");
  if (item.expiryDate !== undefined) payload.expiryDate = normalizeDateOnly(item.expiryDate);
  if (item.size !== undefined) payload.size = normalizeNullableText(item.size, 80);
  if (item.isActive !== undefined) payload.isActive = Boolean(item.isActive);
  if (item.trackStock !== undefined) payload.trackStock = Boolean(item.trackStock);

  if (item.buyPrice !== undefined) {
    payload.buyPrice = toMoneyString(item.buyPrice, "buyPrice", { allowNull: true });
  }
  if (item.sellPrice !== undefined) {
    payload.sellPrice = toMoneyString(item.sellPrice, "sellPrice");
  }
  if (item.stockQty !== undefined) {
    payload.stockQty = toMoneyString(item.stockQty, "stockQty", { defaultValue: "0.00" });
  }

  return { id, data: payload, variants: sanitizeVariants(item.variants) };
}

function toDateOrUndefined(value?: string | number | Date | null) {
  if (value === null || value === undefined) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return undefined;
  return d;
}

export async function POST(req: Request) {
  return withTracing(req, "sync-products", async () => {
    try {
      const rl = await rateLimit(req, { windowMs: 60_000, max: 120, keyPrefix: "sync-products" });
      if (rl.limited) {
        return NextResponse.json(
          { success: false, error: "Too many requests" },
          { status: 429, headers: rl.headers },
        );
      }

      const raw = await req.json();
      const parsed = syncBodySchema.safeParse(raw);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: "Invalid payload", details: parsed.error.format() },
          { status: 400 },
        );
      }

      const { newItems, updatedItems, deletedIds } = parsed.data;
      const updatedRows: SyncUpdatedRow[] = [];
      const deletedRows: string[] = [];
      const archivedRows: string[] = [];

      // ---------- AuthZ guard ----------
      const user = await requireUser();
      if (!hasPermission(user, "sync_offline_data")) {
        return NextResponse.json(
          { success: false, error: "Forbidden" },
          { status: 403 },
        );
      }

      if (newItems.length && !hasPermission(user, "create_product")) {
        return NextResponse.json(
          { success: false, error: "Forbidden" },
          { status: 403 },
        );
      }
      if (updatedItems.length && !hasPermission(user, "update_product")) {
        return NextResponse.json(
          { success: false, error: "Forbidden" },
          { status: 403 },
        );
      }
      if (deletedIds.length && !hasPermission(user, "delete_product")) {
        return NextResponse.json(
          { success: false, error: "Forbidden" },
          { status: 403 },
        );
      }

      const shopIds = new Set<string>();
      (Array.isArray(newItems) ? newItems : []).forEach((p) => {
        if (p?.shopId) shopIds.add(p.shopId);
      });

      const updateIds = (Array.isArray(updatedItems) ? updatedItems : [])
        .map((p) => p?.id)
        .filter(Boolean) as string[];

      const deleteItems = Array.isArray(deletedIds)
        ? deletedIds.map((item) =>
            typeof item === "string" ? { id: item } : item
          )
        : [];
      const deleteIds = deleteItems.map((item) => item.id);

      const existingUpdates = updateIds.length
        ? await prisma.product.findMany({
            where: { id: { in: updateIds } },
            select: { id: true, shopId: true, updatedAt: true },
          })
        : [];
      existingUpdates.forEach((p) => shopIds.add(p.shopId));
      const existingById = new Map(existingUpdates.map((p) => [p.id, p]));

      const existingDeletes = deleteIds.length
        ? await prisma.product.findMany({
            where: { id: { in: deleteIds } },
            select: { id: true, shopId: true, updatedAt: true },
          })
        : [];
      existingDeletes.forEach((p) => shopIds.add(p.shopId));
      const deleteExistingById = new Map(existingDeletes.map((p) => [p.id, p]));

      // Require at least one shopId to authorize against when there is work to do
      if ((newItems.length || updatedItems.length || deleteIds.length) && shopIds.size === 0) {
        return NextResponse.json(
          { success: false, error: "shopId required to sync products" },
          { status: 400 },
        );
      }

      for (const shopId of shopIds) {
        await assertShopAccess(shopId, user);
      }

      // Insert new
      if (Array.isArray(newItems) && newItems.length > 0) {
        const sanitized = newItems.map(sanitizeCreate);
        await prisma.product.createMany({
          data: sanitized.map(({ variants: _variants, ...row }) => row) as any,
          skipDuplicates: true,
        });

        const withVariants = sanitized.filter(
          (item) => item.id && item.variants !== undefined
        ) as Array<
          ReturnType<typeof sanitizeCreate> & { id: string }
        >;
        for (const item of withVariants) {
          const existing = await prisma.product.findUnique({
            where: { id: item.id },
            select: { id: true, shopId: true },
          });
          if (!existing || existing.shopId !== item.shopId) continue;
          await prisma.productVariant.deleteMany({
            where: { productId: existing.id },
          });
          if (item.variants && item.variants.length > 0) {
            await prisma.productVariant.createMany({
              data: item.variants.map((variant, index) => ({
                id: variant.id,
                shopId: item.shopId,
                productId: existing.id,
                label: variant.label,
                sellPrice: variant.sellPrice,
                sku: variant.sku,
                barcode: variant.barcode,
                sortOrder: variant.sortOrder ?? index,
                isActive: variant.isActive,
              })),
            });
          }
        }

        const newIds = sanitized.map((item) => item.id).filter(Boolean) as string[];
        if (newIds.length > 0) {
          const rows = await prisma.product.findMany({
            where: { id: { in: newIds } },
            select: { id: true, updatedAt: true, isActive: true, trackStock: true },
          });
          rows.forEach((row) => {
            updatedRows.push({
              id: row.id,
              updatedAt: row.updatedAt.toISOString(),
              isActive: row.isActive,
              trackStock: row.trackStock,
            });
          });
        }
      }

      const conflicts: Array<{
        id: string;
        action: "update" | "delete";
        reason: "stale_update" | "stale_delete";
        serverUpdatedAt?: string;
      }> = [];

      // Update existing
      if (Array.isArray(updatedItems) && updatedItems.length > 0) {
        for (const item of updatedItems) {
          const existing = item?.id ? existingById.get(item.id) : undefined;
          if (existing) {
            const clientUpdatedAt = toDateOrUndefined(item.updatedAt);
            if (!item.force && clientUpdatedAt && existing.updatedAt > clientUpdatedAt) {
              conflicts.push({
                id: existing.id,
                action: "update",
                reason: "stale_update",
                serverUpdatedAt: existing.updatedAt.toISOString(),
              });
              continue;
            }
          }
          const { id, data, variants } = sanitizeUpdate(item);
          const updated = await prisma.product.update({
            where: { id },
            data,
            select: { id: true, updatedAt: true, isActive: true, trackStock: true },
          });
          if (variants !== undefined && existing?.shopId) {
            await prisma.productVariant.deleteMany({ where: { productId: id } });
            if (variants.length > 0) {
              await prisma.productVariant.createMany({
                data: variants.map((variant, index) => ({
                  id: variant.id,
                  shopId: existing.shopId,
                  productId: id,
                  label: variant.label,
                  sellPrice: variant.sellPrice,
                  sku: variant.sku,
                  barcode: variant.barcode,
                  sortOrder: variant.sortOrder ?? index,
                  isActive: variant.isActive,
                })),
              });
            }
          }
          updatedRows.push({
            id: updated.id,
            updatedAt: updated.updatedAt.toISOString(),
            isActive: updated.isActive,
            trackStock: updated.trackStock,
          });
        }
      }

      // Delete
      if (deleteItems.length > 0) {
        const allowedDeleteIds: string[] = [];
        for (const item of deleteItems) {
          const existing = deleteExistingById.get(item.id);
          if (!existing) {
            allowedDeleteIds.push(item.id);
            continue;
          }
          const clientUpdatedAt = toDateOrUndefined(item.updatedAt);
          if (!item.force && clientUpdatedAt && existing.updatedAt > clientUpdatedAt) {
            conflicts.push({
              id: existing.id,
              action: "delete",
              reason: "stale_delete",
              serverUpdatedAt: existing.updatedAt.toISOString(),
            });
            continue;
          }
          allowedDeleteIds.push(item.id);
        }

        if (allowedDeleteIds.length > 0) {
          const referenced = await prisma.saleItem.findMany({
            where: { productId: { in: allowedDeleteIds } },
            select: { productId: true },
            distinct: ["productId"],
          });
          const archiveIds = referenced.map((row) => row.productId);
          const archiveSet = new Set(archiveIds);
          const hardDeleteIds = allowedDeleteIds.filter((id) => !archiveSet.has(id));

          if (archiveIds.length > 0) {
            await prisma.product.updateMany({
              where: { id: { in: archiveIds } },
              data: {
                isActive: false,
                trackStock: false,
              },
            });
            const archived = await prisma.product.findMany({
              where: { id: { in: archiveIds } },
              select: { id: true, updatedAt: true, isActive: true, trackStock: true },
            });
            archived.forEach((row) => {
              updatedRows.push({
                id: row.id,
                updatedAt: row.updatedAt.toISOString(),
                isActive: row.isActive,
                trackStock: row.trackStock,
              });
              archivedRows.push(row.id);
            });
          }

          if (hardDeleteIds.length > 0) {
            await prisma.product.deleteMany({ where: { id: { in: hardDeleteIds } } });
            deletedRows.push(...hardDeleteIds);
          }
        }
      }

      if (shopIds.size > 0) {
        for (const shopId of shopIds) {
          await publishRealtimeEvent(REALTIME_EVENTS.stockUpdated, shopId, {
            synced: true,
          });
        }
        revalidateReportsForProduct();
      }

      return NextResponse.json({
        success: true,
        conflicts,
        updated: updatedRows,
        deleted: deletedRows,
        archived: archivedRows,
      });
    } catch (e: any) {
      console.error("Product sync failed", e);
      return NextResponse.json(
        { success: false, error: e?.message || "Sync failed" },
        { status: 500 }
      );
    }
  });
}
