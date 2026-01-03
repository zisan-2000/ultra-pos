// app/api/sync/cash/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { assertShopAccess } from "@/lib/shop-access";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";

type IncomingCash = {
  id?: string;
  shopId: string;
  entryType?: "IN" | "OUT";
  amount: string | number;
  reason?: string | null;
  createdAt?: number | string | Date;
};

const cashSchema = z.object({
  id: z.string().optional(),
  shopId: z.string(),
  entryType: z.enum(["IN", "OUT"]).optional(),
  amount: z.union([z.string(), z.number()]),
  reason: z.string().nullable().optional(),
  createdAt: z.union([z.string(), z.number(), z.date()]).optional(),
});

const bodySchema = z.object({
  newItems: z.array(cashSchema).optional().default([]),
  updatedItems: z.array(cashSchema.extend({ id: z.string() })).optional().default([]),
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

export async function POST(req: Request) {
  try {
    const rl = rateLimit(req, { windowMs: 60_000, max: 120, keyPrefix: "sync-cash" });
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
    (Array.isArray(newItems) ? newItems : []).forEach((c: IncomingCash) => {
      if (c?.shopId) shopIds.add(c.shopId);
    });
    (Array.isArray(updatedItems) ? updatedItems : []).forEach((c: IncomingCash) => {
      if (c?.shopId) shopIds.add(c.shopId);
    });

    const deleteIds = Array.isArray(deletedIds) ? (deletedIds as string[]) : [];
    if (deleteIds.length) {
      const existing = await prisma.cashEntry.findMany({
        where: { id: { in: deleteIds } },
        select: { id: true, shopId: true },
      });
      existing.forEach((c) => shopIds.add(c.shopId));
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
    }

    if (Array.isArray(updatedItems) && updatedItems.length > 0) {
      for (const item of updatedItems as IncomingCash[]) {
        if (!item.id) continue;
        await prisma.cashEntry.update({
          where: { id: item.id },
          data: {
            entryType: item.entryType || "IN",
            amount: toMoney(item.amount),
            reason: item.reason || "",
          },
        });
      }
    }

    if (Array.isArray(deletedIds) && deletedIds.length > 0) {
      await prisma.cashEntry.deleteMany({
        where: { id: { in: deletedIds as string[] } },
      });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("Cash sync failed", e);
    return NextResponse.json(
      { success: false, error: e?.message || "Sync failed" },
      { status: 500 }
    );
  }
}
