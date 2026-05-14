// lib/exports/dataset-builder.ts
//
// Translates a raw export target ("sales", "profit", etc.) into a normalised
// ExportDataset that the CSV / Excel / PDF writers can consume uniformly.
//
// We keep the data-fetching dependencies as an injected `ctx` so this file
// stays a pure transformer — easy to unit test, easy to reuse from elsewhere.

import type { ExportDataset, ExportColumn, ExportTarget } from "./types";

export type DatasetBuildContext = {
  shopId: string;
  range: { from?: string; to?: string };
  lowStockThreshold: number;
  /** Used in PDF/Excel subtitle. */
  rangeLabel: string | null;
  fetchAllRows: (
    endpoint: string,
    rangeFrom?: string,
    rangeTo?: string
  ) => Promise<any[]>;
  fetchReportData: (
    endpoint: string,
    params: URLSearchParams
  ) => Promise<any>;
  fetchSummary: (
    rangeFrom?: string,
    rangeTo?: string,
    fresh?: boolean
  ) => Promise<{
    sales: {
      totalAmount: number;
      count?: number;
      completedCount?: number;
      voidedCount?: number;
      taxAmount?: number;
      discountAmount?: number;
    };
    expense: { totalAmount: number; count?: number };
    cash: { balance: number; totalIn: number; totalOut: number };
    profit: {
      profit: number;
      salesTotal: number;
      expenseTotal: number;
      cogs?: number;
    };
  }>;
};

const fmt2 = (n: unknown) => {
  const num = Number(n ?? 0);
  return Number.isFinite(num) ? Number(num.toFixed(2)) : 0;
};

function buildSubtitle(ctx: DatasetBuildContext, scope?: string) {
  const parts = [ctx.rangeLabel ?? "সব সময়"];
  if (scope) parts.push(scope);
  return parts.join("  ·  ");
}

// Stamp each row with a 1-based serial number under `_serial` so user-facing
// reports show "১, ২, ৩…" instead of internal UUIDs.
function withSerial<T extends Record<string, any>>(rows: T[]): Array<T & { _serial: number }> {
  return rows.map((row, idx) => ({ ...row, _serial: idx + 1 }));
}

const PAYMENT_LABELS_BN: Record<string, string> = {
  cash: "ক্যাশ",
  bkash: "বিকাশ",
  nagad: "নগদ",
  card: "কার্ড",
  bank_transfer: "ব্যাংক",
  due: "বাকি",
};

function paymentLabel(method?: string | null) {
  if (!method) return "ক্যাশ";
  return PAYMENT_LABELS_BN[method.toLowerCase()] ?? method;
}

function cashEntryLabel(entryType?: string | null) {
  const t = (entryType || "").toUpperCase();
  if (t === "IN") return "ক্যাশ ইন";
  if (t === "OUT") return "ক্যাশ আউট";
  return entryType ?? "";
}

function billTitle(row: any) {
  const inv = String(row?.invoiceNo ?? "").trim();
  if (inv) return inv;
  // No invoice number — fall back to item count when available so the row is
  // still distinguishable from other un-invoiced cash sales.
  const itemCount = Number(row?._count?.saleItems ?? 0);
  if (Number.isFinite(itemCount) && itemCount > 0) {
    return `সরাসরি বিক্রি (${itemCount} পণ্য)`;
  }
  return "সরাসরি বিক্রি";
}

// Server-side actions auto-generate machine-readable English reasons like
// "Cash sale #<uuid>" when sales trigger a cash entry. Those leak UUIDs into
// reports — humanise them here so end users see meaningful Bengali text.
const CASH_REASON_PATTERNS: Array<{ re: RegExp; replacement: string }> = [
  { re: /^Cash sale\s*#?[\w-]*$/i, replacement: "নগদ বিক্রয়" },
  {
    re: /^Partial cash received for due sale\s*#?[\w-]*$/i,
    replacement: "বাকির আংশিক পেমেন্ট",
  },
  { re: /^Reversal of sale\s*#?[\w-]*$/i, replacement: "বিক্রয় বাতিল" },
  {
    re: /^Reversal of partial payment for due sale\s*#?[\w-]*$/i,
    replacement: "আংশিক পেমেন্ট বাতিল",
  },
];

function humanizeCashReason(raw?: string | null): string {
  if (!raw) return "—";
  const trimmed = String(raw).trim();
  if (!trimmed) return "—";
  for (const { re, replacement } of CASH_REASON_PATTERNS) {
    if (re.test(trimmed)) return replacement;
  }
  return trimmed;
}

export async function buildDataset(
  target: ExportTarget,
  ctx: DatasetBuildContext
): Promise<ExportDataset> {
  switch (target) {
    case "summary": {
      const data = await ctx.fetchSummary(ctx.range.from, ctx.range.to, true);
      const salesCount =
        data.sales.count ?? data.sales.completedCount ?? 0;
      const row = {
        range_from: ctx.range.from ?? "all",
        range_to: ctx.range.to ?? "all",
        sales_total: fmt2(data.sales.totalAmount),
        sales_count: salesCount,
        sales_voided: data.sales.voidedCount ?? 0,
        sales_tax: fmt2(data.sales.taxAmount),
        expense_total: fmt2(data.expense.totalAmount),
        expense_count: data.expense.count ?? 0,
        cash_in: fmt2(data.cash.totalIn),
        cash_out: fmt2(data.cash.totalOut),
        cash_balance: fmt2(data.cash.balance),
        profit: fmt2(data.profit.profit),
        cogs: fmt2(data.profit.cogs),
      };
      const columns: ExportColumn[] = [
        { key: "range_from", header: "শুরু", kind: "text" },
        { key: "range_to", header: "শেষ", kind: "text" },
        { key: "sales_total", header: "মোট বিক্রি", kind: "money" },
        { key: "sales_count", header: "বিল সংখ্যা", kind: "number" },
        { key: "sales_voided", header: "বাতিল বিল", kind: "number" },
        { key: "sales_tax", header: "VAT/Tax", kind: "money" },
        { key: "expense_total", header: "মোট খরচ", kind: "money" },
        { key: "expense_count", header: "খরচ এন্ট্রি", kind: "number" },
        { key: "cash_in", header: "ক্যাশ ইন", kind: "money" },
        { key: "cash_out", header: "ক্যাশ আউট", kind: "money" },
        { key: "cash_balance", header: "ক্যাশ ব্যালান্স", kind: "money" },
        { key: "profit", header: "নিট লাভ", kind: "money" },
        { key: "cogs", header: "COGS", kind: "money" },
      ];
      return {
        target,
        title: "সারাংশ",
        subtitle: buildSubtitle(ctx),
        columns,
        rows: [row],
        kpis: [
          {
            label: "মোট বিক্রি",
            value: `৳ ${row.sales_total.toLocaleString("bn-BD")}`,
            tone: "success",
          },
          {
            label: "মোট খরচ",
            value: `৳ ${row.expense_total.toLocaleString("bn-BD")}`,
            tone: "danger",
          },
          {
            label: "নিট লাভ",
            value: `৳ ${row.profit.toLocaleString("bn-BD")}`,
            tone: row.profit >= 0 ? "primary" : "danger",
          },
          {
            label: "ক্যাশ ব্যালান্স",
            value: `৳ ${row.cash_balance.toLocaleString("bn-BD")}`,
            tone: "warning",
          },
        ],
      };
    }

    case "sales": {
      const rawRows = await ctx.fetchAllRows(
        "/api/reports/sales",
        ctx.range.from,
        ctx.range.to
      );
      const rows = withSerial(rawRows);
      const total = rows.reduce(
        (s: number, r: any) => s + Number(r.totalAmount || 0),
        0
      );
      const voidedCount = rows.filter(
        (r: any) => String(r.status ?? "").toUpperCase() === "VOIDED"
      ).length;
      const columns: ExportColumn[] = [
        { key: "_serial", header: "সিরিয়াল", kind: "number" },
        {
          key: "bill",
          header: "বিল নম্বর",
          kind: "text",
          getValue: billTitle,
        },
        {
          key: "customer",
          header: "গ্রাহক",
          kind: "text",
          getValue: (r) => {
            const name = String(r?.customer?.name ?? "").trim();
            const phone = String(r?.customer?.phone ?? "").trim();
            if (name && phone) return `${name} (${phone})`;
            return name || phone || "—";
          },
        },
        { key: "saleDate", header: "সময়", kind: "datetime" },
        {
          key: "paymentMethod",
          header: "পেমেন্ট",
          kind: "text",
          getValue: (r) => paymentLabel(r?.paymentMethod),
        },
        {
          key: "status",
          header: "অবস্থা",
          kind: "text",
          getValue: (r) =>
            String(r?.status ?? "").toUpperCase() === "VOIDED"
              ? "বাতিল"
              : "সম্পন্ন",
        },
        { key: "totalAmount", header: "মোট টাকা", kind: "money" },
        { key: "note", header: "নোট", kind: "text" },
      ];
      return {
        target,
        title: "বিক্রি",
        subtitle: buildSubtitle(ctx, `${rows.length} টি বিল`),
        columns,
        rows,
        totalRow: {
          _serial: "মোট",
          totalAmount: fmt2(total),
        },
        kpis: [
          {
            label: "বিল সংখ্যা",
            value: rows.length.toLocaleString("bn-BD"),
            tone: "primary",
          },
          {
            label: "মোট বিক্রি",
            value: `৳ ${total.toLocaleString("bn-BD")}`,
            tone: "success",
          },
          ...(voidedCount > 0
            ? [
                {
                  label: "বাতিল বিল",
                  value: voidedCount.toLocaleString("bn-BD"),
                  tone: "danger" as const,
                },
              ]
            : []),
        ],
      };
    }

    case "expenses": {
      const rawRows = await ctx.fetchAllRows(
        "/api/reports/expenses",
        ctx.range.from,
        ctx.range.to
      );
      const rows = withSerial(rawRows);
      const total = rows.reduce(
        (s: number, r: any) => s + Number(r.amount || 0),
        0
      );
      const columns: ExportColumn[] = [
        { key: "_serial", header: "সিরিয়াল", kind: "number" },
        { key: "expenseDate", header: "তারিখ", kind: "date" },
        { key: "category", header: "ক্যাটাগরি", kind: "text" },
        { key: "amount", header: "পরিমাণ", kind: "money" },
        { key: "note", header: "নোট", kind: "text" },
      ];
      return {
        target,
        title: "খরচ",
        subtitle: buildSubtitle(ctx, `${rows.length} টি এন্ট্রি`),
        columns,
        rows,
        totalRow: {
          _serial: "মোট",
          amount: fmt2(total),
        },
        kpis: [
          {
            label: "এন্ট্রি সংখ্যা",
            value: rows.length.toLocaleString("bn-BD"),
            tone: "primary",
          },
          {
            label: "মোট খরচ",
            value: `৳ ${total.toLocaleString("bn-BD")}`,
            tone: "danger",
          },
        ],
      };
    }

    case "cash": {
      const rawRows = await ctx.fetchAllRows(
        "/api/reports/cash",
        ctx.range.from,
        ctx.range.to
      );
      const rows = withSerial(rawRows);
      const totalIn = rows
        .filter((r: any) => (r.entryType || "").toUpperCase() === "IN")
        .reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      const totalOut = rows
        .filter((r: any) => (r.entryType || "").toUpperCase() === "OUT")
        .reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      const columns: ExportColumn[] = [
        { key: "_serial", header: "সিরিয়াল", kind: "number" },
        { key: "createdAt", header: "সময়", kind: "datetime" },
        {
          key: "entryType",
          header: "ধরন",
          kind: "text",
          getValue: (r) => cashEntryLabel(r?.entryType),
        },
        { key: "amount", header: "পরিমাণ", kind: "money" },
        {
          key: "reason",
          header: "কারণ",
          kind: "text",
          getValue: (r) => humanizeCashReason(r?.reason),
        },
      ];
      return {
        target,
        title: "ক্যাশবুক",
        subtitle: buildSubtitle(ctx, `${rows.length} টি এন্ট্রি`),
        columns,
        rows,
        kpis: [
          {
            label: "ক্যাশ ইন",
            value: `৳ ${totalIn.toLocaleString("bn-BD")}`,
            tone: "success",
          },
          {
            label: "ক্যাশ আউট",
            value: `৳ ${totalOut.toLocaleString("bn-BD")}`,
            tone: "danger",
          },
          {
            label: "নিট",
            value: `৳ ${(totalIn - totalOut).toLocaleString("bn-BD")}`,
            tone: totalIn - totalOut >= 0 ? "primary" : "danger",
          },
        ],
      };
    }

    case "payment": {
      const params = new URLSearchParams({ shopId: ctx.shopId, fresh: "1" });
      if (ctx.range.from) params.append("from", ctx.range.from);
      if (ctx.range.to) params.append("to", ctx.range.to);
      const raw = await ctx.fetchReportData("/api/reports/payment-method", params);
      const rawRows: any[] = Array.isArray(raw) ? raw : [];
      const rows = withSerial(rawRows);
      const columns: ExportColumn[] = [
        { key: "_serial", header: "সিরিয়াল", kind: "number" },
        {
          key: "name",
          header: "পেমেন্ট পদ্ধতি",
          kind: "text",
          getValue: (r) => paymentLabel(r?.name),
        },
        { key: "value", header: "মোট টাকা", kind: "money" },
        { key: "count", header: "বিল সংখ্যা", kind: "number" },
      ];
      const totalValue = rows.reduce(
        (s: number, r: any) => s + Number(r.value || 0),
        0
      );
      return {
        target,
        title: "পেমেন্ট পদ্ধতি",
        subtitle: buildSubtitle(ctx, `${rows.length} টি পদ্ধতি`),
        columns,
        rows,
        totalRow: {
          _serial: "মোট",
          value: fmt2(totalValue),
        },
      };
    }

    case "profit": {
      const params = new URLSearchParams({ shopId: ctx.shopId, fresh: "1" });
      if (ctx.range.from) params.append("from", ctx.range.from);
      if (ctx.range.to) params.append("to", ctx.range.to);
      const raw = await ctx.fetchReportData("/api/reports/profit-trend", params);
      const normalized = (Array.isArray(raw) ? raw : []).map((row: any) => ({
        date: row.date,
        sales: fmt2(row.sales),
        cogs: fmt2(row.cogs),
        operating_expense: fmt2(
          row.operatingExpense ??
            Math.max(Number(row.expense ?? 0) - Number(row.cogs ?? 0), 0)
        ),
        gross_profit: fmt2(
          row.grossProfit ?? Number(row.sales ?? 0) - Number(row.cogs ?? 0)
        ),
        net_profit: fmt2(
          row.netProfit ?? Number(row.sales ?? 0) - Number(row.expense ?? 0)
        ),
        net_margin_pct: fmt2(
          row.netMarginPct ??
            (Number(row.sales ?? 0)
              ? ((Number(row.netProfit ?? 0) ||
                  Number(row.sales ?? 0) - Number(row.expense ?? 0)) /
                  Number(row.sales ?? 0)) *
                100
              : 0)
        ),
      }));
      const columns: ExportColumn[] = [
        { key: "date", header: "তারিখ", kind: "date" },
        { key: "sales", header: "বিক্রি", kind: "money" },
        { key: "cogs", header: "COGS", kind: "money" },
        { key: "operating_expense", header: "পরিচালন খরচ", kind: "money" },
        { key: "gross_profit", header: "গ্রস লাভ", kind: "money" },
        { key: "net_profit", header: "নিট লাভ", kind: "money" },
        { key: "net_margin_pct", header: "লাভের হার (%)", kind: "number" },
      ];
      const totals = normalized.reduce(
        (acc, r) => ({
          sales: acc.sales + r.sales,
          cogs: acc.cogs + r.cogs,
          operating_expense: acc.operating_expense + r.operating_expense,
          gross_profit: acc.gross_profit + r.gross_profit,
          net_profit: acc.net_profit + r.net_profit,
        }),
        { sales: 0, cogs: 0, operating_expense: 0, gross_profit: 0, net_profit: 0 }
      );
      return {
        target,
        title: "লাভ-ক্ষতির ট্রেন্ড",
        subtitle: buildSubtitle(ctx, `${normalized.length} দিন`),
        columns,
        rows: normalized,
        totalRow: {
          date: "মোট",
          sales: fmt2(totals.sales),
          cogs: fmt2(totals.cogs),
          operating_expense: fmt2(totals.operating_expense),
          gross_profit: fmt2(totals.gross_profit),
          net_profit: fmt2(totals.net_profit),
        },
      };
    }

    case "products": {
      const params = new URLSearchParams({
        shopId: ctx.shopId,
        limit: "500",
        fresh: "1",
      });
      if (ctx.range.from) params.append("from", ctx.range.from);
      if (ctx.range.to) params.append("to", ctx.range.to);
      const raw = await ctx.fetchReportData("/api/reports/top-products", params);
      const rawRows: any[] = Array.isArray(raw) ? raw : [];
      const rows = withSerial(rawRows);
      const columns: ExportColumn[] = [
        { key: "_serial", header: "সিরিয়াল", kind: "number" },
        { key: "name", header: "পণ্য", kind: "text" },
        { key: "qty", header: "পরিমাণ বিক্রি", kind: "number" },
        { key: "revenue", header: "আয়", kind: "money" },
      ];
      return {
        target,
        title: "টপ পণ্য",
        subtitle: buildSubtitle(ctx, `${rows.length} টি পণ্য`),
        columns,
        rows,
      };
    }

    case "stock": {
      const params = new URLSearchParams({
        shopId: ctx.shopId,
        limit: "500",
        threshold: String(ctx.lowStockThreshold),
        fresh: "1",
      });
      const raw = await ctx.fetchReportData("/api/reports/low-stock", params);
      const rawRows: any[] = Array.isArray(raw) ? raw : [];
      const rows = withSerial(rawRows);
      const columns: ExportColumn[] = [
        { key: "_serial", header: "সিরিয়াল", kind: "number" },
        { key: "name", header: "পণ্য", kind: "text" },
        { key: "stockQty", header: "বর্তমান মজুদ", kind: "number" },
      ];
      return {
        target,
        title: "লো স্টক",
        subtitle: `থ্রেশহোল্ড ${ctx.lowStockThreshold}  ·  ${rows.length} টি পণ্য`,
        columns,
        rows,
      };
    }

    case "valuation": {
      const params = new URLSearchParams({
        shopId: ctx.shopId,
        limit: "500",
      });
      const payload = await ctx.fetchReportData(
        "/api/reports/stock-valuation",
        params
      );
      const rawRows: any[] = Array.isArray(payload?.rows) ? payload.rows : [];
      const rows = withSerial(rawRows);
      const columns: ExportColumn[] = [
        { key: "_serial", header: "সিরিয়াল", kind: "number" },
        { key: "name", header: "পণ্য", kind: "text" },
        { key: "category", header: "ক্যাটাগরি", kind: "text" },
        { key: "unit", header: "ইউনিট", kind: "text" },
        { key: "qty", header: "মজুদ", kind: "number" },
        { key: "buyPrice", header: "ক্রয় মূল্য", kind: "money" },
        { key: "sellPrice", header: "বিক্রয় মূল্য", kind: "money" },
        { key: "costValue", header: "মোট ক্রয় মূল্য", kind: "money" },
        { key: "retailValue", header: "মোট বিক্রয় মূল্য", kind: "money" },
      ];
      const totalCost = rows.reduce(
        (s: number, r: any) => s + Number(r.costValue || 0),
        0
      );
      const totalRetail = rows.reduce(
        (s: number, r: any) => s + Number(r.retailValue || 0),
        0
      );
      return {
        target,
        title: "স্টক মূল্য",
        subtitle: buildSubtitle(ctx, `${rows.length} টি পণ্য`),
        columns,
        rows,
        totalRow: {
          _serial: "মোট",
          costValue: fmt2(totalCost),
          retailValue: fmt2(totalRetail),
        },
        kpis: [
          {
            label: "মোট ক্রয় মূল্য",
            value: `৳ ${totalCost.toLocaleString("bn-BD")}`,
            tone: "warning",
          },
          {
            label: "মোট বিক্রয় মূল্য",
            value: `৳ ${totalRetail.toLocaleString("bn-BD")}`,
            tone: "success",
          },
        ],
      };
    }

    default:
      return {
        target,
        title: target,
        columns: [],
        rows: [],
      };
  }
}
