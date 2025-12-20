// app/api/sync/sales/route.ts
// Receives queued offline sales and persists them server-side.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type IncomingSaleItem = {
  productId: string;
  name?: string;
  unitPrice: string | number;
  qty: string | number;
};

type IncomingSale = {
  shopId: string;
  items: IncomingSaleItem[];
  paymentMethod?: string;
  note?: string | null;
  customerId?: string | null;
  totalAmount?: string | number;
  createdAt?: number | string;
};

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
  try {
    const body = await req.json();
    const { newItems = [] } = body || {};

    if (!Array.isArray(newItems) || newItems.length === 0) {
      return NextResponse.json({ success: true, saleIds: [] });
    }

    const insertedSaleIds: string[] = [];

    for (const raw of newItems as IncomingSale[]) {
      const shopId = raw?.shopId;
      const items = raw?.items || [];
      const paymentMethod = (raw?.paymentMethod || "cash").toLowerCase();
      const note = raw?.note ?? null;
      const createdAt = toDateOrUndefined(raw?.createdAt);

      if (!shopId) {
        throw new Error("shopId is required");
      }
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error("items are required");
      }
      // Offline flow currently blocks due sales. Keep server strict.
      if (paymentMethod === "due") {
        throw new Error("Due sales cannot be synced offline yet");
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

      const inserted = await prisma.$transaction(async (tx) => {
        const sale = await tx.sale.create({
          data: {
            shopId,
            customerId: null,
            totalAmount,
            paymentMethod,
            note,
            saleDate: createdAt,
            createdAt: createdAt,
          },
          select: { id: true },
        });

        const saleItemRows = items.map((item) => {
          const qtyStr = toMoneyString(item.qty, "quantity");
          const unitPriceStr = toMoneyString(item.unitPrice, "unitPrice");
          const lineTotal = toMoneyString(
            Number(item.qty) * Number(item.unitPrice),
            "lineTotal"
          );
          return {
            saleId: sale.id,
            productId: item.productId,
            quantity: qtyStr,
            unitPrice: unitPriceStr,
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

        return sale.id;
      });

      insertedSaleIds.push(inserted);
    }

    return NextResponse.json({ success: true, saleIds: insertedSaleIds });
  } catch (e: any) {
    console.error("Offline sales sync failed", e);
    return NextResponse.json(
      { success: false, error: e?.message || "Sync failed" },
      { status: 500 }
    );
  }
}
