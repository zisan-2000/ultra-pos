// app/api/sync/sales/route.ts
// Receives queued offline sales and persists them server-side.

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/rbac";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { withTracing } from "@/lib/tracing";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { publishRealtimeEvent } from "@/lib/realtime/publisher";
import { REALTIME_EVENTS } from "@/lib/realtime/events";
import { revalidateReportsForSale } from "@/lib/reports/revalidate";
import {
  syncOfflineSalesBatch,
  type IncomingSale,
} from "@/lib/sales/sync-offline-sales";

const saleItemSchema = z.object({
  productId: z.string(),
  name: z.string().optional(),
  unitPrice: z.union([z.string(), z.number()]),
  qty: z.union([z.string(), z.number()]),
});

const saleSchema = z.object({
  id: z.string().optional(),
  shopId: z.string(),
  items: z.array(saleItemSchema).min(1),
  paymentMethod: z.string().optional(),
  note: z.string().nullable().optional(),
  customerId: z.string().nullable().optional(),
  paidNow: z.union([z.string(), z.number()]).optional(),
  totalAmount: z.union([z.string(), z.number()]).optional(),
  createdAt: z.union([z.string(), z.number()]).optional(),
});

const bodySchema = z.object({
  newItems: z.array(saleSchema).optional().default([]),
});

export async function POST(req: Request) {
  return withTracing(req, "sync-sales", async () => {
    try {
      const rl = await rateLimit(req, { windowMs: 60_000, max: 120, keyPrefix: "sync-sales" });
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

      const { newItems } = parsed.data;

      // AuthZ guard
      let user;
      try {
        user = await requireUser();
      } catch {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
      }

      if (!hasPermission(user, "sync_offline_data")) {
        return NextResponse.json(
          { success: false, error: "Forbidden" },
          { status: 403 },
        );
      }

      if (!hasPermission(user, "create_sale")) {
        return NextResponse.json(
          { success: false, error: "Forbidden" },
          { status: 403 },
        );
      }

      const needsDuePermission = newItems.some(
        (sale) => (sale?.paymentMethod || "cash").toString().toLowerCase() === "due",
      );
      if (needsDuePermission && !hasPermission(user, "create_due_sale")) {
        return NextResponse.json(
          { success: false, error: "Forbidden" },
          { status: 403 },
        );
      }

      if (!Array.isArray(newItems) || newItems.length === 0) {
        return NextResponse.json({ success: true, saleIds: [] });
      }

      const result = await syncOfflineSalesBatch({
        newItems: newItems as IncomingSale[],
        user,
        db: prisma,
      });
      const insertedSaleIds = result.saleIds;

      for (const effect of result.effects) {
        const publishTasks: Promise<void>[] = [];
        publishTasks.push(
          publishRealtimeEvent(REALTIME_EVENTS.saleCommitted, effect.shopId, {
            saleId: effect.saleId,
            totalAmount: effect.totalAmount,
            paymentMethod: effect.paymentMethod,
            invoiceNo: effect.invoiceNo,
          })
        );

        const cashAmount =
          effect.paymentMethod === "cash"
            ? effect.totalAmount
            : effect.isDue && effect.payNow > 0
            ? effect.payNow
            : null;
        if (cashAmount) {
          publishTasks.push(
            publishRealtimeEvent(REALTIME_EVENTS.cashUpdated, effect.shopId, {
              amount: cashAmount,
              entryType: "IN",
            })
          );
        }

        if (effect.productIds.length > 0) {
          publishTasks.push(
            publishRealtimeEvent(REALTIME_EVENTS.stockUpdated, effect.shopId, {
              productIds: effect.productIds,
            })
          );
        }

        if (effect.isDue && effect.customerId) {
          publishTasks.push(
            publishRealtimeEvent(REALTIME_EVENTS.ledgerUpdated, effect.shopId, {
              customerId: effect.customerId,
            })
          );
        }

        await Promise.all(publishTasks);
      }

      if (insertedSaleIds.length) {
        revalidatePath("/dashboard");
        revalidatePath("/dashboard/sales");
        revalidatePath("/dashboard/reports");
        revalidatePath("/dashboard/cash");
        revalidatePath("/dashboard/products");
        revalidateReportsForSale();
      }

      return NextResponse.json({ success: true, saleIds: insertedSaleIds });
    } catch (e: any) {
      console.error("Offline sales sync failed", e);
      return NextResponse.json(
        { success: false, error: e?.message || "Sync failed" },
        { status: 500 }
      );
    }
  });
}
