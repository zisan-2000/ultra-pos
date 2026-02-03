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

  return {
    id: item.id, // keep client-generated id when present
    shopId,
    name: item.name || "Unnamed product",
    category: item.category || "Uncategorized",
    buyPrice: buyPrice === undefined ? undefined : buyPrice, // undefined omits field, null sets null
    sellPrice,
    stockQty,
    trackStock: Boolean(item.trackStock),
    isActive: item.isActive !== false,
  };
}

function sanitizeUpdate(item: IncomingProduct) {
  const { id } = item;
  if (!id) throw new Error("id is required for update");

  const payload: Record<string, any> = {};

  if (item.name !== undefined) payload.name = item.name || "Unnamed product";
  if (item.category !== undefined) payload.category = item.category || "Uncategorized";
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

  return { id, data: payload };
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
        await prisma.product.createMany({ data: sanitized as any, skipDuplicates: true });
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
          const { id, data } = sanitizeUpdate(item);
          const updated = await prisma.product.update({
            where: { id },
            data,
            select: { id: true, updatedAt: true, isActive: true, trackStock: true },
          });
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
