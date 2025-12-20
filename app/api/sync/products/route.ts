// app/api/sync/products/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type IncomingProduct = Record<string, any>;

function toMoneyString(
  value: string | number | null | undefined,
  field: string,
  options?: { allowNull?: boolean; defaultValue?: string }
) {
  if (value === null || value === undefined || value === "") {
    if (options?.allowNull) return null;
    if (options?.defaultValue !== undefined) return options.defaultValue;
    throw new Error(`${field} is required`);
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new Error(`${field} must be a valid number`);
  }
  return num.toFixed(2);
}

function sanitizeCreate(item: IncomingProduct) {
  const shopId = item.shopId;
  if (!shopId) throw new Error("shopId is required");

  const sellPrice = toMoneyString(item.sellPrice ?? "0", "sellPrice");
  const stockQty = toMoneyString(item.stockQty ?? "0", "stockQty", {
    defaultValue: "0.00",
  });
  const buyPrice = item.buyPrice !== undefined
    ? toMoneyString(item.buyPrice, "buyPrice", { allowNull: true })
    : undefined;

  return {
    id: item.id, // keep client-generated id when present
    shopId,
    name: item.name || "Unnamed product",
    category: item.category || "Uncategorized",
    buyPrice: buyPrice === undefined ? undefined : buyPrice, // undefined omits field, null sets null
    sellPrice,
    stockQty,
    trackStock: Boolean(item.trackStock),
    isActive: item.isActive !== false,
  };
}

function sanitizeUpdate(item: IncomingProduct) {
  const { id } = item;
  if (!id) throw new Error("id is required for update");

  const payload: Record<string, any> = {};

  if (item.name !== undefined) payload.name = item.name || "Unnamed product";
  if (item.category !== undefined) payload.category = item.category || "Uncategorized";
  if (item.isActive !== undefined) payload.isActive = Boolean(item.isActive);
  if (item.trackStock !== undefined) payload.trackStock = Boolean(item.trackStock);

  if (item.buyPrice !== undefined) {
    payload.buyPrice = toMoneyString(item.buyPrice, "buyPrice", { allowNull: true });
  }
  if (item.sellPrice !== undefined) {
    payload.sellPrice = toMoneyString(item.sellPrice, "sellPrice");
  }
  if (item.stockQty !== undefined) {
    payload.stockQty = toMoneyString(item.stockQty, "stockQty", { defaultValue: "0.00" });
  }

  return { id, data: payload };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { newItems = [], updatedItems = [], deletedIds = [] } = body || {};

    // Insert new
    if (Array.isArray(newItems) && newItems.length > 0) {
      const sanitized = newItems.map(sanitizeCreate);
      await prisma.product.createMany({ data: sanitized as any, skipDuplicates: true });
    }

    // Update existing
    if (Array.isArray(updatedItems) && updatedItems.length > 0) {
      for (const item of updatedItems) {
        const { id, data } = sanitizeUpdate(item);
        await prisma.product.update({
          where: { id },
          data,
        });
      }
    }

    // Delete
    if (Array.isArray(deletedIds) && deletedIds.length > 0) {
      await prisma.product.deleteMany({ where: { id: { in: deletedIds } } });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("Product sync failed", e);
    return NextResponse.json(
      { success: false, error: e?.message || "Sync failed" },
      { status: 500 }
    );
  }
}
