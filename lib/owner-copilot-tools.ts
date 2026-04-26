import { Prisma } from "@prisma/client";
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
const categorySalesArgsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).optional(),
  period: z.enum(["today", "7d"]).optional(),
});
const paymentMethodBreakdownArgsSchema = z.object({
  period: z.enum(["today", "7d"]).optional(),
});
const averageOrderValueArgsSchema = z.object({
  period: z.enum(["today", "7d"]).optional(),
});
const productSalesSummaryArgsSchema = z.object({
  query: z.string().trim().min(2),
  period: z.enum(["today", "7d"]).optional(),
});
const inventorySummaryArgsSchema = z.object({});
const stockExtremesArgsSchema = z.object({
  direction: z.enum(["highest", "lowest"]).optional(),
  limit: z.coerce.number().int().min(1).max(10).optional(),
  trackedOnly: z.coerce.boolean().optional(),
});
const deadStockArgsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).optional(),
  days: z.coerce.number().int().min(7).max(90).optional(),
  activeOnly: z.coerce.boolean().optional(),
});
const customerSummaryArgsSchema = z.object({});
const topDueCustomersArgsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).optional(),
});
const repeatCustomersArgsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).optional(),
  days: z.coerce.number().int().min(7).max(90).optional(),
});
const inactiveCustomersArgsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).optional(),
  days: z.coerce.number().int().min(7).max(180).optional(),
});
const supplierSummaryArgsSchema = z.object({});
const topSuppliersArgsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).optional(),
  days: z.coerce.number().int().min(7).max(180).optional(),
});
const supplierPayablesArgsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).optional(),
});
const recentPurchasesArgsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).optional(),
});
const purchaseGapItemsArgsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).optional(),
  days: z.coerce.number().int().min(7).max(180).optional(),
  trackedOnly: z.coerce.boolean().optional(),
});
const topProfitProductsArgsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).optional(),
  period: z.enum(["today", "7d"]).optional(),
});
const lowMarginProductsArgsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).optional(),
  period: z.enum(["today", "7d"]).optional(),
  minRevenue: z.coerce.number().min(0).optional(),
});
const categoryMarginSummaryArgsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).optional(),
  period: z.enum(["today", "7d"]).optional(),
});
const profitTrendSummaryArgsSchema = z.object({});
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
    name: "get_category_sales_breakdown",
    description: "Get category-wise sales breakdown for today or the last 7 days.",
    schema: categorySalesArgsSchema,
  },
  {
    name: "get_payment_method_breakdown",
    description: "Get sales totals and order counts grouped by payment method for today or the last 7 days.",
    schema: paymentMethodBreakdownArgsSchema,
  },
  {
    name: "get_average_order_value",
    description: "Get average order value and order count for today or the last 7 days.",
    schema: averageOrderValueArgsSchema,
  },
  {
    name: "get_product_sales_summary",
    description: "Find a product by name, SKU, or barcode and return its sales quantity and revenue for today or the last 7 days.",
    schema: productSalesSummaryArgsSchema,
  },
  {
    name: "get_inventory_summary",
    description: "Get total product counts, active/inactive split, tracked items, out-of-stock count, and top categories.",
    schema: inventorySummaryArgsSchema,
  },
  {
    name: "get_stock_extremes",
    description: "Get products with the highest or lowest stock quantities.",
    schema: stockExtremesArgsSchema,
  },
  {
    name: "get_dead_stock_items",
    description: "Get products with no sales in the last N days for dead-stock review.",
    schema: deadStockArgsSchema,
  },
  {
    name: "get_customer_summary",
    description: "Get total customers, due customers, customers with payments, and recently added customers.",
    schema: customerSummaryArgsSchema,
  },
  {
    name: "get_top_due_customers",
    description: "Get customers with the highest due amounts.",
    schema: topDueCustomersArgsSchema,
  },
  {
    name: "get_repeat_customers",
    description: "Get repeat customers based on purchase count in the last N days.",
    schema: repeatCustomersArgsSchema,
  },
  {
    name: "get_inactive_customers",
    description: "Get customers with no sale activity in the last N days.",
    schema: inactiveCustomersArgsSchema,
  },
  {
    name: "get_supplier_summary",
    description: "Get total suppliers, payable suppliers, and recent supplier activity summary.",
    schema: supplierSummaryArgsSchema,
  },
  {
    name: "get_top_suppliers",
    description: "Get suppliers with the highest purchase totals in the last N days.",
    schema: topSuppliersArgsSchema,
  },
  {
    name: "get_supplier_payables",
    description: "Get suppliers with the highest outstanding payable balances.",
    schema: supplierPayablesArgsSchema,
  },
  {
    name: "get_recent_purchases",
    description: "Get a compact list of recent purchases with totals, supplier, and due amount.",
    schema: recentPurchasesArgsSchema,
  },
  {
    name: "get_purchase_gap_items",
    description: "Get products with no purchase activity in the last N days for restock review.",
    schema: purchaseGapItemsArgsSchema,
  },
  {
    name: "get_top_profit_products",
    description: "Get products with the highest estimated gross profit for today or the last 7 days.",
    schema: topProfitProductsArgsSchema,
  },
  {
    name: "get_low_margin_products",
    description: "Get low-margin products for today or the last 7 days using estimated gross margin.",
    schema: lowMarginProductsArgsSchema,
  },
  {
    name: "get_category_margin_summary",
    description: "Get category-wise revenue, cost, and estimated gross profit summary for today or the last 7 days.",
    schema: categoryMarginSummaryArgsSchema,
  },
  {
    name: "get_profit_trend_summary",
    description: "Get current profit trend compared with yesterday and the 7-day average.",
    schema: profitTrendSummaryArgsSchema,
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
  get_category_sales_breakdown: categorySalesArgsSchema,
  get_payment_method_breakdown: paymentMethodBreakdownArgsSchema,
  get_average_order_value: averageOrderValueArgsSchema,
  get_product_sales_summary: productSalesSummaryArgsSchema,
  get_inventory_summary: inventorySummaryArgsSchema,
  get_stock_extremes: stockExtremesArgsSchema,
  get_dead_stock_items: deadStockArgsSchema,
  get_customer_summary: customerSummaryArgsSchema,
  get_top_due_customers: topDueCustomersArgsSchema,
  get_repeat_customers: repeatCustomersArgsSchema,
  get_inactive_customers: inactiveCustomersArgsSchema,
  get_supplier_summary: supplierSummaryArgsSchema,
  get_top_suppliers: topSuppliersArgsSchema,
  get_supplier_payables: supplierPayablesArgsSchema,
  get_recent_purchases: recentPurchasesArgsSchema,
  get_purchase_gap_items: purchaseGapItemsArgsSchema,
  get_top_profit_products: topProfitProductsArgsSchema,
  get_low_margin_products: lowMarginProductsArgsSchema,
  get_category_margin_summary: categoryMarginSummaryArgsSchema,
  get_profit_trend_summary: profitTrendSummaryArgsSchema,
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

function getRangeForLastDays(days: number) {
  const offsetDays = Math.max(days - 1, 0);
  const from = getDhakaDateString(
    new Date(Date.now() - offsetDays * 24 * 60 * 60 * 1000)
  );
  const to = getDhakaDateString();
  return parseDhakaDateOnlyRange(from, to, true);
}

async function getProductProfitRows(
  shopId: string,
  period: "today" | "7d"
): Promise<
  Array<{
    productId: string;
    name: string | null;
    category: string | null;
    quantity: number;
    revenue: number;
    estimatedCost: number;
    estimatedGrossProfit: number;
    marginPct: number | null;
  }>
> {
  const { start, end } = getRangeForPeriod(period);
  const safeStart = start ?? new Date();
  const safeEnd = end ?? safeStart;
  const startDate = safeStart.toISOString().slice(0, 10);
  const endDate = safeEnd.toISOString().slice(0, 10);

  const rows = await prisma.$queryRaw<
    Array<{
      productId: string;
      name: string | null;
      category: string | null;
      quantity: Prisma.Decimal | number | null;
      revenue: Prisma.Decimal | number | null;
      estimatedCost: Prisma.Decimal | number | null;
    }>
  >(Prisma.sql`
    SELECT
      si.product_id AS "productId",
      MAX(COALESCE(si.product_name_snapshot, p.name)) AS "name",
      MAX(p.category) AS "category",
      SUM(CAST(si.quantity AS numeric)) AS "quantity",
      SUM(CAST(si.line_total AS numeric)) AS "revenue",
      SUM(CAST(si.quantity AS numeric) * COALESCE(si.cost_at_sale, p.buy_price, 0)) AS "estimatedCost"
    FROM "sale_items" si
    JOIN "sales" s ON s.id = si.sale_id
    JOIN "products" p ON p.id = si.product_id
    WHERE s.shop_id = CAST(${shopId} AS uuid)
      AND s.status <> 'VOIDED'
      AND s.business_date >= CAST(${startDate} AS date)
      AND s.business_date <= CAST(${endDate} AS date)
    GROUP BY si.product_id
  `);

  return rows.map((row) => {
    const revenue = Number(row.revenue ?? 0);
    const estimatedCost = Number(row.estimatedCost ?? 0);
    const estimatedGrossProfit = Number((revenue - estimatedCost).toFixed(2));
    return {
      productId: row.productId,
      name: row.name ?? null,
      category: row.category ?? null,
      quantity: Number(row.quantity ?? 0),
      revenue,
      estimatedCost,
      estimatedGrossProfit,
      marginPct:
        revenue > 0
          ? Number(((estimatedGrossProfit / revenue) * 100).toFixed(2))
          : null,
    };
  });
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
    case "get_category_sales_breakdown": {
      const limit = Number(toolCall.args.limit ?? 5);
      const period = (toolCall.args.period === "7d" ? "7d" : "today") as
        | "today"
        | "7d";
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
      });

      const products = rows.length
        ? await prisma.product.findMany({
            where: {
              id: { in: rows.map((row) => row.productId) },
            },
            select: {
              id: true,
              category: true,
            },
          })
        : [];

      const productCategoryMap = new Map(
        products.map((product) => [product.id, product.category || "Uncategorized"])
      );

      const categoryMap = new Map<
        string,
        { category: string; quantity: number; revenue: number }
      >();

      for (const row of rows) {
        const category = productCategoryMap.get(row.productId) || "Uncategorized";
        const current = categoryMap.get(category) || {
          category,
          quantity: 0,
          revenue: 0,
        };
        current.quantity += Number(row._sum.quantity ?? 0);
        current.revenue += Number(row._sum.lineTotal ?? 0);
        categoryMap.set(category, current);
      }

      const items = Array.from(categoryMap.values())
        .sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity)
        .slice(0, limit);

      return {
        tool: toolCall.tool,
        data: {
          period,
          items,
        },
      };
    }
    case "get_payment_method_breakdown": {
      const period = (toolCall.args.period === "7d" ? "7d" : "today") as
        | "today"
        | "7d";
      const { start, end } = getRangeForPeriod(period);
      const rows = await prisma.sale.groupBy({
        by: ["paymentMethod"],
        where: {
          shopId,
          status: { not: "VOIDED" },
          businessDate: { gte: start, lte: end },
        },
        _sum: {
          totalAmount: true,
        },
        _count: {
          _all: true,
        },
        orderBy: {
          _sum: {
            totalAmount: "desc",
          },
        },
      });

      return {
        tool: toolCall.tool,
        data: {
          period,
          items: rows.map((row) => ({
            paymentMethod: row.paymentMethod || "unknown",
            totalAmount: Number(row._sum.totalAmount ?? 0),
            orderCount: Number(row._count._all ?? 0),
          })),
        },
      };
    }
    case "get_average_order_value": {
      const period = (toolCall.args.period === "7d" ? "7d" : "today") as
        | "today"
        | "7d";
      const { start, end } = getRangeForPeriod(period);
      const aggregate = await prisma.sale.aggregate({
        where: {
          shopId,
          status: { not: "VOIDED" },
          businessDate: { gte: start, lte: end },
        },
        _sum: {
          totalAmount: true,
        },
        _count: {
          _all: true,
        },
      });

      const totalSales = Number(aggregate._sum.totalAmount ?? 0);
      const orderCount = Number(aggregate._count._all ?? 0);

      return {
        tool: toolCall.tool,
        data: {
          period,
          totalSales,
          orderCount,
          averageOrderValue: orderCount > 0 ? Number((totalSales / orderCount).toFixed(2)) : 0,
        },
      };
    }
    case "get_product_sales_summary": {
      const period = (toolCall.args.period === "7d" ? "7d" : "today") as
        | "today"
        | "7d";
      const query = String(toolCall.args.query ?? "");
      const product = await findBestProduct(shopId, query);
      if (!product) {
        return {
          tool: toolCall.tool,
          data: {
            matched: false,
            period,
          },
        };
      }

      const { start, end } = getRangeForPeriod(period);
      const aggregate = await prisma.saleItem.aggregate({
        where: {
          productId: product.id,
          sale: {
            shopId,
            status: { not: "VOIDED" },
            businessDate: { gte: start, lte: end },
          },
        },
        _sum: {
          quantity: true,
          lineTotal: true,
        },
        _count: {
          _all: true,
        },
      });

      return {
        tool: toolCall.tool,
        data: {
          matched: true,
          period,
          product: {
            id: product.id,
            name: product.name,
            category: product.category,
            sellPrice: Number(product.sellPrice ?? 0),
          },
          sales: {
            quantity: Number(aggregate._sum.quantity ?? 0),
            revenue: Number(aggregate._sum.lineTotal ?? 0),
            lineCount: Number(aggregate._count._all ?? 0),
          },
        },
      };
    }
    case "get_inventory_summary": {
      const baseWhere = { shopId };
      const trackedWhere = {
        shopId,
        trackStock: true,
      };

      const [
        totalProducts,
        activeProducts,
        inactiveProducts,
        trackedProducts,
        outOfStockProducts,
        lowStockProducts,
        categoryRows,
      ] = await Promise.all([
        prisma.product.count({ where: baseWhere }),
        prisma.product.count({
          where: {
            ...baseWhere,
            isActive: true,
          },
        }),
        prisma.product.count({
          where: {
            ...baseWhere,
            isActive: false,
          },
        }),
        prisma.product.count({ where: trackedWhere }),
        prisma.product.count({
          where: {
            ...trackedWhere,
            stockQty: { lte: 0 },
          },
        }),
        prisma.product.count({
          where: {
            ...trackedWhere,
            isActive: true,
            stockQty: { lte: 10 },
          },
        }),
        prisma.product.groupBy({
          by: ["category"],
          where: baseWhere,
          _count: {
            _all: true,
          },
          orderBy: {
            _count: {
              category: "desc",
            },
          },
          take: 5,
        }),
      ]);

      return {
        tool: toolCall.tool,
        data: {
          totalProducts,
          activeProducts,
          inactiveProducts,
          trackedProducts,
          untrackedProducts: Math.max(totalProducts - trackedProducts, 0),
          outOfStockProducts,
          lowStockProducts,
          topCategories: categoryRows.map((row) => ({
            category: row.category || "Uncategorized",
            count: Number(row._count._all ?? 0),
          })),
        },
      };
    }
    case "get_stock_extremes": {
      const direction =
        toolCall.args.direction === "highest" ? "highest" : "lowest";
      const limit = Number(toolCall.args.limit ?? 5);
      const trackedOnly = toolCall.args.trackedOnly !== false;
      const items = await prisma.product.findMany({
        where: {
          shopId,
          isActive: true,
          ...(trackedOnly ? { trackStock: true } : {}),
        },
        select: {
          id: true,
          name: true,
          category: true,
          stockQty: true,
          baseUnit: true,
          sellPrice: true,
          trackStock: true,
        },
        orderBy: [
          { stockQty: direction === "highest" ? "desc" : "asc" },
          { updatedAt: "desc" },
        ],
        take: limit,
      });

      return {
        tool: toolCall.tool,
        data: {
          direction,
          trackedOnly,
          items: items.map((item) => ({
            ...item,
            stockQty: Number(item.stockQty ?? 0),
            sellPrice: Number(item.sellPrice ?? 0),
          })),
        },
      };
    }
    case "get_dead_stock_items": {
      const limit = Number(toolCall.args.limit ?? 5);
      const days = Number(toolCall.args.days ?? 30);
      const activeOnly = toolCall.args.activeOnly !== false;
      const { start, end } = getRangeForLastDays(days);

      const soldRows = await prisma.saleItem.groupBy({
        by: ["productId"],
        where: {
          sale: {
            shopId,
            status: { not: "VOIDED" },
            businessDate: { gte: start, lte: end },
          },
        },
        _sum: {
          quantity: true,
        },
      });

      const soldProductIds = soldRows.map((row) => row.productId);
      const deadStockWhere = {
        shopId,
        ...(activeOnly ? { isActive: true } : {}),
        ...(soldProductIds.length > 0 ? { id: { notIn: soldProductIds } } : {}),
      };

      const [count, items] = await Promise.all([
        prisma.product.count({
          where: deadStockWhere,
        }),
        prisma.product.findMany({
          where: deadStockWhere,
          select: {
            id: true,
            name: true,
            category: true,
            stockQty: true,
            baseUnit: true,
            sellPrice: true,
            trackStock: true,
            isActive: true,
            updatedAt: true,
          },
          orderBy: [{ updatedAt: "asc" }, { stockQty: "desc" }],
          take: limit,
        }),
      ]);

      return {
        tool: toolCall.tool,
        data: {
          days,
          activeOnly,
          count,
          items: items.map((item) => ({
            ...item,
            stockQty: Number(item.stockQty ?? 0),
            sellPrice: Number(item.sellPrice ?? 0),
          })),
        },
      };
    }
    case "get_customer_summary": {
      const thirtyDaysAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
      const [
        totalCustomers,
        dueCustomers,
        customersWithPayments,
        recentCustomers,
      ] = await Promise.all([
        prisma.customer.count({
          where: { shopId },
        }),
        prisma.customer.count({
          where: {
            shopId,
            totalDue: { gt: 0 },
          },
        }),
        prisma.customer.count({
          where: {
            shopId,
            lastPaymentAt: { not: null },
          },
        }),
        prisma.customer.count({
          where: {
            shopId,
            createdAt: { gte: thirtyDaysAgo },
          },
        }),
      ]);

      return {
        tool: toolCall.tool,
        data: {
          totalCustomers,
          dueCustomers,
          customersWithPayments,
          customersWithoutPayments: Math.max(totalCustomers - customersWithPayments, 0),
          recentCustomers,
        },
      };
    }
    case "get_top_due_customers": {
      const limit = Number(toolCall.args.limit ?? 5);
      const customers = await prisma.customer.findMany({
        where: {
          shopId,
          totalDue: { gt: 0 },
        },
        select: {
          id: true,
          name: true,
          phone: true,
          totalDue: true,
          lastPaymentAt: true,
        },
        orderBy: [{ totalDue: "desc" }, { name: "asc" }],
        take: limit,
      });

      return {
        tool: toolCall.tool,
        data: {
          count: customers.length,
          items: customers.map((customer) => ({
            id: customer.id,
            name: customer.name,
            phone: customer.phone,
            totalDue: Number(customer.totalDue ?? 0),
            lastPaymentAt: customer.lastPaymentAt,
          })),
        },
      };
    }
    case "get_repeat_customers": {
      const limit = Number(toolCall.args.limit ?? 5);
      const days = Number(toolCall.args.days ?? 30);
      const { start, end } = getRangeForLastDays(days);
      const rows = await prisma.sale.groupBy({
        by: ["customerId"],
        where: {
          shopId,
          status: { not: "VOIDED" },
          businessDate: { gte: start, lte: end },
          customerId: { not: null },
        },
        _count: {
          _all: true,
        },
        _sum: {
          totalAmount: true,
        },
        orderBy: [{ _count: { customerId: "desc" } }, { _sum: { totalAmount: "desc" } }],
        take: limit,
      });

      const customerIds = rows
        .map((row) => row.customerId)
        .filter((value): value is string => Boolean(value));
      const customers = customerIds.length
        ? await prisma.customer.findMany({
            where: {
              shopId,
              id: { in: customerIds },
            },
            select: {
              id: true,
              name: true,
              phone: true,
              totalDue: true,
              lastPaymentAt: true,
            },
          })
        : [];
      const customerMap = new Map(customers.map((customer) => [customer.id, customer]));

      return {
        tool: toolCall.tool,
        data: {
          days,
          items: rows
            .filter((row) => row.customerId && customerMap.has(row.customerId))
            .map((row) => {
              const customer = customerMap.get(row.customerId!)!;
              return {
                id: customer.id,
                name: customer.name,
                phone: customer.phone,
                purchaseCount: Number(row._count._all ?? 0),
                totalSpent: Number(row._sum.totalAmount ?? 0),
                totalDue: Number(customer.totalDue ?? 0),
                lastPaymentAt: customer.lastPaymentAt,
              };
            }),
        },
      };
    }
    case "get_inactive_customers": {
      const limit = Number(toolCall.args.limit ?? 5);
      const days = Number(toolCall.args.days ?? 60);
      const { start, end } = getRangeForLastDays(days);
      const activeRows = await prisma.sale.groupBy({
        by: ["customerId"],
        where: {
          shopId,
          status: { not: "VOIDED" },
          businessDate: { gte: start, lte: end },
          customerId: { not: null },
        },
      });
      const activeCustomerIds = activeRows
        .map((row) => row.customerId)
        .filter((value): value is string => Boolean(value));

      const where = {
        shopId,
        ...(activeCustomerIds.length > 0 ? { id: { notIn: activeCustomerIds } } : {}),
      };

      const [count, customers] = await Promise.all([
        prisma.customer.count({ where }),
        prisma.customer.findMany({
          where,
          select: {
            id: true,
            name: true,
            phone: true,
            totalDue: true,
            lastPaymentAt: true,
            createdAt: true,
          },
          orderBy: [{ lastPaymentAt: "asc" }, { createdAt: "asc" }],
          take: limit,
        }),
      ]);

      return {
        tool: toolCall.tool,
        data: {
          days,
          count,
          items: customers.map((customer) => ({
            id: customer.id,
            name: customer.name,
            phone: customer.phone,
            totalDue: Number(customer.totalDue ?? 0),
            lastPaymentAt: customer.lastPaymentAt,
            createdAt: customer.createdAt,
          })),
        },
      };
    }
    case "get_supplier_summary": {
      const thirtyDaysAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
      const [totalSuppliers, recentSuppliers] = await Promise.all([
        prisma.supplier.count({
          where: { shopId },
        }),
        prisma.supplier.count({
          where: {
            shopId,
            createdAt: { gte: thirtyDaysAgo },
          },
        }),
      ]);

      return {
        tool: toolCall.tool,
        data: {
          totalSuppliers,
          payableSuppliers: Number(payload.payables.supplierCount ?? 0),
          totalPayable: Number(payload.payables.totalDue ?? 0),
          recentSuppliers,
        },
      };
    }
    case "get_top_suppliers": {
      const limit = Number(toolCall.args.limit ?? 5);
      const days = Number(toolCall.args.days ?? 30);
      const { start, end } = getRangeForLastDays(days);
      const rows = await prisma.purchase.groupBy({
        by: ["supplierId"],
        where: {
          shopId,
          purchaseDate: { gte: start, lte: end },
          supplierId: { not: null },
        },
        _sum: {
          totalAmount: true,
          dueAmount: true,
        },
        _count: {
          _all: true,
        },
        orderBy: [{ _sum: { totalAmount: "desc" } }],
        take: limit,
      });

      const supplierIds = rows
        .map((row) => row.supplierId)
        .filter((value): value is string => Boolean(value));
      const suppliers = supplierIds.length
        ? await prisma.supplier.findMany({
            where: {
              shopId,
              id: { in: supplierIds },
            },
            select: {
              id: true,
              name: true,
              phone: true,
            },
          })
        : [];
      const supplierMap = new Map(suppliers.map((supplier) => [supplier.id, supplier]));

      return {
        tool: toolCall.tool,
        data: {
          days,
          items: rows
            .filter((row) => row.supplierId && supplierMap.has(row.supplierId))
            .map((row) => {
              const supplier = supplierMap.get(row.supplierId!)!;
              return {
                id: supplier.id,
                name: supplier.name,
                phone: supplier.phone,
                purchaseTotal: Number(row._sum.totalAmount ?? 0),
                dueAmount: Number(row._sum.dueAmount ?? 0),
                purchaseCount: Number(row._count._all ?? 0),
              };
            }),
        },
      };
    }
    case "get_supplier_payables": {
      const limit = Number(toolCall.args.limit ?? 5);
      const rows = await prisma.purchase.groupBy({
        by: ["supplierId"],
        where: {
          shopId,
          dueAmount: { gt: 0 },
          supplierId: { not: null },
        },
        _sum: {
          dueAmount: true,
          totalAmount: true,
        },
        _count: {
          _all: true,
        },
        orderBy: [{ _sum: { dueAmount: "desc" } }],
        take: limit,
      });

      const supplierIds = rows
        .map((row) => row.supplierId)
        .filter((value): value is string => Boolean(value));
      const suppliers = supplierIds.length
        ? await prisma.supplier.findMany({
            where: {
              shopId,
              id: { in: supplierIds },
            },
            select: {
              id: true,
              name: true,
              phone: true,
            },
          })
        : [];
      const supplierMap = new Map(suppliers.map((supplier) => [supplier.id, supplier]));

      return {
        tool: toolCall.tool,
        data: {
          items: rows
            .filter((row) => row.supplierId && supplierMap.has(row.supplierId))
            .map((row) => {
              const supplier = supplierMap.get(row.supplierId!)!;
              return {
                id: supplier.id,
                name: supplier.name,
                phone: supplier.phone,
                payableAmount: Number(row._sum.dueAmount ?? 0),
                purchaseTotal: Number(row._sum.totalAmount ?? 0),
                duePurchaseCount: Number(row._count._all ?? 0),
              };
            }),
        },
      };
    }
    case "get_recent_purchases": {
      const limit = Number(toolCall.args.limit ?? 5);
      const purchases = await prisma.purchase.findMany({
        where: {
          shopId,
        },
        select: {
          id: true,
          purchaseDate: true,
          totalAmount: true,
          paidAmount: true,
          dueAmount: true,
          paymentMethod: true,
          supplierName: true,
          supplier: {
            select: {
              name: true,
            },
          },
        },
        orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }],
        take: limit,
      });

      return {
        tool: toolCall.tool,
        data: {
          items: purchases.map((purchase) => ({
            id: purchase.id,
            purchaseDate: purchase.purchaseDate,
            supplierName: purchase.supplier?.name ?? purchase.supplierName ?? null,
            totalAmount: Number(purchase.totalAmount ?? 0),
            paidAmount: Number(purchase.paidAmount ?? 0),
            dueAmount: Number(purchase.dueAmount ?? 0),
            paymentMethod: purchase.paymentMethod,
          })),
        },
      };
    }
    case "get_purchase_gap_items": {
      const limit = Number(toolCall.args.limit ?? 5);
      const days = Number(toolCall.args.days ?? 45);
      const trackedOnly = toolCall.args.trackedOnly !== false;
      const { start, end } = getRangeForLastDays(days);

      const purchasedRows = await prisma.purchaseItem.groupBy({
        by: ["productId"],
        where: {
          purchase: {
            shopId,
            purchaseDate: { gte: start, lte: end },
          },
        },
      });

      const purchasedProductIds = purchasedRows.map((row) => row.productId);
      const where = {
        shopId,
        isActive: true,
        ...(trackedOnly ? { trackStock: true } : {}),
        ...(purchasedProductIds.length > 0 ? { id: { notIn: purchasedProductIds } } : {}),
      };

      const [count, items] = await Promise.all([
        prisma.product.count({ where }),
        prisma.product.findMany({
          where,
          select: {
            id: true,
            name: true,
            category: true,
            stockQty: true,
            baseUnit: true,
            sellPrice: true,
            buyPrice: true,
            trackStock: true,
            updatedAt: true,
          },
          orderBy: [{ updatedAt: "asc" }, { stockQty: "asc" }],
          take: limit,
        }),
      ]);

      return {
        tool: toolCall.tool,
        data: {
          days,
          trackedOnly,
          count,
          items: items.map((item) => ({
            ...item,
            stockQty: Number(item.stockQty ?? 0),
            sellPrice: Number(item.sellPrice ?? 0),
            buyPrice: Number(item.buyPrice ?? 0),
          })),
        },
      };
    }
    case "get_top_profit_products": {
      const limit = Number(toolCall.args.limit ?? 5);
      const period = (toolCall.args.period === "7d" ? "7d" : "today") as
        | "today"
        | "7d";
      const items = (await getProductProfitRows(shopId, period))
        .sort(
          (a, b) =>
            b.estimatedGrossProfit - a.estimatedGrossProfit || b.revenue - a.revenue
        )
        .slice(0, limit);

      return {
        tool: toolCall.tool,
        data: {
          period,
          items,
        },
      };
    }
    case "get_low_margin_products": {
      const limit = Number(toolCall.args.limit ?? 5);
      const period = (toolCall.args.period === "7d" ? "7d" : "today") as
        | "today"
        | "7d";
      const minRevenue = Number(toolCall.args.minRevenue ?? 100);
      const items = (await getProductProfitRows(shopId, period))
        .filter((item) => item.revenue >= minRevenue)
        .sort((a, b) => {
          const aMargin = a.marginPct ?? Number.POSITIVE_INFINITY;
          const bMargin = b.marginPct ?? Number.POSITIVE_INFINITY;
          return aMargin - bMargin || b.revenue - a.revenue;
        })
        .slice(0, limit);

      return {
        tool: toolCall.tool,
        data: {
          period,
          minRevenue,
          items,
        },
      };
    }
    case "get_category_margin_summary": {
      const limit = Number(toolCall.args.limit ?? 5);
      const period = (toolCall.args.period === "7d" ? "7d" : "today") as
        | "today"
        | "7d";
      const categoryMap = new Map<
        string,
        {
          category: string;
          quantity: number;
          revenue: number;
          estimatedCost: number;
          estimatedGrossProfit: number;
          marginPct: number | null;
        }
      >();

      for (const row of await getProductProfitRows(shopId, period)) {
        const category = row.category || "Uncategorized";
        const current = categoryMap.get(category) || {
          category,
          quantity: 0,
          revenue: 0,
          estimatedCost: 0,
          estimatedGrossProfit: 0,
          marginPct: null,
        };
        current.quantity += row.quantity;
        current.revenue += row.revenue;
        current.estimatedCost += row.estimatedCost;
        current.estimatedGrossProfit += row.estimatedGrossProfit;
        categoryMap.set(category, current);
      }

      const items = Array.from(categoryMap.values())
        .map((item) => ({
          ...item,
          marginPct:
            item.revenue > 0
              ? Number(((item.estimatedGrossProfit / item.revenue) * 100).toFixed(2))
              : null,
        }))
        .sort((a, b) => b.estimatedGrossProfit - a.estimatedGrossProfit || b.revenue - a.revenue)
        .slice(0, limit);

      return {
        tool: toolCall.tool,
        data: {
          period,
          items,
        },
      };
    }
    case "get_profit_trend_summary": {
      const todayProfit = Number(payload.summary.profit ?? 0);
      const yesterdayProfit = Number(payload.snapshot.yesterday.profit ?? 0);
      const average7dProfit = Number(payload.snapshot.average7d.profit ?? 0);
      const vsYesterday = Number((todayProfit - yesterdayProfit).toFixed(2));
      const vsAverage7d = Number((todayProfit - average7dProfit).toFixed(2));

      return {
        tool: toolCall.tool,
        data: {
          todayProfit,
          yesterdayProfit,
          average7dProfit,
          vsYesterday,
          vsAverage7d,
          trendDirection:
            vsYesterday > 0 ? "up" : vsYesterday < 0 ? "down" : "flat",
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
