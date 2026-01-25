// app/api/sync/products/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { assertShopAccess } from "@/lib/shop-access";
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
});

const productUpdateSchema = productCreateSchema.extend({
  id: z.string(),
});

const syncBodySchema = z.object({
  newItems: z.array(productCreateSchema).optional().default([]),
  updatedItems: z.array(productUpdateSchema).optional().default([]),
  deletedIds: z.array(z.string()).optional().default([]),
});

type IncomingProduct = Record<string, any>;

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

export async function POST(req: Request) {
  return withTracing(req, "sync-products", async () => {
    try {
      const rl = rateLimit(req, { windowMs: 60_000, max: 120, keyPrefix: "sync-products" });
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

      // ---------- AuthZ guard ----------
      const user = await requireUser();

      const shopIds = new Set<string>();
      (Array.isArray(newItems) ? newItems : []).forEach((p) => {
        if (p?.shopId) shopIds.add(p.shopId);
      });

      const updateIds = (Array.isArray(updatedItems) ? updatedItems : [])
        .map((p) => p?.id)
        .filter(Boolean) as string[];

      const deleteIds = Array.isArray(deletedIds) ? (deletedIds as string[]) : [];

      if (updateIds.length) {
        const existing = await prisma.product.findMany({
          where: { id: { in: updateIds } },
          select: { id: true, shopId: true },
        });
        existing.forEach((p) => shopIds.add(p.shopId));
      }

      if (deleteIds.length) {
        const existing = await prisma.product.findMany({
          where: { id: { in: deleteIds } },
          select: { id: true, shopId: true },
        });
        existing.forEach((p) => shopIds.add(p.shopId));
      }

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
      }

      // Update existing
      if (Array.isArray(updatedItems) && updatedItems.length > 0) {
        for (const item of updatedItems) {
          const { id, data } = sanitizeUpdate(item);
          await prisma.product.update({
            where: { id },
            data,
          });
        }
      }

      // Delete
    if (Array.isArray(deletedIds) && deletedIds.length > 0) {
      const deleteTargets = deletedIds as string[];
      const referenced = await prisma.saleItem.findMany({
        where: { productId: { in: deleteTargets } },
        select: { productId: true },
        distinct: ["productId"],
      });
      const archiveIds = referenced.map((row) => row.productId);
      const archiveSet = new Set(archiveIds);
      const hardDeleteIds = deleteTargets.filter((id) => !archiveSet.has(id));

      if (archiveIds.length > 0) {
        await prisma.product.updateMany({
          where: { id: { in: archiveIds } },
          data: {
            isActive: false,
            trackStock: false,
          },
        });
      }

      if (hardDeleteIds.length > 0) {
        await prisma.product.deleteMany({ where: { id: { in: hardDeleteIds } } });
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

      return NextResponse.json({ success: true });
    } catch (e: any) {
      console.error("Product sync failed", e);
      return NextResponse.json(
        { success: false, error: e?.message || "Sync failed" },
        { status: 500 }
      );
    }
  });
}
