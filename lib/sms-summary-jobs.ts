import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCogsTotalRaw } from "@/lib/reports/cogs";
import { getDhakaDateString, parseDhakaDateOnlyRange } from "@/lib/dhaka-date";
import { sendSms, resolveSmsProviderLabel } from "@/lib/sms/provider";

type DailySmsSummaryJobOptions = {
  now?: Date;
  businessDate?: string;
  dryRun?: boolean;
  forceResend?: boolean;
  limit?: number;
};

type SmsPreviewRow = {
  shopId: string;
  shopName: string;
  to: string | null;
  message: string;
  status: "ready" | "skipped";
  reason?: string;
};

export type DailySmsSummaryJobResult = {
  targetBusinessDate: string;
  dryRun: boolean;
  provider: string;
  eligibleShops: number;
  processed: number;
  sent: number;
  failed: number;
  skippedNoPhone: number;
  skippedAlreadySent: number;
  skippedInvalidPhone: number;
  previews: SmsPreviewRow[];
};

type ShopDaySummary = {
  sales: number;
  expense: number;
  profit: number;
  cashBalance: number;
  topProductName: string | null;
  topProductQty: number;
};

function isDateOnly(input: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(input);
}

function resolveTargetDate(now: Date, explicitDate?: string) {
  if (explicitDate) {
    const trimmed = explicitDate.trim();
    if (!isDateOnly(trimmed)) {
      throw new Error("Invalid date format. Use YYYY-MM-DD");
    }
    return trimmed;
  }

  const todayDhaka = getDhakaDateString(now);
  const todayStart = new Date(`${todayDhaka}T00:00:00.000+06:00`);
  const prev = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  return getDhakaDateString(prev);
}

function normalizePhone(raw?: string | null) {
  const trimmed = (raw || "").trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("8801") && digits.length === 13) {
    return `+${digits}`;
  }
  if (digits.startsWith("01") && digits.length === 11) {
    return `+880${digits.slice(1)}`;
  }
  if (digits.startsWith("1") && digits.length === 10) {
    return `+880${digits}`;
  }
  if (digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }
  return null;
}

function formatMoney(value: number) {
  const fixed = Number(value.toFixed(2));
  return Number.isInteger(fixed) ? String(fixed) : fixed.toFixed(2);
}

function formatQty(value: number) {
  const fixed = Number(value.toFixed(2));
  return Number.isInteger(fixed) ? String(fixed) : fixed.toFixed(2);
}

function truncate(value: string, max = 20) {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(1, max - 1))}...`;
}

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function toCompactDateLabel(dateOnly: string) {
  const [year, month, day] = dateOnly.split("-");
  const parsedMonth = Number(month);
  const parsedDay = Number(day);
  if (
    !year ||
    !Number.isInteger(parsedMonth) ||
    parsedMonth < 1 ||
    parsedMonth > 12 ||
    !Number.isInteger(parsedDay) ||
    parsedDay < 1 ||
    parsedDay > 31
  ) {
    return dateOnly;
  }
  return `${parsedDay}${MONTH_LABELS[parsedMonth - 1]}`;
}

function buildSummaryMessage(params: {
  shopName: string;
  businessDate: string;
  summary: ShopDaySummary;
}) {
  const topProduct =
    params.summary.topProductName && params.summary.topProductQty > 0
      ? `${truncate(params.summary.topProductName, 16)}(${formatQty(
          params.summary.topProductQty
        )})`
      : null;

  const sales = formatMoney(params.summary.sales);
  const expense = formatMoney(params.summary.expense);
  const profit = formatMoney(params.summary.profit);
  const cash = formatMoney(params.summary.cashBalance);
  const dateLabel = toCompactDateLabel(params.businessDate);

  const withTemplate = (shopName: string, topLabel: string, compact = false) => {
    if (compact) {
      return `[SellFlick] ${dateLabel}: ${shopName}-Sales${sales}Tk,Exp${expense}Tk,Profit${profit}Tk,Cash${cash}Tk${topLabel}`;
    }
    return `[SellFlick] ${dateLabel}: ${shopName}-Sales ${sales}Tk, Exp ${expense}Tk, Profit ${profit}Tk, Cash ${cash}Tk${topLabel}`;
  };

  let shopLabel = truncate(params.shopName, 18);
  let topLabel = topProduct ? `, Top product: ${topProduct}` : "";
  let message = withTemplate(shopLabel, topLabel, false);

  if (message.length > 160) {
    shopLabel = truncate(params.shopName, 14);
    topLabel = topProduct ? `, Top:${truncate(topProduct, 20)}` : "";
    message = withTemplate(shopLabel, topLabel, false);
  }

  if (message.length > 160) {
    shopLabel = truncate(params.shopName, 12);
    topLabel = topProduct ? `, Top:${truncate(topProduct, 12)}` : "";
    message = withTemplate(shopLabel, topLabel, true);
  }

  if (message.length > 160) {
    message = message.slice(0, 160);
  }

  return message;
}

async function computeShopDaySummary(
  shopId: string,
  businessDate: string
): Promise<ShopDaySummary> {
  const parsedRange = parseDhakaDateOnlyRange(
    businessDate,
    businessDate,
    true
  );
  const start =
    parsedRange.start ?? new Date(`${businessDate}T00:00:00.000Z`);
  const end = parsedRange.end ?? new Date(`${businessDate}T23:59:59.999Z`);
  const dateOnly = businessDate;

  const [salesAgg, returnAgg, expenseAgg, cashAgg, cogs, topRows] =
    await Promise.all([
      prisma.sale.aggregate({
        where: {
          shopId,
          status: { notIn: ["VOIDED", "VOID"] },
          businessDate: { gte: start, lte: end },
        },
        _sum: { totalAmount: true },
      }),
      prisma.saleReturn.aggregate({
        where: {
          shopId,
          status: "completed",
          businessDate: { gte: start, lte: end },
        },
        _sum: { netAmount: true },
      }),
      prisma.expense.aggregate({
        where: {
          shopId,
          expenseDate: { gte: start, lte: end },
        },
        _sum: { amount: true },
      }),
      prisma.$queryRaw<
        { totalIn: Prisma.Decimal | number; totalOut: Prisma.Decimal | number }[]
      >(Prisma.sql`
        SELECT
          COALESCE(SUM(CASE WHEN entry_type = 'IN' THEN amount ELSE 0 END), 0) AS "totalIn",
          COALESCE(SUM(CASE WHEN entry_type = 'OUT' THEN amount ELSE 0 END), 0) AS "totalOut"
        FROM "cash_entries"
        WHERE shop_id = CAST(${shopId} AS uuid)
          AND business_date = CAST(${dateOnly} AS date)
      `),
      getCogsTotalRaw(shopId, start, end),
      prisma.$queryRaw<
        {
          product_id: string;
          qty: Prisma.Decimal | number | null;
          revenue: Prisma.Decimal | number | null;
        }[]
      >(Prisma.sql`
        WITH sales_lines AS (
          SELECT
            si.product_id AS product_id,
            CAST(si.quantity AS numeric) AS qty_delta,
            CAST(si.line_total AS numeric) AS revenue_delta
          FROM "sale_items" si
          JOIN "sales" s ON s.id = si.sale_id
          WHERE s.shop_id = CAST(${shopId} AS uuid)
            AND s.status <> 'VOIDED'
            AND s.business_date = CAST(${dateOnly} AS date)
        ),
        return_lines AS (
          SELECT
            sri.product_id AS product_id,
            -CAST(sri.quantity AS numeric) AS qty_delta,
            -CAST(sri.line_total AS numeric) AS revenue_delta
          FROM "sale_return_items" sri
          JOIN "sale_returns" sr ON sr.id = sri.sale_return_id
          WHERE sr.shop_id = CAST(${shopId} AS uuid)
            AND sr.status = 'completed'
            AND sr.business_date = CAST(${dateOnly} AS date)
        ),
        exchange_lines AS (
          SELECT
            srei.product_id AS product_id,
            CAST(srei.quantity AS numeric) AS qty_delta,
            CAST(srei.line_total AS numeric) AS revenue_delta
          FROM "sale_return_exchange_items" srei
          JOIN "sale_returns" sr ON sr.id = srei.sale_return_id
          WHERE sr.shop_id = CAST(${shopId} AS uuid)
            AND sr.status = 'completed'
            AND sr.business_date = CAST(${dateOnly} AS date)
        ),
        merged AS (
          SELECT * FROM sales_lines
          UNION ALL
          SELECT * FROM return_lines
          UNION ALL
          SELECT * FROM exchange_lines
        )
        SELECT
          product_id,
          SUM(qty_delta) AS qty,
          SUM(revenue_delta) AS revenue
        FROM merged
        GROUP BY product_id
        HAVING SUM(qty_delta) > 0 OR SUM(revenue_delta) > 0
        ORDER BY revenue DESC, qty DESC
        LIMIT 1
      `),
    ]);

  const topRow = topRows[0];
  let topProductName: string | null = null;
  let topProductQty = Number(topRow?.qty ?? 0);

  if (topRow?.product_id) {
    const product = await prisma.product.findUnique({
      where: { id: topRow.product_id },
      select: { name: true },
    });
    topProductName = product?.name ?? null;
  }

  const sales =
    Number(salesAgg._sum.totalAmount ?? 0) + Number(returnAgg._sum.netAmount ?? 0);
  const expense = Number(expenseAgg._sum.amount ?? 0);
  const totalIn = Number(cashAgg[0]?.totalIn ?? 0);
  const totalOut = Number(cashAgg[0]?.totalOut ?? 0);
  const cashBalance = totalIn - totalOut;
  const profit = sales - expense - Number(cogs ?? 0);

  if (!Number.isFinite(topProductQty)) {
    topProductQty = 0;
  }

  return {
    sales: Number(sales.toFixed(2)),
    expense: Number(expense.toFixed(2)),
    profit: Number(profit.toFixed(2)),
    cashBalance: Number(cashBalance.toFixed(2)),
    topProductName,
    topProductQty: Number(topProductQty.toFixed(2)),
  };
}

async function upsertDispatch(params: {
  shopId: string;
  businessDateValue: Date;
  recipientPhone: string;
  messageBody: string;
  status: "sent" | "failed" | "skipped";
  provider?: string | null;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  sentAt?: Date | null;
  nextAttemptCount: number;
}) {
  const where = {
    shopId_businessDate: {
      shopId: params.shopId,
      businessDate: params.businessDateValue,
    },
  };

  const data = {
    recipientPhone: params.recipientPhone,
    messageBody: params.messageBody,
    status: params.status,
    provider: params.provider ?? null,
    providerMessageId: params.providerMessageId ?? null,
    errorMessage: params.errorMessage ?? null,
    attemptCount: params.nextAttemptCount,
    sentAt: params.sentAt ?? null,
  };

  await prisma.smsSummaryDispatch.upsert({
    where,
    create: {
      shopId: params.shopId,
      businessDate: params.businessDateValue,
      ...data,
    },
    update: data,
  });
}

export async function runDailySmsSummaryJob(
  options?: DailySmsSummaryJobOptions
): Promise<DailySmsSummaryJobResult> {
  const now = options?.now ?? new Date();
  const targetBusinessDate = resolveTargetDate(now, options?.businessDate);
  const parsedRange = parseDhakaDateOnlyRange(
    targetBusinessDate,
    targetBusinessDate,
    true
  );
  const businessDateValue =
    parsedRange.start ?? new Date(`${targetBusinessDate}T00:00:00.000Z`);
  const forceResend = options?.forceResend === true;
  const dryRun = options?.dryRun === true;
  const provider = resolveSmsProviderLabel();
  const shopLimit = Math.max(1, Math.min(Number(options?.limit || 500), 5_000));

  const shops = await prisma.shop.findMany({
    where: {
      deletedAt: null,
      smsSummaryEntitled: true,
      smsSummaryEnabled: true,
    },
    select: {
      id: true,
      name: true,
      phone: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: shopLimit,
  });

  const result: DailySmsSummaryJobResult = {
    targetBusinessDate,
    dryRun,
    provider,
    eligibleShops: shops.length,
    processed: 0,
    sent: 0,
    failed: 0,
    skippedNoPhone: 0,
    skippedAlreadySent: 0,
    skippedInvalidPhone: 0,
    previews: [],
  };

  for (const shop of shops) {
    result.processed += 1;

    const existing = await prisma.smsSummaryDispatch.findUnique({
      where: {
        shopId_businessDate: {
          shopId: shop.id,
          businessDate: businessDateValue,
        },
      },
      select: {
        id: true,
        status: true,
        attemptCount: true,
      },
    });

    if (existing?.status === "sent" && !forceResend) {
      result.skippedAlreadySent += 1;
      result.previews.push({
        shopId: shop.id,
        shopName: shop.name,
        to: normalizePhone(shop.phone),
        message: "",
        status: "skipped",
        reason: "already-sent",
      });
      continue;
    }

    if (!shop.phone?.trim()) {
      result.skippedNoPhone += 1;
      const nextAttemptCount = Number(existing?.attemptCount ?? 0);
      if (!dryRun) {
        await upsertDispatch({
          shopId: shop.id,
          businessDateValue,
          recipientPhone: "",
          messageBody: "Skipped: shop phone not configured",
          status: "skipped",
          provider: null,
          errorMessage: "Shop phone not configured",
          sentAt: null,
          nextAttemptCount,
        });
      }
      result.previews.push({
        shopId: shop.id,
        shopName: shop.name,
        to: null,
        message: "",
        status: "skipped",
        reason: "phone-missing",
      });
      continue;
    }

    const normalizedPhone = normalizePhone(shop.phone);
    if (!normalizedPhone) {
      result.skippedInvalidPhone += 1;
      const nextAttemptCount = Number(existing?.attemptCount ?? 0);
      if (!dryRun) {
        await upsertDispatch({
          shopId: shop.id,
          businessDateValue,
          recipientPhone: shop.phone,
          messageBody: "Skipped: invalid phone format",
          status: "skipped",
          provider: null,
          errorMessage: "Invalid phone format",
          sentAt: null,
          nextAttemptCount,
        });
      }
      result.previews.push({
        shopId: shop.id,
        shopName: shop.name,
        to: shop.phone,
        message: "",
        status: "skipped",
        reason: "phone-invalid",
      });
      continue;
    }

    const summary = await computeShopDaySummary(shop.id, targetBusinessDate);
    const message = buildSummaryMessage({
      shopName: shop.name,
      businessDate: targetBusinessDate,
      summary,
    });

    result.previews.push({
      shopId: shop.id,
      shopName: shop.name,
      to: normalizedPhone,
      message,
      status: "ready",
    });

    if (dryRun) {
      continue;
    }

    const nextAttemptCount = Number(existing?.attemptCount ?? 0) + 1;
    try {
      const smsResult = await sendSms({
        to: normalizedPhone,
        message,
      });
      await upsertDispatch({
        shopId: shop.id,
        businessDateValue,
        recipientPhone: normalizedPhone,
        messageBody: message,
        status: "sent",
        provider: smsResult.provider,
        providerMessageId: smsResult.messageId ?? null,
        errorMessage: null,
        sentAt: new Date(),
        nextAttemptCount,
      });
      result.sent += 1;
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : "Unknown SMS send error";
      await upsertDispatch({
        shopId: shop.id,
        businessDateValue,
        recipientPhone: normalizedPhone,
        messageBody: message,
        status: "failed",
        provider: provider,
        providerMessageId: null,
        errorMessage: messageText,
        sentAt: null,
        nextAttemptCount,
      });
      result.failed += 1;
    }
  }

  return result;
}
