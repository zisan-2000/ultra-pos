// app/api/sync/expenses/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { assertShopAccess } from "@/lib/shop-access";
import { hasPermission } from "@/lib/rbac";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { publishRealtimeEvent } from "@/lib/realtime/publisher";
import { REALTIME_EVENTS } from "@/lib/realtime/events";
import { revalidatePath } from "next/cache";
import { revalidateReportsForExpense } from "@/lib/reports/revalidate";

type IncomingExpense = {
  id?: string;
  shopId: string;
  amount: string | number;
  category: string;
  note?: string | null;
  expenseDate?: string | number | Date;
  createdAt?: number | string;
  updatedAt?: number | string | Date;
};

type SyncUpdatedRow = {
  id: string;
  updatedAt: string;
};

const expenseSchema = z.object({
  id: z.string().optional(),
  shopId: z.string(),
  amount: z.union([z.string(), z.number()]),
  category: z.string(),
  note: z.string().nullable().optional(),
  expenseDate: z.union([z.string(), z.number(), z.date()]).optional(),
  createdAt: z.union([z.string(), z.number()]).optional(),
  updatedAt: z.union([z.string(), z.number(), z.date()]).optional(),
  force: z.boolean().optional(),
});

const bodySchema = z.object({
  newItems: z.array(expenseSchema).optional().default([]),
  updatedItems: z.array(expenseSchema.extend({ id: z.string() })).optional().default([]),
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

function revalidateExpensePaths() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/expenses");
  revalidatePath("/dashboard/reports");
  revalidatePath("/dashboard/cash");
}

export async function POST(req: Request) {
  try {
    const rl = await rateLimit(req, { windowMs: 60_000, max: 120, keyPrefix: "sync-expenses" });
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

    if (newItems.length && !hasPermission(user, "create_expense")) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }
    if (updatedItems.length && !hasPermission(user, "update_expense")) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }
    if (deletedIds.length && !hasPermission(user, "delete_expense")) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    const shopIds = new Set<string>();
    (Array.isArray(newItems) ? newItems : []).forEach((e: IncomingExpense) => {
      if (e?.shopId) shopIds.add(e.shopId);
    });
    (Array.isArray(updatedItems) ? updatedItems : []).forEach((e: IncomingExpense) => {
      if (e?.shopId) shopIds.add(e.shopId);
    });

    const deleteItems = Array.isArray(deletedIds)
      ? deletedIds.map((item) => (typeof item === "string" ? { id: item } : item))
      : [];
    const deleteIds = deleteItems.map((item) => item.id);
    let deleteTargets: Array<{ id: string; shopId: string; amount: any; updatedAt: Date }> = [];
    if (deleteIds.length) {
      deleteTargets = await prisma.expense.findMany({
        where: { id: { in: deleteIds } },
        select: { id: true, shopId: true, amount: true, updatedAt: true },
      });
      deleteTargets.forEach((e) => shopIds.add(e.shopId));
    }
    const deleteById = new Map(deleteTargets.map((e) => [e.id, e]));

    const hasCreateOrUpdate = newItems.length > 0 || updatedItems.length > 0;
    const hasDeletes = deleteIds.length > 0;
    const hasShopScope = shopIds.size > 0;

    if (hasCreateOrUpdate && !hasShopScope) {
      return NextResponse.json(
        { success: false, error: "shopId required to sync expenses" },
        { status: 400 },
      );
    }

    // If we only received deleteIds that don't exist on server, treat as no-op.
    if (!hasCreateOrUpdate && hasDeletes && deleteTargets.length === 0) {
      return NextResponse.json({ success: true, skippedDeletes: deleteIds.length });
    }

    for (const shopId of shopIds) {
      await assertShopAccess(shopId, user);
    }

    if (Array.isArray(newItems) && newItems.length > 0) {
      const newIds = newItems.map((item) => item.id).filter(Boolean) as string[];
      const existingNewIds = newIds.length
        ? await prisma.expense.findMany({
            where: { id: { in: newIds } },
            select: { id: true },
          })
        : [];
      const existingNewSet = new Set(existingNewIds.map((e) => e.id));

      const data = newItems.map((item: IncomingExpense) => ({
        id: item.id,
        shopId: item.shopId,
        amount: toMoney(item.amount),
        category: item.category || "Uncategorized",
        note: item.note || "",
        expenseDate: toDate(item.expenseDate),
        createdAt: toDate(item.createdAt ?? item.expenseDate),
      }));

      await prisma.expense.createMany({
        data,
        skipDuplicates: true,
      });

      if (newIds.length > 0) {
        const rows = await prisma.expense.findMany({
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

      const freshItems = newItems.filter(
        (item) => item.id && !existingNewSet.has(item.id)
      );
      if (freshItems.length > 0) {
        await prisma.cashEntry.createMany({
          data: freshItems.map((item) => ({
            shopId: item.shopId,
            entryType: "OUT",
            amount: toMoney(item.amount),
            reason: `Expense: ${item.category || "Uncategorized"} (#${
              item.id || "offline"
            })`,
            createdAt: toDate(item.expenseDate ?? item.createdAt),
          })),
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
      const updateIds = updatedItems
        .map((item) => item.id)
        .filter(Boolean) as string[];
      const existingUpdates = updateIds.length
        ? await prisma.expense.findMany({
            where: { id: { in: updateIds } },
            select: { id: true, shopId: true, amount: true, updatedAt: true },
          })
        : [];
      const existingById = new Map(existingUpdates.map((e) => [e.id, e]));

      for (const item of updatedItems as IncomingExpense[]) {
        if (!item.id) continue;
        const existing = existingById.get(item.id);
        if (!existing) continue;
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

        const prevAmount = Number(existing.amount);
        const nextAmount = Number(item.amount);
        const delta = Number((nextAmount - prevAmount).toFixed(2));

        const updated = await prisma.expense.update({
          where: { id: item.id },
          data: {
            amount: toMoney(item.amount),
            category: item.category || "Uncategorized",
            note: item.note || "",
            expenseDate: toDate(item.expenseDate),
          },
          select: { id: true, updatedAt: true },
        });
        updatedRows.push({
          id: updated.id,
          updatedAt: updated.updatedAt.toISOString(),
        });

        if (delta !== 0) {
          await prisma.cashEntry.create({
            data: {
              shopId: existing.shopId,
              entryType: delta > 0 ? "OUT" : "IN",
              amount: Math.abs(delta).toFixed(2),
              reason: `Expense adjustment #${item.id}`,
            },
          });
        }
      }
    }

    if (deleteItems.length > 0) {
      const allowedDeleteIds: string[] = [];
      for (const item of deleteItems) {
        const existing = deleteById.get(item.id);
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
        const deleteAllowedTargets = deleteTargets.filter((e) =>
          allowedDeleteIds.includes(e.id)
        );
        await prisma.cashEntry.createMany({
          data: deleteAllowedTargets.map((expense) => ({
            shopId: expense.shopId,
            entryType: "IN",
            amount: expense.amount,
            reason: `Reversal of expense #${expense.id}`,
          })),
        });
        await prisma.expense.deleteMany({
          where: { id: { in: allowedDeleteIds } },
        });
        deletedRows.push(...allowedDeleteIds);
      }
    }

    if (shopIds.size > 0) {
      for (const shopId of shopIds) {
        await Promise.all([
          publishRealtimeEvent(REALTIME_EVENTS.expenseCreated, shopId, {
            synced: true,
          }),
          publishRealtimeEvent(REALTIME_EVENTS.cashUpdated, shopId, {
            synced: true,
          }),
        ]);
      }
      revalidateExpensePaths();
      revalidateReportsForExpense();
    }

    return NextResponse.json({
      success: true,
      conflicts,
      updated: updatedRows,
      deleted: deletedRows,
    });
  } catch (e: any) {
    console.error("Expense sync failed", e);
    return NextResponse.json(
      { success: false, error: e?.message || "Sync failed" },
      { status: 500 }
    );
  }
}
