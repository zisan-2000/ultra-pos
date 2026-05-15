// app/actions/purchases.ts

"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { requirePermission } from "@/lib/rbac";
import { assertShopAccess } from "@/lib/shop-access";
import { revalidatePath } from "next/cache";
import { revalidateReportsForProduct } from "@/lib/reports/revalidate";
import { shopHasInventoryModule } from "@/lib/accounting/cogs";
import {
  getDhakaDateString,
  parseDhakaDateOnlyRange,
  toDhakaBusinessDate,
} from "@/lib/dhaka-date";
import { auditActorSnapshot, logAudit } from "@/lib/audit/logger";
import { auditMoney } from "@/lib/audit/formatters";

type PurchaseItemInput = {
  productId: string;
  variantId?: string | null;
  qty: number | string;
  unitCost: number | string;
  unitConversionId?: string | null;
  serialNumbers?: string[] | null;
  batchNo?: string | null;
  batchExpiryDate?: string | null;
};

type CreatePurchaseInput = {
  shopId: string;
  items: PurchaseItemInput[];
  purchaseDate?: string;
  supplierId?: string | null;
  supplierName?: string | null;
  supplierPhone?: string | null;
  supplierAddress?: string | null;
  paymentMethod?: "cash" | "bkash" | "bank" | "due";
  paidNow?: number | string | null;
  transportCost?: number | string | null;
  unloadingCost?: number | string | null;
  carryingCost?: number | string | null;
  otherLandedCost?: number | string | null;
  note?: string | null;
};

type PurchaseReturnItemInput = {
  purchaseItemId: string;
  qty: number | string;
  serialNumbers?: string[] | null;
};

type CreatePurchaseReturnInput = {
  shopId: string;
  purchaseId: string;
  items: PurchaseReturnItemInput[];
  returnDate?: string;
  note?: string | null;
};

function toMoney(value: number | string, field: string) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error(`${field} must be a valid non-negative number`);
  }
  return num;
}

function normalizePurchaseDate(raw?: string | null) {
  const trimmed = raw?.trim();
  const day = trimmed || getDhakaDateString();
  const { start } = parseDhakaDateOnlyRange(day, day, true);
  return start ?? new Date(`${day}T00:00:00.000Z`);
}

function normalizeDateOnlyInput(raw?: string | null) {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error("Expiry date must be YYYY-MM-DD");
  }
  const date = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid expiry date");
  }
  return date;
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function allocateLandedCost<T extends { qty: number; lineTotal: number }>(
  rows: T[],
  landedCostTotal: number
) {
  if (!Number.isFinite(landedCostTotal) || landedCostTotal <= 0 || rows.length === 0) {
    return rows.map((row) => ({
      ...row,
      landedCostAllocated: 0,
      effectiveLineTotal: roundMoney(row.lineTotal),
      effectiveUnitCost: row.qty > 0 ? row.lineTotal / row.qty : 0,
    }));
  }

  const baseTotal = rows.reduce((sum, row) => sum + Math.max(0, row.lineTotal), 0);
  const totalQty = rows.reduce((sum, row) => sum + Math.max(0, row.qty), 0);
  let remaining = roundMoney(landedCostTotal);

  return rows.map((row, index) => {
    const isLast = index === rows.length - 1;
    const weight =
      baseTotal > 0
        ? row.lineTotal / baseTotal
        : totalQty > 0
        ? row.qty / totalQty
        : 1 / rows.length;
    const allocated = isLast ? remaining : roundMoney(landedCostTotal * weight);
    remaining = roundMoney(remaining - allocated);
    const effectiveLineTotal = roundMoney(row.lineTotal + allocated);
    const effectiveUnitCost = row.qty > 0 ? effectiveLineTotal / row.qty : row.lineTotal;
    return {
      ...row,
      landedCostAllocated: allocated,
      effectiveLineTotal,
      effectiveUnitCost,
    };
  });
}

async function getReturnedQtyByPurchaseItemId(
  purchaseId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma
) {
  const rows = await tx.purchaseReturnItem.groupBy({
    by: ["purchaseItemId"],
    where: {
      purchaseReturn: {
        purchaseId,
      },
    },
    _sum: {
      quantity: true,
    },
  });

  const returnedByItem = new Map<string, number>();
  for (const row of rows) {
    returnedByItem.set(
      row.purchaseItemId,
      Number(row._sum.quantity ?? 0)
    );
  }
  return returnedByItem;
}

async function reduceCutLengthForPurchaseReturn(
  tx: Prisma.TransactionClient,
  params: {
    shopId: string;
    productId: string;
    variantId: string | null;
    purchaseReturnItemId: string;
    qty: number;
  }
) {
  let remaining = new Prisma.Decimal(params.qty.toFixed(2));
  if (remaining.lte(0)) return;

  const remnantRows = await tx.remnantPiece.findMany({
    where: {
      shopId: params.shopId,
      productId: params.productId,
      variantId: params.variantId,
      status: "ACTIVE",
      remainingLength: { gt: 0 },
    },
    orderBy: [{ remainingLength: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      remainingLength: true,
    },
  });

  for (const piece of remnantRows) {
    if (remaining.lte(0)) break;
    const consume = Prisma.Decimal.min(piece.remainingLength, remaining);
    if (consume.lte(0)) continue;
    const nextRemaining = piece.remainingLength.sub(consume);

    await tx.remnantPiece.update({
      where: { id: piece.id },
      data: {
        remainingLength: nextRemaining,
        status: nextRemaining.lte(0) ? "CONSUMED" : "ACTIVE",
        note: nextRemaining.lte(0)
          ? "Returned to supplier from remnant stock"
          : undefined,
      },
    });

    await tx.remnantPiece.create({
      data: {
        shopId: params.shopId,
        productId: params.productId,
        variantId: params.variantId,
        originalLength: consume,
        remainingLength: new Prisma.Decimal("0.00"),
        source: "PURCHASE_RETURN",
        sourceRef: params.purchaseReturnItemId,
        status: "CONSUMED",
        note: "Returned to supplier",
      },
    });

    remaining = remaining.sub(consume);
  }

  if (remaining.gt(0)) {
    await tx.remnantPiece.create({
      data: {
        shopId: params.shopId,
        productId: params.productId,
        variantId: params.variantId,
        originalLength: remaining,
        remainingLength: new Prisma.Decimal("0.00"),
        source: "PURCHASE_RETURN",
        sourceRef: params.purchaseReturnItemId,
        status: "CONSUMED",
        note: "Returned to supplier from non-remnant stock",
      },
    });
  }
}

async function assertInventoryModuleEnabled(shopId: string) {
  const enabled = await shopHasInventoryModule(shopId);
  if (!enabled) {
    throw new Error(
      "Purchases/Suppliers module is disabled for this shop. Enable it from shop settings first."
    );
  }
}

export async function createPurchase(input: CreatePurchaseInput) {
  const user = await requireUser();
  requirePermission(user, "create_purchase");
  await assertShopAccess(input.shopId, user);
  await assertInventoryModuleEnabled(input.shopId);
  const shop = await prisma.shop.findUnique({
    where: { id: input.shopId },
    select: { businessType: true },
  });
  const isPharmacyShop = shop?.businessType === "pharmacy";

  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("At least one item is required");
  }

  const paymentMethod = (input.paymentMethod || "cash").toLowerCase() as
    | "cash"
    | "bkash"
    | "bank"
    | "due";

  const productIds = input.items.map((item) => item.productId);
  const uniqueProductIds = Array.from(new Set(productIds));
  const products = await prisma.product.findMany({
    where: { id: { in: uniqueProductIds } },
    select: {
      id: true,
      shopId: true,
      name: true,
      baseUnit: true,
      buyPrice: true,
      stockQty: true,
      trackStock: true,
      trackSerialNumbers: true,
      trackBatch: true,
      variants: {
        where: { isActive: true },
        select: { id: true, label: true, stockQty: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (products.length !== uniqueProductIds.length) {
    throw new Error("Some products not found");
  }

  const productMap = new Map(products.map((p) => [p.id, p]));

  let supplierId = input.supplierId ?? null;
  const supplierName = input.supplierName?.trim() || null;
  const supplierPhone = input.supplierPhone?.trim() || null;
  const supplierAddress = input.supplierAddress?.trim() || null;

  if (!supplierId && supplierName) {
    const existing = await prisma.supplier.findFirst({
      where: { shopId: input.shopId, name: supplierName },
      select: { id: true },
    });
    if (existing) {
      supplierId = existing.id;
    } else {
      const createdSupplier = await prisma.supplier.create({
        data: {
          shopId: input.shopId,
          name: supplierName,
          phone: supplierPhone,
          address: supplierAddress,
        },
        select: { id: true },
      });
      supplierId = createdSupplier.id;
    }
  } else if (supplierId) {
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, shopId: input.shopId },
      select: { id: true },
    });
    if (!supplier) {
      throw new Error("Supplier not found for this shop");
    }
  }

  if (paymentMethod === "due" && !supplierId && !supplierName) {
    throw new Error("Supplier required for due purchase");
  }

  let subtotalAmount = 0;
  const variantIds = input.items
    .map((i) => i.variantId)
    .filter((id): id is string => !!id);

  const variantMap = new Map<
    string,
    { id: string; productId: string; stockQty: any; buyPrice: any }
  >();
  if (variantIds.length > 0) {
    const variants = await prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, productId: true, stockQty: true, buyPrice: true },
    });
    for (const v of variants) variantMap.set(v.id, v);
  }

  const unitConversionIds = input.items
    .map((item) => item.unitConversionId?.trim())
    .filter((id): id is string => Boolean(id));
  const unitConversionMap = new Map<
    string,
    {
      id: string;
      productId: string;
      label: string;
      baseUnitQuantity: Prisma.Decimal;
      isActive: boolean;
    }
  >();
  if (unitConversionIds.length > 0) {
    const unitConversions = await prisma.productUnitConversion.findMany({
      where: {
        id: { in: Array.from(new Set(unitConversionIds)) },
        shopId: input.shopId,
      },
      select: {
        id: true,
        productId: true,
        label: true,
        baseUnitQuantity: true,
        isActive: true,
      },
    });
    for (const row of unitConversions) {
      unitConversionMap.set(row.id, row);
    }
  }

  const rows = input.items.map((item) => {
    const product = productMap.get(item.productId);
    if (!product) throw new Error("Product not found");
    if (product.shopId !== input.shopId) {
      throw new Error("Product does not belong to this shop");
    }
    const variantId = item.variantId ?? null;
    if ((product.variants?.length ?? 0) > 0 && !variantId) {
      throw new Error(`"${product.name}" variant-wise managed। আগে variant নির্বাচন করুন`);
    }
    if (variantId) {
      const variant = variantMap.get(variantId);
      if (!variant) throw new Error(`Variant not found: ${variantId}`);
      if (variant.productId !== item.productId) {
        throw new Error("Variant does not belong to the given product");
      }
    }
    const qty = toMoney(item.qty, "Quantity");
    const enteredUnitCost = toMoney(item.unitCost, "Unit cost");
    if (qty <= 0) throw new Error("Quantity must be greater than 0");
    const unitConversionId = item.unitConversionId?.trim() || null;
    const selectedConversion = unitConversionId
      ? unitConversionMap.get(unitConversionId)
      : null;
    if (unitConversionId && !selectedConversion) {
      throw new Error("Selected unit conversion was not found");
    }
    if (selectedConversion && selectedConversion.productId !== product.id) {
      throw new Error("Selected unit conversion does not belong to the product");
    }
    if (selectedConversion && !selectedConversion.isActive) {
      throw new Error("Selected unit conversion is inactive");
    }
    const baseUnitQuantity = selectedConversion
      ? Number(selectedConversion.baseUnitQuantity ?? 0)
      : 1;
    if (!Number.isFinite(baseUnitQuantity) || baseUnitQuantity <= 0) {
      throw new Error("Invalid base unit conversion quantity");
    }
    const baseQty = qty * baseUnitQuantity;
    const lineTotal = qty * enteredUnitCost;
    const unitCost = baseQty > 0 ? lineTotal / baseQty : 0;
    if (!Number.isFinite(baseQty) || baseQty <= 0) {
      throw new Error("Converted base quantity must be greater than 0");
    }
    if (!Number.isFinite(unitCost) || unitCost <= 0) {
      throw new Error("Converted base unit cost must be greater than 0");
    }
    const batchNo = (item.batchNo ?? "").trim().toUpperCase();
    if (product.trackBatch && !batchNo) {
      throw new Error(`"${product.name}" batch / lot tracked। ক্রয়ের সময় batch নম্বর দিন`);
    }
    const batchExpiryDate = normalizeDateOnlyInput(item.batchExpiryDate);
    if (isPharmacyShop && product.trackBatch && !batchExpiryDate) {
      throw new Error(`"${product.name}" ফার্মেসি batch। ক্রয়ের সময় expiry date দিন`);
    }
    subtotalAmount += lineTotal;
    return {
      product,
      variantId,
      variant: variantId ? variantMap.get(variantId) ?? null : null,
      qty: baseQty,
      purchaseQty: qty,
      baseQty,
      baseUnitQuantity,
      purchaseUnitLabel: selectedConversion?.label ?? product.baseUnit,
      unitConversionId: selectedConversion?.id ?? null,
      batchNo,
      batchExpiryDate,
      unitCost,
      lineTotal,
    };
  });

  const transportCost = toMoney(input.transportCost ?? 0, "Transport cost");
  const unloadingCost = toMoney(input.unloadingCost ?? 0, "Unloading cost");
  const carryingCost = toMoney(input.carryingCost ?? 0, "Carrying cost");
  const otherLandedCost = toMoney(input.otherLandedCost ?? 0, "Other landed cost");
  const landedCostTotal = roundMoney(
    transportCost + unloadingCost + carryingCost + otherLandedCost
  );
  const rowsWithLanded = allocateLandedCost(rows, landedCostTotal);
  const totalAmount = roundMoney(subtotalAmount + landedCostTotal);

  const paidNowRaw = Number(input.paidNow ?? 0);
  const paidNow = Number.isFinite(paidNowRaw) ? Math.max(0, paidNowRaw) : 0;
  const paidAmount =
    paymentMethod === "cash" ||
    paymentMethod === "bkash" ||
    paymentMethod === "bank"
      ? totalAmount
      : Math.min(paidNow, totalAmount);
  const dueAmount = Number((totalAmount - paidAmount).toFixed(2));

  const purchaseDate = normalizePurchaseDate(input.purchaseDate);
  let createdPurchaseId: string | null = null;

  const actor = auditActorSnapshot(user);
  await prisma.$transaction(async (tx) => {
    const created = await tx.purchase.create({
      data: {
        shopId: input.shopId,
        supplierId,
        supplierName,
        purchaseDate,
        paymentMethod,
        subtotalAmount: subtotalAmount.toFixed(2),
        transportCost: transportCost.toFixed(2),
        unloadingCost: unloadingCost.toFixed(2),
        carryingCost: carryingCost.toFixed(2),
        otherLandedCost: otherLandedCost.toFixed(2),
        landedCostTotal: landedCostTotal.toFixed(2),
        totalAmount: totalAmount.toFixed(2),
        paidAmount: paidAmount.toFixed(2),
        dueAmount: dueAmount.toFixed(2),
        note: input.note?.trim() || null,
      },
      select: { id: true },
    });
    createdPurchaseId = created.id;

    // Create purchase items individually to capture IDs for serial number linking
    const createdItemIds: Array<{ id: string; index: number }> = [];
    for (let i = 0; i < rowsWithLanded.length; i++) {
      const row = rowsWithLanded[i];
      const createdItem = await tx.purchaseItem.create({
        data: {
          purchaseId: created.id,
          productId: row.product.id,
          variantId: row.variantId,
          quantity: row.baseQty.toFixed(2),
          purchaseQty: row.purchaseQty.toFixed(2),
          purchaseUnitLabel: row.purchaseUnitLabel,
          baseUnitQuantity: row.baseUnitQuantity.toFixed(4),
          unitConversionId: row.unitConversionId,
          batchNo: row.batchNo || null,
          batchExpiryDate: row.batchExpiryDate,
          unitCost: row.unitCost.toFixed(2),
          lineTotal: row.lineTotal.toFixed(2),
          landedCostAllocated: row.landedCostAllocated.toFixed(2),
          effectiveUnitCost: row.effectiveUnitCost.toFixed(4),
          effectiveLineTotal: row.effectiveLineTotal.toFixed(2),
        },
        select: { id: true },
      });
      createdItemIds.push({ id: createdItem.id, index: i });
    }

    // Create serial number records for serialized products
    for (const { id: purchaseItemId, index } of createdItemIds) {
      const row = rowsWithLanded[index];
      const inputItem = input.items[index];
      const product = row.product;

      if (product.trackSerialNumbers) {
        const rawSerials = inputItem.serialNumbers ?? [];
        const serials = rawSerials
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean);
        const expectedQty = Math.round(row.baseQty);
        if (Math.abs(row.baseQty - expectedQty) > 0.000001) {
          throw new Error(`"${product.name}" এর base quantity পূর্ণসংখ্যা হতে হবে serial tracking-এর জন্য`);
        }

        if (serials.length !== expectedQty) {
          throw new Error(
            `"${product.name}": ${serials.length}টি serial দেওয়া হয়েছে, কিন্তু qty হলো ${expectedQty}`
          );
        }

        // Check for duplicates (within this batch or already in DB)
        const uniqueSerials = new Set(serials);
        if (uniqueSerials.size !== serials.length) {
          throw new Error(`"${product.name}": batch-এ duplicate serial number আছে`);
        }

        const existing = await tx.serialNumber.findFirst({
          where: {
            shopId: input.shopId,
            productId: product.id,
            serialNo: { in: serials },
          },
          select: { serialNo: true },
        });
        if (existing) {
          throw new Error(
            `Serial "${existing.serialNo}" ইতিমধ্যে এই দোকানে নথিভুক্ত আছে`
          );
        }

        await tx.serialNumber.createMany({
          data: serials.map((serialNo) => ({
            shopId: input.shopId,
            productId: product.id,
            variantId: row.variantId ?? null,
            serialNo,
            status: "IN_STOCK" as const,
            purchaseItemId,
          })),
        });
      }

      // Create or upsert batch record for batch-tracked products
      if (product.trackBatch) {
        const batchNo = row.batchNo;
        const conflictingBatch = await tx.batch.findFirst({
          where: {
            shopId: input.shopId,
            productId: product.id,
            batchNo,
            NOT: {
              variantId: row.variantId ?? null,
            },
          },
          select: {
            id: true,
            variant: {
              select: {
                label: true,
              },
            },
          },
        });
        if (conflictingBatch) {
          throw new Error(
            `"${product.name}"-এ batch "${batchNo}" অন্য variant-এর সাথে আগে থেকেই ব্যবহার হয়েছে${
              conflictingBatch.variant?.label
                ? ` (${conflictingBatch.variant.label})`
                : ""
            }। variant-wise product-এ আলাদা batch code দিন।`
          );
        }
        const existingBatchForExpiry = await tx.batch.findUnique({
          where: {
            shopId_productId_batchNo: {
              shopId: input.shopId,
              productId: product.id,
              batchNo,
            },
          },
          select: {
            expiryDate: true,
          },
        });
        if (
          existingBatchForExpiry?.expiryDate &&
          row.batchExpiryDate &&
          existingBatchForExpiry.expiryDate.toISOString().slice(0, 10) !==
            row.batchExpiryDate.toISOString().slice(0, 10)
        ) {
          throw new Error(
            `"${product.name}" batch "${batchNo}"-এর expiry আগে ${existingBatchForExpiry.expiryDate
              .toISOString()
              .slice(0, 10)} ছিল। একই batch code-এ আলাদা expiry দেওয়া যাবে না।`
          );
        }

        await tx.batch.upsert({
          where: {
            shopId_productId_batchNo: {
              shopId: input.shopId,
              productId: product.id,
              batchNo,
            },
          },
          create: {
            shopId: input.shopId,
            productId: product.id,
            variantId: row.variantId ?? null,
            batchNo,
            expiryDate: row.batchExpiryDate,
            purchaseItemId,
            totalQty: row.baseQty,
            remainingQty: row.baseQty,
          },
          update: {
            totalQty: { increment: row.baseQty },
            remainingQty: { increment: row.baseQty },
            expiryDate:
              existingBatchForExpiry?.expiryDate || !row.batchExpiryDate
                ? undefined
                : row.batchExpiryDate,
            isActive: true,
          },
        });
      }
    }

    for (const row of rowsWithLanded) {
      const product = row.product;
      if (row.variantId && row.variant) {
        const currentVariantStock = Number(row.variant.stockQty ?? 0);
        const currentVariantCost = Number(row.variant.buyPrice ?? 0);
        const variantBaseStock = product.trackStock ? currentVariantStock : 0;
        const variantTotalUnits = variantBaseStock + row.baseQty;
        const weightedVariantCost =
          variantTotalUnits > 0
            ? (variantBaseStock * currentVariantCost + row.baseQty * row.effectiveUnitCost) /
              variantTotalUnits
            : row.effectiveUnitCost;
        const nextVariantCost = Number.isFinite(weightedVariantCost)
          ? weightedVariantCost
          : row.effectiveUnitCost;

        await tx.productVariant.update({
          where: { id: row.variantId },
          data: {
            buyPrice: nextVariantCost.toFixed(2),
            ...(product.trackStock ? { stockQty: { increment: row.baseQty } } : {}),
          },
        });
      } else {
        const currentStock = Number(product.stockQty ?? 0);
        const currentCost = Number(product.buyPrice ?? 0);
        const baseStock = product.trackStock ? currentStock : 0;
        const nextStock = product.trackStock ? currentStock + row.baseQty : currentStock;
        const totalUnits = baseStock + row.baseQty;
        const weighted =
          totalUnits > 0
            ? (baseStock * currentCost + row.baseQty * row.effectiveUnitCost) / totalUnits
            : row.effectiveUnitCost;
        const nextCost = Number.isFinite(weighted) ? weighted : row.effectiveUnitCost;

        await tx.product.update({
          where: { id: product.id },
          data: {
            buyPrice: nextCost.toFixed(2),
            ...(product.trackStock ? { stockQty: nextStock.toFixed(2) } : {}),
          },
        });
      }
    }

    if (paidAmount > 0) {
      await tx.cashEntry.create({
        data: {
          shopId: input.shopId,
          entryType: "OUT",
          amount: paidAmount.toFixed(2),
          reason: `Purchase #${created.id}`,
          createdAt: purchaseDate,
          businessDate: toDhakaBusinessDate(purchaseDate),
        },
      });
    }

    if (supplierId) {
      await tx.supplierLedger.create({
        data: {
          shopId: input.shopId,
          supplierId,
          entryType: "PURCHASE",
          amount: totalAmount.toFixed(2),
          note: `Purchase #${created.id}`,
          entryDate: purchaseDate,
          businessDate: toDhakaBusinessDate(purchaseDate),
        },
      });

      if (paidAmount > 0) {
        await tx.purchasePayment.create({
          data: {
            shopId: input.shopId,
            purchaseId: created.id,
            supplierId,
            amount: paidAmount.toFixed(2),
            method: paymentMethod === "due" ? "cash" : paymentMethod,
            paidAt: purchaseDate,
            businessDate: toDhakaBusinessDate(purchaseDate),
            note: `Payment for purchase #${created.id}`,
          },
        });

        await tx.supplierLedger.create({
          data: {
            shopId: input.shopId,
            supplierId,
            entryType: "PAYMENT",
            amount: paidAmount.toFixed(2),
            note: `Payment for purchase #${created.id}`,
            entryDate: purchaseDate,
            businessDate: toDhakaBusinessDate(purchaseDate),
          },
        });
      }
    }
    await logAudit(
      {
        shopId: input.shopId,
        ...actor,
        action: "purchase.create",
        targetType: "purchase",
        targetId: created.id,
        summary: `${actor.userName || "সিস্টেম"} পণ্য ক্রয় করেছেন: ${auditMoney(totalAmount)} · ${rowsWithLanded.length} আইটেম${supplierName ? ` · ${supplierName}` : ""}`,
        metadata: {
          purchaseId: created.id,
          supplierId,
          supplierName,
          subtotalAmount,
          landedCostTotal,
          totalAmount,
          paidAmount,
          dueAmount,
          paymentMethod,
          items: rowsWithLanded.map((row) => ({
            productId: row.product.id,
            productName: row.product.name,
            variantId: row.variantId,
            qty: row.baseQty,
            purchaseQty: row.purchaseQty,
            purchaseUnitLabel: row.purchaseUnitLabel,
            unitCost: row.unitCost,
            effectiveUnitCost: row.effectiveUnitCost,
            batchNo: row.batchNo || null,
            batchExpiryDate: row.batchExpiryDate,
          })),
        },
        severity: "info",
        correlationId: created.id,
        businessDate: toDhakaBusinessDate(purchaseDate).toISOString().slice(0, 10),
      },
      tx,
    );
  });

  revalidatePath("/dashboard/purchases");
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/products/serials");
  revalidatePath("/dashboard/reports");
  revalidatePath("/dashboard/suppliers");
  revalidateReportsForProduct();

  return { success: true, purchaseId: createdPurchaseId };
}

export async function createPurchaseReturn(input: CreatePurchaseReturnInput) {
  const user = await requireUser();
  requirePermission(user, "create_purchase");
  await assertShopAccess(input.shopId, user);
  await assertInventoryModuleEnabled(input.shopId);

  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("At least one return item is required");
  }

  const purchase = await prisma.purchase.findUnique({
    where: { id: input.purchaseId },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              stockQty: true,
              trackStock: true,
              trackSerialNumbers: true,
              trackBatch: true,
              trackCutLength: true,
            },
          },
          variant: {
            select: {
              id: true,
              stockQty: true,
            },
          },
          serialNumbers: {
            select: {
              id: true,
              serialNo: true,
              status: true,
            },
          },
          batches: {
            select: {
              id: true,
              batchNo: true,
              totalQty: true,
              remainingQty: true,
            },
          },
        },
      },
    },
  });

  if (!purchase || purchase.shopId !== input.shopId) {
    throw new Error("Purchase not found for this shop");
  }
  if (!purchase.supplierId) {
    throw new Error("Supplier-linked purchase required for supplier credit return");
  }

  const returnedMap = await getReturnedQtyByPurchaseItemId(purchase.id);
  const purchaseItemMap = new Map(purchase.items.map((item) => [item.id, item]));
  const returnDate = normalizePurchaseDate(input.returnDate);
  const preparedRows: Array<{
    purchaseItemId: string;
    productId: string;
    variantId: string | null;
    qty: number;
    unitCost: number;
    lineTotal: number;
    serialNumbers: string[];
  }> = [];

  let totalAmount = 0;

  for (const rawItem of input.items) {
    const purchaseItem = purchaseItemMap.get(rawItem.purchaseItemId);
    if (!purchaseItem) {
      throw new Error("Invalid purchase item in return request");
    }
    const qty = toMoney(rawItem.qty, "Return quantity");
    if (qty <= 0) continue;

    const purchasedQty = Number(purchaseItem.quantity ?? 0);
    const alreadyReturned = returnedMap.get(purchaseItem.id) ?? 0;
    const returnableQty = Math.max(0, purchasedQty - alreadyReturned);
    if (qty > returnableQty + 0.000001) {
      throw new Error(`"${purchaseItem.product.name}" এর জন্য returnable quantity অতিক্রম করেছে`);
    }

    const product = purchaseItem.product;
    if (product.trackStock) {
      if (purchaseItem.variantId) {
        const variantStock = Number(purchaseItem.variant?.stockQty ?? 0);
        if (!Number.isFinite(variantStock) || variantStock + 0.000001 < qty) {
          throw new Error(`"${product.name}" variant-এর পর্যাপ্ত স্টক নেই return করার জন্য`);
        }
      } else {
        const currentStock = Number(product.stockQty ?? 0);
        if (!Number.isFinite(currentStock) || currentStock + 0.000001 < qty) {
          throw new Error(`"${product.name}" এর পর্যাপ্ত স্টক নেই return করার জন্য`);
        }
      }
    }

    const serials = (rawItem.serialNumbers ?? [])
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean);
    if (product.trackSerialNumbers) {
      const expectedQty = Math.round(qty);
      if (serials.length !== expectedQty) {
        throw new Error(`"${product.name}" এর জন্য ${expectedQty}টি serial number দিন`);
      }
      const availableSerials = purchaseItem.serialNumbers.filter(
        (serial) => serial.status === "IN_STOCK"
      );
      const availableSet = new Set(availableSerials.map((serial) => serial.serialNo));
      for (const serial of serials) {
        if (!availableSet.has(serial)) {
          throw new Error(`Serial "${serial}" available নেই বা ইতিমধ্যে বিক্রি/ফেরত হয়েছে`);
        }
      }
    }

    if (product.trackBatch && purchaseItem.batches.length > 0) {
      const batch = purchaseItem.batches[0];
      const remainingQty = Number(batch.remainingQty ?? 0);
      if (!Number.isFinite(remainingQty) || remainingQty + 0.000001 < qty) {
        throw new Error(`Batch "${batch.batchNo}" এ পর্যাপ্ত অবশিষ্ট নেই supplier return করার জন্য`);
      }
    }

    const unitCost = Number(purchaseItem.unitCost ?? 0);
    const lineTotal = Number((qty * unitCost).toFixed(2));
    totalAmount += lineTotal;
    preparedRows.push({
      purchaseItemId: purchaseItem.id,
      productId: purchaseItem.productId,
      variantId: purchaseItem.variantId ?? null,
      qty,
      unitCost,
      lineTotal,
      serialNumbers: serials,
    });
  }

  if (preparedRows.length === 0) {
    throw new Error("No valid return rows found");
  }

  let createdPurchaseReturnId: string | null = null;
  let supplierCreditAmount = 0;

  await prisma.$transaction(async (tx) => {
    const createdReturn = await tx.purchaseReturn.create({
      data: {
        shopId: input.shopId,
        purchaseId: purchase.id,
        supplierId: purchase.supplierId,
        returnDate,
        totalAmount: totalAmount.toFixed(2),
        supplierCredit: "0.00",
        note: input.note?.trim() || null,
        createdByUserId: user.id,
      },
      select: { id: true },
    });
    createdPurchaseReturnId = createdReturn.id;

    for (const row of preparedRows) {
      const purchaseItem = purchaseItemMap.get(row.purchaseItemId)!;
      const product = purchaseItem.product;

      const createdReturnItem = await tx.purchaseReturnItem.create({
        data: {
          purchaseReturnId: createdReturn.id,
          purchaseItemId: row.purchaseItemId,
          productId: row.productId,
          variantId: row.variantId,
          quantity: row.qty.toFixed(2),
          unitCost: row.unitCost.toFixed(2),
          lineTotal: row.lineTotal.toFixed(2),
          note: input.note?.trim() || null,
        },
        select: { id: true },
      });

      if (product.trackSerialNumbers && row.serialNumbers.length > 0) {
        const updated = await tx.serialNumber.updateMany({
          where: {
            purchaseItemId: row.purchaseItemId,
            serialNo: { in: row.serialNumbers },
            status: "IN_STOCK",
          },
          data: {
            status: "RETURNED",
            note: `Supplier return ${createdReturn.id}`,
          },
        });
        if (updated.count !== row.serialNumbers.length) {
          throw new Error(`Serial return update অসম্পূর্ণ হয়েছে for "${product.name}"`);
        }
      }

      if (product.trackBatch && purchaseItem.batches.length > 0) {
        const batch = purchaseItem.batches[0];
        const nextTotal = new Prisma.Decimal(batch.totalQty).sub(
          new Prisma.Decimal(row.qty.toFixed(2))
        );
        const nextRemaining = new Prisma.Decimal(batch.remainingQty).sub(
          new Prisma.Decimal(row.qty.toFixed(2))
        );
        await tx.batch.update({
          where: { id: batch.id },
          data: {
            totalQty: nextTotal,
            remainingQty: nextRemaining,
            isActive: nextRemaining.gt(0),
          },
        });
      }

      if (product.trackCutLength) {
        await reduceCutLengthForPurchaseReturn(tx, {
          shopId: input.shopId,
          productId: row.productId,
          variantId: row.variantId,
          purchaseReturnItemId: createdReturnItem.id,
          qty: row.qty,
        });
      }

      if (product.trackStock) {
        const qtyDecimal = new Prisma.Decimal(row.qty.toFixed(2));
        if (row.variantId) {
          const updated = await tx.productVariant.updateMany({
            where: { id: row.variantId, stockQty: { gte: qtyDecimal } },
            data: { stockQty: { decrement: qtyDecimal } },
          });
          if (updated.count !== 1) {
            throw new Error(`"${product.name}" variant stock return failed`);
          }
        } else {
          const updated = await tx.product.updateMany({
            where: { id: row.productId, trackStock: true, stockQty: { gte: qtyDecimal } },
            data: { stockQty: { decrement: qtyDecimal } },
          });
          if (updated.count !== 1) {
            throw new Error(`"${product.name}" stock return failed`);
          }
        }
      }
    }

    const dueBefore = Number(purchase.dueAmount ?? 0);
    const newDue = Math.max(0, Number((dueBefore - totalAmount).toFixed(2)));
    supplierCreditAmount = Number(Math.max(0, totalAmount - dueBefore).toFixed(2));

    await tx.purchase.update({
      where: { id: purchase.id },
      data: {
        dueAmount: newDue.toFixed(2),
      },
    });

    await tx.purchaseReturn.update({
      where: { id: createdReturn.id },
      data: {
        supplierCredit: supplierCreditAmount.toFixed(2),
      },
    });

    await tx.supplierLedger.create({
      data: {
        shopId: input.shopId,
        supplierId: purchase.supplierId!,
        entryType: "PURCHASE_RETURN",
        amount: totalAmount.toFixed(2),
        note: `Purchase return #${createdReturn.id} for purchase #${purchase.id}`,
        entryDate: returnDate,
        businessDate: toDhakaBusinessDate(returnDate),
      },
    });
  });

  revalidatePath("/dashboard/purchases");
  revalidatePath(`/dashboard/purchases/${purchase.id}`);
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/products/serials");
  revalidatePath("/dashboard/suppliers");
  revalidatePath("/dashboard/reports");
  revalidateReportsForProduct();

  return {
    success: true,
    purchaseReturnId: createdPurchaseReturnId,
    supplierCreditAmount,
  };
}

export async function recordPurchasePayment(input: {
  shopId: string;
  purchaseId: string;
  amount: string | number;
  paidAt?: string;
  method?: string;
  note?: string | null;
}) {
  const user = await requireUser();
  requirePermission(user, "create_purchase_payment");
  await assertShopAccess(input.shopId, user);
  await assertInventoryModuleEnabled(input.shopId);

  const amount = toMoney(input.amount, "Amount");
  if (amount <= 0) throw new Error("Amount must be greater than 0");
  const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
  if (Number.isNaN(paidAt.getTime())) throw new Error("Invalid payment date");
  const paymentBusinessDate = toDhakaBusinessDate(paidAt);

  const purchase = await prisma.purchase.findUnique({
    where: { id: input.purchaseId },
    select: {
      id: true,
      shopId: true,
      paidAmount: true,
      dueAmount: true,
      supplierId: true,
    },
  });

  if (!purchase || purchase.shopId !== input.shopId) {
    throw new Error("Purchase not found for this shop");
  }
  if (!purchase.supplierId) {
    throw new Error("Supplier is required to record payment");
  }

  const due = Number(purchase.dueAmount ?? 0);
  const paid = Number(purchase.paidAmount ?? 0);
  if (due <= 0) {
    throw new Error("No due amount remaining for this purchase");
  }
  const payAmount = Math.min(due, amount);

  await prisma.$transaction(async (tx) => {
    await tx.purchase.update({
      where: { id: purchase.id },
      data: {
        paidAmount: (paid + payAmount).toFixed(2),
        dueAmount: (due - payAmount).toFixed(2),
      } as any,
    });

    await tx.purchasePayment.create({
      data: {
        shopId: input.shopId,
        purchaseId: purchase.id,
        supplierId: purchase.supplierId!,
        amount: payAmount.toFixed(2),
        method: input.method || "cash",
        paidAt,
        businessDate: paymentBusinessDate,
        note: input.note?.trim() || null,
      },
    });

    await tx.cashEntry.create({
      data: {
        shopId: input.shopId,
        entryType: "OUT",
        amount: payAmount.toFixed(2),
        reason: `Purchase payment #${purchase.id}`,
        createdAt: paidAt,
        businessDate: paymentBusinessDate,
      },
    });

    await tx.supplierLedger.create({
      data: {
        shopId: input.shopId,
        supplierId: purchase.supplierId!,
        entryType: "PAYMENT",
        amount: payAmount.toFixed(2),
        note: `Payment for purchase #${purchase.id}`,
        entryDate: paidAt,
        businessDate: paymentBusinessDate,
      },
    });
  });

  revalidatePath("/dashboard/purchases");
  revalidatePath("/dashboard/suppliers");
  return { success: true };
}

export async function getPurchasesByShopPaginated({
  shopId,
  from,
  to,
  page = 1,
  pageSize = 20,
}: {
  shopId: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}) {
  const user = await requireUser();
  requirePermission(user, "view_purchases");
  await assertShopAccess(shopId, user);
  await assertInventoryModuleEnabled(shopId);

  const safePage = Math.max(1, Math.floor(page));
  const safeSize = Math.max(1, Math.min(Math.floor(pageSize), 100));
  const skip = (safePage - 1) * safeSize;

  const start = from ? normalizePurchaseDate(from) : undefined;
  const end = to ? normalizePurchaseDate(to) : undefined;

  const where = {
    shopId,
    purchaseDate: from || to ? { gte: start, lte: end } : undefined,
  } as const;

  const [rows, totalCount] = await Promise.all([
    prisma.purchase.findMany({
      where,
      orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }],
      skip,
      take: safeSize,
      include: {
        supplier: { select: { id: true, name: true } },
        items: {
          select: {
            id: true,
            quantity: true,
            unitCost: true,
            lineTotal: true,
            landedCostAllocated: true,
            effectiveUnitCost: true,
            effectiveLineTotal: true,
            product: { select: { name: true } },
          },
        },
      },
    }),
    prisma.purchase.count({ where }),
  ]);

  const items = rows.map((p) => ({
    id: p.id,
    shopId: p.shopId,
    supplierId: p.supplier?.id ?? null,
    supplierName: p.supplier?.name ?? p.supplierName,
    purchaseDate: p.purchaseDate?.toISOString?.() ?? p.purchaseDate,
    paymentMethod: p.paymentMethod,
    subtotalAmount: p.subtotalAmount?.toString?.() ?? "0",
    transportCost: p.transportCost?.toString?.() ?? "0",
    unloadingCost: p.unloadingCost?.toString?.() ?? "0",
    carryingCost: p.carryingCost?.toString?.() ?? "0",
    otherLandedCost: p.otherLandedCost?.toString?.() ?? "0",
    landedCostTotal: p.landedCostTotal?.toString?.() ?? "0",
    totalAmount: p.totalAmount?.toString?.() ?? "0",
    paidAmount: p.paidAmount?.toString?.() ?? "0",
    dueAmount: p.dueAmount?.toString?.() ?? "0",
    note: p.note,
    createdAt: p.createdAt?.toISOString?.() ?? p.createdAt,
    items: p.items.map((item) => ({
      id: item.id,
      name: item.product?.name || "Unknown",
      quantity: item.quantity?.toString?.() ?? "0",
      unitCost: item.unitCost?.toString?.() ?? "0",
      lineTotal: item.lineTotal?.toString?.() ?? "0",
    })),
  }));

  return {
    items,
    totalCount,
    page: safePage,
    pageSize: safeSize,
    totalPages: Math.max(1, Math.ceil(totalCount / safeSize)),
  };
}

export async function getPurchaseSummaryByRange(
  shopId: string,
  from?: string,
  to?: string
) {
  const user = await requireUser();
  requirePermission(user, "view_purchases");
  await assertShopAccess(shopId, user);
  await assertInventoryModuleEnabled(shopId);

  const start = from ? normalizePurchaseDate(from) : undefined;
  const end = to ? normalizePurchaseDate(to) : undefined;

  const purchaseWhere = {
    shopId,
    purchaseDate: from || to ? { gte: start, lte: end } : undefined,
  };

  const purchaseReturnWhere = {
    shopId,
    returnDate: from || to ? { gte: start, lte: end } : undefined,
  };

  const [agg, returnAgg] = await Promise.all([
    prisma.purchase.aggregate({
      where: purchaseWhere,
      _sum: { totalAmount: true, paidAmount: true, landedCostTotal: true },
      _count: { _all: true },
    }),
    prisma.purchaseReturn.aggregate({
      where: purchaseReturnWhere,
      _sum: { totalAmount: true },
      _count: { _all: true },
    }),
  ]);

  const purchaseTotal = Number(agg._sum.totalAmount ?? 0);
  const returnTotal = Number(returnAgg._sum.totalAmount ?? 0);

  const paidTotal = Number(agg._sum.paidAmount ?? 0);
  return {
    totalAmount: Number((purchaseTotal - returnTotal).toFixed(2)).toString(),
    count: agg._count._all ?? 0,
    returnCount: returnAgg._count._all ?? 0,
    purchaseTotal: purchaseTotal.toFixed(2),
    purchaseReturnTotal: returnTotal.toFixed(2),
    landedCostTotal: Number(agg._sum.landedCostTotal ?? 0).toFixed(2),
    paidTotal: paidTotal.toFixed(2),
  };
}

export async function getPurchaseWithPayments(
  purchaseId: string,
  options?: { page?: number; pageSize?: number }
) {
  const user = await requireUser();
  requirePermission(user, "view_purchases");

  const page = Math.max(1, Math.floor(options?.page ?? 1));
  const pageSize = Math.max(1, Math.min(Math.floor(options?.pageSize ?? 10), 50));
  const skip = (page - 1) * pageSize;

  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: {
      supplier: { select: { id: true, name: true } },
      items: {
        select: {
          id: true,
          quantity: true,
          unitCost: true,
          lineTotal: true,
          landedCostAllocated: true,
          effectiveUnitCost: true,
          effectiveLineTotal: true,
          product: { select: { name: true } },
        },
      },
      payments: {
        orderBy: [{ paidAt: "desc" }],
        skip,
        take: pageSize,
        select: {
          id: true,
          amount: true,
          method: true,
          paidAt: true,
          note: true,
        },
      },
      returns: {
        orderBy: [{ returnDate: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          returnDate: true,
          totalAmount: true,
          supplierCredit: true,
          note: true,
          items: {
            select: {
              id: true,
              quantity: true,
              unitCost: true,
              lineTotal: true,
              product: { select: { name: true } },
              variant: { select: { label: true } },
            },
          },
        },
      },
    },
  });

  if (!purchase) throw new Error("Purchase not found");
  await assertShopAccess(purchase.shopId, user);
  await assertInventoryModuleEnabled(purchase.shopId);

  const totalPayments = await prisma.purchasePayment.count({
    where: { purchaseId },
  });

  return {
    id: purchase.id,
    shopId: purchase.shopId,
    supplierId: purchase.supplier?.id ?? null,
    supplierName: purchase.supplier?.name ?? purchase.supplierName,
    purchaseDate: purchase.purchaseDate?.toISOString?.() ?? purchase.purchaseDate,
    paymentMethod: purchase.paymentMethod,
    subtotalAmount: purchase.subtotalAmount?.toString?.() ?? "0",
    transportCost: purchase.transportCost?.toString?.() ?? "0",
    unloadingCost: purchase.unloadingCost?.toString?.() ?? "0",
    carryingCost: purchase.carryingCost?.toString?.() ?? "0",
    otherLandedCost: purchase.otherLandedCost?.toString?.() ?? "0",
    landedCostTotal: purchase.landedCostTotal?.toString?.() ?? "0",
    totalAmount: purchase.totalAmount?.toString?.() ?? "0",
    paidAmount: purchase.paidAmount?.toString?.() ?? "0",
    dueAmount: purchase.dueAmount?.toString?.() ?? "0",
    note: purchase.note,
    items: purchase.items.map((item) => ({
      id: item.id,
      name: item.product?.name || "Unknown",
      quantity: item.quantity?.toString?.() ?? "0",
      unitCost: item.unitCost?.toString?.() ?? "0",
      lineTotal: item.lineTotal?.toString?.() ?? "0",
      landedCostAllocated: item.landedCostAllocated?.toString?.() ?? "0",
      effectiveUnitCost: item.effectiveUnitCost?.toString?.() ?? "0",
      effectiveLineTotal: item.effectiveLineTotal?.toString?.() ?? "0",
    })),
    payments: purchase.payments.map((p) => ({
      id: p.id,
      amount: p.amount?.toString?.() ?? "0",
      method: p.method,
      paidAt: p.paidAt?.toISOString?.() ?? p.paidAt,
      note: p.note,
    })),
    returns: purchase.returns.map((row) => ({
      id: row.id,
      returnDate: row.returnDate?.toISOString?.() ?? row.returnDate,
      totalAmount: row.totalAmount?.toString?.() ?? "0",
      supplierCredit: row.supplierCredit?.toString?.() ?? "0",
      note: row.note,
      items: row.items.map((item) => ({
        id: item.id,
        name: item.product?.name || "Unknown",
        variantLabel: item.variant?.label ?? null,
        quantity: item.quantity?.toString?.() ?? "0",
        unitCost: item.unitCost?.toString?.() ?? "0",
        lineTotal: item.lineTotal?.toString?.() ?? "0",
      })),
    })),
    paymentMeta: {
      page,
      pageSize,
      total: totalPayments,
      totalPages: Math.max(1, Math.ceil(totalPayments / pageSize)),
    },
  };
}

export async function getPurchaseReturnContext(purchaseId: string) {
  const user = await requireUser();
  requirePermission(user, "create_purchase");

  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: {
      supplier: { select: { id: true, name: true } },
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              trackStock: true,
              trackSerialNumbers: true,
              trackBatch: true,
              trackCutLength: true,
            },
          },
          variant: { select: { id: true, label: true } },
          serialNumbers: {
            select: {
              id: true,
              serialNo: true,
              status: true,
            },
            orderBy: [{ serialNo: "asc" }],
          },
          batches: {
            select: {
              id: true,
              batchNo: true,
              expiryDate: true,
              remainingQty: true,
            },
            orderBy: [{ createdAt: "asc" }],
          },
        },
      },
      returns: {
        select: {
          id: true,
          totalAmount: true,
          supplierCredit: true,
          items: {
            select: {
              purchaseItemId: true,
              quantity: true,
            },
          },
        },
      },
    },
  });

  if (!purchase) throw new Error("Purchase not found");
  await assertShopAccess(purchase.shopId, user);
  await assertInventoryModuleEnabled(purchase.shopId);

  if (!purchase.supplierId || !purchase.supplier) {
    throw new Error("Supplier-linked purchase required for supplier return");
  }

  const returnedByItem = new Map<string, number>();
  let totalReturnAmount = 0;
  let totalSupplierCredit = 0;
  for (const purchaseReturn of purchase.returns) {
    totalReturnAmount += Number(purchaseReturn.totalAmount ?? 0);
    totalSupplierCredit += Number(purchaseReturn.supplierCredit ?? 0);
    for (const item of purchaseReturn.items) {
      returnedByItem.set(
        item.purchaseItemId,
        (returnedByItem.get(item.purchaseItemId) ?? 0) + Number(item.quantity ?? 0)
      );
    }
  }

  const items = purchase.items.map((item) => {
    const purchasedQty = Number(item.quantity ?? 0);
    const alreadyReturnedQty = returnedByItem.get(item.id) ?? 0;
    const returnableQty = Math.max(0, Number((purchasedQty - alreadyReturnedQty).toFixed(2)));
    const availableSerials = item.serialNumbers
      .filter((serial) => serial.status === "IN_STOCK")
      .map((serial) => serial.serialNo);

    return {
      id: item.id,
      productId: item.productId,
      productName: item.product.name,
      variantId: item.variantId ?? null,
      variantLabel: item.variant?.label ?? null,
      purchasedQty: purchasedQty.toFixed(2),
      alreadyReturnedQty: alreadyReturnedQty.toFixed(2),
      returnableQty: returnableQty.toFixed(2),
      unitCost: Number(item.unitCost ?? 0).toFixed(2),
      lineTotal: Number(item.lineTotal ?? 0).toFixed(2),
      trackStock: item.product.trackStock,
      trackSerialNumbers: item.product.trackSerialNumbers,
      trackBatch: item.product.trackBatch,
      trackCutLength: item.product.trackCutLength,
      batchNo: item.batches[0]?.batchNo ?? null,
      batchExpiryDate: item.batches[0]?.expiryDate?.toISOString?.().slice(0, 10) ?? null,
      batchRemainingQty: item.batches[0]?.remainingQty?.toString?.() ?? null,
      availableSerials,
    };
  }).filter((item) => Number(item.returnableQty) > 0);

  return {
    purchase: {
      id: purchase.id,
      shopId: purchase.shopId,
      supplierId: purchase.supplierId,
      supplierName: purchase.supplier.name,
      purchaseDate: purchase.purchaseDate?.toISOString?.() ?? purchase.purchaseDate,
      totalAmount: purchase.totalAmount?.toString?.() ?? "0",
      paidAmount: purchase.paidAmount?.toString?.() ?? "0",
      dueAmount: purchase.dueAmount?.toString?.() ?? "0",
      note: purchase.note,
    },
    items,
    returnSummary: {
      totalReturnAmount: totalReturnAmount.toFixed(2),
      totalSupplierCredit: totalSupplierCredit.toFixed(2),
    },
  };
}

export async function getPayablesSummary(shopId: string) {
  const user = await requireUser();
  requirePermission(user, "view_suppliers");
  await assertShopAccess(shopId, user);
  await assertInventoryModuleEnabled(shopId);

  const [agg, supplierGroups] = await Promise.all([
    prisma.purchase.aggregate({
      where: { shopId, dueAmount: { gt: 0 } },
      _sum: { dueAmount: true },
      _count: { _all: true },
    }),
    prisma.purchase.groupBy({
      by: ["supplierId"],
      where: { shopId, dueAmount: { gt: 0 }, supplierId: { not: null } },
    }),
  ]);

  return {
    totalDue: Number(agg._sum.dueAmount ?? 0),
    dueCount: agg._count._all ?? 0,
    supplierCount: supplierGroups.length,
  };
}
