// app/api/sync/cash/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { assertShopAccess } from "@/lib/shop-access";
import { hasPermission } from "@/lib/rbac";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { publishRealtimeEvent } from "@/lib/realtime/publisher";
import { REALTIME_EVENTS } from "@/lib/realtime/events";
import { revalidateReportsForCash } from "@/lib/reports/revalidate";

type IncomingCash = {
  id?: string;
  shopId: string;
  entryType?: "IN" | "OUT";
  amount: string | number;
  reason?: string | null;
  createdAt?: number | string | Date;
  updatedAt?: number | string | Date;
  force?: boolean;
};

type SyncUpdatedRow = {
  id: string;
  updatedAt: string;
};

const cashSchema = z.object({
  id: z.string().optional(),
  shopId: z.string(),
  entryType: z.enum(["IN", "OUT"]).optional(),
  amount: z.union([z.string(), z.number()]),
  reason: z.string().nullable().optional(),
  createdAt: z.union([z.string(), z.number(), z.date()]).optional(),
  updatedAt: z.union([z.string(), z.number(), z.date()]).optional(),
  force: z.boolean().optional(),
});

const bodySchema = z.object({
  newItems: z.array(cashSchema).optional().default([]),
  updatedItems: z.array(cashSchema.extend({ id: z.string() })).optional().default([]),
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

function toMoney(value: string | number) {
  const num = Number(value);
  if (!Number.isFinite(num)) throw new Error("Invalid amount");
  return num.toFixed(2);
}

function toDate(value?: number | string | Date) {
  const d = value ? new Date(value) : new Date();
  if (!Number.isFinite(d.getTime())) return new Date();
  return d;
}

function toDateOrUndefined(value?: number | string | Date) {
  if (!value) return undefined;
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return undefined;
  return d;
}

export async function POST(req: Request) {
  try {
    const rl = await rateLimit(req, { windowMs: 60_000, max: 120, keyPrefix: "sync-cash" });
    if (rl.limited) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429, headers: rl.headers },
      );
    }

    const raw = await req.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid payload", details: parsed.error.format() },
        { status: 400 },
      );
    }

    const { newItems, updatedItems, deletedIds } = parsed.data;
    const updatedRows: SyncUpdatedRow[] = [];
    const deletedRows: string[] = [];

    const user = await requireUser();
    if (!hasPermission(user, "sync_offline_data")) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    if (newItems.length && !hasPermission(user, "create_cash_entry")) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }
    if (updatedItems.length && !hasPermission(user, "update_cash_entry")) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }
    if (deletedIds.length && !hasPermission(user, "delete_cash_entry")) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    const shopIds = new Set<string>();
    (Array.isArray(newItems) ? newItems : []).forEach((c: IncomingCash) => {
      if (c?.shopId) shopIds.add(c.shopId);
    });
    (Array.isArray(updatedItems) ? updatedItems : []).forEach((c: IncomingCash) => {
      if (c?.shopId) shopIds.add(c.shopId);
    });

    const deleteItems = Array.isArray(deletedIds)
      ? deletedIds.map((item) => (typeof item === "string" ? { id: item } : item))
      : [];
    const deleteIds = deleteItems.map((item) => item.id);
    const existingById = new Map<string, { id: string; shopId: string; updatedAt: Date }>();
    if (deleteIds.length) {
      const existing = await prisma.cashEntry.findMany({
        where: { id: { in: deleteIds } },
        select: { id: true, shopId: true, updatedAt: true },
      });
      existing.forEach((c) => shopIds.add(c.shopId));
      existing.forEach((c) => existingById.set(c.id, c));
    }

    if ((newItems.length || updatedItems.length || deleteIds.length) && shopIds.size === 0) {
      return NextResponse.json(
        { success: false, error: "shopId required to sync cash entries" },
        { status: 400 },
      );
    }

    for (const shopId of shopIds) {
      await assertShopAccess(shopId, user);
    }

    if (Array.isArray(newItems) && newItems.length > 0) {
      const data = newItems.map((item: IncomingCash) => ({
        id: item.id,
        shopId: item.shopId,
        entryType: item.entryType || "IN",
        amount: toMoney(item.amount),
        reason: item.reason || "",
        createdAt: toDate(item.createdAt),
      }));

      await prisma.cashEntry.createMany({
        data,
        skipDuplicates: true,
      });

      const newIds = newItems.map((item) => item.id).filter(Boolean) as string[];
      if (newIds.length > 0) {
        const rows = await prisma.cashEntry.findMany({
          where: { id: { in: newIds } },
          select: { id: true, updatedAt: true },
        });
        rows.forEach((row) => {
          updatedRows.push({
            id: row.id,
            updatedAt: row.updatedAt.toISOString(),
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

    if (Array.isArray(updatedItems) && updatedItems.length > 0) {
      for (const item of updatedItems as IncomingCash[]) {
        if (!item.id) continue;
        const existing = await prisma.cashEntry.findUnique({
          where: { id: item.id },
          select: { id: true, updatedAt: true, shopId: true },
        });
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
        const updated = await prisma.cashEntry.update({
          where: { id: item.id },
          data: {
            entryType: item.entryType || "IN",
            amount: toMoney(item.amount),
            reason: item.reason || "",
          },
          select: { id: true, updatedAt: true },
        });
        updatedRows.push({
          id: updated.id,
          updatedAt: updated.updatedAt.toISOString(),
        });
      }
    }

    if (deleteItems.length > 0) {
      const allowedDeleteIds: string[] = [];
      for (const item of deleteItems) {
        const existing = existingById.get(item.id);
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
        await prisma.cashEntry.deleteMany({
          where: { id: { in: allowedDeleteIds } },
        });
        deletedRows.push(...allowedDeleteIds);
      }
    }

    if (shopIds.size > 0) {
      for (const shopId of shopIds) {
        await publishRealtimeEvent(REALTIME_EVENTS.cashUpdated, shopId, {
          synced: true,
        });
      }
      revalidateReportsForCash();
    }

    return NextResponse.json({
      success: true,
      conflicts,
      updated: updatedRows,
      deleted: deletedRows,
    });
  } catch (e: any) {
    console.error("Cash sync failed", e);
    return NextResponse.json(
      { success: false, error: e?.message || "Sync failed" },
      { status: 500 }
    );
  }
}
