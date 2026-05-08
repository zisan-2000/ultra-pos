import { Prisma, PrismaClient } from "@prisma/client";

const DEMO_TAG = "[hardware-demo]";
const DEMO_PREFIX = "HW";

type SeedUserRefs = {
  ownerUserId: string;
  staffUserId?: string | null;
};

type HardwareProductBlueprint = {
  name: string;
  category: string;
  baseUnit: string;
  buyPrice: number | null;
  sellPrice: number;
  trackStock?: boolean;
  trackBatch?: boolean;
  trackSerialNumbers?: boolean;
  trackCutLength?: boolean;
  defaultCutLength?: number | null;
  reorderPoint?: number | null;
  storageLocation?: string | null;
  sku?: string | null;
  barcode?: string | null;
  variants?: Array<{
    label: string;
    buyPrice: number | null;
    sellPrice: number;
    reorderPoint?: number | null;
    storageLocation?: string | null;
    sku?: string | null;
    barcode?: string | null;
  }>;
  conversions?: Array<{
    label: string;
    baseUnitQuantity: number;
  }>;
};

type PurchaseSeedItem = {
  productName: string;
  variantLabel?: string;
  qty: number;
  unitCost: number;
  batchNo?: string;
  serialNumbers?: string[];
};

type PurchaseSeed = {
  supplierName: string;
  purchaseDate: Date;
  paymentMethod: "cash" | "bkash" | "bank" | "due";
  paidAmount: number;
  transportCost?: number;
  unloadingCost?: number;
  carryingCost?: number;
  otherLandedCost?: number;
  note: string;
  items: PurchaseSeedItem[];
};

type PurchaseReturnSeed = {
  purchaseNote: string;
  returnDate: Date;
  note: string;
  items: Array<{
    productName: string;
    variantLabel?: string;
    qty: number;
    serialNumbers?: string[];
  }>;
};

type SaleSeedItem = {
  productName: string;
  variantLabel?: string;
  qty: number;
  unitPrice?: number;
  serialNumbers?: string[];
};

type SaleSeed = {
  customerName?: string;
  saleDate: Date;
  paymentMethod: "cash" | "due" | "bkash" | "bank";
  paidAmount?: number;
  note: string;
  dueDays?: number;
  items: SaleSeedItem[];
};

type ProductResolved = {
  id: string;
  name: string;
  category: string;
  baseUnit: string;
  buyPrice: Prisma.Decimal | null;
  sellPrice: Prisma.Decimal;
  stockQty: Prisma.Decimal;
  trackStock: boolean;
  trackBatch: boolean;
  trackSerialNumbers: boolean;
  trackCutLength: boolean;
  defaultCutLength: Prisma.Decimal | null;
};

type VariantResolved = {
  id: string;
  productId: string;
  label: string;
  buyPrice: Prisma.Decimal | null;
  sellPrice: Prisma.Decimal;
  stockQty: Prisma.Decimal;
};

type PurchaseRecord = {
  purchaseId: string;
  note: string;
  itemIdsByKey: Map<string, string>;
};

function money(value: number | string | Prisma.Decimal) {
  return new Prisma.Decimal(value).toFixed(2);
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function roundCost(value: number) {
  return Number(value.toFixed(4));
}

function day(value: string) {
  return new Date(`${value}T00:00:00.000+06:00`);
}

function moment(value: string) {
  return new Date(value);
}

function keyedItem(productName: string, variantLabel?: string | null) {
  return variantLabel ? `${productName}::${variantLabel}` : productName;
}

async function syncVariantAggregateStock(
  tx: Prisma.TransactionClient,
  productIds: Iterable<string>
) {
  for (const productId of new Set(Array.from(productIds))) {
    const variants = await tx.productVariant.findMany({
      where: { productId },
      select: { stockQty: true },
    });
    const total = variants.reduce(
      (sum, variant) => sum + Number(variant.stockQty ?? 0),
      0
    );
    await tx.product.update({
      where: { id: productId },
      data: { stockQty: money(total) },
    });
  }
}

async function ensureHardwareShopReady(
  prisma: PrismaClient,
  shopId: string,
  ownerUserId: string,
  staffUserId?: string | null
) {
  await prisma.shop.update({
    where: { id: shopId },
    data: {
      inventoryFeatureEntitled: true,
      inventoryEnabled: true,
      cogsFeatureEntitled: true,
      cogsEnabled: true,
      salesInvoiceEntitled: true,
      salesInvoiceEnabled: true,
      salesInvoicePrefix: DEMO_PREFIX,
      nextSalesInvoiceSeq: 1,
      saleReturnPrefix: "HWR",
      nextSaleReturnSeq: 1,
      discountFeatureEntitled: true,
      discountEnabled: true,
      barcodeFeatureEntitled: true,
      barcodeScanEnabled: true,
      taxFeatureEntitled: false,
      taxEnabled: false,
      ownerId: ownerUserId,
    },
  });

  if (staffUserId) {
    await prisma.user.update({
      where: { id: staffUserId },
      data: { staffShopId: shopId },
    });
  }
}

async function detectExistingHardwareActivity(prisma: PrismaClient, shopId: string) {
  const [purchases, sales, expenses, cashEntries, customers, suppliers, adjustments] =
    await Promise.all([
      prisma.purchase.findMany({
        where: { shopId },
        select: { id: true, note: true },
        take: 5,
      }),
      prisma.sale.findMany({
        where: { shopId },
        select: { id: true, note: true },
        take: 5,
      }),
      prisma.expense.count({ where: { shopId } }),
      prisma.cashEntry.count({ where: { shopId } }),
      prisma.customer.count({ where: { shopId } }),
      prisma.supplier.count({ where: { shopId } }),
      prisma.stockAdjustment.count({ where: { shopId } }),
    ]);

  const activityCount =
    purchases.length + sales.length + expenses + cashEntries + customers + suppliers + adjustments;
  const alreadyTagged =
    purchases.some((row) => row.note?.includes(DEMO_TAG)) ||
    sales.some((row) => row.note?.includes(DEMO_TAG));

  return { activityCount, alreadyTagged };
}

async function ensureHardwareProducts(prisma: PrismaClient, shopId: string) {
  const blueprints: HardwareProductBlueprint[] = [
    {
      name: "সিমেন্ট (৫০ কেজি)",
      category: "সিমেন্ট/বিল্ডিং",
      baseUnit: "bag",
      buyPrice: 445,
      sellPrice: 485,
      reorderPoint: 40,
      storageLocation: "ইয়ার্ড-A / সিমেন্ট জোন",
      sku: "HW-CEM-50",
      barcode: "2900000000001",
      conversions: [{ label: "১ প্যালেট", baseUnitQuantity: 50 }],
    },
    {
      name: "প্রিমিয়াম সিমেন্ট (৫০ কেজি)",
      category: "সিমেন্ট/বিল্ডিং",
      baseUnit: "bag",
      buyPrice: 452,
      sellPrice: 495,
      trackBatch: true,
      reorderPoint: 35,
      storageLocation: "ইয়ার্ড-A / ব্যাচ স্টক",
      sku: "HW-PCEM-50",
      barcode: "2900000000002",
      conversions: [{ label: "১ প্যালেট", baseUnitQuantity: 50 }],
    },
    {
      name: "রড",
      category: "সিমেন্ট/বিল্ডিং",
      baseUnit: "kg",
      buyPrice: 76,
      sellPrice: 84,
      reorderPoint: 120,
      storageLocation: "ইয়ার্ড-B / রড র‌্যাক",
      sku: "HW-ROD",
      conversions: [{ label: "১ টন", baseUnitQuantity: 1000 }],
      variants: [
        {
          label: "৮মিমি",
          buyPrice: 73,
          sellPrice: 80,
          reorderPoint: 70,
          storageLocation: "র‌্যাক R1",
          sku: "HW-ROD-8",
          barcode: "2900000000108",
        },
        {
          label: "১০মিমি",
          buyPrice: 75,
          sellPrice: 83,
          reorderPoint: 60,
          storageLocation: "র‌্যাক R2",
          sku: "HW-ROD-10",
          barcode: "2900000000110",
        },
        {
          label: "১২মিমি",
          buyPrice: 77,
          sellPrice: 86,
          reorderPoint: 55,
          storageLocation: "র‌্যাক R3",
          sku: "HW-ROD-12",
          barcode: "2900000000112",
        },
        {
          label: "১৬মিমি",
          buyPrice: 79,
          sellPrice: 92,
          reorderPoint: 35,
          storageLocation: "র‌্যাক R4",
          sku: "HW-ROD-16",
          barcode: "2900000000116",
        },
      ],
    },
    {
      name: "PVC পাইপ",
      category: "পাইপ/ফিটিংস",
      baseUnit: "ft",
      buyPrice: 24,
      sellPrice: 33,
      trackCutLength: true,
      defaultCutLength: 20,
      reorderPoint: 120,
      storageLocation: "ইয়ার্ড-C / পাইপ স্ট্যান্ড",
      sku: "HW-PVC",
      conversions: [{ label: "১ লম্বা", baseUnitQuantity: 20 }],
      variants: [
        {
          label: "১ ইঞ্চি",
          buyPrice: 19,
          sellPrice: 24,
          reorderPoint: 80,
          storageLocation: "স্ট্যান্ড P1",
          sku: "HW-PVC-1",
          barcode: "2900000000201",
        },
        {
          label: "১.৫ ইঞ্চি",
          buyPrice: 28,
          sellPrice: 36,
          reorderPoint: 70,
          storageLocation: "স্ট্যান্ড P2",
          sku: "HW-PVC-15",
          barcode: "2900000000202",
        },
        {
          label: "২ ইঞ্চি",
          buyPrice: 38,
          sellPrice: 48,
          reorderPoint: 55,
          storageLocation: "স্ট্যান্ড P3",
          sku: "HW-PVC-2",
          barcode: "2900000000203",
        },
      ],
    },
    {
      name: "তার",
      category: "ইলেকট্রিক্যাল",
      baseUnit: "mtr",
      buyPrice: 55,
      sellPrice: 72,
      reorderPoint: 80,
      storageLocation: "ইলেকট্রিক শেলফ-A",
      sku: "HW-WIRE",
      conversions: [{ label: "১ কয়েল", baseUnitQuantity: 90 }],
      variants: [
        {
          label: "১.৫ স্কোয়ার",
          buyPrice: 38,
          sellPrice: 52,
          reorderPoint: 60,
          storageLocation: "শেলফ W1",
          sku: "HW-WIRE-15",
          barcode: "2900000000301",
        },
        {
          label: "২.৫ স্কোয়ার",
          buyPrice: 62,
          sellPrice: 82,
          reorderPoint: 45,
          storageLocation: "শেলফ W2",
          sku: "HW-WIRE-25",
          barcode: "2900000000302",
        },
        {
          label: "৪ স্কোয়ার",
          buyPrice: 88,
          sellPrice: 118,
          reorderPoint: 30,
          storageLocation: "শেলফ W3",
          sku: "HW-WIRE-4",
          barcode: "2900000000303",
        },
      ],
    },
    {
      name: "সুইচ (সিঙ্গেল)",
      category: "ইলেকট্রিক্যাল",
      baseUnit: "pcs",
      buyPrice: 34,
      sellPrice: 48,
      reorderPoint: 30,
      storageLocation: "শেলফ E1",
      sku: "HW-SW-1G",
      barcode: "2900000000401",
    },
    {
      name: "সকেট (২ পিন)",
      category: "ইলেকট্রিক্যাল",
      baseUnit: "pcs",
      buyPrice: 29,
      sellPrice: 41,
      reorderPoint: 25,
      storageLocation: "শেলফ E2",
      sku: "HW-SOC-2P",
      barcode: "2900000000402",
    },
    {
      name: "বল ভালভ ১ ইঞ্চি",
      category: "পাইপ/ফিটিংস",
      baseUnit: "pcs",
      buyPrice: 120,
      sellPrice: 165,
      reorderPoint: 20,
      storageLocation: "ফিটিংস শেলফ B2",
      sku: "HW-BV-1",
      barcode: "2900000000501",
    },
    {
      name: "সাবমার্সিবল পাম্প মোটর ১ এইচপি",
      category: "মোটর/পাম্প",
      baseUnit: "pcs",
      buyPrice: 4650,
      sellPrice: 6200,
      trackSerialNumbers: true,
      reorderPoint: 1,
      storageLocation: "স্টোর রুম / মোটর কেজ",
      sku: "HW-MTR-1HP",
      barcode: "2900000000601",
    },
    {
      name: "টাইলস",
      category: "সিমেন্ট/বিল্ডিং",
      baseUnit: "pcs",
      buyPrice: 82,
      sellPrice: 102,
      reorderPoint: 90,
      storageLocation: "ডিসপ্লে কর্নার / টাইলস স্ট্যাক",
      sku: "HW-TILE",
      variants: [
        {
          label: "১×১ ফুট",
          buyPrice: 58,
          sellPrice: 76,
          reorderPoint: 50,
          storageLocation: "টাইলস স্ট্যাক T1",
          sku: "HW-TILE-11",
          barcode: "2900000000701",
        },
        {
          label: "২×২ ফুট",
          buyPrice: 145,
          sellPrice: 185,
          reorderPoint: 35,
          storageLocation: "টাইলস স্ট্যাক T2",
          sku: "HW-TILE-22",
          barcode: "2900000000702",
        },
      ],
    },
  ];

  const productsByName = new Map<string, ProductResolved>();
  const variantsByKey = new Map<string, VariantResolved>();

  for (const blueprint of blueprints) {
    const existing = await prisma.product.findFirst({
      where: { shopId, name: blueprint.name },
      include: { variants: true },
    });

    const baseData = {
      shopId,
      name: blueprint.name,
      category: blueprint.category,
      sku: blueprint.sku ?? null,
      barcode: blueprint.barcode ?? null,
      baseUnit: blueprint.baseUnit,
      buyPrice: blueprint.buyPrice == null ? null : money(blueprint.buyPrice),
      sellPrice: money(blueprint.sellPrice),
      stockQty: "0.00",
      trackStock: blueprint.trackStock ?? true,
      trackSerialNumbers: blueprint.trackSerialNumbers ?? false,
      trackBatch: blueprint.trackBatch ?? false,
      trackCutLength: blueprint.trackCutLength ?? false,
      defaultCutLength:
        blueprint.defaultCutLength == null ? null : money(blueprint.defaultCutLength),
      reorderPoint: blueprint.reorderPoint ?? null,
      storageLocation: blueprint.storageLocation ?? null,
      isActive: true,
    };

    const product = existing
      ? await prisma.product.update({
          where: { id: existing.id },
          data: baseData,
        })
      : await prisma.product.create({ data: baseData });

    await prisma.productUnitConversion.deleteMany({ where: { productId: product.id } });
    if (blueprint.conversions?.length) {
      await prisma.productUnitConversion.createMany({
        data: blueprint.conversions.map((conversion, index) => ({
          shopId,
          productId: product.id,
          label: conversion.label,
          baseUnitQuantity: money(conversion.baseUnitQuantity),
          sortOrder: index,
          isActive: true,
        })),
      });
    }

    const activeVariantIds: string[] = [];
    for (const [index, variantSeed] of (blueprint.variants ?? []).entries()) {
      const existingVariant = existing?.variants.find(
        (variant) => variant.label === variantSeed.label
      );
      const variant = existingVariant
        ? await prisma.productVariant.update({
            where: { id: existingVariant.id },
            data: {
              shopId,
              label: variantSeed.label,
              buyPrice:
                variantSeed.buyPrice == null ? null : money(variantSeed.buyPrice),
              sellPrice: money(variantSeed.sellPrice),
              stockQty: "0.00",
              reorderPoint: variantSeed.reorderPoint ?? null,
              storageLocation: variantSeed.storageLocation ?? null,
              sku: variantSeed.sku ?? null,
              barcode: variantSeed.barcode ?? null,
              sortOrder: index,
              isActive: true,
            },
          })
        : await prisma.productVariant.create({
            data: {
              shopId,
              productId: product.id,
              label: variantSeed.label,
              buyPrice:
                variantSeed.buyPrice == null ? null : money(variantSeed.buyPrice),
              sellPrice: money(variantSeed.sellPrice),
              stockQty: "0.00",
              reorderPoint: variantSeed.reorderPoint ?? null,
              storageLocation: variantSeed.storageLocation ?? null,
              sku: variantSeed.sku ?? null,
              barcode: variantSeed.barcode ?? null,
              sortOrder: index,
              isActive: true,
            },
          });

      activeVariantIds.push(variant.id);
      variantsByKey.set(keyedItem(blueprint.name, variant.label), variant as VariantResolved);
    }

    if (activeVariantIds.length > 0) {
      await prisma.productVariant.updateMany({
        where: { productId: product.id, id: { notIn: activeVariantIds } },
        data: { isActive: false, stockQty: "0.00" },
      });
    }

    productsByName.set(blueprint.name, product as ProductResolved);
  }

  return { productsByName, variantsByKey };
}

async function ensureSuppliers(prisma: PrismaClient, shopId: string) {
  const supplierSeeds = [
    {
      name: "Karim Cement Traders",
      phone: "01711-440001",
      address: "Kanchpur, Narayanganj",
    },
    {
      name: "Noor Steel Mills",
      phone: "01711-440002",
      address: "Fatullah Steel Market",
    },
    {
      name: "Pipe House BD",
      phone: "01711-440003",
      address: "Sadar Pipe Goli",
    },
    {
      name: "Electro Source",
      phone: "01711-440004",
      address: "Baitul View Electrical Hub",
    },
    {
      name: "Apex Surface & Tiles",
      phone: "01711-440005",
      address: "Jatrabari Building Materials Market",
    },
  ];

  const suppliers = new Map<string, { id: string; name: string }>();

  for (const seed of supplierSeeds) {
    const existing = await prisma.supplier.findFirst({
      where: { shopId, name: seed.name },
    });
    const supplier = existing
      ? await prisma.supplier.update({
          where: { id: existing.id },
          data: {
            phone: seed.phone,
            address: seed.address,
          },
        })
      : await prisma.supplier.create({
          data: {
            shopId,
            name: seed.name,
            phone: seed.phone,
            address: seed.address,
          },
        });
    suppliers.set(seed.name, { id: supplier.id, name: supplier.name });
  }

  return suppliers;
}

async function ensureCustomers(prisma: PrismaClient, shopId: string) {
  const customerSeeds = [
    {
      name: "Mizan Builder",
      phone: "01717-550001",
      address: "Shantinagar Project Site",
      creditLimit: 50000,
    },
    {
      name: "Noor Construction",
      phone: "01717-550002",
      address: "Rupganj Site Office",
      creditLimit: 35000,
    },
    {
      name: "Babul Electric Works",
      phone: "01717-550003",
      address: "Mogbazar Electrical Market",
      creditLimit: 15000,
    },
    {
      name: "Shapla Developers",
      phone: "01717-550004",
      address: "Narayanganj Main Road",
      creditLimit: 40000,
    },
  ];

  const customers = new Map<
    string,
    { id: string; name: string; totalDue: number; creditLimit: number | null }
  >();

  for (const seed of customerSeeds) {
    const existing = await prisma.customer.findFirst({
      where: { shopId, name: seed.name },
    });
    const customer = existing
      ? await prisma.customer.update({
          where: { id: existing.id },
          data: {
            phone: seed.phone,
            address: seed.address,
            creditLimit: money(seed.creditLimit),
            totalDue: "0.00",
            lastPaymentAt: null,
          },
        })
      : await prisma.customer.create({
          data: {
            shopId,
            name: seed.name,
            phone: seed.phone,
            address: seed.address,
            creditLimit: money(seed.creditLimit),
            totalDue: "0.00",
          },
        });

    customers.set(seed.name, {
      id: customer.id,
      name: customer.name,
      totalDue: 0,
      creditLimit: seed.creditLimit,
    });
  }

  return customers;
}

async function createPurchase(
  prisma: PrismaClient,
  params: {
    shopId: string;
    suppliers: Map<string, { id: string; name: string }>;
    productsByName: Map<string, ProductResolved>;
    variantsByKey: Map<string, VariantResolved>;
    seed: PurchaseSeed;
  }
): Promise<PurchaseRecord> {
  const supplier = params.suppliers.get(params.seed.supplierName);
  if (!supplier) {
    throw new Error(`Missing supplier: ${params.seed.supplierName}`);
  }

  const rows = params.seed.items.map((item) => {
    const product = params.productsByName.get(item.productName);
    if (!product) throw new Error(`Missing product: ${item.productName}`);
    const variant = item.variantLabel
      ? params.variantsByKey.get(keyedItem(item.productName, item.variantLabel))
      : null;
    if (item.variantLabel && !variant) {
      throw new Error(`Missing variant: ${item.productName} / ${item.variantLabel}`);
    }
    const lineTotal = roundMoney(item.qty * item.unitCost);
    return {
      item,
      product,
      variant,
      qty: item.qty,
      unitCost: item.unitCost,
      lineTotal,
    };
  });

  const subtotalAmount = roundMoney(rows.reduce((sum, row) => sum + row.lineTotal, 0));
  const transportCost = roundMoney(params.seed.transportCost ?? 0);
  const unloadingCost = roundMoney(params.seed.unloadingCost ?? 0);
  const carryingCost = roundMoney(params.seed.carryingCost ?? 0);
  const otherLandedCost = roundMoney(params.seed.otherLandedCost ?? 0);
  const landedCostTotal = roundMoney(
    transportCost + unloadingCost + carryingCost + otherLandedCost
  );
  const totalAmount = roundMoney(subtotalAmount + landedCostTotal);
  const paidAmount = roundMoney(Math.min(params.seed.paidAmount, totalAmount));
  const dueAmount = roundMoney(totalAmount - paidAmount);

  const baseTotal = rows.reduce((sum, row) => sum + row.lineTotal, 0);
  let remainingLanded = landedCostTotal;
  const allocatedRows = rows.map((row, index) => {
    const weight = baseTotal > 0 ? row.lineTotal / baseTotal : 1 / rows.length;
    const allocated =
      index === rows.length - 1
        ? roundMoney(remainingLanded)
        : roundMoney(landedCostTotal * weight);
    remainingLanded = roundMoney(remainingLanded - allocated);
    const effectiveLineTotal = roundMoney(row.lineTotal + allocated);
    const effectiveUnitCost = roundCost(effectiveLineTotal / row.qty);
    return {
      ...row,
      landedCostAllocated: allocated,
      effectiveLineTotal,
      effectiveUnitCost,
    };
  });

  return prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.create({
      data: {
        shopId: params.shopId,
        supplierId: supplier.id,
        supplierName: supplier.name,
        purchaseDate: params.seed.purchaseDate,
        paymentMethod: params.seed.paymentMethod,
        subtotalAmount: money(subtotalAmount),
        transportCost: money(transportCost),
        unloadingCost: money(unloadingCost),
        carryingCost: money(carryingCost),
        otherLandedCost: money(otherLandedCost),
        landedCostTotal: money(landedCostTotal),
        totalAmount: money(totalAmount),
        paidAmount: money(paidAmount),
        dueAmount: money(dueAmount),
        note: `${params.seed.note} ${DEMO_TAG}`,
      },
    });

    const aggregateVariantParents = new Set<string>();
    const itemIdsByKey = new Map<string, string>();

    for (const row of allocatedRows) {
      const purchaseItem = await tx.purchaseItem.create({
        data: {
          purchaseId: purchase.id,
          productId: row.product.id,
          variantId: row.variant?.id ?? null,
          quantity: money(row.qty),
          unitCost: money(row.unitCost),
          lineTotal: money(row.lineTotal),
          landedCostAllocated: money(row.landedCostAllocated),
          effectiveUnitCost: row.effectiveUnitCost.toFixed(4),
          effectiveLineTotal: money(row.effectiveLineTotal),
        },
      });

      itemIdsByKey.set(keyedItem(row.product.name, row.variant?.label), purchaseItem.id);

      if (row.product.trackSerialNumbers && row.item.serialNumbers?.length) {
        await tx.serialNumber.createMany({
          data: row.item.serialNumbers.map((serialNo) => ({
            shopId: params.shopId,
            productId: row.product.id,
            variantId: row.variant?.id ?? null,
            serialNo,
            status: "IN_STOCK",
            purchaseItemId: purchaseItem.id,
            note: `${params.seed.note} ${DEMO_TAG}`,
          })),
        });
      }

      if (row.product.trackBatch && row.item.batchNo) {
        await tx.batch.create({
          data: {
            shopId: params.shopId,
            productId: row.product.id,
            variantId: row.variant?.id ?? null,
            batchNo: row.item.batchNo,
            purchaseItemId: purchaseItem.id,
            totalQty: money(row.qty),
            remainingQty: money(row.qty),
            isActive: true,
          },
        });
      }

      if (row.product.trackStock) {
        if (row.variant) {
          const currentStock = Number(row.variant.stockQty ?? 0);
          const currentBuyPrice = Number(row.variant.buyPrice ?? row.product.buyPrice ?? 0);
          const nextStock = roundMoney(currentStock + row.qty);
          const nextBuyPrice =
            currentStock > 0
              ? roundCost(
                  (currentStock * currentBuyPrice + row.qty * row.effectiveUnitCost) /
                    nextStock
                )
              : row.effectiveUnitCost;

          await tx.productVariant.update({
            where: { id: row.variant.id },
            data: {
              buyPrice: money(nextBuyPrice),
              stockQty: money(nextStock),
            },
          });
          aggregateVariantParents.add(row.product.id);
        } else {
          const currentStock = Number(row.product.stockQty ?? 0);
          const currentBuyPrice = Number(row.product.buyPrice ?? 0);
          const nextStock = roundMoney(currentStock + row.qty);
          const nextBuyPrice =
            currentStock > 0
              ? roundCost(
                  (currentStock * currentBuyPrice + row.qty * row.effectiveUnitCost) /
                    nextStock
                )
              : row.effectiveUnitCost;
          await tx.product.update({
            where: { id: row.product.id },
            data: {
              buyPrice: money(nextBuyPrice),
              stockQty: money(nextStock),
            },
          });
        }
      }
    }

    if (aggregateVariantParents.size > 0) {
      await syncVariantAggregateStock(tx, aggregateVariantParents);
    }

    await tx.supplierLedger.create({
      data: {
        shopId: params.shopId,
        supplierId: supplier.id,
        entryType: "PURCHASE",
        amount: money(totalAmount),
        note: `${params.seed.note} ${DEMO_TAG}`,
        entryDate: params.seed.purchaseDate,
        businessDate: params.seed.purchaseDate,
      },
    });

    if (paidAmount > 0) {
      await tx.purchasePayment.create({
        data: {
          shopId: params.shopId,
          purchaseId: purchase.id,
          supplierId: supplier.id,
          amount: money(paidAmount),
          method: params.seed.paymentMethod,
          paidAt: params.seed.purchaseDate,
          businessDate: params.seed.purchaseDate,
          note: `${params.seed.note} ${DEMO_TAG}`,
        },
      });

      await tx.supplierLedger.create({
        data: {
          shopId: params.shopId,
          supplierId: supplier.id,
          entryType: "PAYMENT",
          amount: money(paidAmount),
          note: `Initial payment for ${params.seed.note} ${DEMO_TAG}`,
          entryDate: params.seed.purchaseDate,
          businessDate: params.seed.purchaseDate,
        },
      });
    }

    return {
      purchaseId: purchase.id,
      note: params.seed.note,
      itemIdsByKey,
    };
  });
}

async function createPurchaseReturn(
  prisma: PrismaClient,
  params: {
    shopId: string;
    purchaseRecord: PurchaseRecord;
    productsByName: Map<string, ProductResolved>;
    variantsByKey: Map<string, VariantResolved>;
    seed: PurchaseReturnSeed;
    ownerUserId: string;
  }
) {
  const purchase = await prisma.purchase.findUnique({
    where: { id: params.purchaseRecord.purchaseId },
  });
  if (!purchase) {
    throw new Error(`Missing purchase for return: ${params.seed.purchaseNote}`);
  }

  return prisma.$transaction(async (tx) => {
    const purchaseReturn = await tx.purchaseReturn.create({
      data: {
        shopId: params.shopId,
        purchaseId: purchase.id,
        supplierId: purchase.supplierId,
        returnDate: params.seed.returnDate,
        totalAmount: "0.00",
        supplierCredit: "0.00",
        note: `${params.seed.note} ${DEMO_TAG}`,
        createdByUserId: params.ownerUserId,
      },
    });

    let totalAmount = 0;
    const aggregateVariantParents = new Set<string>();

    for (const item of params.seed.items) {
      const purchaseItemId = params.purchaseRecord.itemIdsByKey.get(
        keyedItem(item.productName, item.variantLabel)
      );
      if (!purchaseItemId) {
        throw new Error(
          `Missing purchase item for return: ${keyedItem(item.productName, item.variantLabel)}`
        );
      }
      const product = params.productsByName.get(item.productName);
      const variant = item.variantLabel
        ? params.variantsByKey.get(keyedItem(item.productName, item.variantLabel))
        : null;
      if (!product) throw new Error(`Missing product: ${item.productName}`);

      const unitCost = Number(
        (
          await tx.purchaseItem.findUnique({
            where: { id: purchaseItemId },
            select: { unitCost: true },
          })
        )?.unitCost ?? 0
      );
      const lineTotal = roundMoney(unitCost * item.qty);
      totalAmount = roundMoney(totalAmount + lineTotal);

      const returnItem = await tx.purchaseReturnItem.create({
        data: {
          purchaseReturnId: purchaseReturn.id,
          purchaseItemId,
          productId: product.id,
          variantId: variant?.id ?? null,
          quantity: money(item.qty),
          unitCost: money(unitCost),
          lineTotal: money(lineTotal),
          note: `${params.seed.note} ${DEMO_TAG}`,
        },
      });

      if (product.trackSerialNumbers && item.serialNumbers?.length) {
        await tx.serialNumber.updateMany({
          where: {
            purchaseItemId,
            serialNo: { in: item.serialNumbers },
            status: "IN_STOCK",
          },
          data: {
            status: "RETURNED",
            note: `Supplier return ${purchaseReturn.id} ${DEMO_TAG}`,
          },
        });
      }

      if (product.trackBatch) {
        const batch = await tx.batch.findFirst({
          where: { purchaseItemId },
          orderBy: { createdAt: "asc" },
        });
        if (batch) {
          const nextTotal = roundMoney(Number(batch.totalQty) - item.qty);
          const nextRemaining = roundMoney(Number(batch.remainingQty) - item.qty);
          await tx.batch.update({
            where: { id: batch.id },
            data: {
              totalQty: money(nextTotal),
              remainingQty: money(nextRemaining),
              isActive: nextRemaining > 0,
            },
          });
        }
      }

      if (product.trackStock) {
        if (variant) {
          const currentStock = Number(
            (
              await tx.productVariant.findUnique({
                where: { id: variant.id },
                select: { stockQty: true },
              })
            )?.stockQty ?? 0
          );
          await tx.productVariant.update({
            where: { id: variant.id },
            data: { stockQty: money(currentStock - item.qty) },
          });
          aggregateVariantParents.add(product.id);
        } else {
          const currentStock = Number(
            (
              await tx.product.findUnique({
                where: { id: product.id },
                select: { stockQty: true },
              })
            )?.stockQty ?? 0
          );
          await tx.product.update({
            where: { id: product.id },
            data: { stockQty: money(currentStock - item.qty) },
          });
        }
      }

      if (product.trackCutLength) {
        await tx.remnantPiece.create({
          data: {
            shopId: params.shopId,
            productId: product.id,
            variantId: variant?.id ?? null,
            originalLength: money(item.qty),
            remainingLength: "0.00",
            source: "PURCHASE_RETURN",
            sourceRef: returnItem.id,
            status: "CONSUMED",
            note: `Returned to supplier ${DEMO_TAG}`,
          },
        });
      }
    }

    if (aggregateVariantParents.size > 0) {
      await syncVariantAggregateStock(tx, aggregateVariantParents);
    }

    const dueBefore = Number(purchase.dueAmount ?? 0);
    const newDue = roundMoney(Math.max(0, dueBefore - totalAmount));
    const supplierCredit = roundMoney(Math.max(0, totalAmount - dueBefore));

    await tx.purchase.update({
      where: { id: purchase.id },
      data: { dueAmount: money(newDue) },
    });

    await tx.purchaseReturn.update({
      where: { id: purchaseReturn.id },
      data: {
        totalAmount: money(totalAmount),
        supplierCredit: money(supplierCredit),
      },
    });

    if (purchase.supplierId) {
      await tx.supplierLedger.create({
        data: {
          shopId: params.shopId,
          supplierId: purchase.supplierId,
          entryType: "PURCHASE_RETURN",
          amount: money(totalAmount),
          note: `${params.seed.note} ${DEMO_TAG}`,
          entryDate: params.seed.returnDate,
          businessDate: params.seed.returnDate,
        },
      });
    }
  });
}

async function createSale(
  prisma: PrismaClient,
  params: {
    shopId: string;
    saleNo: number;
    customers: Map<
      string,
      { id: string; name: string; totalDue: number; creditLimit: number | null }
    >;
    productsByName: Map<string, ProductResolved>;
    variantsByKey: Map<string, VariantResolved>;
    seed: SaleSeed;
  }
) {
  const customer = params.seed.customerName
    ? params.customers.get(params.seed.customerName) ?? null
    : null;

  const rows = params.seed.items.map((item) => {
    const product = params.productsByName.get(item.productName);
    if (!product) throw new Error(`Missing product: ${item.productName}`);
    const variant = item.variantLabel
      ? params.variantsByKey.get(keyedItem(item.productName, item.variantLabel))
      : null;
    if (item.variantLabel && !variant) {
      throw new Error(`Missing variant: ${item.productName} / ${item.variantLabel}`);
    }
    const unitPrice =
      item.unitPrice ?? Number(variant?.sellPrice ?? product.sellPrice ?? 0);
    const lineTotal = roundMoney(item.qty * unitPrice);
    return { item, product, variant, unitPrice, lineTotal };
  });

  const subtotalAmount = roundMoney(rows.reduce((sum, row) => sum + row.lineTotal, 0));
  const totalAmount = subtotalAmount;
  const paidAmount = roundMoney(
    Math.min(
      params.seed.paymentMethod === "due"
        ? params.seed.paidAmount ?? 0
        : totalAmount,
      totalAmount
    )
  );
  const invoiceNo = `${DEMO_PREFIX}-${String(params.saleNo).padStart(4, "0")}`;

  return prisma.$transaction(async (tx) => {
    const businessDate = day(params.seed.saleDate.toISOString().slice(0, 10));
    const dueDate =
      params.seed.paymentMethod === "due"
        ? day(
            new Date(
              params.seed.saleDate.getTime() + 86400000 * (params.seed.dueDays ?? 30)
            )
              .toISOString()
              .slice(0, 10)
          )
        : null;

    const sale = await tx.sale.create({
      data: {
        shopId: params.shopId,
        customerId: customer?.id ?? null,
        invoiceNo,
        invoiceIssuedAt: params.seed.saleDate,
        saleDate: params.seed.saleDate,
        businessDate,
        subtotalAmount: money(subtotalAmount),
        discountAmount: "0.00",
        taxableAmount: money(totalAmount),
        taxAmount: "0.00",
        totalAmount: money(totalAmount),
        paymentMethod: params.seed.paymentMethod,
        dueDate,
        paidAmount: money(paidAmount),
        note: `${params.seed.note} ${DEMO_TAG}`,
      },
      select: { id: true },
    });

    const aggregateVariantParents = new Set<string>();

    for (const row of rows) {
      const costAtSale = row.variant?.buyPrice ?? row.product.buyPrice ?? null;
      const saleItem = await tx.saleItem.create({
        data: {
          saleId: sale.id,
          productId: row.product.id,
          variantId: row.variant?.id ?? null,
          productNameSnapshot: row.product.name,
          quantity: money(row.item.qty),
          unitPrice: money(row.unitPrice),
          costAtSale,
          lineTotal: money(row.lineTotal),
        },
        select: { id: true },
      });

      if (row.product.trackSerialNumbers && row.item.serialNumbers?.length) {
        await tx.serialNumber.updateMany({
          where: {
            shopId: params.shopId,
            productId: row.product.id,
            variantId: row.variant?.id ?? null,
            serialNo: { in: row.item.serialNumbers },
            status: "IN_STOCK",
          },
          data: {
            status: "SOLD",
            saleItemId: saleItem.id,
            note: `Sold in ${invoiceNo} ${DEMO_TAG}`,
          },
        });
      }

      if (row.product.trackBatch) {
        let remaining = row.item.qty;
        const batches = await tx.batch.findMany({
          where: {
            shopId: params.shopId,
            productId: row.product.id,
            variantId: row.variant?.id ?? null,
            remainingQty: { gt: 0 },
          },
          orderBy: { createdAt: "asc" },
        });

        for (const batch of batches) {
          if (remaining <= 0) break;
          const available = Number(batch.remainingQty ?? 0);
          const used = Math.min(available, remaining);
          await tx.batch.update({
            where: { id: batch.id },
            data: {
              remainingQty: money(available - used),
              isActive: available - used > 0,
            },
          });
          await tx.batchAllocation.create({
            data: {
              shopId: params.shopId,
              batchId: batch.id,
              saleItemId: saleItem.id,
              quantityAllocated: money(used),
            },
          });
          remaining = roundMoney(remaining - used);
        }

        if (remaining > 0.000001) {
          throw new Error(`Batch allocation incomplete for ${row.product.name}`);
        }
      }

      if (row.product.trackCutLength) {
        let remaining = row.item.qty;
        const defaultLength = Number(row.product.defaultCutLength ?? 0);
        const remnants = await tx.remnantPiece.findMany({
          where: {
            shopId: params.shopId,
            productId: row.product.id,
            variantId: row.variant?.id ?? null,
            status: "ACTIVE",
            remainingLength: { gt: 0 },
          },
          orderBy: [{ remainingLength: "asc" }, { createdAt: "asc" }],
        });

        for (const piece of remnants) {
          if (remaining <= 0) break;
          const available = Number(piece.remainingLength ?? 0);
          const used = Math.min(available, remaining);
          const nextRemaining = roundMoney(available - used);
          if (nextRemaining <= 0) {
            await tx.remnantPiece.update({
              where: { id: piece.id },
              data: {
                remainingLength: "0.00",
                status: "CONSUMED",
                consumedSaleItemId: saleItem.id,
              },
            });
          } else {
            await tx.remnantPiece.update({
              where: { id: piece.id },
              data: { remainingLength: money(nextRemaining) },
            });
            await tx.remnantPiece.create({
              data: {
                shopId: params.shopId,
                productId: row.product.id,
                variantId: row.variant?.id ?? null,
                originalLength: money(used),
                remainingLength: "0.00",
                source: "REMNANT_SALE",
                sourceRef: piece.id,
                status: "CONSUMED",
                consumedSaleItemId: saleItem.id,
                note: `Partial remnant consumption ${DEMO_TAG}`,
              },
            });
          }
          remaining = roundMoney(remaining - used);
        }

        while (remaining > 0) {
          if (remaining >= defaultLength) {
            remaining = roundMoney(remaining - defaultLength);
            continue;
          }

          const leftover = roundMoney(defaultLength - remaining);
          await tx.remnantPiece.create({
            data: {
              shopId: params.shopId,
              productId: row.product.id,
              variantId: row.variant?.id ?? null,
              originalLength: money(defaultLength),
              remainingLength: money(leftover),
              source: "CUT_SALE",
              sourceRef: saleItem.id,
              status: "ACTIVE",
              note: `Leftover created from ${invoiceNo} ${DEMO_TAG}`,
            },
          });
          remaining = 0;
        }
      }

      if (row.product.trackStock) {
        if (row.variant) {
          const currentStock = Number(
            (
              await tx.productVariant.findUnique({
                where: { id: row.variant.id },
                select: { stockQty: true },
              })
            )?.stockQty ?? 0
          );
          await tx.productVariant.update({
            where: { id: row.variant.id },
            data: { stockQty: money(currentStock - row.item.qty) },
          });
          aggregateVariantParents.add(row.product.id);
        } else {
          const currentStock = Number(
            (
              await tx.product.findUnique({
                where: { id: row.product.id },
                select: { stockQty: true },
              })
            )?.stockQty ?? 0
          );
          await tx.product.update({
            where: { id: row.product.id },
            data: { stockQty: money(currentStock - row.item.qty) },
          });
        }
      }
    }

    if (aggregateVariantParents.size > 0) {
      await syncVariantAggregateStock(tx, aggregateVariantParents);
    }

    if (params.seed.paymentMethod === "cash" || paidAmount > 0) {
      await tx.cashEntry.create({
        data: {
          shopId: params.shopId,
          entryType: "IN",
          amount: money(params.seed.paymentMethod === "cash" ? totalAmount : paidAmount),
          reason:
            params.seed.paymentMethod === "cash"
              ? `Cash sale ${invoiceNo} ${DEMO_TAG}`
              : `Partial due payment in sale ${invoiceNo} ${DEMO_TAG}`,
          businessDate,
          createdAt: params.seed.saleDate,
        },
      });
    }

    if (customer && params.seed.paymentMethod === "due") {
      const dueAmount = roundMoney(totalAmount - paidAmount);
      const dueAfterSale = roundMoney(customer.totalDue + totalAmount);
      await tx.customerLedger.create({
        data: {
          shopId: params.shopId,
          customerId: customer.id,
          entryType: "SALE",
          amount: money(totalAmount),
          description: `Due sale ${invoiceNo} ${DEMO_TAG}`,
          saleId: sale.id,
          entryDate: params.seed.saleDate,
          businessDate,
        },
      });

      let finalDue = dueAfterSale;
      if (paidAmount > 0) {
        finalDue = roundMoney(dueAfterSale - paidAmount);
        await tx.customerLedger.create({
          data: {
            shopId: params.shopId,
            customerId: customer.id,
            entryType: "PAYMENT",
            amount: money(paidAmount),
            description: `Paid during due sale ${invoiceNo} ${DEMO_TAG}`,
            saleId: sale.id,
            entryDate: params.seed.saleDate,
            businessDate,
          },
        });
      }

      await tx.customer.update({
        where: { id: customer.id },
        data: {
          totalDue: money(finalDue),
          lastPaymentAt: paidAmount > 0 ? params.seed.saleDate : undefined,
        },
      });
      customer.totalDue = roundMoney(customer.totalDue + dueAmount);
    }

    return { saleId: sale.id, invoiceNo };
  });
}

async function recordCustomerPayment(
  prisma: PrismaClient,
  params: {
    shopId: string;
    customer: { id: string; name: string; totalDue: number };
    amount: number;
    paidAt: Date;
    note: string;
  }
) {
  await prisma.$transaction(async (tx) => {
    const nextDue = roundMoney(Math.max(0, params.customer.totalDue - params.amount));
    const businessDate = day(params.paidAt.toISOString().slice(0, 10));

    await tx.customer.update({
      where: { id: params.customer.id },
      data: {
        totalDue: money(nextDue),
        lastPaymentAt: params.paidAt,
      },
    });

    await tx.customerLedger.create({
      data: {
        shopId: params.shopId,
        customerId: params.customer.id,
        entryType: "PAYMENT",
        amount: money(params.amount),
        description: `${params.note} ${DEMO_TAG}`,
        entryDate: params.paidAt,
        businessDate,
      },
    });

    await tx.cashEntry.create({
      data: {
        shopId: params.shopId,
        entryType: "IN",
        amount: money(params.amount),
        reason: `${params.note} ${DEMO_TAG}`,
        businessDate,
        createdAt: params.paidAt,
      },
    });
  });

  params.customer.totalDue = roundMoney(Math.max(0, params.customer.totalDue - params.amount));
}

async function seedExpensesAndCash(prisma: PrismaClient, shopId: string) {
  const openingCashDate = moment("2026-04-01T09:00:00+06:00");
  await prisma.cashEntry.create({
    data: {
      shopId,
      entryType: "IN",
      amount: money(25000),
      reason: `Opening cash float ${DEMO_TAG}`,
      businessDate: day("2026-04-01"),
      createdAt: openingCashDate,
    },
  });

  const expenseSeeds = [
    {
      amount: 2800,
      category: "Transport",
      expenseDate: day("2026-04-11"),
      note: `Local delivery van fuel ${DEMO_TAG}`,
    },
    {
      amount: 5200,
      category: "Salary",
      expenseDate: day("2026-04-30"),
      note: `Store helper weekly wages ${DEMO_TAG}`,
    },
    {
      amount: 1800,
      category: "Electricity",
      expenseDate: day("2026-05-02"),
      note: `Shop electricity bill ${DEMO_TAG}`,
    },
    {
      amount: 2400,
      category: "Maintenance",
      expenseDate: day("2026-05-03"),
      note: `Display rack repair ${DEMO_TAG}`,
    },
  ];

  for (const expense of expenseSeeds) {
    await prisma.expense.create({
      data: {
        shopId,
        amount: money(expense.amount),
        category: expense.category,
        expenseDate: expense.expenseDate,
        note: expense.note,
      },
    });

    await prisma.cashEntry.create({
      data: {
        shopId,
        entryType: "OUT",
        amount: money(expense.amount),
        reason: expense.note,
        businessDate: expense.expenseDate,
        createdAt: expense.expenseDate,
      },
    });
  }
}

async function seedStockAdjustments(
  prisma: PrismaClient,
  params: {
    shopId: string;
    productsByName: Map<string, ProductResolved>;
    variantsByKey: Map<string, VariantResolved>;
  }
) {
  await prisma.$transaction(async (tx) => {
    const switchProduct = params.productsByName.get("সুইচ (সিঙ্গেল)");
    const rodProduct = params.productsByName.get("রড");
    const rod12 = params.variantsByKey.get(keyedItem("রড", "১২মিমি"));
    if (!switchProduct || !rodProduct || !rod12) {
      throw new Error("Stock adjustment seed references are missing");
    }

    const currentSwitch = Number(
      (
        await tx.product.findUnique({
          where: { id: switchProduct.id },
          select: { stockQty: true },
        })
      )?.stockQty ?? 0
    );
    const nextSwitch = roundMoney(currentSwitch - 3);
    await tx.product.update({
      where: { id: switchProduct.id },
      data: { stockQty: money(nextSwitch) },
    });
    await tx.stockAdjustment.create({
      data: {
        shopId: params.shopId,
        productId: switchProduct.id,
        reason: "ভাঙা/নষ্ট",
        note: `${DEMO_TAG} display box damaged during handling`,
        quantityChange: money(-3),
        previousQty: money(currentSwitch),
        newQty: money(nextSwitch),
        createdAt: moment("2026-05-04T18:00:00+06:00"),
      },
    });

    const currentRod12 = Number(
      (
        await tx.productVariant.findUnique({
          where: { id: rod12.id },
          select: { stockQty: true },
        })
      )?.stockQty ?? 0
    );
    const nextRod12 = roundMoney(currentRod12 + 5);
    await tx.productVariant.update({
      where: { id: rod12.id },
      data: { stockQty: money(nextRod12) },
    });
    await tx.stockAdjustment.create({
      data: {
        shopId: params.shopId,
        productId: rodProduct.id,
        variantId: rod12.id,
        reason: "গণনায় ভুল",
        note: `${DEMO_TAG} recount found extra bundle stock`,
        quantityChange: money(5),
        previousQty: money(currentRod12),
        newQty: money(nextRod12),
        createdAt: moment("2026-05-05T17:30:00+06:00"),
      },
    });

    await syncVariantAggregateStock(tx, [rodProduct.id]);
  });
}

export async function seedHardwareDemo(
  prisma: PrismaClient,
  shopId: string,
  users: SeedUserRefs
) {
  await ensureHardwareShopReady(prisma, shopId, users.ownerUserId, users.staffUserId);

  const existing = await detectExistingHardwareActivity(prisma, shopId);
  if (existing.activityCount > 0) {
    if (existing.alreadyTagged) {
      console.log(
        "INFO: Hardware demo seed already present. Skipping duplicate transactional seeding."
      );
      return;
    }

    console.warn(
      "WARN: Hardware shop already has activity without demo tag. Skipping transactional demo seed to avoid overwriting live-looking data. Use SEED_RESET=1 for a clean full hardware demo."
    );
    return;
  }

  const { productsByName, variantsByKey } = await ensureHardwareProducts(prisma, shopId);
  const suppliers = await ensureSuppliers(prisma, shopId);
  const customers = await ensureCustomers(prisma, shopId);

  const purchases: PurchaseSeed[] = [
    {
      supplierName: "Karim Cement Traders",
      purchaseDate: day("2026-04-02"),
      paymentMethod: "due",
      paidAmount: 35000,
      transportCost: 1200,
      unloadingCost: 600,
      carryingCost: 300,
      note: "April cement restock",
      items: [
        { productName: "সিমেন্ট (৫০ কেজি)", qty: 120, unitCost: 442 },
        {
          productName: "প্রিমিয়াম সিমেন্ট (৫০ কেজি)",
          qty: 80,
          unitCost: 452,
          batchNo: "PC-A-0402",
        },
      ],
    },
    {
      supplierName: "Noor Steel Mills",
      purchaseDate: day("2026-04-05"),
      paymentMethod: "bank",
      paidAmount: 45000,
      transportCost: 1800,
      unloadingCost: 900,
      note: "Rod sizes refill",
      items: [
        { productName: "রড", variantLabel: "৮মিমি", qty: 260, unitCost: 73 },
        { productName: "রড", variantLabel: "১০মিমি", qty: 220, unitCost: 75 },
        { productName: "রড", variantLabel: "১২মিমি", qty: 180, unitCost: 77 },
        { productName: "রড", variantLabel: "১৬মিমি", qty: 120, unitCost: 79 },
      ],
    },
    {
      supplierName: "Pipe House BD",
      purchaseDate: day("2026-04-08"),
      paymentMethod: "cash",
      paidAmount: 18200,
      transportCost: 900,
      note: "PVC pipe and valve stock",
      items: [
        { productName: "PVC পাইপ", variantLabel: "১ ইঞ্চি", qty: 200, unitCost: 19 },
        { productName: "PVC পাইপ", variantLabel: "১.৫ ইঞ্চি", qty: 160, unitCost: 28 },
        { productName: "PVC পাইপ", variantLabel: "২ ইঞ্চি", qty: 120, unitCost: 38 },
        { productName: "বল ভালভ ১ ইঞ্চি", qty: 60, unitCost: 120 },
      ],
    },
    {
      supplierName: "Electro Source",
      purchaseDate: day("2026-04-10"),
      paymentMethod: "cash",
      paidAmount: 34850,
      carryingCost: 450,
      note: "Electrical core stock",
      items: [
        { productName: "সুইচ (সিঙ্গেল)", qty: 180, unitCost: 34 },
        { productName: "সকেট (২ পিন)", qty: 140, unitCost: 29 },
        { productName: "তার", variantLabel: "১.৫ স্কোয়ার", qty: 180, unitCost: 38 },
        { productName: "তার", variantLabel: "২.৫ স্কোয়ার", qty: 140, unitCost: 62 },
        { productName: "তার", variantLabel: "৪ স্কোয়ার", qty: 90, unitCost: 88 },
        {
          productName: "সাবমার্সিবল পাম্প মোটর ১ এইচপি",
          qty: 3,
          unitCost: 4650,
          serialNumbers: ["MTR-1HP-2401", "MTR-1HP-2402", "MTR-1HP-2403"],
        },
      ],
    },
    {
      supplierName: "Karim Cement Traders",
      purchaseDate: day("2026-04-18"),
      paymentMethod: "due",
      paidAmount: 20000,
      transportCost: 500,
      unloadingCost: 300,
      note: "Premium cement second batch",
      items: [
        {
          productName: "প্রিমিয়াম সিমেন্ট (৫০ কেজি)",
          qty: 100,
          unitCost: 458,
          batchNo: "PC-B-0418",
        },
      ],
    },
    {
      supplierName: "Apex Surface & Tiles",
      purchaseDate: day("2026-04-19"),
      paymentMethod: "bkash",
      paidAmount: 22240,
      otherLandedCost: 600,
      note: "Tiles display batch",
      items: [
        { productName: "টাইলস", variantLabel: "১×১ ফুট", qty: 160, unitCost: 58 },
        { productName: "টাইলস", variantLabel: "২×২ ফুট", qty: 90, unitCost: 145 },
      ],
    },
  ];

  const purchaseRecords: PurchaseRecord[] = [];
  for (const seed of purchases) {
    purchaseRecords.push(
      await createPurchase(prisma, {
        shopId,
        suppliers,
        productsByName,
        variantsByKey,
        seed,
      })
    );
  }

  const purchaseRecordByNote = new Map(purchaseRecords.map((row) => [row.note, row]));

  const purchaseReturns: PurchaseReturnSeed[] = [
    {
      purchaseNote: "Rod sizes refill",
      returnDate: day("2026-04-20"),
      note: "Supplier took back wrong gauge rods",
      items: [{ productName: "রড", variantLabel: "১৬মিমি", qty: 8 }],
    },
    {
      purchaseNote: "Premium cement second batch",
      returnDate: day("2026-04-21"),
      note: "Torn bags sent back for supplier credit",
      items: [{ productName: "প্রিমিয়াম সিমেন্ট (৫০ কেজি)", qty: 12 }],
    },
  ];

  for (const seed of purchaseReturns) {
    const purchaseRecord = purchaseRecordByNote.get(seed.purchaseNote);
    if (!purchaseRecord) throw new Error(`Missing purchase record: ${seed.purchaseNote}`);
    await createPurchaseReturn(prisma, {
      shopId,
      purchaseRecord,
      productsByName,
      variantsByKey,
      seed,
      ownerUserId: users.ownerUserId,
    });
  }

  const sales: SaleSeed[] = [
    {
      saleDate: moment("2026-04-21T11:10:00+06:00"),
      paymentMethod: "cash",
      note: "Morning counter sale",
      items: [
        { productName: "রড", variantLabel: "৮মিমি", qty: 35, unitPrice: 80 },
        { productName: "সিমেন্ট (৫০ কেজি)", qty: 12, unitPrice: 485 },
        { productName: "সুইচ (সিঙ্গেল)", qty: 8, unitPrice: 48 },
        { productName: "PVC পাইপ", variantLabel: "১ ইঞ্চি", qty: 18, unitPrice: 24 },
      ],
    },
    {
      customerName: "Mizan Builder",
      saleDate: moment("2026-04-22T15:20:00+06:00"),
      paymentMethod: "due",
      paidAmount: 5000,
      dueDays: 21,
      note: "Site delivery on credit",
      items: [
        { productName: "প্রিমিয়াম সিমেন্ট (৫০ কেজি)", qty: 30, unitPrice: 495 },
        { productName: "রড", variantLabel: "১০মিমি", qty: 40, unitPrice: 83 },
        { productName: "বল ভালভ ১ ইঞ্চি", qty: 6, unitPrice: 165 },
      ],
    },
    {
      customerName: "Babul Electric Works",
      saleDate: moment("2026-04-24T13:45:00+06:00"),
      paymentMethod: "cash",
      note: "Electrical contractor purchase",
      items: [
        { productName: "সকেট (২ পিন)", qty: 12, unitPrice: 41 },
        { productName: "সুইচ (সিঙ্গেল)", qty: 10, unitPrice: 48 },
        { productName: "তার", variantLabel: "২.৫ স্কোয়ার", qty: 45, unitPrice: 82 },
      ],
    },
    {
      customerName: "Noor Construction",
      saleDate: moment("2026-04-26T10:50:00+06:00"),
      paymentMethod: "cash",
      note: "Pipe and cement urgent pickup",
      items: [
        { productName: "প্রিমিয়াম সিমেন্ট (৫০ কেজি)", qty: 42, unitPrice: 495 },
        { productName: "PVC পাইপ", variantLabel: "২ ইঞ্চি", qty: 24, unitPrice: 48 },
      ],
    },
    {
      customerName: "Shapla Developers",
      saleDate: moment("2026-04-27T17:10:00+06:00"),
      paymentMethod: "due",
      paidAmount: 4000,
      dueDays: 30,
      note: "Project materials billed",
      items: [
        {
          productName: "সাবমার্সিবল পাম্প মোটর ১ এইচপি",
          qty: 1,
          unitPrice: 6200,
          serialNumbers: ["MTR-1HP-2401"],
        },
        { productName: "টাইলস", variantLabel: "২×২ ফুট", qty: 18, unitPrice: 185 },
      ],
    },
    {
      saleDate: moment("2026-05-01T12:20:00+06:00"),
      paymentMethod: "cash",
      note: "Batch-heavy client order",
      items: [
        { productName: "প্রিমিয়াম সিমেন্ট (৫০ কেজি)", qty: 25, unitPrice: 495 },
        { productName: "রড", variantLabel: "১২মিমি", qty: 30, unitPrice: 86 },
      ],
    },
  ];

  let invoiceSeq = 1;
  for (const seed of sales) {
    await createSale(prisma, {
      shopId,
      saleNo: invoiceSeq,
      customers,
      productsByName,
      variantsByKey,
      seed,
    });
    invoiceSeq += 1;
  }

  const mizan = customers.get("Mizan Builder");
  if (mizan) {
    await recordCustomerPayment(prisma, {
      shopId,
      customer: mizan,
      amount: 6000,
      paidAt: moment("2026-05-04T16:00:00+06:00"),
      note: "Cash received against project due",
    });
  }

  await seedExpensesAndCash(prisma, shopId);
  await seedStockAdjustments(prisma, {
    shopId,
    productsByName,
    variantsByKey,
  });

  await prisma.shop.update({
    where: { id: shopId },
    data: {
      nextSalesInvoiceSeq: invoiceSeq,
    },
  });

  console.log(
    `INFO: Hardware demo seeded with ${purchases.length} purchases, ${purchaseReturns.length} purchase returns, ${sales.length} sales, and full hardware showcase data.`
  );
}
