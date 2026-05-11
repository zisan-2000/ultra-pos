"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { assertShopAccess } from "@/lib/shop-access";

type SerialStatus = "IN_STOCK" | "SOLD" | "RETURNED" | "DAMAGED";

export type UpdateSerialRecordInput = {
  shopId: string;
  serialId: string;
  serialNo: string;
  status: SerialStatus;
  note?: string | null;
};

export async function updateSerialRecord(input: UpdateSerialRecordInput) {
  const user = await requireUser();
  requirePermission(user, "update_product");
  await assertShopAccess(input.shopId, user);

  const serialNo = String(input.serialNo ?? "").trim().toUpperCase();
  if (!serialNo) throw new Error("Serial number দিন");
  if (!input.serialId) throw new Error("Serial record ID নেই");

  const allowed: SerialStatus[] = ["IN_STOCK", "SOLD", "RETURNED", "DAMAGED"];
  if (!allowed.includes(input.status)) {
    throw new Error("Invalid serial status");
  }
  await prisma.$transaction(async (tx) => {
    const row = await tx.serialNumber.findFirst({
      where: {
        id: input.serialId,
        shopId: input.shopId,
      },
      select: {
        id: true,
        productId: true,
        variantId: true,
        serialNo: true,
        status: true,
        note: true,
        saleItemId: true,
        product: {
          select: {
            name: true,
            trackStock: true,
          },
        },
      },
    });

    if (!row) throw new Error("Serial record পাওয়া যায়নি");
    if (input.status === "SOLD" && row.status !== "SOLD") {
      throw new Error("SOLD status manual ভাবে সেট করা যাবে না");
    }
    if (row.status === "SOLD") {
      if (input.status !== "SOLD") {
        throw new Error("SOLD serial status sale return/void ছাড়া বদলানো যাবে না");
      }
      if (serialNo !== row.serialNo) {
        throw new Error("SOLD serial number edit করা যাবে না");
      }
    }

    if (serialNo !== row.serialNo) {
      const duplicate = await tx.serialNumber.findFirst({
        where: {
          shopId: input.shopId,
          productId: row.productId,
          serialNo,
          id: { not: row.id },
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new Error(`Serial "${serialNo}" আগে থেকেই আছে`);
      }
    }

    const statusChanged = row.status !== input.status;
    const userNote = input.note?.trim() || "";
    const statusNote = statusChanged
      ? `Manual status update: ${row.status} → ${input.status}`
      : "";
    const note = [statusNote, userNote].filter(Boolean).join("\n");

    const wasInStock = row.status === "IN_STOCK";
    const willBeInStock = input.status === "IN_STOCK";
    if (row.product.trackStock && wasInStock !== willBeInStock) {
      if (row.variantId) {
        const updated = await tx.productVariant.updateMany({
          where: {
            id: row.variantId,
            ...(wasInStock && !willBeInStock
              ? { stockQty: { gte: 1 } }
              : {}),
          },
          data: {
            stockQty: wasInStock && !willBeInStock
              ? { decrement: 1 }
              : { increment: 1 },
          },
        });
        if (updated.count !== 1) {
          throw new Error(`"${row.product.name}" variant stock sync ব্যর্থ হয়েছে`);
        }
      } else {
        const updated = await tx.product.updateMany({
          where: {
            id: row.productId,
            trackStock: true,
            ...(wasInStock && !willBeInStock
              ? { stockQty: { gte: 1 } }
              : {}),
          },
          data: {
            stockQty: wasInStock && !willBeInStock
              ? { decrement: 1 }
              : { increment: 1 },
          },
        });
        if (updated.count !== 1) {
          throw new Error(`"${row.product.name}" stock sync ব্যর্থ হয়েছে`);
        }
      }
    }

    await tx.serialNumber.update({
      where: { id: row.id },
      data: {
        serialNo,
        status: input.status,
        note: note || null,
        ...(input.status === "IN_STOCK" || input.status === "RETURNED" || input.status === "DAMAGED"
          ? { saleItemId: null }
          : {}),
      },
    });
  });

  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/products/serials");

  return { success: true };
}
