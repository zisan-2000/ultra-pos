// app/api/sync/expenses/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { assertShopAccess } from "@/lib/shop-access";
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
};

const expenseSchema = z.object({
  id: z.string().optional(),
  shopId: z.string(),
  amount: z.union([z.string(), z.number()]),
  category: z.string(),
  note: z.string().nullable().optional(),
  expenseDate: z.union([z.string(), z.number(), z.date()]).optional(),
  createdAt: z.union([z.string(), z.number()]).optional(),
});

const bodySchema = z.object({
  newItems: z.array(expenseSchema).optional().default([]),
  updatedItems: z.array(expenseSchema.extend({ id: z.string() })).optional().default([]),
  deletedIds: z.array(z.string()).optional().default([]),
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

function revalidateExpensePaths() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/expenses");
  revalidatePath("/dashboard/reports");
  revalidatePath("/dashboard/cash");
}

export async function POST(req: Request) {
  try {
    const rl = rateLimit(req, { windowMs: 60_000, max: 120, keyPrefix: "sync-expenses" });
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

    const user = await requireUser();

    const shopIds = new Set<string>();
    (Array.isArray(newItems) ? newItems : []).forEach((e: IncomingExpense) => {
      if (e?.shopId) shopIds.add(e.shopId);
    });
    (Array.isArray(updatedItems) ? updatedItems : []).forEach((e: IncomingExpense) => {
      if (e?.shopId) shopIds.add(e.shopId);
    });

    const deleteIds = Array.isArray(deletedIds) ? (deletedIds as string[]) : [];
    let deleteTargets: Array<{ id: string; shopId: string; amount: any }> = [];
    if (deleteIds.length) {
      deleteTargets = await prisma.expense.findMany({
        where: { id: { in: deleteIds } },
        select: { id: true, shopId: true, amount: true },
      });
      deleteTargets.forEach((e) => shopIds.add(e.shopId));
    }

    if ((newItems.length || updatedItems.length || deleteIds.length) && shopIds.size === 0) {
      return NextResponse.json(
        { success: false, error: "shopId required to sync expenses" },
        { status: 400 },
      );
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

    if (Array.isArray(updatedItems) && updatedItems.length > 0) {
      const updateIds = updatedItems
        .map((item) => item.id)
        .filter(Boolean) as string[];
      const existingUpdates = updateIds.length
        ? await prisma.expense.findMany({
            where: { id: { in: updateIds } },
            select: { id: true, shopId: true, amount: true },
          })
        : [];
      const existingById = new Map(existingUpdates.map((e) => [e.id, e]));

      for (const item of updatedItems as IncomingExpense[]) {
        if (!item.id) continue;
        const existing = existingById.get(item.id);
        if (!existing) continue;

        const prevAmount = Number(existing.amount);
        const nextAmount = Number(item.amount);
        const delta = Number((nextAmount - prevAmount).toFixed(2));

        await prisma.expense.update({
          where: { id: item.id },
          data: {
            amount: toMoney(item.amount),
            category: item.category || "Uncategorized",
            note: item.note || "",
            expenseDate: toDate(item.expenseDate),
          },
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

    if (Array.isArray(deletedIds) && deletedIds.length > 0) {
      if (deleteTargets.length > 0) {
        await prisma.cashEntry.createMany({
          data: deleteTargets.map((expense) => ({
            shopId: expense.shopId,
            entryType: "IN",
            amount: expense.amount,
            reason: `Reversal of expense #${expense.id}`,
          })),
        });
      }
      await prisma.expense.deleteMany({
        where: { id: { in: deletedIds as string[] } },
      });
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

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("Expense sync failed", e);
    return NextResponse.json(
      { success: false, error: e?.message || "Sync failed" },
      { status: 500 }
    );
  }
}
