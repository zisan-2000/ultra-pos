export const REPORTS_CACHE_TAGS = {
  summary: "reports:summary",
  salesSummary: "reports:sales-summary",
  expenseSummary: "reports:expense-summary",
  cashSummary: "reports:cash-summary",
  profitSummary: "reports:profit-summary",
  paymentMethod: "reports:payment-method",
  profitTrend: "reports:profit-trend",
  topProducts: "reports:top-products",
  lowStock: "reports:low-stock",
  todaySummary: "reports:today-summary",
} as const;

export const REPORTS_TAG_GROUPS = {
  sales: [
    REPORTS_CACHE_TAGS.summary,
    REPORTS_CACHE_TAGS.salesSummary,
    REPORTS_CACHE_TAGS.cashSummary,
    REPORTS_CACHE_TAGS.profitSummary,
    REPORTS_CACHE_TAGS.paymentMethod,
    REPORTS_CACHE_TAGS.profitTrend,
    REPORTS_CACHE_TAGS.topProducts,
    REPORTS_CACHE_TAGS.lowStock,
    REPORTS_CACHE_TAGS.todaySummary,
  ],
  expenses: [
    REPORTS_CACHE_TAGS.summary,
    REPORTS_CACHE_TAGS.expenseSummary,
    REPORTS_CACHE_TAGS.cashSummary,
    REPORTS_CACHE_TAGS.profitSummary,
    REPORTS_CACHE_TAGS.profitTrend,
    REPORTS_CACHE_TAGS.todaySummary,
  ],
  cash: [
    REPORTS_CACHE_TAGS.summary,
    REPORTS_CACHE_TAGS.cashSummary,
    REPORTS_CACHE_TAGS.profitSummary,
    REPORTS_CACHE_TAGS.todaySummary,
  ],
  products: [
    REPORTS_CACHE_TAGS.lowStock,
    REPORTS_CACHE_TAGS.topProducts,
  ],
} as const;
