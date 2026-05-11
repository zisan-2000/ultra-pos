"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { requirePermission } from "@/lib/rbac";
import { assertShopAccess } from "@/lib/shop-access";

type SerialMarkStatus = "RETURNED" | "DAMAGED";

export type StockAdjustmentInput = {
  shopId: string;
  productId: string;
  variantId?: string | null;
  newQty: number;
  reason: string;
  note?: string | null;
  serialAdjustment?: {
    increaseSerials?: string[] | null;
    decreaseSerials?: string[] | null;
    decreaseStatus?: SerialMarkStatus | null;
  } | null;
};

export async function createStockAdjustment(input: StockAdjustmentInput) {
  const user = await requireUser();
  requirePermission(user, "update_product");
  await assertShopAccess(input.shopId, user);

  if (!input.productId) throw new Error("Product ID required");
  if (!input.reason) throw new Error("Reason required");
  if (!Number.isFinite(input.newQty) || input.newQty < 0) {
    throw new Error("পরিমাণ অবশ্যই 0 বা তার বেশি হতে হবে");
  }

  const normalizeSerials = (list?: string[] | null) => {
    const seen = new Set<string>();
    const rows: string[] = [];
    for (const raw of list ?? []) {
      const serial = String(raw ?? "").trim().toUpperCase();
      if (!serial || seen.has(serial)) continue;
      seen.add(serial);
      rows.push(serial);
    }
    return rows;
  };

  const increaseSerials = normalizeSerials(input.serialAdjustment?.increaseSerials);
  const decreaseSerials = normalizeSerials(input.serialAdjustment?.decreaseSerials);
  const decreaseStatus: SerialMarkStatus =
    input.serialAdjustment?.decreaseStatus === "RETURNED" ? "RETURNED" : "DAMAGED";

  await prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: {
        id: input.productId,
        shopId: input.shopId,
      },
      select: {
        id: true,
        stockQty: true,
        trackStock: true,
        trackSerialNumbers: true,
        trackCutLength: true,
        variants: {
          where: { isActive: true },
          select: { id: true, label: true, stockQty: true },
        },
      },
    });

    if (!product) throw new Error("পণ্য পাওয়া যায়নি");
    if (!product.trackStock) throw new Error("এই পণ্যে স্টক ট্র্যাকিং চালু নেই");

    const hasVariants = product.variants.length > 0;
    if (hasVariants && !input.variantId) {
      throw new Error("ভ্যারিয়েন্ট বেছে নিন");
    }
    if (!hasVariants && input.variantId) {
      throw new Error("এই পণ্যে ভ্যারিয়েন্ট নেই");
    }

    const selectedVariant = input.variantId
      ? product.variants.find((variant) => variant.id === input.variantId) ?? null
      : null;

    if (input.variantId && !selectedVariant) {
      throw new Error("নির্বাচিত ভ্যারিয়েন্ট এই পণ্যের নয়");
    }

    const previousQty = selectedVariant
      ? Number(selectedVariant.stockQty)
      : Number(product.stockQty);

    const quantityChange = input.newQty - previousQty;
    const normalizedNewQty = Number(input.newQty.toFixed(2));

    if (product.trackSerialNumbers) {
      const isWholeNumber = (num: number) => Number.isInteger(num);
      if (!isWholeNumber(previousQty) || !isWholeNumber(normalizedNewQty)) {
        throw new Error("Serial tracking পণ্যে stock adjustment অবশ্যই পূর্ণসংখ্যা হবে");
      }

      const expectedDelta = Math.abs(normalizedNewQty - previousQty);
      if (expectedDelta > 0 && !Number.isInteger(expectedDelta)) {
        throw new Error("Serial reconciliation-এর জন্য valid quantity দিন");
      }

      const inStockSerialRows = await tx.serialNumber.findMany({
        where: {
          shopId: input.shopId,
          productId: input.productId,
          variantId: input.variantId ?? null,
          status: "IN_STOCK",
        },
        select: {
          id: true,
          serialNo: true,
        },
        orderBy: [{ createdAt: "asc" }, { serialNo: "asc" }],
      });

      const currentSerialCount = inStockSerialRows.length;
      const currentStockCount = Math.round(previousQty);
      const serialDrift = currentSerialCount - currentStockCount;
      const reconcilingDriftOnly = quantityChange === 0 && serialDrift !== 0;

      if (serialDrift !== 0 && quantityChange !== 0) {
        throw new Error(
          `আগে serial mismatch ঠিক করুন। stock ${currentStockCount}, IN_STOCK serial ${currentSerialCount}`
        );
      }

      const existing = await tx.serialNumber.findMany({
        where: {
          shopId: input.shopId,
          productId: input.productId,
          serialNo: { in: increaseSerials },
        },
        select: {
          id: true,
          serialNo: true,
          status: true,
          variantId: true,
        },
      });

      const existingBySerial = new Map(existing.map((row) => [row.serialNo, row]));
      const currentInStockSet = new Set(inStockSerialRows.map((row) => row.serialNo));

      const reactivateOrCreate = async (serials: string[], reasonLabel: string) => {
        if (serials.length === 0) return;

        for (const serial of serials) {
          const row = existingBySerial.get(serial);
          if (!row) continue;
          if (row.variantId && row.variantId !== (input.variantId ?? null)) {
            throw new Error(`Serial "${serial}" অন্য ভ্যারিয়েন্টের সাথে যুক্ত`);
          }
          if (row.status === "IN_STOCK") {
            throw new Error(`Serial "${serial}" ইতিমধ্যেই স্টকে আছে`);
          }
          if (row.status === "SOLD") {
            throw new Error(
              `Serial "${serial}" SOLD অবস্থায় আছে। sale return/void ছাড়া এটাকে স্টকে আনা যাবে না`
            );
          }
        }

        const toReactivate = serials.filter((serial) => existingBySerial.has(serial));
        const toCreate = serials.filter((serial) => !existingBySerial.has(serial));

        for (const serial of toReactivate) {
          const row = existingBySerial.get(serial)!;
          const statusNote = `${reasonLabel}: ${row.status} → IN_STOCK (${input.reason})`;
          await tx.serialNumber.update({
            where: { id: row.id },
            data: {
              status: "IN_STOCK",
              variantId: input.variantId ?? null,
              saleItemId: null,
              note: input.note?.trim()
                ? `${statusNote}\n${input.note.trim()}`
                : statusNote,
            },
          });
        }

        if (toCreate.length > 0) {
          await tx.serialNumber.createMany({
            data: toCreate.map((serialNo) => ({
              shopId: input.shopId,
              productId: input.productId,
              variantId: input.variantId ?? null,
              serialNo,
              status: "IN_STOCK",
              note: input.note?.trim() || `${reasonLabel} (${input.reason})`,
            })),
          });
        }
      };

      const markOutOfStock = async (serials: string[], reasonLabel: string) => {
        if (serials.length === 0) return;
        for (const serial of serials) {
          if (!currentInStockSet.has(serial)) {
            throw new Error(`Serial "${serial}" এখন IN_STOCK অবস্থায় নেই`);
          }
        }

        const updated = await tx.serialNumber.updateMany({
          where: {
            shopId: input.shopId,
            productId: input.productId,
            variantId: input.variantId ?? null,
            serialNo: { in: serials },
            status: "IN_STOCK",
          },
          data: {
            status: decreaseStatus,
            saleItemId: null,
            note: input.note?.trim()
              ? `${reasonLabel} (${input.reason})\n${input.note.trim()}`
              : `${reasonLabel} (${input.reason})`,
          },
        });

        if (updated.count !== serials.length) {
          throw new Error("কিছু serial IN_STOCK অবস্থায় পাওয়া যায়নি");
        }
      };

      if (reconcilingDriftOnly) {
        if (serialDrift > 0) {
          if (decreaseSerials.length !== serialDrift) {
            throw new Error(`Extra ${serialDrift}টি serial remove করতে ${serialDrift}টি serial বাছাই করুন`);
          }
          if (increaseSerials.length > 0) {
            throw new Error("Extra serial remove করার সময় increase serial দেওয়া যাবে না");
          }
          await markOutOfStock(decreaseSerials, "Serial-only reconciliation remove");
        } else {
          const missingCount = Math.abs(serialDrift);
          if (increaseSerials.length !== missingCount) {
            throw new Error(`Missing ${missingCount}টি serial add করতে ${missingCount}টি serial দিন`);
          }
          if (decreaseSerials.length > 0) {
            throw new Error("Missing serial add করার সময় decrease serial দেওয়া যাবে না");
          }
          await reactivateOrCreate(increaseSerials, "Serial-only reconciliation add");
        }
      } else if (quantityChange > 0) {
        const expected = Math.round(expectedDelta);
        if (increaseSerials.length !== expected) {
          throw new Error(`স্টক ${expected} বাড়াতে ${expected}টি serial দিন`);
        }
        if (decreaseSerials.length > 0) {
          throw new Error("Stock বাড়ানোর সময় decrease serial দেওয়া যাবে না");
        }
        await reactivateOrCreate(increaseSerials, "Stock adjustment add");
      } else if (quantityChange < 0) {
        const expected = Math.round(expectedDelta);
        if (decreaseSerials.length !== expected) {
          throw new Error(`স্টক ${expected} কমাতে ${expected}টি serial দিন`);
        }
        if (increaseSerials.length > 0) {
          throw new Error("Stock কমানোর সময় increase serial দেওয়া যাবে না");
        }
        await markOutOfStock(decreaseSerials, "Stock adjustment remove");
      }
    }

    let createdAdjustmentId: string | null = null;

    if (product.trackCutLength) {
      const remnantRows = await tx.remnantPiece.findMany({
        where: {
          shopId: input.shopId,
          productId: input.productId,
          variantId: input.variantId ?? null,
          status: "ACTIVE",
          remainingLength: { gt: 0 },
        },
        orderBy: [{ remainingLength: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          remainingLength: true,
          note: true,
        },
      });

      const activeRemnantQty = remnantRows.reduce(
        (sum, row) => sum + Number(row.remainingLength ?? 0),
        0
      );

      if (activeRemnantQty - previousQty > 0.000001) {
        throw new Error(
          `Active remnant ${activeRemnantQty.toFixed(
            2
          )}, কিন্তু stock ${previousQty.toFixed(
            2
          )}। আগে Remnant Tracking দেখে reconcile করুন।`
        );
      }

      if (quantityChange < 0) {
        createdAdjustmentId = crypto.randomUUID();
        let reductionRemaining = Number(Math.abs(quantityChange).toFixed(2));
        const implicitFullStock = Math.max(
          0,
          Number((previousQty - activeRemnantQty).toFixed(2))
        );

        if (implicitFullStock >= reductionRemaining) {
          reductionRemaining = 0;
        } else {
          reductionRemaining = Number(
            (reductionRemaining - implicitFullStock).toFixed(2)
          );
        }

        for (const piece of remnantRows) {
          if (reductionRemaining <= 0.000001) break;
          const pieceQty = Number(piece.remainingLength ?? 0);
          if (!Number.isFinite(pieceQty) || pieceQty <= 0) continue;

          const consumeQty = Math.min(pieceQty, reductionRemaining);
          const nextRemaining = Number((pieceQty - consumeQty).toFixed(2));

          if (nextRemaining <= 0.000001) {
            await tx.remnantPiece.update({
              where: { id: piece.id },
              data: {
                remainingLength: "0.00",
                status: "CONSUMED",
                note: input.note?.trim()
                  ? `Stock adjustment remove (${input.reason})\n${input.note.trim()}`
                  : `Stock adjustment remove (${input.reason})`,
              },
            });
          } else {
            await tx.remnantPiece.update({
              where: { id: piece.id },
              data: {
                remainingLength: nextRemaining.toFixed(2),
                status: "ACTIVE",
              },
            });
            await tx.remnantPiece.create({
              data: {
                shopId: input.shopId,
                productId: input.productId,
                variantId: input.variantId ?? null,
                originalLength: consumeQty.toFixed(2),
                remainingLength: "0.00",
                source: "STOCK_ADJUSTMENT",
                sourceRef: createdAdjustmentId,
                status: "CONSUMED",
                note: input.note?.trim()
                  ? `Partial remnant reduction (${input.reason})\n${input.note.trim()}`
                  : `Partial remnant reduction (${input.reason})`,
              },
            });
          }

          reductionRemaining = Number(
            (reductionRemaining - consumeQty).toFixed(2)
          );
        }
      }
    }

    if (input.variantId) {
      await tx.productVariant.update({
        where: { id: input.variantId },
        data: { stockQty: normalizedNewQty.toFixed(2) },
      });
    } else {
      await tx.product.update({
        where: { id: input.productId },
        data: { stockQty: normalizedNewQty.toFixed(2) },
      });
    }

    await tx.stockAdjustment.create({
      data: {
        id: createdAdjustmentId ?? undefined,
        shopId: input.shopId,
        productId: input.productId,
        variantId: input.variantId ?? null,
        reason: input.reason,
        note: input.note?.trim() || null,
        quantityChange: quantityChange.toFixed(2),
        previousQty: previousQty.toFixed(2),
        newQty: normalizedNewQty.toFixed(2),
      },
    });
  });

  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/products/adjustments");
  revalidatePath("/dashboard/products/serials");
  revalidatePath("/dashboard/products/remnants");

  return { success: true };
}

export async function getStockAdjustmentsByShop(shopId: string, limit = 500) {
  const user = await requireUser();
  requirePermission(user, "view_products");
  await assertShopAccess(shopId, user);

  const rows = await prisma.stockAdjustment.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      reason: true,
      note: true,
      quantityChange: true,
      previousQty: true,
      newQty: true,
      createdAt: true,
      product: { select: { id: true, name: true } },
      variant: { select: { label: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    reason: r.reason,
    note: r.note ?? null,
    quantityChange: r.quantityChange.toString(),
    previousQty: r.previousQty.toString(),
    newQty: r.newQty.toString(),
    createdAt: r.createdAt.toISOString(),
    productId: r.product.id,
    productName: r.product.name,
    variantLabel: r.variant?.label ?? null,
  }));
}
