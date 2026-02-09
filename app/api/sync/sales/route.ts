// app/api/sync/sales/route.ts
// Receives queued offline sales and persists them server-side.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth-session";
import { assertShopAccess } from "@/lib/shop-access";
import { hasPermission } from "@/lib/rbac";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { withTracing } from "@/lib/tracing";
import { revalidatePath } from "next/cache";
import { publishRealtimeEvent } from "@/lib/realtime/publisher";
import { REALTIME_EVENTS } from "@/lib/realtime/events";
import { revalidateReportsForSale } from "@/lib/reports/revalidate";
import { shopNeedsCogs } from "@/lib/accounting/cogs";
import { toDhakaBusinessDate } from "@/lib/dhaka-date";
import {
  allocateSalesInvoiceNumber,
  canIssueSalesInvoice,
} from "@/lib/sales-invoice";

type IncomingSaleItem = {
  productId: string;
  name?: string;
  unitPrice: string | number;
  qty: string | number;
};

type IncomingSale = {
  id?: string;
  shopId: string;
  items: IncomingSaleItem[];
  paymentMethod?: string;
  note?: string | null;
  customerId?: string | null;
  paidNow?: string | number;
  totalAmount?: string | number;
  createdAt?: number | string;
};

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

function toMoneyString(value: string | number, field: string) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new Error(`${field} must be a valid number`);
  }
  return num.toFixed(2);
}

function toDateOrUndefined(value?: number | string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

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

      const shopIds = new Set<string>();
      newItems.forEach((s: IncomingSale) => {
        if (s?.shopId) shopIds.add(s.shopId);
      });
      if (shopIds.size === 0) {
        return NextResponse.json({ success: false, error: "shopId is required" }, { status: 400 });
      }
      const shopById = new Map<string, Awaited<ReturnType<typeof assertShopAccess>>>();
      for (const shopId of shopIds) {
        const shop = await assertShopAccess(shopId, user);
        shopById.set(shopId, shop);
      }

      const insertedSaleIds: string[] = [];

      for (const raw of newItems as IncomingSale[]) {
        const shopId = raw?.shopId;
        const items = raw?.items || [];
        const paymentMethod = (raw?.paymentMethod || "cash").toLowerCase();
        const note = raw?.note ?? null;
        const createdAt = toDateOrUndefined(raw?.createdAt) ?? new Date();
        const businessDate = toDhakaBusinessDate(createdAt);
        const customerId = raw?.customerId ?? null;
        const clientSaleId = raw?.id;

        if (!shopId) {
          throw new Error("shopId is required");
        }
        const shop = shopById.get(shopId);
        if (!shop) {
          throw new Error("Shop not found");
        }
        const shouldIssueSalesInvoice = canIssueSalesInvoice(
          user,
          (shop as any).salesInvoiceEnabled
        );

        if (clientSaleId) {
          const existingSale = await prisma.sale.findUnique({
            where: { id: clientSaleId },
            select: { id: true, shopId: true },
          });
          if (existingSale) {
            if (existingSale.shopId !== shopId) {
              throw new Error("Sale id conflict");
            }
            insertedSaleIds.push(existingSale.id);
            continue;
          }
        }

        if (!Array.isArray(items) || items.length === 0) {
          throw new Error("items are required");
        }
        const isDue = paymentMethod === "due";
        if (isDue && !customerId) {
          throw new Error("Select a customer for due sale");
        }

        const productIds = items.map((i) => i.productId).filter(Boolean);
        if (productIds.length !== items.length) {
          throw new Error("Every item must include productId");
        }

        // Fetch products for validation and stock updates.
        const dbProducts = await prisma.product.findMany({
          where: { id: { in: productIds } },
        });

        if (dbProducts.length !== productIds.length) {
          throw new Error("One or more products not found");
        }

        for (const p of dbProducts) {
          if (p.shopId !== shopId) {
            throw new Error("Product does not belong to this shop");
          }
          if (!p.isActive) {
            throw new Error(`Inactive product in cart: ${p.name}`);
          }
        }

        const needsCogs = await shopNeedsCogs(shopId);
        if (needsCogs) {
          const missing = dbProducts.filter((p) => p.buyPrice == null);
          if (missing.length > 0) {
            const names = missing.map((p) => p.name).slice(0, 5).join(", ");
            throw new Error(
              `Purchase price missing for: ${names}${
                missing.length > 5 ? "..." : ""
              }. Set buy price to ensure accurate profit.`
            );
          }
        }

        const productMap = new Map(dbProducts.map((p) => [p.id, p]));

        // Compute totals from items to avoid trusting client totals.
        let computedTotal = 0;
        for (const item of items) {
          const qtyNum = Number(item.qty);
          const priceNum = Number(item.unitPrice);
          if (!Number.isFinite(qtyNum) || !Number.isFinite(priceNum)) {
            throw new Error("Item qty and price must be numbers");
          }
          computedTotal += qtyNum * priceNum;
        }
        const totalAmount = toMoneyString(
          raw?.totalAmount ?? computedTotal,
          "totalAmount"
        );
        const totalNum = Number(totalAmount);
        const payNowRaw = Number(raw?.paidNow ?? 0);
        const payNow = Math.min(
          Math.max(Number.isFinite(payNowRaw) ? payNowRaw : 0, 0),
          totalNum
        );

        const inserted = await prisma.$transaction(async (tx) => {
          if (isDue && customerId) {
            const existingCustomer = await tx.customer.findUnique({
              where: { id: customerId },
              select: { id: true, shopId: true, totalDue: true },
            });
            if (existingCustomer && existingCustomer.shopId !== shopId) {
              throw new Error("Customer not found for this shop");
            }
            if (!existingCustomer) {
              await tx.customer.create({
                data: {
                  id: customerId,
                  shopId,
                  name: "Customer",
                  totalDue: "0",
                },
              });
            }
          }

          const issuedInvoice = shouldIssueSalesInvoice
            ? await allocateSalesInvoiceNumber(tx, shopId, createdAt)
            : null;

          const sale = await tx.sale.create({
            data: {
              id: clientSaleId ?? undefined,
              shopId,
              customerId: isDue ? customerId : null,
              totalAmount,
              paymentMethod,
              note,
              invoiceNo: issuedInvoice?.invoiceNo ?? null,
              invoiceIssuedAt: issuedInvoice?.issuedAt ?? null,
              saleDate: createdAt,
              businessDate,
              createdAt: createdAt,
            },
            select: { id: true, invoiceNo: true },
          });

          if (paymentMethod === "cash") {
            await tx.cashEntry.create({
              data: {
                shopId,
                entryType: "IN",
                amount: totalAmount,
                reason: `Cash sale #${sale.id}`,
                createdAt: createdAt,
                businessDate,
              },
            });
          } else if (isDue && payNow > 0) {
            await tx.cashEntry.create({
              data: {
                shopId,
                entryType: "IN",
                amount: payNow.toFixed(2),
                reason: `Partial cash received for due sale #${sale.id}`,
                createdAt: createdAt,
                businessDate,
              },
            });
          }

          const saleItemRows = items.map((item) => {
            const qtyStr = toMoneyString(item.qty, "quantity");
            const unitPriceStr = toMoneyString(item.unitPrice, "unitPrice");
            const lineTotal = toMoneyString(
              Number(item.qty) * Number(item.unitPrice),
              "lineTotal"
            );
            const product = productMap.get(item.productId);
            const costAtSale = product?.buyPrice ?? null;
            return {
              saleId: sale.id,
              productId: item.productId,
              productNameSnapshot: item.name || product?.name || null,
              quantity: qtyStr,
              unitPrice: unitPriceStr,
              costAtSale,
              lineTotal,
            };
          });

          await tx.saleItem.createMany({ data: saleItemRows });

          // Update stock for tracked products
          for (const p of dbProducts) {
            if (p.trackStock === false) continue;
            const soldQty = items
              .filter((i) => i.productId === p.id)
              .reduce((sum, i) => sum + Number(i.qty || 0), 0);
            if (!Number.isFinite(soldQty) || soldQty === 0) continue;

            const currentStock = Number(p.stockQty || 0);
            const newStock = currentStock - soldQty;
            await tx.product.update({
              where: { id: p.id },
              data: { stockQty: toMoneyString(newStock, "stockQty") },
            });
          }

          if (isDue && customerId) {
            const dueAmount = Number((totalNum - payNow).toFixed(2));
            await tx.customerLedger.create({
              data: {
                shopId,
                customerId,
                entryType: "SALE",
                amount: totalAmount,
                description: note || "Due sale",
                entryDate: createdAt,
                businessDate,
              },
            });

            if (payNow > 0) {
              await tx.customerLedger.create({
                data: {
                  shopId,
                  customerId,
                  entryType: "PAYMENT",
                  amount: payNow.toFixed(2),
                  description: "Partial payment at sale",
                  entryDate: createdAt,
                  businessDate,
                },
              });
            }

            const current = await tx.customer.findUnique({
              where: { id: customerId },
              select: { totalDue: true },
            });
            const currentDue = new Prisma.Decimal(current?.totalDue ?? 0);
            const newDue = currentDue.add(new Prisma.Decimal(dueAmount));
            await tx.customer.update({
              where: { id: customerId },
              data: {
                totalDue: newDue.toFixed(2),
                lastPaymentAt: payNow > 0 ? new Date() : null,
              },
            });
          }

          return {
            saleId: sale.id,
            invoiceNo: sale.invoiceNo ?? null,
          };
        });

        insertedSaleIds.push(inserted.saleId);
        const publishTasks: Promise<void>[] = [];
        publishTasks.push(
          publishRealtimeEvent(REALTIME_EVENTS.saleCommitted, shopId, {
            saleId: inserted.saleId,
            totalAmount: totalNum,
            paymentMethod,
            invoiceNo: inserted.invoiceNo,
          })
        );

        const cashAmount =
          paymentMethod === "cash"
            ? totalNum
            : isDue && payNow > 0
            ? payNow
            : null;
        if (cashAmount) {
          publishTasks.push(
            publishRealtimeEvent(REALTIME_EVENTS.cashUpdated, shopId, {
              amount: cashAmount,
              entryType: "IN",
            })
          );
        }

        if (productIds.length > 0) {
          publishTasks.push(
            publishRealtimeEvent(REALTIME_EVENTS.stockUpdated, shopId, {
              productIds,
            })
          );
        }

        if (isDue && customerId) {
          publishTasks.push(
            publishRealtimeEvent(REALTIME_EVENTS.ledgerUpdated, shopId, {
              customerId,
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
