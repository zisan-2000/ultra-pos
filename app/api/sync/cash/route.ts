// app/api/sync/cash/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type IncomingCash = {
  id?: string;
  shopId: string;
  entryType: "IN" | "OUT";
  amount: string | number;
  reason?: string | null;
  createdAt?: number | string | Date;
};

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
    const body = await req.json();
    const { newItems = [], updatedItems = [], deletedIds = [] } = body || {};

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
