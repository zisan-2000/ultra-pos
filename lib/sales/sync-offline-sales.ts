import { Prisma, type PrismaClient } from "@prisma/client";

export type IncomingSaleItem = {
  productId: string;
  name?: string;
  unitPrice: string | number;
  qty: string | number;
};

export type IncomingSale = {
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

export type SalesFlowUser = {
  id: string;
  roles: string[];
  permissions: string[];
  staffShopId: string | null;
};

export type SyncedSaleEffect = {
  shopId: string;
  saleId: string;
  invoiceNo: string | null;
  totalAmount: number;
  paymentMethod: string;
  payNow: number;
  isDue: boolean;
  customerId: string | null;
  productIds: string[];
};

export type SyncOfflineSalesResult = {
  saleIds: string[];
  effects: SyncedSaleEffect[];
};

const SHOP_TYPES_WITH_COGS = new Set([
  "mini_grocery",
  "pharmacy",
  "clothing",
  "cosmetics_gift",
  "mini_wholesale",
]);

const DEFAULT_SALES_INVOICE_PREFIX = "INV";

function hasPermission(user: SalesFlowUser, permission: string) {
  if (user.roles.includes("super_admin")) return true;
  return user.permissions.includes(permission);
}

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

function getDhakaDateString(date: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function toDhakaBusinessDate(input?: Date | string | number | null) {
  const base = input ? new Date(input as any) : new Date();
  const safeBase = Number.isNaN(base.getTime()) ? new Date() : base;
  const day = getDhakaDateString(safeBase);
  return new Date(`${day}T00:00:00.000Z`);
}

function sanitizeSalesInvoicePrefix(value?: string | null) {
  const raw = value?.trim().toUpperCase() ?? "";
  const cleaned = raw.replace(/[^A-Z0-9]/g, "").slice(0, 12);
  return cleaned || null;
}

function resolveSalesInvoicePrefix(value?: string | null) {
  return sanitizeSalesInvoicePrefix(value) ?? DEFAULT_SALES_INVOICE_PREFIX;
}

function formatSalesInvoiceNo(
  prefix: string | null | undefined,
  sequence: number,
  issuedAt: Date = new Date()
) {
  const normalizedPrefix = resolveSalesInvoicePrefix(prefix);
  const safeSeq = Math.max(1, Math.floor(sequence));
  const yy = String(issuedAt.getUTCFullYear()).slice(-2);
  const mm = String(issuedAt.getUTCMonth() + 1).padStart(2, "0");
  const serial = String(safeSeq).padStart(6, "0");
  return `${normalizedPrefix}-${yy}${mm}-${serial}`;
}

function canIssueSalesInvoice(
  user: SalesFlowUser,
  salesInvoiceEnabled?: boolean | null
) {
  return Boolean(salesInvoiceEnabled) && hasPermission(user, "issue_sales_invoice");
}

async function allocateSalesInvoiceNumber(
  tx: Prisma.TransactionClient,
  shopId: string,
  issuedAt: Date
) {
  const rows = await tx.$queryRaw<{ prefix: string | null; seq: unknown }[]>(
    Prisma.sql`
      UPDATE "shops"
      SET "next_sales_invoice_seq" = COALESCE("next_sales_invoice_seq", 1) + 1
      WHERE "id" = CAST(${shopId} AS uuid)
      RETURNING
        "sales_invoice_prefix" AS prefix,
        ("next_sales_invoice_seq" - 1)::int AS seq
    `
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Shop not found while issuing sales invoice");
  }
  const seq = Math.max(0, Math.floor(Number(row.seq ?? 0)));
  if (seq < 1) {
    throw new Error("Invalid sales invoice sequence");
  }
  return {
    invoiceNo: formatSalesInvoiceNo(row.prefix, seq, issuedAt),
    issuedAt,
  };
}

async function assertShopAccess(
  db: PrismaClient,
  shopId: string,
  user: SalesFlowUser
) {
  const shop = await db.shop.findUnique({ where: { id: shopId } });
  if (!shop) {
    throw new Error("Shop not found");
  }

  const isOwner = shop.ownerId === user.id;
  const isStaffForShop =
    user.roles.includes("staff") && user.staffShopId === shopId;

  if (!isOwner && !isStaffForShop) {
    throw new Error("Unauthorized access to this shop");
  }

  return shop;
}

async function shopNeedsCogs(db: PrismaClient, shopId: string) {
  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: { businessType: true },
  });
  if (!shop?.businessType) return false;
  return SHOP_TYPES_WITH_COGS.has(shop.businessType);
}

export async function syncOfflineSalesBatch({
  newItems,
  user,
  db,
}: {
  newItems: IncomingSale[];
  user: SalesFlowUser;
  db: PrismaClient;
}): Promise<SyncOfflineSalesResult> {
  if (!hasPermission(user, "sync_offline_data")) {
    throw new Error("Forbidden");
  }
  if (!hasPermission(user, "create_sale")) {
    throw new Error("Forbidden");
  }
  const needsDuePermission = newItems.some(
    (sale) => (sale?.paymentMethod || "cash").toString().toLowerCase() === "due"
  );
  if (needsDuePermission && !hasPermission(user, "create_due_sale")) {
    throw new Error("Forbidden");
  }

  if (!Array.isArray(newItems) || newItems.length === 0) {
    return { saleIds: [], effects: [] };
  }

  const shopIds = new Set<string>();
  newItems.forEach((sale) => {
    if (sale?.shopId) {
      shopIds.add(sale.shopId);
    }
  });

  if (shopIds.size === 0) {
    throw new Error("shopId is required");
  }

  const shopById = new Map<string, Awaited<ReturnType<typeof assertShopAccess>>>();
  for (const shopId of shopIds) {
    const shop = await assertShopAccess(db, shopId, user);
    shopById.set(shopId, shop);
  }

  const insertedSaleIds: string[] = [];
  const effects: SyncedSaleEffect[] = [];

  for (const raw of newItems) {
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
      const existingSale = await db.sale.findUnique({
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

    const productIds = items.map((item) => item.productId).filter(Boolean);
    if (productIds.length !== items.length) {
      throw new Error("Every item must include productId");
    }

    const dbProducts = await db.product.findMany({
      where: { id: { in: productIds } },
    });
    if (dbProducts.length !== productIds.length) {
      throw new Error("One or more products not found");
    }

    for (const product of dbProducts) {
      if (product.shopId !== shopId) {
        throw new Error("Product does not belong to this shop");
      }
      if (!product.isActive) {
        throw new Error(`Inactive product in cart: ${product.name}`);
      }
    }

    const needsCogs = await shopNeedsCogs(db, shopId);
    if (needsCogs) {
      const missing = dbProducts.filter((product) => product.buyPrice == null);
      if (missing.length > 0) {
        const names = missing
          .map((product) => product.name)
          .slice(0, 5)
          .join(", ");
        throw new Error(
          `Purchase price missing for: ${names}${
            missing.length > 5 ? "..." : ""
          }. Set buy price to ensure accurate profit.`
        );
      }
    }

    const productMap = new Map(dbProducts.map((product) => [product.id, product]));

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

    const inserted = await db.$transaction(async (tx) => {
      if (isDue && customerId) {
        const existingCustomer = await tx.customer.findUnique({
          where: { id: customerId },
          select: { id: true, shopId: true },
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
          createdAt,
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
            createdAt,
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
            createdAt,
            businessDate,
          },
        });
      }

      const saleItemRows = items.map((item) => {
        const product = productMap.get(item.productId);
        return {
          saleId: sale.id,
          productId: item.productId,
          productNameSnapshot: item.name || product?.name || null,
          quantity: toMoneyString(item.qty, "quantity"),
          unitPrice: toMoneyString(item.unitPrice, "unitPrice"),
          costAtSale: product?.buyPrice ?? null,
          lineTotal: toMoneyString(
            Number(item.qty) * Number(item.unitPrice),
            "lineTotal"
          ),
        };
      });

      await tx.saleItem.createMany({ data: saleItemRows });

      for (const product of dbProducts) {
        if (!product.trackStock) continue;

        const soldQty = items
          .filter((item) => item.productId === product.id)
          .reduce((sum, item) => sum + Number(item.qty || 0), 0);
        if (!Number.isFinite(soldQty) || soldQty === 0) continue;

        const soldQtyDecimal = new Prisma.Decimal(soldQty.toFixed(2));
        const updated = await tx.product.updateMany({
          where: {
            id: product.id,
            trackStock: true,
            stockQty: { gte: soldQtyDecimal },
          },
          data: {
            stockQty: { decrement: soldQtyDecimal },
          },
        });
        if (updated.count !== 1) {
          throw new Error(`Insufficient stock for product "${product.name}"`);
        }
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
    effects.push({
      shopId,
      saleId: inserted.saleId,
      invoiceNo: inserted.invoiceNo,
      totalAmount: totalNum,
      paymentMethod,
      payNow,
      isDue,
      customerId,
      productIds,
    });
  }

  return {
    saleIds: insertedSaleIds,
    effects,
  };
}
