// app/api/sync/due/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth-session";
import { assertShopAccess } from "@/lib/shop-access";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";

type IncomingCustomer = {
  id?: string;
  shopId: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  totalDue?: string | number;
};

type IncomingPayment = {
  shopId: string;
  customerId: string;
  amount: string | number;
  description?: string | null;
  createdAt?: number | string | Date;
};

const customerSchema = z.object({
  id: z.string().optional(),
  shopId: z.string(),
  name: z.string(),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  totalDue: z.union([z.string(), z.number()]).optional(),
});

const paymentSchema = z.object({
  shopId: z.string(),
  customerId: z.string(),
  amount: z.union([z.string(), z.number()]),
  description: z.string().nullable().optional(),
  createdAt: z.union([z.string(), z.number(), z.date()]).optional(),
});

const bodySchema = z.object({
  customers: z.array(customerSchema).optional().default([]),
  payments: z.array(paymentSchema).optional().default([]),
});

function money(value: string | number) {
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
    const rl = rateLimit(req, { windowMs: 60_000, max: 120, keyPrefix: "sync-due" });
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
    const { customers, payments } = parsed.data;

    if (customers.length === 0 && payments.length === 0) {
      return NextResponse.json({ success: true });
    }

    const user = await requireUser();
    const shopIds = new Set<string>();
    customers.forEach((c) => {
      if (c?.shopId) shopIds.add(c.shopId);
    });
    payments.forEach((p) => {
      if (p?.shopId) shopIds.add(p.shopId);
    });

    if (shopIds.size === 0) {
      return NextResponse.json(
        { success: false, error: "shopId required to sync due data" },
        { status: 400 },
      );
    }

    for (const shopId of shopIds) {
      await assertShopAccess(shopId, user);
    }

    if (customers.length > 0) {
      const rows = customers.map((c) => ({
        id: c.id,
        shopId: c.shopId,
        name: c.name || "Customer",
        phone: c.phone || null,
        address: c.address || null,
        totalDue: c.totalDue !== undefined ? money(c.totalDue) : "0",
      }));
      await prisma.customer.createMany({
        data: rows,
        skipDuplicates: true,
      });
    }

    for (const p of payments) {
      const amountStr = money(p.amount);
      const createdAt = toDate(p.createdAt);

      const customer = await prisma.customer.findUnique({
        where: { id: p.customerId },
        select: { totalDue: true, shopId: true },
      });

      // If customer missing (out-of-order sync), create a stub
      if (!customer) {
        await prisma.customer.create({
          data: {
            id: p.customerId,
            shopId: p.shopId,
            name: "Customer",
            totalDue: "0",
          },
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.customerLedger.create({
          data: {
            shopId: p.shopId,
            customerId: p.customerId,
            entryType: "PAYMENT",
            amount: amountStr,
            description: p.description || "Offline payment",
            entryDate: createdAt,
          },
        });

        await tx.cashEntry.create({
          data: {
            shopId: p.shopId,
            entryType: "IN",
            amount: amountStr,
            reason: `Due payment from customer #${p.customerId}`,
            createdAt,
          },
        });

        const current = await tx.customer.findUnique({
          where: { id: p.customerId },
          select: { totalDue: true },
        });

        const currentDue = new Prisma.Decimal(current?.totalDue ?? 0);
        const nextDue = currentDue.sub(new Prisma.Decimal(amountStr));

        await tx.customer.update({
          where: { id: p.customerId },
          data: {
            totalDue: nextDue.toFixed(2),
            lastPaymentAt: new Date(),
          },
        });
      });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("Due sync failed", e);
    return NextResponse.json(
      { success: false, error: e?.message || "Sync failed" },
      { status: 500 }
    );
  }
}
