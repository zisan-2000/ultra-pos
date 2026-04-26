import { revalidatePath } from "next/cache";
import { hasAnyPermission, requirePermission, type UserContext } from "@/lib/rbac";
import { assertShopAccess } from "@/lib/shop-access";
import { ownerCopilotActionDraftSchema, type OwnerCopilotActionDraft } from "@/lib/owner-copilot-actions";
import { prisma } from "@/lib/prisma";
import { publishRealtimeEvent } from "@/lib/realtime/publisher";
import { REALTIME_EVENTS } from "@/lib/realtime/events";
import { revalidateReportsForCash, revalidateReportsForExpense, revalidateReportsForProduct } from "@/lib/reports/revalidate";
import { toDhakaBusinessDate } from "@/lib/dhaka-date";
import { recordCustomerPayment } from "@/app/actions/customers";
import { recordPurchasePayment } from "@/app/actions/purchases";
import { createCustomer } from "@/app/actions/customers";
import { createSupplier } from "@/app/actions/suppliers";
import { createProduct } from "@/app/actions/products";
import { voidSale } from "@/app/actions/sales";
import { shopHasInventoryModule } from "@/lib/accounting/cogs";
import { addDueSaleEntry } from "@/app/actions/customers";

function revalidateExpensePaths() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/expenses");
  revalidatePath("/dashboard/reports");
  revalidatePath("/dashboard/cash");
}

function revalidateCashPaths() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/cash");
  revalidatePath("/dashboard/reports");
}

function revalidateDuePaths() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/due");
  revalidatePath("/dashboard/cash");
  revalidatePath("/dashboard/reports");
}

function revalidateSupplierPaths() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/purchases");
  revalidatePath("/dashboard/suppliers");
  revalidatePath("/dashboard/cash");
  revalidatePath("/dashboard/reports");
}

function revalidateProductPaths() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/reports");
}

function normalizeSearchValue(value: string) {
  return value
    .toLowerCase()
    .replace(/[?？！!।,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(?:এর|র|য়ের|কে)$/u, "")
    .trim();
}

function scoreEntityMatch(candidate: string, asked: string) {
  const left = normalizeSearchValue(candidate).replace(/\s+/g, "");
  const right = normalizeSearchValue(asked).replace(/\s+/g, "");
  if (!left || !right) return 0;
  if (left === right) return 100;
  if (left.startsWith(right)) return 80;
  if (left.includes(right)) return 60;
  if (right.includes(left)) return 40;
  return 0;
}

async function resolveCustomerForDueCollection(shopId: string, customerName: string) {
  const candidates = await prisma.customer.findMany({
    where: {
      shopId,
      totalDue: { gt: 0 },
      name: { contains: customerName.trim(), mode: "insensitive" },
    },
    select: {
      id: true,
      name: true,
      totalDue: true,
    },
    orderBy: [{ totalDue: "desc" }, { name: "asc" }],
    take: 8,
  });

  const best = candidates
    .map((candidate) => ({
      candidate,
      score: scoreEntityMatch(candidate.name, customerName),
    }))
    .sort((a, b) => b.score - a.score || Number(b.candidate.totalDue) - Number(a.candidate.totalDue))[0];

  return best && best.score > 0 ? best.candidate : null;
}

async function resolveCustomerById(shopId: string, customerId: string) {
  return prisma.customer.findFirst({
    where: {
      id: customerId,
      shopId,
    },
    select: {
      id: true,
      name: true,
      totalDue: true,
    },
  });
}

async function resolveSupplierWithDuePurchases(shopId: string, supplierName: string) {
  const candidates = await prisma.supplier.findMany({
    where: {
      shopId,
      name: { contains: supplierName.trim(), mode: "insensitive" },
      purchases: {
        some: {
          dueAmount: { gt: 0 },
        },
      },
    },
    select: {
      id: true,
      name: true,
      purchases: {
        where: { dueAmount: { gt: 0 } },
        select: {
          id: true,
          dueAmount: true,
          purchaseDate: true,
        },
        orderBy: [{ purchaseDate: "asc" }, { createdAt: "asc" }],
        take: 20,
      },
    },
    take: 8,
  });

  const best = candidates
    .map((candidate) => ({
      candidate,
      score: scoreEntityMatch(candidate.name, supplierName),
      totalDue: candidate.purchases.reduce(
        (sum, purchase) => sum + Number(purchase.dueAmount ?? 0),
        0
      ),
    }))
    .sort((a, b) => b.score - a.score || b.totalDue - a.totalDue)[0];

  return best && best.score > 0
    ? {
        id: best.candidate.id,
        name: best.candidate.name,
        totalDue: best.totalDue,
        duePurchases: best.candidate.purchases.map((purchase) => ({
          id: purchase.id,
          dueAmount: Number(purchase.dueAmount ?? 0),
        })),
      }
    : null;
}

async function resolveSupplierWithDuePurchasesById(shopId: string, supplierId: string) {
  const supplier = await prisma.supplier.findFirst({
    where: {
      id: supplierId,
      shopId,
      purchases: {
        some: {
          dueAmount: { gt: 0 },
        },
      },
    },
    select: {
      id: true,
      name: true,
      purchases: {
        where: { dueAmount: { gt: 0 } },
        select: {
          id: true,
          dueAmount: true,
          purchaseDate: true,
        },
        orderBy: [{ purchaseDate: "asc" }, { createdAt: "asc" }],
        take: 20,
      },
    },
  });

  if (!supplier) return null;

  return {
    id: supplier.id,
    name: supplier.name,
    totalDue: supplier.purchases.reduce(
      (sum, purchase) => sum + Number(purchase.dueAmount ?? 0),
      0
    ),
    duePurchases: supplier.purchases.map((purchase) => ({
      id: purchase.id,
      dueAmount: Number(purchase.dueAmount ?? 0),
    })),
  };
}

async function resolveProductForStockAdjustment(shopId: string, productQuery: string) {
  const candidates = await prisma.product.findMany({
    where: {
      shopId,
      OR: [
        { name: { contains: productQuery.trim(), mode: "insensitive" } },
        { sku: { contains: productQuery.trim(), mode: "insensitive" } },
        { barcode: { contains: productQuery.trim(), mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      sku: true,
      barcode: true,
      trackStock: true,
      stockQty: true,
      isActive: true,
    },
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    take: 10,
  });

  const best = candidates
    .map((candidate) => ({
      candidate,
      score: Math.max(
        scoreEntityMatch(candidate.name, productQuery),
        candidate.sku ? scoreEntityMatch(candidate.sku, productQuery) - 10 : 0,
        candidate.barcode ? scoreEntityMatch(candidate.barcode, productQuery) - 10 : 0
      ),
    }))
    .sort((a, b) => b.score - a.score || Number(b.candidate.isActive) - Number(a.candidate.isActive))[0];

  return best && best.score > 0 ? best.candidate : null;
}

async function resolveProductById(shopId: string, productId: string) {
  return prisma.product.findFirst({
    where: {
      id: productId,
      shopId,
    },
    select: {
      id: true,
      name: true,
      sku: true,
      barcode: true,
      trackStock: true,
      stockQty: true,
      isActive: true,
    },
  });
}

export async function executeOwnerCopilotActionDraft({
  shopId,
  user,
  actionDraft,
}: {
  shopId: string;
  user: UserContext;
  actionDraft: OwnerCopilotActionDraft;
}) {
  const parsed = ownerCopilotActionDraftSchema.parse(actionDraft);
  await assertShopAccess(shopId, user);

  if (parsed.kind === "expense") {
    requirePermission(user, "create_expense");

    let createdExpenseId = "";
    await prisma.$transaction(async (tx) => {
      const expenseDate = toDhakaBusinessDate();
      const created = await tx.expense.create({
        data: {
          shopId,
          amount: parsed.amount,
          category: parsed.category,
          expenseDate,
          note: parsed.note || "",
        },
      });
      createdExpenseId = created.id;

      await tx.cashEntry.create({
        data: {
          shopId,
          entryType: "OUT",
          amount: created.amount,
          reason: `Expense: ${created.category} (#${created.id})`,
          businessDate: expenseDate,
        },
      });
    });

    await publishRealtimeEvent(REALTIME_EVENTS.expenseCreated, shopId, {
      expenseId: createdExpenseId,
      amount: Number(parsed.amount),
      category: parsed.category,
    });
    await publishRealtimeEvent(REALTIME_EVENTS.cashUpdated, shopId, {
      amount: Number(parsed.amount),
      entryType: "OUT",
    });
    revalidateExpensePaths();
    revalidateReportsForExpense();

    return {
      success: true,
      answer: `খরচ যোগ হয়েছে। ৳ ${parsed.amount} | ${parsed.category}${parsed.note ? ` | ${parsed.note}` : ""}`,
    };
  }

  if (parsed.kind === "due_collection") {
    requirePermission(user, "take_due_payment");

    const customer = parsed.customerId
      ? await resolveCustomerById(shopId, parsed.customerId)
      : await resolveCustomerForDueCollection(shopId, parsed.customerName);
    if (!customer) {
      throw new Error(`"${parsed.customerName}" নামে due থাকা customer পাওয়া যায়নি`);
    }

    const requestedAmount = Number(parsed.amount);
    const dueAmount = Number(customer.totalDue ?? 0);
    const payAmount = Math.min(requestedAmount, dueAmount);

    if (!Number.isFinite(payAmount) || payAmount <= 0) {
      throw new Error(`${customer.name}-এর কোনো due বাকি নেই`);
    }

    await recordCustomerPayment({
      shopId,
      customerId: customer.id,
      amount: payAmount,
      description: parsed.note || `Copilot due collection for ${customer.name}`,
    });

    await Promise.all([
      publishRealtimeEvent(REALTIME_EVENTS.cashUpdated, shopId, {
        amount: payAmount,
        entryType: "IN",
      }),
      publishRealtimeEvent(REALTIME_EVENTS.ledgerUpdated, shopId, {
        customerId: customer.id,
      }),
    ]);
    revalidateDuePaths();
    revalidateReportsForCash();

    return {
      success: true,
      answer:
        requestedAmount > payAmount
          ? `${customer.name}-এর due থেকে ৳ ${payAmount.toFixed(2)} নেওয়া হয়েছে। চাওয়া হয়েছিল ৳ ${parsed.amount}, কিন্তু বাকি ছিল ৳ ${dueAmount.toFixed(2)}।`
          : `${customer.name}-এর কাছ থেকে ৳ ${payAmount.toFixed(2)} due payment নেওয়া হয়েছে।`,
    };
  }

  if (parsed.kind === "due_entry") {
    requirePermission(user, "create_due_entry");

    const customer = parsed.customerId
      ? await resolveCustomerById(shopId, parsed.customerId)
      : await prisma.customer.findFirst({
          where: {
            shopId,
            name: { contains: parsed.customerName.trim(), mode: "insensitive" },
          },
          select: { id: true, name: true, totalDue: true },
          orderBy: [{ totalDue: "desc" }, { name: "asc" }],
        });

    if (!customer) {
      throw new Error(`"${parsed.customerName}" নামে customer পাওয়া যায়নি`);
    }

    await addDueSaleEntry({
      shopId,
      customerId: customer.id,
      amount: Number(parsed.amount),
      description: parsed.note || `Copilot due entry for ${customer.name}`,
    });

    await publishRealtimeEvent(REALTIME_EVENTS.ledgerUpdated, shopId, {
      customerId: customer.id,
    });
    revalidateDuePaths();

    return {
      success: true,
      answer: `${customer.name}-এর নামে ৳ ${parsed.amount} due যোগ করা হয়েছে।`,
    };
  }

  if (parsed.kind === "supplier_payment") {
    requirePermission(user, "create_purchase_payment");

    const inventoryEnabled = await shopHasInventoryModule(shopId);
    if (!inventoryEnabled) {
      throw new Error("Purchases/Suppliers module এই shop-এ enabled না");
    }

    const supplier = parsed.supplierId
      ? await resolveSupplierWithDuePurchasesById(shopId, parsed.supplierId)
      : await resolveSupplierWithDuePurchases(shopId, parsed.supplierName);
    if (!supplier) {
      throw new Error(`"${parsed.supplierName}" নামে due থাকা supplier পাওয়া যায়নি`);
    }

    let remaining = Number(parsed.amount);
    if (!Number.isFinite(remaining) || remaining <= 0) {
      throw new Error("Amount must be positive");
    }

    let totalPaid = 0;
    let paymentCount = 0;
    for (const purchase of supplier.duePurchases) {
      if (remaining <= 0) break;
      const chunk = Math.min(remaining, purchase.dueAmount);
      if (chunk <= 0) continue;

      await recordPurchasePayment({
        shopId,
        purchaseId: purchase.id,
        amount: chunk,
        method: parsed.method || "cash",
        note: parsed.note || `Copilot supplier payment for ${supplier.name}`,
      });

      remaining -= chunk;
      totalPaid += chunk;
      paymentCount += 1;
    }

    if (totalPaid <= 0) {
      throw new Error(`${supplier.name}-এর কোনো due purchase পাওয়া যায়নি`);
    }

    await Promise.all([
      publishRealtimeEvent(REALTIME_EVENTS.cashUpdated, shopId, {
        amount: totalPaid,
        entryType: "OUT",
      }),
      publishRealtimeEvent(REALTIME_EVENTS.ledgerUpdated, shopId, {
        supplierId: supplier.id,
      }),
    ]);
    revalidateSupplierPaths();
    revalidateReportsForCash();

    return {
      success: true,
      answer:
        remaining > 0
          ? `${supplier.name}-কে ৳ ${totalPaid.toFixed(2)} payment করা হয়েছে ${paymentCount}টি purchase due-এ। চাওয়া হয়েছিল ৳ ${parsed.amount}, কিন্তু payable ছিল ৳ ${supplier.totalDue.toFixed(2)}।`
          : `${supplier.name}-কে ৳ ${totalPaid.toFixed(2)} payment করা হয়েছে ${paymentCount}টি due purchase-এ।`,
    };
  }

  if (parsed.kind === "stock_adjustment") {
    if (!hasAnyPermission(user, ["update_product", "update_product_stock"])) {
      throw new Error("Forbidden: missing permission update_product_stock");
    }

    const product = parsed.productId
      ? await resolveProductById(shopId, parsed.productId)
      : await resolveProductForStockAdjustment(shopId, parsed.productQuery);
    if (!product) {
      throw new Error(`"${parsed.productQuery}" নামে product পাওয়া যায়নি`);
    }
    if (!product.trackStock) {
      throw new Error(`${product.name} product-এ track stock চালু নেই`);
    }

    const targetStock = Number(parsed.targetStock);
    if (!Number.isFinite(targetStock) || targetStock < 0) {
      throw new Error("Target stock must be a valid non-negative number");
    }

    await prisma.product.update({
      where: { id: product.id },
      data: {
        stockQty: targetStock.toFixed(2),
      },
    });

    await publishRealtimeEvent(REALTIME_EVENTS.stockUpdated, shopId, {
      productIds: [product.id],
      targetStock,
    });
    revalidateProductPaths();
    revalidateReportsForProduct();

    return {
      success: true,
      answer: `${product.name}-এর stock ${Number(product.stockQty ?? 0).toFixed(2)} থেকে ${targetStock.toFixed(2)} করা হয়েছে।`,
    };
  }

  if (parsed.kind === "void_sale") {
    requirePermission(user, "cancel_sale");

    if (!parsed.saleId) {
      throw new Error(`"${parsed.saleQuery}" sale/invoice resolve করা যায়নি`);
    }

    const result = await voidSale(
      parsed.saleId,
      parsed.note || `Copilot void action for ${parsed.invoiceNo || parsed.saleQuery}`
    );

    if (result.alreadyVoided) {
      return {
        success: true,
        answer: `${parsed.invoiceNo || parsed.saleQuery} sale আগেই void করা ছিল।`,
      };
    }

    return {
      success: true,
      answer: `${parsed.invoiceNo || parsed.saleQuery} sale void করা হয়েছে।`,
    };
  }

  if (parsed.kind === "create_customer") {
    requirePermission(user, "create_customer");

    const created = await createCustomer({
      shopId,
      name: parsed.name,
      phone: parsed.phone || null,
      address: null,
    });

    await publishRealtimeEvent(REALTIME_EVENTS.ledgerUpdated, shopId, {
      customerId: created.id,
    });
    revalidateDuePaths();

    return {
      success: true,
      answer: `${parsed.name} নামে নতুন customer তৈরি হয়েছে${parsed.phone ? ` | ${parsed.phone}` : ""}।`,
    };
  }

  if (parsed.kind === "create_supplier") {
    requirePermission(user, "create_supplier");

    const created = await createSupplier({
      shopId,
      name: parsed.name,
      phone: parsed.phone || null,
      address: null,
    });

    await publishRealtimeEvent(REALTIME_EVENTS.ledgerUpdated, shopId, {
      supplierId: created.supplierId,
    });
    revalidateSupplierPaths();

    return {
      success: true,
      answer: created.alreadyExists
        ? `${parsed.name} supplier আগেই ছিল। existing record-টাই use করা হয়েছে।`
        : `${parsed.name} নামে নতুন supplier তৈরি হয়েছে${parsed.phone ? ` | ${parsed.phone}` : ""}।`,
    };
  }

  if (parsed.kind === "create_product") {
    requirePermission(user, "create_product");

    const created = await createProduct({
      shopId,
      name: parsed.name,
      category: parsed.category || "Uncategorized",
      sellPrice: parsed.sellPrice,
      stockQty: parsed.stockQty || "0",
      baseUnit: parsed.baseUnit || "pcs",
      trackStock: parsed.trackStock ?? false,
      isActive: true,
      buyPrice: null,
    });

    await publishRealtimeEvent(REALTIME_EVENTS.stockUpdated, shopId, {
      productIds: [created.id],
      created: true,
    });
    revalidateProductPaths();
    revalidateReportsForProduct();

    return {
      success: true,
      answer: `${parsed.name} নামে নতুন product তৈরি হয়েছে। Sell price ৳ ${parsed.sellPrice}।`,
    };
  }

  requirePermission(user, "create_cash_entry");

  await prisma.cashEntry.create({
    data: {
      shopId,
      entryType: parsed.entryType,
      amount: parsed.amount,
      reason: parsed.reason || "",
      businessDate: toDhakaBusinessDate(),
    },
  });

  await publishRealtimeEvent(REALTIME_EVENTS.cashUpdated, shopId, {
    amount: Number(parsed.amount),
    entryType: parsed.entryType,
  });
  revalidateCashPaths();
  revalidateReportsForCash();

  return {
    success: true,
    answer: `${parsed.entryType === "IN" ? "ক্যাশ ইন" : "ক্যাশ আউট"} এন্ট্রি যোগ হয়েছে। ৳ ${parsed.amount}${parsed.reason ? ` | ${parsed.reason}` : ""}`,
  };
}
