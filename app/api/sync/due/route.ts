// app/api/sync/due/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

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
    const body = await req.json();
    const customers: IncomingCustomer[] = Array.isArray(body?.customers)
      ? body.customers
      : [];
    const payments: IncomingPayment[] = Array.isArray(body?.payments)
      ? body.payments
      : [];

    if (customers.length === 0 && payments.length === 0) {
      return NextResponse.json({ success: true });
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
