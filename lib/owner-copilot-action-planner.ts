import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  OwnerCopilotActionDraft,
} from "@/lib/owner-copilot-actions";
import type { OwnerCopilotConversationMessageWithMetadata } from "@/lib/owner-copilot-memory";

type ClarificationResult = {
  answer: string;
  suggestions: readonly string[];
};

type PreparedActionPlan =
  | {
      status: "ready";
      actionDraft: OwnerCopilotActionDraft;
      resolvedEntities?: Record<string, unknown>;
    }
  | {
      status: "clarify";
      clarification: ClarificationResult;
    };

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

function isImplicitReference(value: string | undefined | null) {
  const normalized = normalizeSearchValue(String(value || ""));
  if (!normalized) return false;
  return ["ওই", "ওটা", "ওটার", "ওইটা", "ঐটা", "তার", "আগেরটা", "আগের"].includes(
    normalized
  );
}

function getRecentActionEntities(
  messages: OwnerCopilotConversationMessageWithMetadata[]
) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "assistant" || !message.metadata) continue;
    const actionDraft = message.metadata.actionDraft as Record<string, unknown> | undefined;
    if (!actionDraft || typeof actionDraft.kind !== "string") continue;

    switch (actionDraft.kind) {
      case "due_collection":
      case "due_entry":
        if (typeof actionDraft.customerName === "string") {
          return {
            customer: {
              id:
                typeof actionDraft.customerId === "string"
                  ? actionDraft.customerId
                  : undefined,
              name: actionDraft.customerName,
            },
          };
        }
        break;
      case "supplier_payment":
      case "create_supplier":
        if (typeof actionDraft.supplierName === "string" || typeof actionDraft.name === "string") {
          return {
            supplier: {
              id:
                typeof actionDraft.supplierId === "string"
                  ? actionDraft.supplierId
                  : undefined,
              name:
                typeof actionDraft.supplierName === "string"
                  ? actionDraft.supplierName
                  : String(actionDraft.name),
            },
          };
        }
        break;
      case "stock_adjustment":
      case "create_product":
        if (typeof actionDraft.productQuery === "string" || typeof actionDraft.name === "string") {
          return {
            product: {
              id:
                typeof actionDraft.productId === "string"
                  ? actionDraft.productId
                  : undefined,
              name:
                typeof actionDraft.productQuery === "string"
                  ? actionDraft.productQuery
                  : String(actionDraft.name),
            },
          };
        }
        break;
      case "void_sale":
        if (typeof actionDraft.saleQuery === "string") {
          return {
            sale: {
              id:
                typeof actionDraft.saleId === "string"
                  ? actionDraft.saleId
                  : undefined,
              invoiceNo:
                typeof actionDraft.invoiceNo === "string"
                  ? actionDraft.invoiceNo
                  : undefined,
              query: actionDraft.saleQuery,
            },
          };
        }
        break;
      default:
        break;
    }
  }

  return {};
}

function buildMultiMatchClarification(
  answer: string,
  suggestions: string[]
): PreparedActionPlan {
  return {
    status: "clarify",
    clarification: {
      answer,
      suggestions,
    },
  };
}

async function resolveCustomerDraft(
  shopId: string,
  draft: Extract<OwnerCopilotActionDraft, { kind: "due_collection" | "due_entry" }>,
  recentEntities: ReturnType<typeof getRecentActionEntities>
): Promise<PreparedActionPlan> {
  const askedName =
    isImplicitReference(draft.customerName) && recentEntities.customer?.name
      ? recentEntities.customer.name
      : draft.customerName;

  if (draft.customerId) {
    return {
      status: "ready",
      actionDraft: {
        ...draft,
        customerName: askedName,
      },
      resolvedEntities: {
        customerId: draft.customerId,
        customerName: askedName,
      },
    };
  }

  const candidates = await prisma.customer.findMany({
    where: {
      shopId,
      name: { contains: askedName.trim(), mode: "insensitive" },
    },
    select: {
      id: true,
      name: true,
      totalDue: true,
    },
    orderBy: [{ totalDue: "desc" }, { name: "asc" }],
    take: 6,
  });

  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: scoreEntityMatch(candidate.name, askedName),
    }))
    .filter((item) => item.score > 0);

  if (scored.length === 0) {
    return buildMultiMatchClarification(
      `আমি "${askedName}" নামে customer খুঁজে পাইনি। exact নাম দিয়ে আবার বলুন।`,
      ["মোট customer কয়জন?", "সবচেয়ে বেশি due কোন customer-এর?"]
    );
  }

  if (scored.length > 1 && scored[1].score >= scored[0].score - 10) {
    const amountText =
      draft.kind === "due_collection"
        ? `${draft.amount} টাকা বাকি নাও`
        : `${draft.amount} টাকা বাকি যোগ করো`;
    return buildMultiMatchClarification(
      `একাধিক customer match পেয়েছি। যেটা চেয়েছেন সেটা exact নামে বলুন।`,
      scored.slice(0, 3).map((item) => `${item.candidate.name}-এর ${amountText}`)
    );
  }

  return {
    status: "ready",
    actionDraft: {
      ...draft,
      customerId: scored[0].candidate.id,
      customerName: scored[0].candidate.name,
      summary:
        draft.kind === "due_collection"
          ? `বাকি সংগ্রহ draft: ${scored[0].candidate.name} | ৳ ${draft.amount}${draft.note ? ` | ${draft.note}` : ""}`
          : `Due entry draft: ${scored[0].candidate.name} | ৳ ${draft.amount}${draft.note ? ` | ${draft.note}` : ""}`,
      confirmationText:
        draft.kind === "due_collection"
          ? `${scored[0].candidate.name}-এর কাছ থেকে ৳ ${draft.amount} বাকি collect করব${draft.note ? ` (${draft.note})` : ""}?`
          : `${scored[0].candidate.name}-এর নামে ৳ ${draft.amount} বাকি যোগ করব${draft.note ? ` (${draft.note})` : ""}?`,
    },
    resolvedEntities: {
      customerId: scored[0].candidate.id,
      customerName: scored[0].candidate.name,
    },
  };
}

async function resolveSupplierDraft(
  shopId: string,
  draft: Extract<OwnerCopilotActionDraft, { kind: "supplier_payment" }>,
  recentEntities: ReturnType<typeof getRecentActionEntities>
): Promise<PreparedActionPlan> {
  const askedName =
    isImplicitReference(draft.supplierName) && recentEntities.supplier?.name
      ? recentEntities.supplier.name
      : draft.supplierName;

  const candidates = await prisma.supplier.findMany({
    where: {
      shopId,
      name: { contains: askedName.trim(), mode: "insensitive" },
    },
    select: {
      id: true,
      name: true,
    },
    orderBy: [{ name: "asc" }],
    take: 6,
  });

  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: scoreEntityMatch(candidate.name, askedName),
    }))
    .filter((item) => item.score > 0);

  if (scored.length === 0) {
    return buildMultiMatchClarification(
      `আমি "${askedName}" নামে supplier খুঁজে পাইনি। exact নাম দিয়ে আবার বলুন।`,
      ["মোট supplier কয়জন?", "সবচেয়ে বেশি payable কোন supplier-এর?"]
    );
  }

  if (scored.length > 1 && scored[1].score >= scored[0].score - 10) {
    return buildMultiMatchClarification(
      `একাধিক supplier match পেয়েছি। exact supplier name দিয়ে আবার বলুন।`,
      scored
        .slice(0, 3)
        .map((item) => `${item.candidate.name}-কে ${draft.amount} টাকা payment করো`)
    );
  }

  return {
    status: "ready",
    actionDraft: {
      ...draft,
      supplierId: scored[0].candidate.id,
      supplierName: scored[0].candidate.name,
      summary: `Supplier payment draft: ${scored[0].candidate.name} | ৳ ${draft.amount}${draft.note ? ` | ${draft.note}` : ""}`,
      confirmationText: `${scored[0].candidate.name}-কে ৳ ${draft.amount} supplier payment করব${draft.note ? ` (${draft.note})` : ""}?`,
    },
    resolvedEntities: {
      supplierId: scored[0].candidate.id,
      supplierName: scored[0].candidate.name,
    },
  };
}

async function resolveProductDraft(
  shopId: string,
  draft: Extract<OwnerCopilotActionDraft, { kind: "stock_adjustment" }>,
  recentEntities: ReturnType<typeof getRecentActionEntities>
): Promise<PreparedActionPlan> {
  const askedName =
    isImplicitReference(draft.productQuery) && recentEntities.product?.name
      ? recentEntities.product.name
      : draft.productQuery;

  const candidates = await prisma.product.findMany({
    where: {
      shopId,
      OR: [
        { name: { contains: askedName.trim(), mode: "insensitive" } },
        { sku: { contains: askedName.trim(), mode: "insensitive" } },
        { barcode: { contains: askedName.trim(), mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      sku: true,
      barcode: true,
      trackStock: true,
      isActive: true,
    },
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    take: 8,
  });

  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: Math.max(
        scoreEntityMatch(candidate.name, askedName),
        candidate.sku ? scoreEntityMatch(candidate.sku, askedName) - 10 : 0,
        candidate.barcode ? scoreEntityMatch(candidate.barcode, askedName) - 10 : 0
      ),
    }))
    .filter((item) => item.score > 0);

  if (scored.length === 0) {
    return buildMultiMatchClarification(
      `আমি "${askedName}" নামে product খুঁজে পাইনি। exact product name বা barcode দিয়ে আবার বলুন।`,
      ["low stock কোনগুলো?", "কোন product-এর stock কত?"]
    );
  }

  if (scored.length > 1 && scored[1].score >= scored[0].score - 10) {
    return buildMultiMatchClarification(
      `একাধিক product match পেয়েছি। exact product name দিয়ে আবার বলুন।`,
      scored
        .slice(0, 3)
        .map((item) => `${item.candidate.name}-এর stock ${draft.targetStock} করো`)
    );
  }

  return {
    status: "ready",
    actionDraft: {
      ...draft,
      productId: scored[0].candidate.id,
      productQuery: scored[0].candidate.name,
      summary: `Stock adjustment draft: ${scored[0].candidate.name} | target ${draft.targetStock}${draft.note ? ` | ${draft.note}` : ""}`,
      confirmationText: `${scored[0].candidate.name}-এর stock ${draft.targetStock}-এ set করব${draft.note ? ` (${draft.note})` : ""}?`,
    },
    resolvedEntities: {
      productId: scored[0].candidate.id,
      productName: scored[0].candidate.name,
    },
  };
}

async function resolveSaleVoidDraft(
  shopId: string,
  draft: Extract<OwnerCopilotActionDraft, { kind: "void_sale" }>,
  recentEntities: ReturnType<typeof getRecentActionEntities>
): Promise<PreparedActionPlan> {
  const askedQuery =
    isImplicitReference(draft.saleQuery) &&
    (recentEntities.sale?.invoiceNo || recentEntities.sale?.query)
      ? recentEntities.sale.invoiceNo || recentEntities.sale.query
      : draft.saleQuery;

  const saleOrFilters: Prisma.SaleWhereInput[] = [
    { invoiceNo: { contains: askedQuery.trim(), mode: "insensitive" } },
    { customer: { is: { name: { contains: askedQuery.trim(), mode: "insensitive" } } } },
  ];

  if (draft.saleId || /^[a-z0-9_-]{10,}$/i.test(askedQuery.trim())) {
    saleOrFilters.push({ id: draft.saleId || askedQuery.trim() });
  }

  const candidates = await prisma.sale.findMany({
    where: {
      shopId,
      OR: saleOrFilters,
    },
    select: {
      id: true,
      invoiceNo: true,
      totalAmount: true,
      paymentMethod: true,
      status: true,
      customer: { select: { name: true } },
    },
    orderBy: [{ saleDate: "desc" }, { id: "desc" }],
    take: 6,
  });

  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: Math.max(
        candidate.invoiceNo ? scoreEntityMatch(candidate.invoiceNo, askedQuery) : 0,
        candidate.customer?.name ? scoreEntityMatch(candidate.customer.name, askedQuery) - 20 : 0,
        scoreEntityMatch(candidate.id, askedQuery) - 20
      ),
    }))
    .filter((item) => item.score > 0);

  if (scored.length === 0) {
    return buildMultiMatchClarification(
      `আমি "${askedQuery}" sale/invoice খুঁজে পাইনি। invoice no দিয়ে আবার বলুন।`,
      ["আজ কত বিক্রি?", "recent saleগুলো দেখাও"]
    );
  }

  if (scored.length > 1 && scored[1].score >= scored[0].score - 10) {
    return buildMultiMatchClarification(
      `একাধিক sale match পেয়েছি। exact invoice no দিয়ে আবার বলুন।`,
      scored
        .slice(0, 3)
        .map((item) => `${item.candidate.invoiceNo || item.candidate.id} invoice void করো`)
    );
  }

  const best = scored[0].candidate;
  if (best.status === "VOIDED") {
    return buildMultiMatchClarification(
      `${best.invoiceNo || best.id} sale আগেই void করা আছে।`,
      ["recent saleগুলো দেখাও", "আজ কত বিক্রি?"]
    );
  }

  return {
    status: "ready",
    actionDraft: {
      ...draft,
      saleId: best.id,
      invoiceNo: best.invoiceNo || undefined,
      saleQuery: best.invoiceNo || best.id,
      summary: `Sale void draft: ${best.invoiceNo || best.id} | ৳ ${Number(best.totalAmount ?? 0).toFixed(2)}`,
      confirmationText: `${best.invoiceNo || best.id} sale void করব? এটা ${best.customer?.name ? `${best.customer.name}-এর ` : ""}${best.paymentMethod} sale।`,
    },
    resolvedEntities: {
      saleId: best.id,
      invoiceNo: best.invoiceNo || null,
      customerName: best.customer?.name || null,
    },
  };
}

export async function prepareOwnerCopilotActionDraft(args: {
  shopId: string;
  actionDraft: OwnerCopilotActionDraft;
  recentMessages: OwnerCopilotConversationMessageWithMetadata[];
}) {
  const recentEntities = getRecentActionEntities(args.recentMessages);
  const draft = args.actionDraft;

  switch (draft.kind) {
    case "due_collection":
    case "due_entry":
      return resolveCustomerDraft(args.shopId, draft, recentEntities);
    case "supplier_payment":
      return resolveSupplierDraft(args.shopId, draft, recentEntities);
    case "stock_adjustment":
      return resolveProductDraft(args.shopId, draft, recentEntities);
    case "void_sale":
      return resolveSaleVoidDraft(args.shopId, draft, recentEntities);
    default:
      return {
        status: "ready" as const,
        actionDraft: draft,
      };
  }
}

export function getOwnerCopilotActionSuggestions(
  actionDraft: OwnerCopilotActionDraft,
  phase: "draft" | "confirmed"
) {
  if (phase === "draft") {
    switch (actionDraft.kind) {
      case "due_collection":
      case "due_entry":
        return ["Confirm করলে ledger update হবে", "অন্য amount দিয়ে আবার বলুন", "customer due summary জিজ্ঞেস করুন"] as const;
      case "supplier_payment":
        return ["Confirm করলে due purchase payment হবে", "অন্য amount দিয়ে আবার বলুন", "supplier payable জিজ্ঞেস করুন"] as const;
      case "stock_adjustment":
        return ["Confirm করলে stock update হবে", "অন্য stock value দিয়ে বলুন", "low stock list জিজ্ঞেস করুন"] as const;
      case "void_sale":
        return ["Confirm করলে sale void হবে", "exact invoice no দিয়ে আবার বলুন", "recent saleগুলো দেখাও"] as const;
      case "create_customer":
      case "create_supplier":
      case "create_product":
        return ["Confirm করলে record তৈরি হবে", "আরও field দিয়ে আবার বলুন", "current summary জিজ্ঞেস করুন"] as const;
      default:
        return ["Confirm করলে সেভ হবে", "না চাইলে নতুনভাবে বলুন", "অন্য amount/category দিয়েও বলতে পারেন"] as const;
    }
  }

  switch (actionDraft.kind) {
    case "due_collection":
      return ["এখন তার due কত?", "আজ মোট due কত?", "top due customer কারা?"] as const;
    case "due_entry":
      return ["এখন তার total due কত?", "মোট due কত?", "customer statement দেখাও"] as const;
    case "supplier_payment":
      return ["এখন supplier payable কত?", "top supplier কারা?", "recent purchaseগুলো দেখাও"] as const;
    case "stock_adjustment":
      return ["এখন ওটার stock কত?", "low stock কোনগুলো?", "inventory summary দেখাও"] as const;
    case "void_sale":
      return ["আজ কত বিক্রি?", "recent saleগুলো দেখাও", "cash summary কী?"] as const;
    case "create_customer":
      return ["এখন তার due কত?", "মোট customer কয়জন?", "top due customer কারা?"] as const;
    case "create_supplier":
      return ["supplier payable কত?", "মোট supplier কয়জন?", "recent purchaseগুলো দেখাও"] as const;
    case "create_product":
      return ["এখন ওটার stock কত?", "low stock কোনগুলো?", "এই দোকানে মোট কয়টা product আছে?"] as const;
    default:
      return ["আরেকটা action draft করতে পারেন", "আজকের cash balance জিজ্ঞেস করুন", "আজ খরচ কত হলো জিজ্ঞেস করুন"] as const;
  }
}
