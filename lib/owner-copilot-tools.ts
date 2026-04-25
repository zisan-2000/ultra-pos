import { z } from "zod";
import { getDhakaDateOnlyRange, getDhakaDateString, parseDhakaDateOnlyRange } from "@/lib/dhaka-date";
import { buildOwnerCopilotInsight, type OwnerCopilotSnapshot } from "@/lib/owner-copilot";
import { prisma } from "@/lib/prisma";
import type { TodaySummary } from "@/lib/reports/today-summary";
import { normalizeCopilotQuestion } from "@/lib/copilot-ask";

type OwnerCopilotPayloadForTools = {
  summary: TodaySummary;
  payables: {
    totalDue: number;
    dueCount: number;
    supplierCount: number;
  };
  snapshot: OwnerCopilotSnapshot;
};

const overviewArgsSchema = z.object({});
const lowStockArgsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).optional(),
});
const topProductsArgsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).optional(),
  period: z.enum(["today", "7d"]).optional(),
});
const recentSalesArgsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).optional(),
});
const customerDueArgsSchema = z.object({
  customerName: z.string().trim().min(2),
});
const productDetailsArgsSchema = z.object({
  query: z.string().trim().min(2),
});
const queueStatusArgsSchema = z.object({});
const payablesStatusArgsSchema = z.object({});
const billingStatusArgsSchema = z.object({});

export const OWNER_COPILOT_TOOL_DEFINITIONS = [
  {
    name: "get_overview",
    description: "Get today's overall business overview, focus, risks, metrics, and summary insights.",
    schema: overviewArgsSchema,
  },
  {
    name: "get_low_stock_items",
    description: "Get current low stock products with quantities and units.",
    schema: lowStockArgsSchema,
  },
  {
    name: "get_top_products",
    description: "Get top-selling products for today or the last 7 days.",
    schema: topProductsArgsSchema,
  },
  {
    name: "get_recent_sales",
    description: "Get a compact list of recent sales with totals and payment method.",
    schema: recentSalesArgsSchema,
  },
  {
    name: "get_customer_due",
    description: "Look up a customer's due amount by name.",
    schema: customerDueArgsSchema,
  },
  {
    name: "get_product_details",
    description: "Find a product by name, SKU, or barcode and return stock/price/details.",
    schema: productDetailsArgsSchema,
  },
  {
    name: "get_queue_status",
    description: "Get current token queue counts by status for today.",
    schema: queueStatusArgsSchema,
  },
  {
    name: "get_payables_status",
    description: "Get supplier payable summary.",
    schema: payablesStatusArgsSchema,
  },
  {
    name: "get_billing_status",
    description: "Get subscription and invoice billing status summary.",
    schema: billingStatusArgsSchema,
  },
] as const;

export type OwnerCopilotToolName =
  (typeof OWNER_COPILOT_TOOL_DEFINITIONS)[number]["name"];

export type OwnerCopilotToolCall = {
  tool: OwnerCopilotToolName;
  args?: Record<string, unknown>;
};

export type OwnerCopilotToolResult = {
  tool: OwnerCopilotToolName;
  data: unknown;
};

const toolSchemaMap: Record<OwnerCopilotToolName, z.ZodTypeAny> = {
  get_overview: overviewArgsSchema,
  get_low_stock_items: lowStockArgsSchema,
  get_top_products: topProductsArgsSchema,
  get_recent_sales: recentSalesArgsSchema,
  get_customer_due: customerDueArgsSchema,
  get_product_details: productDetailsArgsSchema,
  get_queue_status: queueStatusArgsSchema,
  get_payables_status: payablesStatusArgsSchema,
  get_billing_status: billingStatusArgsSchema,
};

function normalizeName(value: string) {
  return normalizeCopilotQuestion(value).replace(/\s+/g, "");
}

function scoreCustomerMatch(customerName: string, askedName: string) {
  const customer = normalizeName(customerName);
  const asked = normalizeName(askedName);
  if (!customer || !asked) return 0;
  if (customer === asked) return 100;
  if (customer.startsWith(asked)) return 80;
  if (customer.includes(asked)) return 60;
  if (asked.includes(customer)) return 40;
  return 0;
}

function scoreProductMatch(productName: string, askedName: string) {
  const product = normalizeName(productName);
  const asked = normalizeName(askedName);
  if (!product || !asked) return 0;
  if (product === asked) return 100;
  if (product.startsWith(asked)) return 85;
  if (product.includes(asked)) return 65;
  if (asked.includes(product)) return 45;
  return 0;
}

async function findBestCustomer(shopId: string, askedName: string) {
  const candidates = await prisma.customer.findMany({
    where: {
      shopId,
      name: {
        contains: askedName.trim(),
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      name: true,
      totalDue: true,
      lastPaymentAt: true,
    },
    orderBy: [{ totalDue: "desc" }, { name: "asc" }],
    take: 8,
  });

  if (candidates.length === 0) return null;

  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: scoreCustomerMatch(candidate.name, askedName),
    }))
    .sort((a, b) => b.score - a.score || Number(b.candidate.totalDue) - Number(a.candidate.totalDue));

  return scored[0]?.score > 0 ? scored[0].candidate : null;
}

async function findBestProduct(shopId: string, askedName: string) {
  const candidates = await prisma.product.findMany({
    where: {
      shopId,
      OR: [
        {
          name: {
            contains: askedName.trim(),
            mode: "insensitive",
          },
        },
        {
          sku: {
            contains: askedName.trim(),
            mode: "insensitive",
          },
        },
        {
          barcode: {
            contains: askedName.trim(),
            mode: "insensitive",
          },
        },
      ],
    },
    select: {
      id: true,
      name: true,
      category: true,
      sellPrice: true,
      stockQty: true,
      baseUnit: true,
      sku: true,
      barcode: true,
      isActive: true,
      trackStock: true,
    },
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    take: 10,
  });

  if (candidates.length === 0) return null;

  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: Math.max(
        scoreProductMatch(candidate.name, askedName),
        candidate.sku ? scoreProductMatch(candidate.sku, askedName) - 10 : 0,
        candidate.barcode ? scoreProductMatch(candidate.barcode, askedName) - 10 : 0
      ),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.candidate.isActive) - Number(a.candidate.isActive)
    );

  return scored[0]?.score > 0 ? scored[0].candidate : null;
}

function getRangeForPeriod(period: "today" | "7d") {
  if (period === "today") {
    return getDhakaDateOnlyRange();
  }

  const from = getDhakaDateString(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));
  const to = getDhakaDateString();
  return parseDhakaDateOnlyRange(from, to, true);
}

export function listOwnerCopilotToolDefinitions() {
  return OWNER_COPILOT_TOOL_DEFINITIONS.map(({ name, description }) => ({
    name,
    description,
  }));
}

export function validateOwnerCopilotToolCall(toolCall: OwnerCopilotToolCall) {
  const schema = toolSchemaMap[toolCall.tool];
  if (!schema) return null;
  const parsed = schema.safeParse(toolCall.args ?? {});
  if (!parsed.success) return null;
  return {
    tool: toolCall.tool,
    args: parsed.data as Record<string, unknown>,
  };
}

export async function runOwnerCopilotToolCall({
  shopId,
  payload,
  toolCall,
}: {
  shopId: string;
  payload: OwnerCopilotPayloadForTools;
  toolCall: { tool: OwnerCopilotToolName; args: Record<string, unknown> };
}): Promise<OwnerCopilotToolResult> {
  switch (toolCall.tool) {
    case "get_overview": {
      const insight = buildOwnerCopilotInsight(shopId, payload.summary, payload.snapshot);
      return {
        tool: toolCall.tool,
        data: {
          summary: payload.summary,
          snapshot: payload.snapshot,
          insight,
        },
      };
    }
    case "get_low_stock_items": {
      const limit = Number(toolCall.args.limit ?? 5);
      const items = await prisma.product.findMany({
        where: {
          shopId,
          isActive: true,
          trackStock: true,
          stockQty: { lte: 10 },
        },
        select: {
          id: true,
          name: true,
          stockQty: true,
          baseUnit: true,
          sellPrice: true,
          category: true,
        },
        orderBy: [{ stockQty: "asc" }, { updatedAt: "desc" }],
        take: limit,
      });
      return {
        tool: toolCall.tool,
        data: {
          count: items.length,
          items: items.map((item) => ({
            ...item,
            stockQty: Number(item.stockQty ?? 0),
            sellPrice: Number(item.sellPrice ?? 0),
          })),
        },
      };
    }
    case "get_top_products": {
      const limit = Number(toolCall.args.limit ?? 5);
      const period = (toolCall.args.period === "7d" ? "7d" : "today") as "today" | "7d";
      const { start, end } = getRangeForPeriod(period);
      const rows = await prisma.saleItem.groupBy({
        by: ["productId"],
        where: {
          sale: {
            shopId,
            status: { not: "VOIDED" },
            businessDate: { gte: start, lte: end },
          },
        },
        _sum: { quantity: true, lineTotal: true },
        orderBy: [{ _sum: { lineTotal: "desc" } }],
        take: limit,
      });

      const products = rows.length
        ? await prisma.product.findMany({
            where: {
              id: { in: rows.map((row) => row.productId) },
            },
            select: {
              id: true,
              name: true,
              category: true,
            },
          })
        : [];

      const productMap = new Map(products.map((product) => [product.id, product]));

      return {
        tool: toolCall.tool,
        data: {
          period,
          items: rows.map((row) => ({
            productId: row.productId,
            name: productMap.get(row.productId)?.name ?? "Unknown product",
            category: productMap.get(row.productId)?.category ?? null,
            quantity: Number(row._sum.quantity ?? 0),
            revenue: Number(row._sum.lineTotal ?? 0),
          })),
        },
      };
    }
    case "get_recent_sales": {
      const limit = Number(toolCall.args.limit ?? 5);
      const sales = await prisma.sale.findMany({
        where: {
          shopId,
          status: { not: "VOIDED" },
        },
        select: {
          id: true,
          invoiceNo: true,
          saleDate: true,
          totalAmount: true,
          paymentMethod: true,
          customer: {
            select: {
              name: true,
            },
          },
          saleItems: {
            select: {
              productNameSnapshot: true,
              quantity: true,
            },
            take: 3,
          },
        },
        orderBy: [{ createdAt: "desc" }],
        take: limit,
      });

      return {
        tool: toolCall.tool,
        data: {
          items: sales.map((sale) => ({
            id: sale.id,
            invoiceNo: sale.invoiceNo,
            saleDate: sale.saleDate,
            totalAmount: Number(sale.totalAmount ?? 0),
            paymentMethod: sale.paymentMethod,
            customerName: sale.customer?.name ?? null,
            items: sale.saleItems.map((item) => ({
              name: item.productNameSnapshot ?? null,
              quantity: Number(item.quantity ?? 0),
            })),
          })),
        },
      };
    }
    case "get_customer_due": {
      const customer = await findBestCustomer(shopId, String(toolCall.args.customerName ?? ""));
      return {
        tool: toolCall.tool,
        data: customer
          ? {
              matched: true,
              customer: {
                id: customer.id,
                name: customer.name,
                totalDue: Number(customer.totalDue ?? 0),
                lastPaymentAt: customer.lastPaymentAt,
              },
            }
          : {
              matched: false,
            },
      };
    }
    case "get_product_details": {
      const product = await findBestProduct(shopId, String(toolCall.args.query ?? ""));
      return {
        tool: toolCall.tool,
        data: product
          ? {
              matched: true,
              product: {
                id: product.id,
                name: product.name,
                category: product.category,
                sellPrice: Number(product.sellPrice ?? 0),
                stockQty: Number(product.stockQty ?? 0),
                baseUnit: product.baseUnit,
                sku: product.sku,
                barcode: product.barcode,
                isActive: product.isActive,
                trackStock: product.trackStock,
              },
            }
          : {
              matched: false,
            },
      };
    }
    case "get_queue_status": {
      const { start, end } = getDhakaDateOnlyRange();
      const rows = await prisma.queueToken.groupBy({
        by: ["status"],
        where: {
          shopId,
          businessDate: { gte: start, lte: end },
        },
        _count: {
          _all: true,
        },
      });

      return {
        tool: toolCall.tool,
        data: {
          totalPending: payload.snapshot.queuePendingCount,
          statuses: rows.map((row) => ({
            status: row.status,
            count: Number(row._count._all ?? 0),
          })),
        },
      };
    }
    case "get_payables_status": {
      return {
        tool: toolCall.tool,
        data: {
          totalDue: Number(payload.payables.totalDue ?? 0),
          dueCount: Number(payload.payables.dueCount ?? 0),
          supplierCount: Number(payload.payables.supplierCount ?? 0),
          snapshotTotal: Number(payload.snapshot.payablesTotal ?? 0),
        },
      };
    }
    case "get_billing_status": {
      return {
        tool: toolCall.tool,
        data: {
          status: payload.snapshot.billingStatus,
        },
      };
    }
  }
}
