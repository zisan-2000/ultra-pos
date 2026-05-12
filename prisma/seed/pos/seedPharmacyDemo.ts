import { Prisma, PrismaClient } from "@prisma/client";

const DEMO_TAG = "[pharmacy-demo]";
const DEMO_PREFIX = "PH";

type SeedUserRefs = {
  ownerUserId: string;
  staffUserId?: string | null;
};

type PharmacyProductBlueprint = {
  name: string;
  category: string;
  baseUnit: string;
  buyPrice: number | null;
  sellPrice: number;
  trackStock?: boolean;
  trackBatch?: boolean;
  trackSerialNumbers?: boolean;
  reorderPoint?: number | null;
  storageLocation?: string | null;
  sku?: string | null;
  barcode?: string | null;
  genericName?: string | null;
  strength?: string | null;
  dosageForm?: string | null;
  manufacturer?: string | null;
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
  batchExpiryDate?: Date;
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
  genericName: string | null;
  strength: string | null;
  dosageForm: string | null;
  manufacturer: string | null;
};

type VariantResolved = {
  id: string;
  productId: string;
  label: string;
  buyPrice: Prisma.Decimal | null;
  sellPrice: Prisma.Decimal;
  stockQty: Prisma.Decimal;
};

type PurchaseItemRef = {
  purchaseItemId: string;
  productId: string;
  variantId: string | null;
  unitCost: number;
  batchNo: string | null;
};

type PurchaseRecord = {
  purchaseId: string;
  supplierId: string;
  note: string;
  itemRefsByKey: Map<string, PurchaseItemRef>;
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

async function ensurePharmacyShopReady(
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
      saleReturnPrefix: "PHR",
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

async function detectExistingPharmacyActivity(prisma: PrismaClient, shopId: string) {
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
    purchases.length +
    sales.length +
    expenses +
    cashEntries +
    customers +
    suppliers +
    adjustments;
  const alreadyTagged =
    purchases.some((row) => row.note?.includes(DEMO_TAG)) ||
    sales.some((row) => row.note?.includes(DEMO_TAG));

  return { activityCount, alreadyTagged };
}

async function ensurePharmacyProducts(prisma: PrismaClient, shopId: string) {
  const blueprints: PharmacyProductBlueprint[] = [
    {
      name: "Napa 500",
      category: "Pain Relief",
      baseUnit: "strip",
      buyPrice: 28,
      sellPrice: 35,
      trackBatch: true,
      reorderPoint: 40,
      storageLocation: "Rack A1 / Fever & Pain",
      sku: "PH-NAPA-500",
      barcode: "3900000000001",
      genericName: "Paracetamol",
      strength: "500mg",
      dosageForm: "Tablet",
      manufacturer: "Beximco Pharma",
      conversions: [{ label: "1 box", baseUnitQuantity: 10 }],
    },
    {
      name: "Seclo 20",
      category: "Gastric",
      baseUnit: "strip",
      buyPrice: 48,
      sellPrice: 62,
      trackBatch: true,
      reorderPoint: 20,
      storageLocation: "Rack A2 / Gastric",
      sku: "PH-SECLO-20",
      barcode: "3900000000002",
      genericName: "Omeprazole",
      strength: "20mg",
      dosageForm: "Capsule",
      manufacturer: "Square Pharma",
      conversions: [{ label: "1 box", baseUnitQuantity: 10 }],
    },
    {
      name: "Ace Syrup",
      category: "Pediatric",
      baseUnit: "bottle",
      buyPrice: 36,
      sellPrice: 48,
      trackBatch: true,
      reorderPoint: 12,
      storageLocation: "Rack B1 / Syrup",
      sku: "PH-ACE-SYP",
      barcode: "3900000000003",
      genericName: "Paracetamol",
      strength: "120mg/5ml",
      dosageForm: "Syrup",
      manufacturer: "Square Pharma",
    },
    {
      name: "ORS Sachet",
      category: "Hydration",
      baseUnit: "pcs",
      buyPrice: 6,
      sellPrice: 10,
      trackBatch: true,
      reorderPoint: 60,
      storageLocation: "Front Bin / ORS",
      sku: "PH-ORS",
      barcode: "3900000000004",
      genericName: "Oral Rehydration Salts",
      strength: "Standard Sachet",
      dosageForm: "Sachet",
      manufacturer: "Opsonin",
      conversions: [{ label: "1 box", baseUnitQuantity: 20 }],
    },
    {
      name: "Histacin 10",
      category: "Allergy",
      baseUnit: "strip",
      buyPrice: 25,
      sellPrice: 34,
      trackBatch: true,
      reorderPoint: 25,
      storageLocation: "Rack A3 / Allergy",
      sku: "PH-HIST-10",
      barcode: "3900000000005",
      genericName: "Cetirizine",
      strength: "10mg",
      dosageForm: "Tablet",
      manufacturer: "Incepta Pharma",
      conversions: [{ label: "1 box", baseUnitQuantity: 10 }],
    },
    {
      name: "Zinc Sulfate Syrup",
      category: "Pediatric",
      baseUnit: "bottle",
      buyPrice: 42,
      sellPrice: 58,
      trackBatch: true,
      reorderPoint: 10,
      storageLocation: "Rack B1 / Syrup",
      sku: "PH-ZINC-SYP",
      barcode: "3900000000006",
      genericName: "Zinc Sulfate",
      strength: "20mg/5ml",
      dosageForm: "Syrup",
      manufacturer: "Incepta Pharma",
    },
    {
      name: "Glucose Test Strip 50s",
      category: "Diabetes Care",
      baseUnit: "box",
      buyPrice: 260,
      sellPrice: 320,
      trackBatch: true,
      reorderPoint: 10,
      storageLocation: "Rack C2 / Diabetes",
      sku: "PH-GLU-50",
      barcode: "3900000000007",
      genericName: "Glucose Test Strip",
      strength: "50 strips",
      dosageForm: "Diagnostic Strip",
      manufacturer: "SafeCheck",
    },
    {
      name: "Savlon Liquid 500ml",
      category: "First Aid",
      baseUnit: "bottle",
      buyPrice: 105,
      sellPrice: 135,
      trackBatch: true,
      reorderPoint: 8,
      storageLocation: "Front Shelf / First Aid",
      sku: "PH-SAVLON-500",
      barcode: "3900000000008",
      genericName: "Antiseptic Liquid",
      strength: "500ml",
      dosageForm: "Liquid",
      manufacturer: "ACI Consumer",
    },
    {
      name: "Baby Diaper",
      category: "Baby Care",
      baseUnit: "pack",
      buyPrice: 340,
      sellPrice: 420,
      reorderPoint: 8,
      storageLocation: "Rack D1 / Baby Care",
      sku: "PH-DIAPER",
      manufacturer: "MamyPoko",
      variants: [
        {
          label: "M (24 pcs)",
          buyPrice: 340,
          sellPrice: 420,
          reorderPoint: 5,
          storageLocation: "Rack D1-M",
          sku: "PH-DIAPER-M24",
          barcode: "3900000000101",
        },
        {
          label: "L (24 pcs)",
          buyPrice: 360,
          sellPrice: 450,
          reorderPoint: 5,
          storageLocation: "Rack D1-L",
          sku: "PH-DIAPER-L24",
          barcode: "3900000000102",
        },
      ],
    },
    {
      name: "Digital Thermometer",
      category: "Medical Device",
      baseUnit: "pcs",
      buyPrice: 180,
      sellPrice: 260,
      trackSerialNumbers: true,
      reorderPoint: 2,
      storageLocation: "Counter Drawer / Device",
      sku: "PH-THERMO-D",
      barcode: "3900000000009",
      manufacturer: "Omron",
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
      genericName: blueprint.genericName ?? null,
      strength: blueprint.strength ?? null,
      dosageForm: blueprint.dosageForm ?? null,
      manufacturer: blueprint.manufacturer ?? null,
      buyPrice: blueprint.buyPrice == null ? null : money(blueprint.buyPrice),
      sellPrice: money(blueprint.sellPrice),
      stockQty: "0.00",
      trackStock: blueprint.trackStock ?? true,
      trackSerialNumbers: blueprint.trackSerialNumbers ?? false,
      trackBatch: blueprint.trackBatch ?? false,
      trackCutLength: false,
      defaultCutLength: null,
      reorderPoint: blueprint.reorderPoint ?? null,
      storageLocation: blueprint.storageLocation ?? null,
      expiryDate: null,
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
      name: "Beximco Pharma Distribution",
      phone: "01711-880001",
      address: "Bogura Distributor Point",
    },
    {
      name: "Square Pharma Trade",
      phone: "01711-880002",
      address: "Rangpur Road Medicine Hub",
    },
    {
      name: "Incepta Regional Depot",
      phone: "01711-880003",
      address: "Sherpur Road, Bogura",
    },
    {
      name: "Healthcare Device House",
      phone: "01711-880004",
      address: "Medical College Road",
    },
    {
      name: "Baby Care Wholesale",
      phone: "01711-880005",
      address: "Satmatha Baby Goods Lane",
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
      name: "City Clinic",
      phone: "01717-990001",
      address: "Satmatha, Bogura",
      creditLimit: 12000,
    },
    {
      name: "Rahman Family",
      phone: "01717-990002",
      address: "Chelopara, Bogura",
      creditLimit: 4000,
    },
    {
      name: "Maa Baby Corner",
      phone: "01717-990003",
      address: "Jaleshworitola, Bogura",
      creditLimit: 8000,
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
      creditLimit: customer.creditLimit ? Number(customer.creditLimit) : null,
    });
  }

  return customers;
}

function allocateLandedCosts(items: PurchaseSeedItem[], landedCostTotal: number) {
  if (landedCostTotal <= 0) {
    return items.map(() => 0);
  }

  const lineTotals = items.map((item) => roundMoney(item.qty * item.unitCost));
  const subtotal = lineTotals.reduce((sum, amount) => sum + amount, 0);
  if (subtotal <= 0) {
    return items.map(() => 0);
  }

  const allocations: number[] = [];
  let allocated = 0;

  for (let i = 0; i < items.length; i += 1) {
    if (i === items.length - 1) {
      allocations.push(roundMoney(landedCostTotal - allocated));
      continue;
    }

    const share = roundMoney((lineTotals[i] / subtotal) * landedCostTotal);
    allocations.push(share);
    allocated = roundMoney(allocated + share);
  }

  return allocations;
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
    throw new Error(`Missing supplier seed: ${params.seed.supplierName}`);
  }

  const subtotalAmount = roundMoney(
    params.seed.items.reduce((sum, item) => sum + item.qty * item.unitCost, 0)
  );
  const landedCostTotal = roundMoney(
    (params.seed.transportCost ?? 0) +
      (params.seed.unloadingCost ?? 0) +
      (params.seed.carryingCost ?? 0) +
      (params.seed.otherLandedCost ?? 0)
  );
  const totalAmount = roundMoney(subtotalAmount + landedCostTotal);
  const dueAmount = roundMoney(Math.max(0, totalAmount - params.seed.paidAmount));
  const businessDate = day(params.seed.purchaseDate.toISOString().slice(0, 10));
  const landedAllocations = allocateLandedCosts(params.seed.items, landedCostTotal);

  return prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.create({
      data: {
        shopId: params.shopId,
        supplierId: supplier.id,
        supplierName: supplier.name,
        purchaseDate: businessDate,
        paymentMethod: params.seed.paymentMethod,
        subtotalAmount: money(subtotalAmount),
        transportCost: money(params.seed.transportCost ?? 0),
        unloadingCost: money(params.seed.unloadingCost ?? 0),
        carryingCost: money(params.seed.carryingCost ?? 0),
        otherLandedCost: money(params.seed.otherLandedCost ?? 0),
        landedCostTotal: money(landedCostTotal),
        totalAmount: money(totalAmount),
        paidAmount: money(params.seed.paidAmount),
        dueAmount: money(dueAmount),
        note: `${params.seed.note} ${DEMO_TAG}`,
        createdAt: params.seed.purchaseDate,
      },
    });

    const aggregateVariantParents = new Set<string>();
    const itemRefsByKey = new Map<string, PurchaseItemRef>();

    for (let index = 0; index < params.seed.items.length; index += 1) {
      const item = params.seed.items[index];
      const product = params.productsByName.get(item.productName);
      if (!product) {
        throw new Error(`Missing product seed: ${item.productName}`);
      }
      const variant = item.variantLabel
        ? params.variantsByKey.get(keyedItem(item.productName, item.variantLabel))
        : null;
      if (item.variantLabel && !variant) {
        throw new Error(`Missing variant seed: ${item.productName} / ${item.variantLabel}`);
      }

      if (product.trackBatch && !item.batchNo) {
        throw new Error(`Batch missing for batch-tracked product: ${item.productName}`);
      }

      const lineTotal = roundMoney(item.qty * item.unitCost);
      const landedAllocated = landedAllocations[index] ?? 0;
      const effectiveLineTotal = roundMoney(lineTotal + landedAllocated);
      const effectiveUnitCost = item.qty > 0 ? roundCost(effectiveLineTotal / item.qty) : 0;

      const purchaseItem = await tx.purchaseItem.create({
        data: {
          purchaseId: purchase.id,
          productId: product.id,
          variantId: variant?.id ?? null,
          quantity: money(item.qty),
          purchaseQty: money(item.qty),
          purchaseUnitLabel: product.baseUnit,
          baseUnitQuantity: "1.0000",
          batchNo: item.batchNo ?? null,
          batchExpiryDate: item.batchExpiryDate ?? null,
          unitCost: money(item.unitCost),
          lineTotal: money(lineTotal),
          landedCostAllocated: money(landedAllocated),
          effectiveUnitCost: new Prisma.Decimal(effectiveUnitCost).toFixed(4),
          effectiveLineTotal: money(effectiveLineTotal),
          createdAt: params.seed.purchaseDate,
        },
      });

      if (product.trackBatch && item.batchNo) {
        const existingBatch = await tx.batch.findFirst({
          where: {
            shopId: params.shopId,
            productId: product.id,
            batchNo: item.batchNo,
          },
        });

        if (existingBatch) {
          const existingExpiry = existingBatch.expiryDate
            ? existingBatch.expiryDate.toISOString().slice(0, 10)
            : null;
          const nextExpiry = item.batchExpiryDate
            ? item.batchExpiryDate.toISOString().slice(0, 10)
            : null;
          if (existingExpiry !== nextExpiry) {
            throw new Error(
              `Batch expiry mismatch for ${item.productName} / ${item.batchNo}`
            );
          }

          const nextTotal = roundMoney(Number(existingBatch.totalQty) + item.qty);
          const nextRemaining = roundMoney(Number(existingBatch.remainingQty) + item.qty);
          await tx.batch.update({
            where: { id: existingBatch.id },
            data: {
              totalQty: money(nextTotal),
              remainingQty: money(nextRemaining),
              isActive: nextRemaining > 0,
            },
          });
        } else {
          await tx.batch.create({
            data: {
              shopId: params.shopId,
              productId: product.id,
              variantId: variant?.id ?? null,
              batchNo: item.batchNo,
              expiryDate: item.batchExpiryDate ?? null,
              purchaseItemId: purchaseItem.id,
              totalQty: money(item.qty),
              remainingQty: money(item.qty),
              isActive: item.qty > 0,
              createdAt: params.seed.purchaseDate,
              updatedAt: params.seed.purchaseDate,
            },
          });
        }
      }

      if (product.trackSerialNumbers) {
        if (!item.serialNumbers?.length || item.serialNumbers.length !== item.qty) {
          throw new Error(
            `Serial numbers mismatch for ${item.productName}. Expected ${item.qty}`
          );
        }

        for (const serialNo of item.serialNumbers) {
          await tx.serialNumber.upsert({
            where: {
              shopId_productId_serialNo: {
                shopId: params.shopId,
                productId: product.id,
                serialNo,
              },
            },
            update: {
              variantId: variant?.id ?? null,
              purchaseItemId: purchaseItem.id,
              saleItemId: null,
              status: "IN_STOCK",
              note: `${params.seed.note} ${DEMO_TAG}`,
            },
            create: {
              shopId: params.shopId,
              productId: product.id,
              variantId: variant?.id ?? null,
              serialNo,
              purchaseItemId: purchaseItem.id,
              status: "IN_STOCK",
              note: `${params.seed.note} ${DEMO_TAG}`,
              createdAt: params.seed.purchaseDate,
              updatedAt: params.seed.purchaseDate,
            },
          });
        }
      }

      if (product.trackStock) {
        if (variant) {
          const nextStock = roundMoney(Number(variant.stockQty) + item.qty);
          await tx.productVariant.update({
            where: { id: variant.id },
            data: { stockQty: money(nextStock) },
          });
          variant.stockQty = new Prisma.Decimal(nextStock);
          aggregateVariantParents.add(product.id);
        } else {
          const nextStock = roundMoney(Number(product.stockQty) + item.qty);
          await tx.product.update({
            where: { id: product.id },
            data: { stockQty: money(nextStock) },
          });
          product.stockQty = new Prisma.Decimal(nextStock);
        }
      }

      itemRefsByKey.set(keyedItem(item.productName, item.variantLabel), {
        purchaseItemId: purchaseItem.id,
        productId: product.id,
        variantId: variant?.id ?? null,
        unitCost: item.unitCost,
        batchNo: item.batchNo ?? null,
      });
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
        businessDate,
      },
    });

    if (params.seed.paidAmount > 0) {
      await tx.purchasePayment.create({
        data: {
          shopId: params.shopId,
          purchaseId: purchase.id,
          supplierId: supplier.id,
          amount: money(params.seed.paidAmount),
          method: params.seed.paymentMethod,
          paidAt: params.seed.purchaseDate,
          businessDate,
          note: `${params.seed.note} ${DEMO_TAG}`,
        },
      });

      await tx.supplierLedger.create({
        data: {
          shopId: params.shopId,
          supplierId: supplier.id,
          entryType: "PAYMENT",
          amount: money(params.seed.paidAmount),
          note: `${params.seed.note} ${DEMO_TAG}`,
          entryDate: params.seed.purchaseDate,
          businessDate,
        },
      });

      if (params.seed.paymentMethod === "cash") {
        await tx.cashEntry.create({
          data: {
            shopId: params.shopId,
            entryType: "OUT",
            amount: money(params.seed.paidAmount),
            reason: `Purchase payment ${params.seed.note} ${DEMO_TAG}`,
            businessDate,
            createdAt: params.seed.purchaseDate,
          },
        });
      }
    }

    return {
      purchaseId: purchase.id,
      supplierId: supplier.id,
      note: params.seed.note,
      itemRefsByKey,
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
  const businessDate = day(params.seed.returnDate.toISOString().slice(0, 10));
  const aggregateVariantParents = new Set<string>();

  await prisma.$transaction(async (tx) => {
    const resolvedItems = [];
    let totalAmount = 0;

    for (const item of params.seed.items) {
      const product = params.productsByName.get(item.productName);
      if (!product) {
        throw new Error(`Missing product for purchase return: ${item.productName}`);
      }
      const variant = item.variantLabel
        ? params.variantsByKey.get(keyedItem(item.productName, item.variantLabel))
        : null;
      const purchaseRef = params.purchaseRecord.itemRefsByKey.get(
        keyedItem(item.productName, item.variantLabel)
      );
      if (!purchaseRef) {
        throw new Error(
          `Missing purchase item reference for return: ${item.productName} ${
            item.variantLabel ?? ""
          }`.trim()
        );
      }

      const lineTotal = roundMoney(item.qty * purchaseRef.unitCost);
      totalAmount = roundMoney(totalAmount + lineTotal);
      resolvedItems.push({
        item,
        product,
        variant,
        purchaseRef,
        lineTotal,
      });
    }

    const purchaseReturn = await tx.purchaseReturn.create({
      data: {
        shopId: params.shopId,
        purchaseId: params.purchaseRecord.purchaseId,
        supplierId: params.purchaseRecord.supplierId,
        returnDate: businessDate,
        totalAmount: money(totalAmount),
        supplierCredit: money(totalAmount),
        note: `${params.seed.note} ${DEMO_TAG}`,
        createdByUserId: params.ownerUserId,
        createdAt: params.seed.returnDate,
      },
    });

    for (const row of resolvedItems) {
      await tx.purchaseReturnItem.create({
        data: {
          purchaseReturnId: purchaseReturn.id,
          purchaseItemId: row.purchaseRef.purchaseItemId,
          productId: row.product.id,
          variantId: row.variant?.id ?? null,
          quantity: money(row.item.qty),
          unitCost: money(row.purchaseRef.unitCost),
          lineTotal: money(row.lineTotal),
          note: `${params.seed.note} ${DEMO_TAG}`,
          createdAt: params.seed.returnDate,
        },
      });

      if (row.product.trackBatch && row.purchaseRef.batchNo) {
        const batch = await tx.batch.findFirst({
          where: {
            shopId: params.shopId,
            productId: row.product.id,
            batchNo: row.purchaseRef.batchNo,
          },
        });
        if (!batch || Number(batch.remainingQty) < row.item.qty) {
          throw new Error(
            `Not enough batch stock for return: ${row.product.name} / ${row.purchaseRef.batchNo}`
          );
        }

        const nextRemaining = roundMoney(Number(batch.remainingQty) - row.item.qty);
        await tx.batch.update({
          where: { id: batch.id },
          data: {
            remainingQty: money(nextRemaining),
            isActive: nextRemaining > 0,
          },
        });
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
          const nextStock = roundMoney(currentStock - row.item.qty);
          await tx.productVariant.update({
            where: { id: row.variant.id },
            data: { stockQty: money(nextStock) },
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
          const nextStock = roundMoney(currentStock - row.item.qty);
          await tx.product.update({
            where: { id: row.product.id },
            data: { stockQty: money(nextStock) },
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
        supplierId: params.purchaseRecord.supplierId,
        entryType: "PURCHASE_RETURN",
        amount: money(totalAmount),
        note: `${params.seed.note} ${DEMO_TAG}`,
        entryDate: params.seed.returnDate,
        businessDate,
      },
    });
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
    ? params.customers.get(params.seed.customerName)
    : null;
  if (params.seed.customerName && !customer) {
    throw new Error(`Missing customer seed: ${params.seed.customerName}`);
  }

  const businessDate = day(params.seed.saleDate.toISOString().slice(0, 10));
  const invoiceNo = `${DEMO_PREFIX}-${String(params.saleNo).padStart(4, "0")}`;

  return prisma.$transaction(async (tx) => {
    const resolvedItems = [];
    let subtotalAmount = 0;

    for (const item of params.seed.items) {
      const product = params.productsByName.get(item.productName);
      if (!product) {
        throw new Error(`Missing product seed for sale: ${item.productName}`);
      }
      const variant = item.variantLabel
        ? params.variantsByKey.get(keyedItem(item.productName, item.variantLabel))
        : null;
      if (item.variantLabel && !variant) {
        throw new Error(`Missing variant seed for sale: ${item.productName} / ${item.variantLabel}`);
      }
      const unitPrice = item.unitPrice ?? Number(variant?.sellPrice ?? product.sellPrice);
      const lineTotal = roundMoney(item.qty * unitPrice);
      subtotalAmount = roundMoney(subtotalAmount + lineTotal);
      resolvedItems.push({ item, product, variant, unitPrice, lineTotal });
    }

    const totalAmount = subtotalAmount;
    const paidAmount =
      params.seed.paymentMethod === "due"
        ? roundMoney(params.seed.paidAmount ?? 0)
        : totalAmount;

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
        taxableAmount: money(subtotalAmount),
        taxAmount: "0.00",
        totalAmount: money(totalAmount),
        paymentMethod: params.seed.paymentMethod,
        dueDate:
          params.seed.paymentMethod === "due" && params.seed.dueDays
            ? day(
                new Date(
                  params.seed.saleDate.getTime() +
                    params.seed.dueDays * 24 * 60 * 60 * 1000
                )
                  .toISOString()
                  .slice(0, 10)
              )
            : null,
        paidAmount: money(paidAmount),
        note: `${params.seed.note} ${DEMO_TAG}`,
      },
    });

    const aggregateVariantParents = new Set<string>();

    for (const row of resolvedItems) {
      const saleItem = await tx.saleItem.create({
        data: {
          saleId: sale.id,
          productId: row.product.id,
          variantId: row.variant?.id ?? null,
          productNameSnapshot: row.variant
            ? `${row.product.name} (${row.variant.label})`
            : row.product.name,
          quantity: money(row.item.qty),
          unitPrice: money(row.unitPrice),
          costAtSale: row.variant
            ? money(Number(row.variant.buyPrice ?? 0))
            : money(Number(row.product.buyPrice ?? 0)),
          lineTotal: money(row.lineTotal),
        },
      });

      if (row.product.trackBatch) {
        let remaining = row.item.qty;
        const batches = await tx.batch.findMany({
          where: {
            shopId: params.shopId,
            productId: row.product.id,
            variantId: row.variant?.id ?? null,
            remainingQty: { gt: 0 },
            isActive: true,
          },
          orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }],
        });

        for (const batch of batches) {
          if (remaining <= 0) break;
          const available = Number(batch.remainingQty);
          const allocated = roundMoney(Math.min(remaining, available));
          if (allocated <= 0) continue;

          const nextRemaining = roundMoney(available - allocated);
          await tx.batch.update({
            where: { id: batch.id },
            data: {
              remainingQty: money(nextRemaining),
              isActive: nextRemaining > 0,
            },
          });

          await tx.batchAllocation.create({
            data: {
              shopId: params.shopId,
              batchId: batch.id,
              saleItemId: saleItem.id,
              quantityAllocated: money(allocated),
              quantityReturned: "0.00",
              createdAt: params.seed.saleDate,
              updatedAt: params.seed.saleDate,
            },
          });
          remaining = roundMoney(remaining - allocated);
        }

        if (remaining > 0) {
          throw new Error(`Insufficient FEFO batch stock for ${row.product.name}`);
        }
      }

      if (row.product.trackSerialNumbers) {
        if (!row.item.serialNumbers?.length || row.item.serialNumbers.length !== row.item.qty) {
          throw new Error(
            `Serial numbers mismatch for sale item: ${row.product.name}. Expected ${row.item.qty}`
          );
        }

        const serials = await tx.serialNumber.findMany({
          where: {
            shopId: params.shopId,
            productId: row.product.id,
            variantId: row.variant?.id ?? null,
            serialNo: { in: row.item.serialNumbers },
            status: "IN_STOCK",
          },
        });

        if (serials.length !== row.item.serialNumbers.length) {
          throw new Error(`Missing in-stock serial for ${row.product.name}`);
        }

        for (const serial of serials) {
          await tx.serialNumber.update({
            where: { id: serial.id },
            data: {
              status: "SOLD",
              saleItemId: saleItem.id,
              note: `${params.seed.note} ${DEMO_TAG}`,
            },
          });
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
          const nextStock = roundMoney(currentStock - row.item.qty);
          await tx.productVariant.update({
            where: { id: row.variant.id },
            data: { stockQty: money(nextStock) },
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
          const nextStock = roundMoney(currentStock - row.item.qty);
          await tx.product.update({
            where: { id: row.product.id },
            data: { stockQty: money(nextStock) },
          });
        }
      }
    }

    if (aggregateVariantParents.size > 0) {
      await syncVariantAggregateStock(tx, aggregateVariantParents);
    }

    if (params.seed.paymentMethod === "cash") {
      await tx.cashEntry.create({
        data: {
          shopId: params.shopId,
          entryType: "IN",
          amount: money(totalAmount),
          reason: `Cash sale ${invoiceNo} ${DEMO_TAG}`,
          businessDate,
          createdAt: params.seed.saleDate,
        },
      });
    } else if (paidAmount > 0) {
      await tx.cashEntry.create({
        data: {
          shopId: params.shopId,
          entryType: "IN",
          amount: money(paidAmount),
          reason: `Partial due payment in sale ${invoiceNo} ${DEMO_TAG}`,
          businessDate,
          createdAt: params.seed.saleDate,
        },
      });
    }

    if (customer && params.seed.paymentMethod === "due") {
      const dueAmount = roundMoney(totalAmount - paidAmount);
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

      if (paidAmount > 0) {
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

      const nextDue = roundMoney(customer.totalDue + dueAmount);
      await tx.customer.update({
        where: { id: customer.id },
        data: {
          totalDue: money(nextDue),
          lastPaymentAt: paidAmount > 0 ? params.seed.saleDate : undefined,
        },
      });
      customer.totalDue = nextDue;
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
  const openingCashDate = moment("2026-05-01T08:30:00+06:00");
  await prisma.cashEntry.create({
    data: {
      shopId,
      entryType: "IN",
      amount: money(15000),
      reason: `Opening cash float ${DEMO_TAG}`,
      businessDate: day("2026-05-01"),
      createdAt: openingCashDate,
    },
  });

  const expenseSeeds = [
    {
      amount: 1200,
      category: "Electricity",
      expenseDate: day("2026-05-05"),
      note: `Medicine fridge electricity ${DEMO_TAG}`,
    },
    {
      amount: 850,
      category: "Maintenance",
      expenseDate: day("2026-05-09"),
      note: `Counter printer paper & cleaning ${DEMO_TAG}`,
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

export async function seedPharmacyDemo(
  prisma: PrismaClient,
  shopId: string,
  users: SeedUserRefs
) {
  await ensurePharmacyShopReady(prisma, shopId, users.ownerUserId, users.staffUserId);

  const existing = await detectExistingPharmacyActivity(prisma, shopId);
  if (existing.activityCount > 0) {
    if (existing.alreadyTagged) {
      console.log(
        "INFO: Pharmacy demo seed already present. Skipping duplicate transactional seeding."
      );
      return;
    }

    console.warn(
      "WARN: Pharmacy shop already has activity without demo tag. Skipping transactional demo seed to avoid overwriting live-looking data. Use SEED_RESET=1 for a clean pharmacy demo."
    );
    return;
  }

  const { productsByName, variantsByKey } = await ensurePharmacyProducts(prisma, shopId);
  const suppliers = await ensureSuppliers(prisma, shopId);
  const customers = await ensureCustomers(prisma, shopId);

  const purchases: PurchaseSeed[] = [
    {
      supplierName: "Beximco Pharma Distribution",
      purchaseDate: day("2026-03-20"),
      paymentMethod: "due",
      paidAmount: 5000,
      note: "Opening analgesic + syrup stock",
      items: [
        {
          productName: "Napa 500",
          qty: 120,
          unitCost: 27,
          batchNo: "NAPA-A-0320",
          batchExpiryDate: day("2026-05-05"),
        },
        {
          productName: "Ace Syrup",
          qty: 24,
          unitCost: 36,
          batchNo: "ACE-A-0320",
          batchExpiryDate: day("2026-06-30"),
        },
      ],
    },
    {
      supplierName: "Square Pharma Trade",
      purchaseDate: day("2026-04-15"),
      paymentMethod: "bank",
      paidAmount: 9100,
      transportCost: 250,
      note: "Gastric and analgesic refill",
      items: [
        {
          productName: "Napa 500",
          qty: 180,
          unitCost: 28,
          batchNo: "NAPA-B-0415",
          batchExpiryDate: day("2026-06-15"),
        },
        {
          productName: "Seclo 20",
          qty: 90,
          unitCost: 48,
          batchNo: "SECLO-A-0415",
          batchExpiryDate: day("2026-08-15"),
        },
      ],
    },
    {
      supplierName: "Incepta Regional Depot",
      purchaseDate: day("2026-04-28"),
      paymentMethod: "cash",
      paidAmount: 8650,
      carryingCost: 200,
      note: "Pediatric + hydration restock",
      items: [
        {
          productName: "Napa 500",
          qty: 140,
          unitCost: 29,
          batchNo: "NAPA-C-0428",
          batchExpiryDate: day("2026-09-20"),
        },
        {
          productName: "ORS Sachet",
          qty: 200,
          unitCost: 6,
          batchNo: "ORS-A-0428",
          batchExpiryDate: day("2027-01-31"),
        },
        {
          productName: "Histacin 10",
          qty: 60,
          unitCost: 25,
          batchNo: "HIST-A-0428",
          batchExpiryDate: day("2026-07-10"),
        },
        {
          productName: "Zinc Sulfate Syrup",
          qty: 18,
          unitCost: 42,
          batchNo: "ZINC-A-0428",
          batchExpiryDate: day("2026-07-25"),
        },
      ],
    },
    {
      supplierName: "Healthcare Device House",
      purchaseDate: day("2026-05-02"),
      paymentMethod: "cash",
      paidAmount: 720,
      note: "Counter device stock",
      items: [
        {
          productName: "Digital Thermometer",
          qty: 4,
          unitCost: 180,
          serialNumbers: [
            "THM-2605-001",
            "THM-2605-002",
            "THM-2605-003",
            "THM-2605-004",
          ],
        },
      ],
    },
    {
      supplierName: "Baby Care Wholesale",
      purchaseDate: day("2026-05-03"),
      paymentMethod: "bkash",
      paidAmount: 2620,
      note: "Baby care stock",
      items: [
        {
          productName: "Baby Diaper",
          variantLabel: "M (24 pcs)",
          qty: 4,
          unitCost: 340,
        },
        {
          productName: "Baby Diaper",
          variantLabel: "L (24 pcs)",
          qty: 3,
          unitCost: 360,
        },
      ],
    },
    {
      supplierName: "Square Pharma Trade",
      purchaseDate: day("2026-05-04"),
      paymentMethod: "due",
      paidAmount: 3000,
      unloadingCost: 120,
      note: "Near-expiry diabetes + antiseptic stock",
      items: [
        {
          productName: "Glucose Test Strip 50s",
          qty: 30,
          unitCost: 260,
          batchNo: "GLU-A-0504",
          batchExpiryDate: day("2026-06-05"),
        },
        {
          productName: "Savlon Liquid 500ml",
          qty: 12,
          unitCost: 105,
          batchNo: "SAVLON-A-0504",
          batchExpiryDate: day("2026-10-15"),
        },
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
      purchaseNote: "Near-expiry diabetes + antiseptic stock",
      returnDate: day("2026-05-09"),
      note: "Damaged strip boxes returned to supplier",
      items: [{ productName: "Glucose Test Strip 50s", qty: 3 }],
    },
  ];

  for (const seed of purchaseReturns) {
    const purchaseRecord = purchaseRecordByNote.get(seed.purchaseNote);
    if (!purchaseRecord) {
      throw new Error(`Missing purchase record for return: ${seed.purchaseNote}`);
    }
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
      saleDate: moment("2026-05-04T10:20:00+06:00"),
      paymentMethod: "cash",
      note: "Morning OTC counter sale",
      items: [
        { productName: "Napa 500", qty: 20, unitPrice: 35 },
        { productName: "Ace Syrup", qty: 3, unitPrice: 48 },
        { productName: "ORS Sachet", qty: 10, unitPrice: 10 },
      ],
    },
    {
      customerName: "City Clinic",
      saleDate: moment("2026-05-06T12:40:00+06:00"),
      paymentMethod: "due",
      paidAmount: 800,
      dueDays: 14,
      note: "Clinic credit delivery",
      items: [
        { productName: "Napa 500", qty: 30, unitPrice: 35 },
        { productName: "Seclo 20", qty: 12, unitPrice: 62 },
      ],
    },
    {
      saleDate: moment("2026-05-08T18:05:00+06:00"),
      paymentMethod: "cash",
      note: "Device and diabetic care sale",
      items: [
        {
          productName: "Digital Thermometer",
          qty: 1,
          unitPrice: 260,
          serialNumbers: ["THM-2605-001"],
        },
        { productName: "Glucose Test Strip 50s", qty: 2, unitPrice: 320 },
      ],
    },
    {
      customerName: "Rahman Family",
      saleDate: moment("2026-05-10T16:30:00+06:00"),
      paymentMethod: "cash",
      note: "Family purchase with baby care",
      items: [
        { productName: "Baby Diaper", variantLabel: "M (24 pcs)", qty: 1, unitPrice: 420 },
        { productName: "Histacin 10", qty: 8, unitPrice: 34 },
        { productName: "Savlon Liquid 500ml", qty: 1, unitPrice: 135 },
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

  const clinicCustomer = customers.get("City Clinic");
  if (clinicCustomer) {
    await recordCustomerPayment(prisma, {
      shopId,
      customer: clinicCustomer,
      amount: 500,
      paidAt: moment("2026-05-11T18:10:00+06:00"),
      note: "Clinic due collection",
    });
  }

  await seedExpensesAndCash(prisma, shopId);

  await prisma.shop.update({
    where: { id: shopId },
    data: {
      nextSalesInvoiceSeq: invoiceSeq,
    },
  });

  console.log(
    `INFO: Pharmacy demo seeded with ${purchases.length} purchases, ${purchaseReturns.length} purchase returns, ${sales.length} sales, and pharmacy-ready batches/expiry/device data.`
  );
}
