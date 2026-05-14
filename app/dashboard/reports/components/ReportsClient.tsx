// app/dashboard/reports/components/ReportsClient.tsx

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ShopSelectorClient from "../ShopSelectorClient";
import { SummaryCards, SummaryCardsSkeleton, type DrillTab } from "./SummaryCards";
import { ReportsExportDialog } from "./ReportsExportDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import RefreshIconButton from "@/components/ui/refresh-icon-button";
import { showSuccessToast, showErrorToast, showInfoToast } from "@/components/ui/action-toast";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { useSyncStatus } from "@/lib/sync/sync-status";
import {
  computeRange,
  computePresetRange,
  getDateRangeSpanDays,
  type RangePreset,
} from "@/lib/reporting-range";
import { REPORT_MAX_RANGE_DAYS, REPORT_ROW_LIMIT } from "@/lib/reporting-config";
import { scheduleIdle } from "@/lib/schedule-idle";
import { handlePermissionError } from "@/lib/permission-toast";
import { reportEvents } from "@/lib/events/reportEvents";
import { useSmartPolling, type SmartPollingReason } from "@/lib/polling/use-smart-polling";
import { usePageVisibility } from "@/lib/use-page-visibility";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";
import { generateCSV } from "@/lib/utils/csv";
import { downloadFile } from "@/lib/utils/download";
import { buildDataset } from "@/lib/exports/dataset-builder";
import type {
  ExportDataset,
  ExportFormat,
  ExportMeta,
} from "@/lib/exports/types";

type Summary = {
  sales: {
    totalAmount: number;
    discountAmount?: number;
    taxAmount?: number;
    completedCount?: number;
    voidedCount?: number;
    count?: number;
  };
  expense: { totalAmount: number; count?: number };
  cash: { balance: number; totalIn: number; totalOut: number };
  profit: {
    profit: number;
    salesTotal: number;
    expenseTotal: number;
    cogs?: number;
  };
};

type Props = {
  shopId: string;
  shopName: string;
  shops: { id: string; name: string }[];
  needsCogs?: boolean;
  summary: Summary;
  summaryRange: { from: string; to: string };
  /** Same-shape summary for the immediately-preceding period, used to compute deltas. */
  previousSummary?: Summary | null;
  previousRange?: { from: string; to: string } | null;
};

function ReportSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-4 w-28 rounded bg-muted" />
      <div className="h-3 w-44 rounded bg-muted" />
      <div className="h-40 w-full rounded bg-muted" />
    </div>
  );
}


const SalesReport = dynamic(() => import("./SalesReport"), {
  loading: () => <ReportSkeleton />,
});
const ExpenseReport = dynamic(() => import("./ExpenseReport"), {
  loading: () => <ReportSkeleton />,
});
const CashbookReport = dynamic(() => import("./CashbookReport"), {
  loading: () => <ReportSkeleton />,
});
const ProfitTrendReport = dynamic(() => import("./ProfitTrendReport"), {
  loading: () => <ReportSkeleton />,
});
const PaymentMethodReport = dynamic(() => import("./PaymentMethodReport"), {
  loading: () => <ReportSkeleton />,
});
const TopProductsReport = dynamic(() => import("./TopProductsReport"), {
  loading: () => <ReportSkeleton />,
});
const LowStockReport = dynamic(() => import("./LowStockReport"), {
  loading: () => <ReportSkeleton />,
});
const StockValuationReport = dynamic(() => import("./StockValuationReport"), {
  loading: () => <ReportSkeleton />,
});

type ReportKey = (typeof NAV)[number]["key"];

const prefetchReportModule = (key: ReportKey) => {
  switch (key) {
    case "sales":
      return import("./SalesReport");
    case "expenses":
      return import("./ExpenseReport");
    case "cash":
      return import("./CashbookReport");
    case "payment":
      return import("./PaymentMethodReport");
    case "profit":
      return import("./ProfitTrendReport");
    case "products":
      return import("./TopProductsReport");
    case "stock":
      return import("./LowStockReport");
    case "valuation":
      return import("./StockValuationReport");
    default:
      return Promise.resolve();
  }
};

const PREFETCH_REPORTS_BY_TAB: Record<ReportKey, ReportKey[]> = {
  summary: ["sales", "expenses"],
  sales: ["expenses", "cash"],
  expenses: ["sales", "cash"],
  cash: ["payment", "profit"],
  payment: ["profit"],
  profit: ["payment", "products"],
  products: ["stock"],
  stock: ["valuation"],
  valuation: [],
};

const PREFETCH_REPORT_DATA_BY_TAB: Record<ReportKey, ReportKey[]> = {
  summary: [],
  sales: ["expenses"],
  expenses: ["sales"],
  cash: ["payment"],
  payment: [],
  profit: [],
  products: [],
  stock: [],
  valuation: [],
};

const NAV = [
  { key: "summary", label: "সারাংশ" },
  { key: "sales", label: "বিক্রি" },
  { key: "expenses", label: "খরচ" },
  { key: "cash", label: "ক্যাশ" },
  { key: "payment", label: "পেমেন্ট" },
  { key: "profit", label: "লাভ" },
  { key: "products", label: "পণ্য" },
  { key: "stock", label: "লো স্টক" },
  { key: "valuation", label: "স্টক মূল্য" },
] as const;

const MOBILE_PRIMARY_REPORT_KEYS = [
  "summary",
  "sales",
  "expenses",
  "cash",
  "profit",
  "valuation",
] as const satisfies ReportKey[];

const MOBILE_SECONDARY_REPORT_KEYS = NAV.map((item) => item.key).filter(
  (key): key is ReportKey =>
    !MOBILE_PRIMARY_REPORT_KEYS.includes(
      key as (typeof MOBILE_PRIMARY_REPORT_KEYS)[number]
    )
);

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: "today", label: "আজ" },
  { key: "yesterday", label: "গতকাল" },
  { key: "7d", label: "৭ দিন" },
  { key: "month", label: "এই মাস" },
  { key: "custom", label: "কাস্টম" },
];

const EXPORT_PAGE_LIMIT = REPORT_ROW_LIMIT;
const EXPORT_MAX_PAGES = 250;
const EXPORT_MAX_ROWS = 5000;
const EXPORT_LOW_STOCK_THRESHOLD = 20;
const SUMMARY_FRESH_MIN_INTERVAL_MS = 8000;
const SUMMARY_PREFETCH_PRESETS: Array<Exclude<RangePreset, "custom">> = [
  "today",
  "yesterday",
  "7d",
  "month",
];

type ExportCursor = { at: string; id: string };

const EXPORT_HISTORY_LIMIT = 5;
const buildExportHistoryKey = (shopId: string) =>
  `reports:export-history:${shopId}`;

const EXPORT_TARGET_LABELS: Record<string, string> = {
  summary: "সারাংশ",
  sales: "বিক্রি",
  expenses: "খরচ",
  cash: "ক্যাশ",
  payment: "পেমেন্ট পদ্ধতি",
  profit: "লাভ-ক্ষতি",
  products: "টপ পণ্য",
  stock: "লো স্টক",
  valuation: "স্টক মূল্য",
};

const EXPORT_FILENAME_STEMS: Record<string, string> = {
  summary: "summary",
  sales: "sales",
  expenses: "expenses",
  cash: "cashbook",
  payment: "payment-method",
  profit: "profit-trend",
  products: "top-products",
  stock: "low-stock",
  valuation: "stock-valuation",
};

type ExportTarget =
  | "summary"
  | "sales"
  | "expenses"
  | "cash"
  | "payment"
  | "profit"
  | "products"
  | "stock"
  | "valuation";

type ExportKey = ExportTarget | "active" | "all";

function buildExportSuffix(rangeFrom?: string, rangeTo?: string) {
  if (rangeFrom && rangeTo) {
    return rangeFrom === rangeTo
      ? rangeFrom
      : `${rangeFrom}_to_${rangeTo}`;
  }
  return rangeFrom ?? rangeTo ?? "all";
}

function isSummaryPayload(value: unknown): value is Summary {
  if (!value || typeof value !== "object") return false;
  const payload = value as Summary;
  return (
    typeof payload.sales?.totalAmount === "number" &&
    typeof payload.expense?.totalAmount === "number" &&
    typeof payload.cash?.balance === "number" &&
    typeof payload.cash?.totalIn === "number" &&
    typeof payload.cash?.totalOut === "number" &&
    typeof payload.profit?.profit === "number" &&
    typeof payload.profit?.salesTotal === "number" &&
    typeof payload.profit?.expenseTotal === "number"
  );
}

export default function ReportsClient({
  shopId,
  shopName,
  shops,
  needsCogs = false,
  summary,
  summaryRange,
  previousSummary = null,
  previousRange = null,
}: Props) {
  const online = useOnlineStatus();
  const isVisible = usePageVisibility();
  const queryClient = useQueryClient();
  const { pendingCount, syncing, lastSyncAt } = useSyncStatus();

  const [active, setActive] = useState<(typeof NAV)[number]["key"]>("summary");
  const [preset, setPreset] = useState<RangePreset>("today");
  const [customFrom, setCustomFrom] = useState<string | undefined>(undefined);
  const [customTo, setCustomTo] = useState<string | undefined>(undefined);
  const [realTimeIndicator, setRealTimeIndicator] = useState(false);
  const [lowStockThreshold, setLowStockThreshold] = useState(
    EXPORT_LOW_STOCK_THRESHOLD
  );
  const [mobileReportPickerOpen, setMobileReportPickerOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportingKey, setExportingKey] = useState<ExportKey | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportProgress, setExportProgress] = useState<
    Partial<Record<ExportTarget, "pending" | "in-progress" | "done" | "error">>
  >({});
  const [exportHistory, setExportHistory] = useState<
    Array<{ at: number; label: string; filename: string; rows: number }>
  >([]);

  // Hydrate export history from localStorage on mount (per-shop).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = safeLocalStorageGet(buildExportHistoryKey(shopId));
    if (!raw) {
      setExportHistory([]);
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setExportHistory(
          parsed
            .filter(
              (item) =>
                item &&
                typeof item.filename === "string" &&
                typeof item.at === "number"
            )
            .slice(0, EXPORT_HISTORY_LIMIT)
        );
      }
    } catch {
      setExportHistory([]);
    }
  }, [shopId]);
  const lastSummaryFreshAtRef = useRef(0);
  const summaryFreshInFlightRef = useRef<Promise<void> | null>(null);
  const lastRangeKeyRef = useRef<string | null>(null);
  const indicatorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const customRangeValidation = useMemo(() => {
    if (preset !== "custom") {
      return { isValid: true, message: null as string | null };
    }
    if (!customFrom || !customTo) {
      return {
        isValid: false,
        message: `শুরুর ও শেষের তারিখ দিন (সর্বোচ্চ ${REPORT_MAX_RANGE_DAYS} দিন)।`,
      };
    }
    if (customFrom > customTo) {
      return {
        isValid: false,
        message: "শুরুর তারিখ শেষের তারিখের আগে হতে হবে।",
      };
    }
    const span = getDateRangeSpanDays(customFrom, customTo);
    if (!span) {
      return {
        isValid: false,
        message: "সঠিক তারিখ দিন (YYYY-MM-DD)।",
      };
    }
    if (span > REPORT_MAX_RANGE_DAYS) {
      return {
        isValid: false,
        message: `সর্বোচ্চ ${REPORT_MAX_RANGE_DAYS} দিনের রেঞ্জ নির্বাচন করুন।`,
      };
    }
    return {
      isValid: true,
      message: `রেঞ্জ: ${span} দিন (সর্বোচ্চ ${REPORT_MAX_RANGE_DAYS} দিন)।`,
    };
  }, [preset, customFrom, customTo]);
  const effectiveCustomFrom =
    preset === "custom" && !customRangeValidation.isValid ? undefined : customFrom;
  const effectiveCustomTo =
    preset === "custom" && !customRangeValidation.isValid ? undefined : customTo;
  
  // Auto-sync on real-time events
  useEffect(() => {
    const syncListener = reportEvents.addListener(
      'sync-complete',
      async (event) => {
        if (event.shopId === shopId) {
          if (!isSummaryPayload(event.data)) return;
          // Refresh query data with latest from server
          queryClient.setQueryData(
            ["reports", "summary", shopId, "all", "all"],
            event.data
          );
        }
      },
      { shopId, priority: 5 }
    );
    
    return () => {
      reportEvents.removeListener(syncListener);
    };
  }, [shopId, queryClient]);
  
  // Performance monitoring
  useEffect(() => {
    const metricsListener = reportEvents.addListener(
      'metrics-updated',
      (event) => {
        if (event.shopId === shopId) {
          if (process.env.NODE_ENV !== "production") {
            console.debug('Real-time Reports Metrics:', event.data);
          }
        }
      },
      { shopId, priority: 1 }
    );
    
    return () => {
      reportEvents.removeListener(metricsListener);
    };
  }, [shopId]);
  const range = useMemo(
    () => computeRange(preset, effectiveCustomFrom, effectiveCustomTo),
    [preset, effectiveCustomFrom, effectiveCustomTo]
  );
  const rangeKey = useMemo(
    () => `${shopId}:${range.from ?? "all"}:${range.to ?? "all"}`,
    [shopId, range.from, range.to]
  );
  const serverRangeKey = useMemo(
    () =>
      `${shopId}:${summaryRange.from ?? "all"}:${summaryRange.to ?? "all"}`,
    [shopId, summaryRange.from, summaryRange.to]
  );
  const isServerRange = rangeKey === serverRangeKey;

  // Period-over-period comparison is only valid when the client range
  // matches the server-provided range. When the user switches preset
  // client-side, the previous-period server fetch becomes stale and we
  // hide deltas until they navigate back or reload.
  const comparisonSummary = isServerRange ? previousSummary : null;
  const comparisonLabel = useMemo(() => {
    if (!isServerRange || !previousRange) return null;
    const span = getDateRangeSpanDays(previousRange.from, previousRange.to);
    if (!span) return null;
    if (span === 1) return "আগের দিনের তুলনায়";
    return `আগের ${span.toLocaleString("bn-BD")} দিনের তুলনায়`;
  }, [isServerRange, previousRange]);

  const handleSelectTab = useCallback(
    (tab: DrillTab) => {
      setActive(tab as (typeof NAV)[number]["key"]);
    },
    []
  );

  const presetLabel = useMemo(
    () => PRESETS.find((item) => item.key === preset)?.label ?? "",
    [preset]
  );
  const activeReportLabel = useMemo(
    () => NAV.find((item) => item.key === active)?.label ?? "রিপোর্ট",
    [active]
  );

  const handleClearExportHistory = useCallback(() => {
    setExportHistory([]);
    if (typeof window !== "undefined") {
      try {
        safeLocalStorageSet(buildExportHistoryKey(shopId), "[]");
      } catch {
        // ignore storage errors
      }
    }
  }, [shopId]);
  const mobilePrimaryReports = useMemo(
    () =>
      MOBILE_PRIMARY_REPORT_KEYS.map((key) =>
        NAV.find((item) => item.key === key)
      ).filter((item): item is (typeof NAV)[number] => Boolean(item)),
    []
  );
  const mobileSecondaryReports = useMemo(
    () =>
      MOBILE_SECONDARY_REPORT_KEYS.map((key) =>
        NAV.find((item) => item.key === key)
      ).filter((item): item is (typeof NAV)[number] => Boolean(item)),
    []
  );
  const exportSuffix = useMemo(
    () => buildExportSuffix(range.from, range.to),
    [range.from, range.to]
  );
  const rangeLabel = useMemo(() => {
    if (range.from && range.to) {
      return range.from === range.to ? range.from : `${range.from} - ${range.to}`;
    }
    return range.from ?? range.to ?? null;
  }, [range.from, range.to]);

  const rangeKeyFrom = range.from ?? "all";
  const rangeKeyTo = range.to ?? "all";

  const buildSummaryKey = useCallback(
    (rangeFrom?: string, rangeTo?: string) =>
      `reports:summary:${shopId}:${rangeFrom || "all"}:${rangeTo || "all"}`,
    [shopId]
  );

  
  const readCachedSummary = useCallback(
    (rangeFrom?: string, rangeTo?: string) => {
      if (typeof window === "undefined") return null;
      const key = buildSummaryKey(rangeFrom, rangeTo);
      try {
        const raw = safeLocalStorageGet(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Summary;
        return parsed && parsed.sales ? parsed : null;
      } catch (err) {
        handlePermissionError(err);
        console.warn("Summary cache read failed", err);
        return null;
      }
    },
    [buildSummaryKey]
  );

  const initialSummaryData = useMemo(() => {
    if (isServerRange) return summary;
    return readCachedSummary(range.from, range.to) ?? undefined;
  }, [isServerRange, summary, range.from, range.to, readCachedSummary]);
  const hasInitialSummary = initialSummaryData !== undefined;
  const shouldForceFresh = lastRangeKeyRef.current !== rangeKey;

  const fetchSummary = useCallback(
    async (rangeFrom?: string, rangeTo?: string, fresh = false) => {
      const params = new URLSearchParams({ shopId });
      if (rangeFrom) params.append("from", rangeFrom);
      if (rangeTo) params.append("to", rangeTo);
      if (fresh) params.append("fresh", "1");
      const res = await fetch(`/api/reports/summary?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const cached = readCachedSummary(rangeFrom, rangeTo);
        if (cached) return cached;
        throw new Error("Summary fetch failed");
      }
      const json = (await res.json()) as Summary;
      if (typeof window !== "undefined") {
        const key = buildSummaryKey(rangeFrom, rangeTo);
        try {
          safeLocalStorageSet(key, JSON.stringify(json));
        } catch (err) {
          handlePermissionError(err);
          console.warn("Summary cache write failed", err);
        }
      }
      return json;
    },
    [shopId, buildSummaryKey, readCachedSummary]
  );

  const summaryQueryKey = useMemo(
    () => ["reports", "summary", shopId, range.from ?? "all", range.to ?? "all"],
    [shopId, range.from, range.to]
  );

  const summaryQuery = useQuery({
    queryKey: summaryQueryKey,
    queryFn: () => fetchSummary(range.from, range.to, shouldForceFresh),
    enabled: online,
    ...(hasInitialSummary ? { initialData: initialSummaryData } : {}),
    ...(hasInitialSummary ? { placeholderData: initialSummaryData } : {}),
    refetchOnMount: "always",
    staleTime: 0,
  });

  const liveSummary = summaryQuery.data ?? initialSummaryData;

  // Best-effort row counts surfaced in the export dialog. We only know counts
  // for the three reports whose summary already carries a count — for the
  // others we show "—" rather than blocking the user with a pre-fetch.
  const exportRowCounts = useMemo<
    Partial<Record<ExportTarget, number | null>>
  >(() => {
    const salesCount =
      (liveSummary?.sales.completedCount ?? 0) +
      (liveSummary?.sales.voidedCount ?? 0);
    return {
      summary: 1,
      sales: liveSummary ? salesCount : null,
      expenses: liveSummary ? (liveSummary.expense.count ?? 0) : null,
      cash: null,
      payment: null,
      profit: null,
      products: null,
      stock: null,
      valuation: null,
    };
  }, [liveSummary]);
  const hasSummary = Boolean(liveSummary);
  const summaryLoading = summaryQuery.isFetching && online && hasSummary;
  const summarySnapshot = hasSummary
    ? `৳ ${Math.round(liveSummary!.sales.totalAmount).toLocaleString("bn-BD")} বিক্রি · লাভ ৳ ${Math.round(liveSummary!.profit.profit).toLocaleString("bn-BD")}`
    : "রিপোর্ট লোড হচ্ছে...";

  // Hero metric switches with the active tab so the headline number always
  // matches what the user is currently looking at. Falls back to total sales
  // for tabs that don't have a single canonical headline value.
  const heroMetric = useMemo<{
    label: string;
    value: string;
    hint: string;
  }>(() => {
    const fmt = (n: number) =>
      `৳ ${Math.round(n).toLocaleString("bn-BD")}`;
    if (!hasSummary) {
      return {
        label: "রিপোর্ট",
        value: "—",
        hint: shopName,
      };
    }
    const s = liveSummary!;
    switch (active) {
      case "expenses":
        return {
          label: "মোট খরচ",
          value: fmt(s.expense.totalAmount),
          hint: `${s.expense.count ?? 0} টি এন্ট্রি`,
        };
      case "cash":
        return {
          label: "ক্যাশ ব্যালেন্স",
          value: fmt(s.cash.balance),
          hint: `ইন ${fmt(s.cash.totalIn)} · আউট ${fmt(s.cash.totalOut)}`,
        };
      case "profit":
        return {
          label: "নিট লাভ",
          value: fmt(s.profit.profit),
          hint: `বিক্রি ${fmt(s.profit.salesTotal)} · খরচ ${fmt(s.profit.expenseTotal)}`,
        };
      case "valuation":
        // Stock valuation has its own KPIs in the sub-report; show total sales
        // in the hero so range context still makes sense.
        return {
          label: "মোট বিক্রি (এই সময়ে)",
          value: fmt(s.sales.totalAmount),
          hint: shopName,
        };
      case "stock":
        return {
          label: "লো স্টক",
          value: "নিচে দেখুন",
          hint: `সীমার নিচের পণ্যগুলো`,
        };
      case "products":
        return {
          label: "মোট বিক্রি",
          value: fmt(s.sales.totalAmount),
          hint: `${s.sales.completedCount ?? 0} টি বিল`,
        };
      case "payment":
        return {
          label: "মোট বিক্রি",
          value: fmt(s.sales.totalAmount),
          hint: "পদ্ধতিভিত্তিক ভাগ নিচে",
        };
      case "sales":
      case "summary":
      default:
        return {
          label: "মোট বিক্রি",
          value: fmt(s.sales.totalAmount),
          hint: `${s.sales.completedCount ?? 0} টি বিল · ${shopName}`,
        };
    }
  }, [active, hasSummary, liveSummary, shopName]);

  const refreshSummaryFresh = useCallback(async (force = false) => {
    if (!online) return;
    const now = Date.now();
    if (!force && now - lastSummaryFreshAtRef.current < SUMMARY_FRESH_MIN_INTERVAL_MS) {
      return;
    }
    if (summaryFreshInFlightRef.current) {
      return summaryFreshInFlightRef.current;
    }
    const refreshTask = (async () => {
      try {
        const freshData = await fetchSummary(range.from, range.to, true);
        if (freshData) {
          queryClient.setQueryData(summaryQueryKey, freshData);
        }
        lastSummaryFreshAtRef.current = Date.now();
      } catch (err) {
        handlePermissionError(err);
      }
    })();
    summaryFreshInFlightRef.current = refreshTask;
    try {
      await refreshTask;
    } finally {
      summaryFreshInFlightRef.current = null;
    }
  }, [online, fetchSummary, range.from, range.to, queryClient, summaryQueryKey]);

  const invalidateSales = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["reports", "sales", shopId, rangeKeyFrom, rangeKeyTo],
    });
  }, [queryClient, shopId, rangeKeyFrom, rangeKeyTo]);

  const invalidateExpenses = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["reports", "expenses", shopId, rangeKeyFrom, rangeKeyTo],
    });
  }, [queryClient, shopId, rangeKeyFrom, rangeKeyTo]);

  const invalidateCash = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["reports", "cash", shopId, rangeKeyFrom, rangeKeyTo],
    });
  }, [queryClient, shopId, rangeKeyFrom, rangeKeyTo]);

  const invalidatePayment = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["reports", "payment", shopId, rangeKeyFrom, rangeKeyTo],
    });
  }, [queryClient, shopId, rangeKeyFrom, rangeKeyTo]);

  const invalidateProfit = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["reports", "profit", shopId, rangeKeyFrom, rangeKeyTo],
    });
  }, [queryClient, shopId, rangeKeyFrom, rangeKeyTo]);

  const invalidateTopProducts = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: [
        "reports",
        "top-products",
        shopId,
        rangeKeyFrom,
        rangeKeyTo,
        REPORT_ROW_LIMIT,
      ],
    });
  }, [queryClient, shopId, rangeKeyFrom, rangeKeyTo]);

  const invalidateLowStock = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["reports", "low-stock", shopId],
    });
  }, [queryClient, shopId]);

  const invalidateValuation = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["reports", "stock-valuation", shopId, REPORT_ROW_LIMIT],
    });
  }, [queryClient, shopId]);

  const invalidateActiveReport = useCallback(() => {
    switch (active) {
      case "sales":
        invalidateSales();
        break;
      case "expenses":
        invalidateExpenses();
        break;
      case "cash":
        invalidateCash();
        break;
      case "payment":
        invalidatePayment();
        break;
      case "profit":
        invalidateProfit();
        break;
      case "products":
        invalidateTopProducts();
        break;
      case "stock":
        invalidateLowStock();
        break;
      case "valuation":
        invalidateValuation();
        break;
      default:
        break;
    }
  }, [
    active,
    invalidateSales,
    invalidateExpenses,
    invalidateCash,
    invalidatePayment,
    invalidateProfit,
    invalidateTopProducts,
    invalidateLowStock,
    invalidateValuation,
  ]);

  const handleSmartRefresh = useCallback(
    (reason: SmartPollingReason) => {
      const force =
        reason === "sync" || reason === "focus" || reason === "reconnect";
      refreshSummaryFresh(force);
      invalidateActiveReport();
    },
    [refreshSummaryFresh, invalidateActiveReport]
  );

  const { triggerRefresh } = useSmartPolling({
    profile: "reports",
    enabled: Boolean(shopId),
    online,
    isVisible,
    blocked: syncing || pendingCount > 0,
    syncToken: lastSyncAt,
    onRefresh: handleSmartRefresh,
  });

  const handleManualRefresh = useCallback(() => {
    triggerRefresh("manual", { force: true });
  }, [triggerRefresh]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mutationKey = `reports-last-mutation:${shopId}`;
    const refreshKey = `reports-last-refresh:${shopId}`;
    const lastMutation = Number(
      safeLocalStorageGet(mutationKey) || "0"
    );
    if (!lastMutation) return;
    const lastRefresh = Number(
      safeLocalStorageGet(refreshKey) || "0"
    );
    if (lastMutation <= lastRefresh) return;
    if (Date.now() - lastMutation > 2 * 60 * 1000) return;

    refreshSummaryFresh(true);
    invalidateSales();
    invalidateExpenses();
    invalidateCash();
    invalidatePayment();
    invalidateProfit();
    invalidateTopProducts();
    invalidateLowStock();
    invalidateValuation();

    try {
      safeLocalStorageSet(refreshKey, String(Date.now()));
    } catch {
      // ignore storage failures
    }
  }, [
    shopId,
    refreshSummaryFresh,
    invalidateSales,
    invalidateExpenses,
    invalidateCash,
    invalidatePayment,
    invalidateProfit,
    invalidateTopProducts,
    invalidateLowStock,
    invalidateValuation,
  ]);

  // Real-time event listeners
  useEffect(() => {
    const handleIndicator = () => {
      setRealTimeIndicator(true);
      if (indicatorTimeoutRef.current) {
        clearTimeout(indicatorTimeoutRef.current);
      }
      indicatorTimeoutRef.current = setTimeout(() => {
        setRealTimeIndicator(false);
      }, 1000);
    };

    const saleUpdateListener = reportEvents.addListener(
      "sale-update",
      (event) => {
        if (event.shopId !== shopId) return;
        handleIndicator();
        if (!triggerRefresh("event", { at: event.timestamp ?? Date.now() })) {
          return;
        }
        invalidateSales();
        invalidateProfit();
        invalidatePayment();
        invalidateTopProducts();
        invalidateValuation();
      },
      { shopId, priority: 10 }
    );

    const expenseUpdateListener = reportEvents.addListener(
      "expense-update",
      (event) => {
        if (event.shopId !== shopId) return;
        handleIndicator();
        if (!triggerRefresh("event", { at: event.timestamp ?? Date.now() })) {
          return;
        }
        invalidateExpenses();
        invalidateProfit();
      },
      { shopId, priority: 10 }
    );

    const cashUpdateListener = reportEvents.addListener(
      "cash-update",
      (event) => {
        if (event.shopId !== shopId) return;
        handleIndicator();
        if (!triggerRefresh("event", { at: event.timestamp ?? Date.now() })) {
          return;
        }
        invalidateCash();
      },
      { shopId, priority: 10 }
    );

    return () => {
      reportEvents.removeListener(saleUpdateListener);
      reportEvents.removeListener(expenseUpdateListener);
      reportEvents.removeListener(cashUpdateListener);
      if (indicatorTimeoutRef.current) {
        clearTimeout(indicatorTimeoutRef.current);
        indicatorTimeoutRef.current = null;
      }
    };
  }, [
    shopId,
    refreshSummaryFresh,
    invalidateSales,
    invalidateExpenses,
    invalidateCash,
    invalidateProfit,
    invalidatePayment,
    invalidateTopProducts,
    invalidateValuation,
    triggerRefresh,
  ]);

  useEffect(() => {
    if (!online || typeof window === "undefined") return;
    const connection = (navigator as any)?.connection;
    if (connection?.saveData) return;
    if (["slow-2g", "2g"].includes(connection?.effectiveType)) return;
    const cancel = scheduleIdle(() => {
      SUMMARY_PREFETCH_PRESETS.forEach((presetKey) => {
        const { from, to } = computePresetRange(presetKey);
        const queryKey = [
          "reports",
          "summary",
          shopId,
          from ?? "all",
          to ?? "all",
        ];
        if (queryClient.getQueryData(queryKey)) return;
        queryClient.prefetchQuery({
          queryKey,
          queryFn: () => fetchSummary(from, to),
        });
      });
    }, 50);
    return () => cancel();
  }, [online, shopId, fetchSummary, queryClient]);

  useEffect(() => {
    lastRangeKeyRef.current = rangeKey;
  }, [rangeKey]);

  useEffect(() => {
    if (!online) return;
    const connection = (navigator as any)?.connection;
    if (connection?.saveData) return;
    if (["slow-2g", "2g"].includes(connection?.effectiveType)) return;

    const dataTargets = (PREFETCH_REPORT_DATA_BY_TAB[active] ?? []).slice(0, 1);
    if (dataTargets.length === 0) return;

    const rangeFrom = range.from ?? "all";
    const rangeTo = range.to ?? "all";
    const salesKey = [
      "reports",
      "sales",
      shopId,
      rangeFrom,
      rangeTo,
      1,
      "start",
      "start",
    ];
    const expensesKey = [
      "reports",
      "expenses",
      shopId,
      rangeFrom,
      rangeTo,
      1,
      "start",
      "start",
    ];
    const cashKey = [
      "reports",
      "cash",
      shopId,
      rangeFrom,
      rangeTo,
      1,
      "start",
      "start",
    ];
    const paymentKey = ["reports", "payment", shopId, rangeFrom, rangeTo];
    const profitKey = ["reports", "profit", shopId, rangeFrom, rangeTo];
    const topProductsKey = [
      "reports",
      "top-products",
      shopId,
      range.from ?? "all",
      range.to ?? "all",
      REPORT_ROW_LIMIT,
    ];
    const lowStockKey = [
      "reports",
      "low-stock",
      shopId,
      lowStockThreshold,
      REPORT_ROW_LIMIT,
    ];

    const cancel = scheduleIdle(() => {
      const tasks: Promise<unknown>[] = [];

      if (dataTargets.includes("sales") && !queryClient.getQueryData(salesKey)) {
        tasks.push(
          queryClient
            .prefetchQuery({
              queryKey: salesKey,
              queryFn: async () => {
                const params = new URLSearchParams({
                  shopId,
                  limit: `${REPORT_ROW_LIMIT}`,
                });
                if (range.from) params.append("from", range.from);
                if (range.to) params.append("to", range.to);
                const res = await fetch(
                  `/api/reports/sales?${params.toString()}`,
                  { cache: "no-store" }
                );
                if (!res.ok) throw new Error("Sales prefetch failed");
                const json = await res.json();
                const rows = Array.isArray(json?.rows) ? json.rows : [];
                return {
                  rows,
                  hasMore: Boolean(json?.hasMore),
                  nextCursor: json?.nextCursor ?? null,
                };
              },
            })
            .catch(() => null)
        );
      }

      if (
        dataTargets.includes("expenses") &&
        !queryClient.getQueryData(expensesKey)
      ) {
        tasks.push(
          queryClient
            .prefetchQuery({
              queryKey: expensesKey,
              queryFn: async () => {
                const params = new URLSearchParams({
                  shopId,
                  limit: `${REPORT_ROW_LIMIT}`,
                });
                if (range.from) params.append("from", range.from);
                if (range.to) params.append("to", range.to);
                const res = await fetch(
                  `/api/reports/expenses?${params.toString()}`,
                  { cache: "no-store" }
                );
                if (!res.ok) throw new Error("Expense prefetch failed");
                const json = await res.json();
                const rows = Array.isArray(json?.rows) ? json.rows : [];
                return {
                  rows,
                  hasMore: Boolean(json?.hasMore),
                  nextCursor: json?.nextCursor ?? null,
                };
              },
            })
            .catch(() => null)
        );
      }

      if (dataTargets.includes("cash") && !queryClient.getQueryData(cashKey)) {
        tasks.push(
          queryClient
            .prefetchQuery({
              queryKey: cashKey,
              queryFn: async () => {
                const params = new URLSearchParams({
                  shopId,
                  limit: `${REPORT_ROW_LIMIT}`,
                });
                if (range.from) params.append("from", range.from);
                if (range.to) params.append("to", range.to);
                const res = await fetch(
                  `/api/reports/cash?${params.toString()}`,
                  { cache: "no-store" }
                );
                if (!res.ok) throw new Error("Cash prefetch failed");
                const json = await res.json();
                const rows = Array.isArray(json?.rows) ? json.rows : [];
                return {
                  rows,
                  hasMore: Boolean(json?.hasMore),
                  nextCursor: json?.nextCursor ?? null,
                };
              },
            })
            .catch(() => null)
        );
      }

      if (
        dataTargets.includes("payment") &&
        !queryClient.getQueryData(paymentKey)
      ) {
        tasks.push(
          queryClient
            .prefetchQuery({
              queryKey: paymentKey,
              queryFn: async () => {
                const params = new URLSearchParams({ shopId });
                if (range.from) params.append("from", range.from);
                if (range.to) params.append("to", range.to);
                const res = await fetch(
                  `/api/reports/payment-method?${params.toString()}`,
                  { cache: "no-store" }
                );
                if (!res.ok) throw new Error("Payment prefetch failed");
                const text = await res.text();
                if (!text) return [];
                const json = JSON.parse(text);
                return Array.isArray(json?.data) ? json.data : [];
              },
            })
            .catch(() => null)
        );
      }

      if (
        dataTargets.includes("profit") &&
        !queryClient.getQueryData(profitKey)
      ) {
        tasks.push(
          queryClient
            .prefetchQuery({
              queryKey: profitKey,
              queryFn: async () => {
                const params = new URLSearchParams({ shopId });
                if (range.from) params.append("from", range.from);
                if (range.to) params.append("to", range.to);
                const res = await fetch(
                  `/api/reports/profit-trend?${params.toString()}`,
                  { cache: "no-store" }
                );
                if (!res.ok) throw new Error("Profit prefetch failed");
                const json = await res.json();
                return Array.isArray(json?.data) ? json.data : [];
              },
            })
            .catch(() => null)
        );
      }

      if (
        dataTargets.includes("products") &&
        !queryClient.getQueryData(topProductsKey)
      ) {
        tasks.push(
          queryClient
            .prefetchQuery({
              queryKey: topProductsKey,
              queryFn: async () => {
                const params = new URLSearchParams({
                  shopId,
                  limit: `${REPORT_ROW_LIMIT}`,
                });
                if (range.from) params.append("from", range.from);
                if (range.to) params.append("to", range.to);
                const res = await fetch(
                  `/api/reports/top-products?${params.toString()}`,
                  { cache: "no-store" }
                );
                if (!res.ok) throw new Error("Top products prefetch failed");
                const text = await res.text();
                if (!text) return [];
                const json = JSON.parse(text);
                return Array.isArray(json?.data) ? json.data : [];
              },
            })
            .catch(() => null)
        );
      }

      if (
        dataTargets.includes("stock") &&
        !queryClient.getQueryData(lowStockKey)
      ) {
        tasks.push(
          queryClient
            .prefetchQuery({
              queryKey: lowStockKey,
              queryFn: async () => {
                const params = new URLSearchParams({
                  shopId,
                  limit: `${REPORT_ROW_LIMIT}`,
                  threshold: `${lowStockThreshold}`,
                });
                const res = await fetch(
                  `/api/reports/low-stock?${params.toString()}`,
                  { cache: "no-store" }
                );
                if (!res.ok) throw new Error("Low stock prefetch failed");
                const text = await res.text();
                if (!text) return [];
                const json = JSON.parse(text);
                return Array.isArray(json?.data) ? json.data : [];
              },
            })
            .catch(() => null)
        );
      }

      if (tasks.length > 0) {
        Promise.all(tasks).catch(() => null);
      }
    }, 150);

    return () => cancel();
  }, [active, online, shopId, range.from, range.to, queryClient, lowStockThreshold]);


  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!online) return;
    const connection = (navigator as any)?.connection;
    if (connection?.saveData) return;
    if (["slow-2g", "2g"].includes(connection?.effectiveType)) return;

    const targets = PREFETCH_REPORTS_BY_TAB[active] ?? [];
    if (targets.length === 0) return;

    const cancel = scheduleIdle(() => {
      Promise.all(targets.map((key) => prefetchReportModule(key))).catch(
        () => null
      );
    }, 250);

    return () => cancel();
  }, [active, online]);

  const fetchAllRows = useCallback(
    async (endpoint: string, rangeFrom?: string, rangeTo?: string) => {
      const rows: any[] = [];
      let cursor: ExportCursor | null = null;
      let pages = 0;

      while (true) {
        const params = new URLSearchParams({
          shopId,
          limit: String(EXPORT_PAGE_LIMIT),
        });
        if (rangeFrom) params.append("from", rangeFrom);
        if (rangeTo) params.append("to", rangeTo);
        if (cursor) {
          params.append("cursorAt", cursor.at);
          params.append("cursorId", cursor.id);
        }

        const res = await fetch(`${endpoint}?${params.toString()}`);
        if (!res.ok) {
          throw new Error("Report fetch failed");
        }
        const data = await res.json();
        const nextRows = Array.isArray(data?.rows) ? data.rows : [];
        rows.push(...nextRows);

        if (rows.length > EXPORT_MAX_ROWS) {
          throw new Error("Too many rows to export");
        }

        if (!data?.hasMore || !data?.nextCursor) break;
        cursor = data.nextCursor;
        pages += 1;
        if (pages >= EXPORT_MAX_PAGES) {
          throw new Error("Export limit reached");
        }
      }

      return rows;
    },
    [shopId]
  );

  const fetchReportData = useCallback(
    async (endpoint: string, params: URLSearchParams) => {
      const res = await fetch(`${endpoint}?${params.toString()}`, {
        cache: "no-cache",
      });
      if (!res.ok) throw new Error("Report fetch failed");
      const text = await res.text();
      if (!text) return [];
      const json = JSON.parse(text);
      return json?.data ?? json;
    },
    []
  );

  const buildExportMeta = useCallback((): ExportMeta => {
    return {
      shopName,
      rangeLabel: rangeLabel ?? null,
      rangeFrom: range.from ?? null,
      rangeTo: range.to ?? null,
      generatedAt: new Date(),
    };
  }, [shopName, rangeLabel, range.from, range.to]);

  const buildDatasetForTarget = useCallback(
    (target: ExportTarget) =>
      buildDataset(target, {
        shopId,
        range,
        lowStockThreshold,
        rangeLabel: rangeLabel ?? null,
        fetchAllRows,
        fetchReportData,
        fetchSummary,
      }),
    [
      shopId,
      range,
      lowStockThreshold,
      rangeLabel,
      fetchAllRows,
      fetchReportData,
      fetchSummary,
    ]
  );

  const exportSingle = useCallback(
    async (
      target: ExportTarget,
      opts?: { prefix?: string; format?: ExportFormat }
    ): Promise<{ filename: string; rows: number }> => {
      const prefix = opts?.prefix?.trim() || "";
      const format: ExportFormat = opts?.format ?? "csv";
      const withPrefix = (name: string) => (prefix ? `${prefix}_${name}` : name);

      const dataset = await buildDatasetForTarget(target);
      const meta = buildExportMeta();

      const baseName = EXPORT_FILENAME_STEMS[target] ?? target;
      const ext = format === "xlsx" ? "xlsx" : format === "pdf" ? "pdf" : "csv";
      const filename = withPrefix(`${baseName}-${exportSuffix}.${ext}`);

      if (format === "csv") {
        const headers = dataset.columns.map((c) => c.key);
        const rows = dataset.rows.map((row) => {
          const obj: Record<string, unknown> = {};
          for (const col of dataset.columns) {
            obj[col.key] = col.getValue ? col.getValue(row) : row[col.key];
          }
          return obj;
        });
        const csv = generateCSV(headers, rows);
        downloadFile(filename, csv);
        return { filename, rows: dataset.rows.length };
      }

      if (format === "xlsx") {
        const { exportDatasetToExcel } = await import(
          "@/lib/exports/excel-export"
        );
        return exportDatasetToExcel(dataset, meta, filename);
      }

      // format === "pdf"
      const { exportDatasetToPdf } = await import("@/lib/exports/pdf-export");
      return exportDatasetToPdf(dataset, meta, filename);
    },
    [buildDatasetForTarget, buildExportMeta, exportSuffix]
  );

  const exportAllCombined = useCallback(
    async (
      targets: ExportTarget[],
      opts: { prefix?: string; format: Exclude<ExportFormat, "csv"> }
    ): Promise<{ filename: string; rows: number }> => {
      const prefix = opts.prefix?.trim() || "";
      const withPrefix = (name: string) => (prefix ? `${prefix}_${name}` : name);
      const ext = opts.format;
      const filename = withPrefix(`all-reports-${exportSuffix}.${ext}`);

      const datasets: ExportDataset[] = [];
      for (const target of targets) {
        datasets.push(await buildDatasetForTarget(target));
      }

      const meta = buildExportMeta();
      if (opts.format === "xlsx") {
        const { exportDatasetsToExcel } = await import(
          "@/lib/exports/excel-export"
        );
        return exportDatasetsToExcel(datasets, meta, filename);
      }
      const { exportDatasetsToPdf } = await import("@/lib/exports/pdf-export");
      return exportDatasetsToPdf(datasets, meta, filename);
    },
    [buildDatasetForTarget, buildExportMeta, exportSuffix]
  );

  const handleExport = useCallback(
    async (key: ExportKey, filenamePrefix = "", format: ExportFormat = "csv") => {
      if (!online) {
        showErrorToast({
          title: "অফলাইনে রিপোর্ট ডাউনলোড করা যাবে না",
          subtitle: "ইন্টারনেট সংযোগ চেক করুন",
        });
        return;
      }
      setExportingKey(key);
      setExportError(null);

      const formatLabel =
        format === "xlsx" ? "Excel" : format === "pdf" ? "PDF" : "CSV";
      const toastId = showInfoToast({
        title: `${formatLabel} ডাউনলোড হচ্ছে`,
        subtitle: "অপেক্ষা করুন...",
        duration: 60_000,
      });

      const targets: ExportTarget[] =
        key === "all"
          ? [
              "summary",
              "sales",
              "expenses",
              "cash",
              "payment",
              "profit",
              "products",
              "stock",
              "valuation",
            ]
          : key === "active"
            ? [
                active === "summary"
                  ? "summary"
                  : (active as Exclude<ReportKey, "summary">),
              ]
            : [key];

      const initialProgress: Partial<
        Record<ExportTarget, "pending" | "in-progress" | "done" | "error">
      > = {};
      for (const t of targets) initialProgress[t] = "pending";
      setExportProgress(initialProgress);

      const completed: Array<{
        at: number;
        label: string;
        filename: string;
        rows: number;
      }> = [];

      try {
        if (
          key === "all" &&
          (format === "xlsx" || format === "pdf")
        ) {
          // Combined file: one workbook / one PDF for all targets.
          for (const t of targets) {
            setExportProgress((prev) => ({ ...prev, [t]: "in-progress" }));
          }
          try {
            const result = await exportAllCombined(targets, {
              prefix: filenamePrefix,
              format,
            });
            for (const t of targets) {
              setExportProgress((prev) => ({ ...prev, [t]: "done" }));
            }
            completed.push({
              at: Date.now(),
              label:
                format === "xlsx" ? "সব রিপোর্ট (Excel)" : "সব রিপোর্ট (PDF)",
              filename: result.filename,
              rows: result.rows,
            });
          } catch (innerErr) {
            for (const t of targets) {
              setExportProgress((prev) =>
                prev[t] === "done" ? prev : { ...prev, [t]: "error" }
              );
            }
            throw innerErr;
          }
        } else {
          for (const target of targets) {
            setExportProgress((prev) => ({ ...prev, [target]: "in-progress" }));
            try {
              const result = await exportSingle(target, {
                prefix: filenamePrefix,
                format,
              });
              setExportProgress((prev) => ({ ...prev, [target]: "done" }));
              completed.push({
                at: Date.now(),
                label: EXPORT_TARGET_LABELS[target] ?? target,
                filename: result.filename,
                rows: result.rows,
              });
            } catch (innerErr) {
              setExportProgress((prev) => ({ ...prev, [target]: "error" }));
              throw innerErr;
            }
          }
        }

        if (completed.length > 0) {
          setExportHistory((prev) => {
            const next = [...completed.reverse(), ...prev].slice(
              0,
              EXPORT_HISTORY_LIMIT
            );
            try {
              safeLocalStorageSet(
                buildExportHistoryKey(shopId),
                JSON.stringify(next)
              );
            } catch {
              // ignore storage errors
            }
            return next;
          });
        }

        showSuccessToast({
          id: toastId,
          title:
            targets.length > 1 && format === "csv"
              ? `${targets.length} টি রিপোর্ট ডাউনলোড হয়েছে`
              : `${formatLabel} ডাউনলোড হয়েছে`,
        });
        setExportOpen(false);
      } catch (err) {
        handlePermissionError(err);
        setExportError(`${formatLabel} ডাউনলোড করা যায়নি`);
        showErrorToast({
          id: toastId,
          title: `${formatLabel} ডাউনলোড করা যায়নি`,
          subtitle: "আবার চেষ্টা করুন",
        });
      } finally {
        setExportingKey(null);
      }
    },
    [active, exportSingle, exportAllCombined, online, shopId]
  );

  const renderReport = () => {
    switch (active) {
      case "summary":
        return hasSummary ? (
          <SummaryCards
            summary={liveSummary!}
            previousSummary={comparisonSummary}
            comparisonLabel={comparisonLabel}
            needsCogs={needsCogs}
            onSelectTab={handleSelectTab}
          />
        ) : (
          <SummaryCardsSkeleton needsCogs={needsCogs} />
        );
      case "sales":
        return <SalesReport shopId={shopId} from={range.from} to={range.to} />;
      case "expenses":
        return (
          <ExpenseReport shopId={shopId} from={range.from} to={range.to} />
        );
      case "cash":
        return <CashbookReport shopId={shopId} from={range.from} to={range.to} />;
      case "payment":
        return (
          <PaymentMethodReport shopId={shopId} from={range.from} to={range.to} />
        );
      case "profit":
        return (
          <ProfitTrendReport
            shopId={shopId}
            from={range.from}
            to={range.to}
            needsCogs={needsCogs}
          />
        );
      case "products":
        return (
          <TopProductsReport shopId={shopId} from={range.from} to={range.to} />
        );
      case "stock":
        return (
          <LowStockReport
            shopId={shopId}
            threshold={lowStockThreshold}
            onThresholdChange={setLowStockThreshold}
          />
        );
      case "valuation":
        return <StockValuationReport shopId={shopId} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 pb-24">
      <ReportsExportDialog
        open={exportOpen}
        onOpenChange={(next) => {
          setExportOpen(next);
          if (!next) setExportError(null);
        }}
        online={online}
        rangeLabel={rangeLabel}
        activeTabKey={active as ExportTarget}
        activeTabLabel={activeReportLabel}
        needsCogs={needsCogs}
        rowCounts={exportRowCounts}
        exportingKey={exportingKey}
        exportProgress={exportProgress}
        exportError={exportError}
        exportHistory={exportHistory}
        onClearHistory={handleClearExportHistory}
        onExport={(key, prefix, format) => handleExport(key, prefix, format)}
      />
      {!online && (
        <div className="rounded-xl border border-warning/30 bg-warning-soft text-warning text-xs font-semibold px-3 py-2 shadow-sm">
          অফলাইন: আগের রিপোর্ট ডাটা দেখানো হচ্ছে।
        </div>
      )}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_16px_36px_rgba(15,23,42,0.08)] animate-fade-in">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-soft/50 via-card to-card" />
        <div className="pointer-events-none absolute -bottom-16 right-0 h-32 w-32 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative space-y-3 p-4">
          {/* Title row */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {heroMetric.label}
              </p>
              <p className="text-3xl font-bold tabular-nums leading-tight text-foreground sm:text-4xl">
                {heroMetric.value}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {heroMetric.hint}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <RefreshIconButton
                onClick={handleManualRefresh}
                loading={summaryLoading}
                label="রিফ্রেশ"
                showLabelOnDesktop={false}
                className="h-9 w-9 px-0 justify-center"
              />
              <button
                type="button"
                onClick={() => setExportOpen(true)}
                disabled={!online || exportingKey !== null}
                className="inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-primary-soft text-primary border border-primary/30 px-4 text-sm font-semibold shadow-sm hover:bg-primary/15 hover:border-primary/40 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {exportingKey ? "এক্সপোর্ট হচ্ছে..." : "↓ এক্সপোর্ট"}
              </button>
            </div>
          </div>

          {/* Shop selector */}
          <ShopSelectorClient shops={shops} selectedShopId={shopId} />

          {/* Chips */}
          <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3 text-xs font-semibold">
            {/* Date range — primary pill, always shows preset + actual dates */}
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-3.5 shadow-sm">
              <span aria-hidden="true" className="text-sm leading-none">📅</span>
              <span className="font-bold">{presetLabel}</span>
              {rangeLabel ? (
                <span className="font-normal opacity-85 truncate max-w-[160px] sm:max-w-[240px]">
                  · {rangeLabel}
                </span>
              ) : null}
            </span>
            <span
              className={`inline-flex h-7 max-w-[240px] items-center truncate rounded-full border px-3 transition-all duration-300 ${
                summaryLoading
                  ? "bg-yellow-soft text-yellow border-yellow/30 animate-pulse"
                  : realTimeIndicator
                  ? "bg-green-soft text-green border-green/30 animate-pulse"
                  : "bg-primary-soft text-primary border-primary/30"
              }`}
            >
              {summarySnapshot}
              {realTimeIndicator && (
                <span className="ml-1 text-xs shrink-0">🔄</span>
              )}
            </span>
            {summaryLoading ? (
              <span
                aria-hidden="true"
                className="inline-flex h-7 w-16 animate-pulse rounded-full bg-muted"
              />
            ) : null}
            <span
              className={`inline-flex h-7 items-center rounded-full border px-3 ${
                online
                  ? "bg-success-soft text-success border-success/30"
                  : "bg-danger-soft text-danger border-danger/30"
              }`}
            >
              {online ? "অনলাইন" : "অফলাইন"}
            </span>
          </div>
        </div>
      </div>

      {/* Mobile controls */}
      <div className="md:hidden space-y-3">
        <div className="border-b border-border/70 pt-3 pb-3">
          <div className="px-3 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground">
                  রিপোর্ট হাব
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  যে রিপোর্ট দেখতে চান, নিচে ট্যাপ করুন
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {mobilePrimaryReports.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setActive(item.key)}
                  className={`min-h-[44px] rounded-full border px-3 py-2 text-sm font-semibold transition-colors ${
                    active === item.key
                      ? "border-primary/30 bg-primary-soft text-primary shadow-sm"
                      : "border-border/70 bg-background text-foreground/85"
                  }`}
                >
                  {item.label}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setMobileReportPickerOpen(true)}
                className={`min-h-[44px] rounded-full border px-3 py-2 text-sm font-semibold transition-colors ${
                  !MOBILE_PRIMARY_REPORT_KEYS.includes(active as (typeof MOBILE_PRIMARY_REPORT_KEYS)[number])
                    ? "border-primary/30 bg-primary-soft text-primary shadow-sm"
                    : "border-dashed border-border/70 bg-background text-foreground/85"
                }`}
              >
                {!MOBILE_PRIMARY_REPORT_KEYS.includes(
                  active as (typeof MOBILE_PRIMARY_REPORT_KEYS)[number]
                )
                  ? `${activeReportLabel}`
                  : "আরও"}
              </button>
            </div>
          </div>
        </div>

          <div className="px-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground">সময়</p>
            {rangeLabel ? (
              <span className="text-[11px] font-semibold text-muted-foreground">
                {rangeLabel}
              </span>
            ) : null}
          </div>
          <div className="relative">
            <div className="flex gap-2 overflow-x-auto no-scrollbar rounded-full bg-muted/70 p-1 pr-8 pb-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
              {PRESETS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setPreset(key)}
                  className={`h-9 px-4 rounded-full text-sm font-semibold whitespace-nowrap border border-transparent transition-colors ${
                    preset === key
                      ? "bg-card text-foreground border-border shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-card to-transparent" />
          </div>
          {preset === "custom" && (
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={customFrom ?? ""}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
              <input
                type="date"
                className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={customTo ?? ""}
                onChange={(e) => setCustomTo(e.target.value)}
              />
              {customRangeValidation.message ? (
                <p
                  className={`col-span-2 text-[11px] ${
                    customRangeValidation.isValid
                      ? "text-muted-foreground"
                      : "text-danger"
                  }`}
                >
                  {customRangeValidation.message}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
      <Dialog open={mobileReportPickerOpen} onOpenChange={setMobileReportPickerOpen}>
        <DialogContent className="bottom-0 left-0 right-0 top-auto max-h-[82vh] translate-x-0 translate-y-0 rounded-t-[28px] border-border/70 p-0 sm:max-w-md">
          <DialogHeader className="px-5 pt-5">
            <DialogTitle>আরও রিপোর্ট</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 px-5 pb-5 pt-2">
            <p className="text-sm text-muted-foreground">
              কম ব্যবহার হওয়া রিপোর্টগুলো এখানে রাখা হয়েছে।
            </p>
            <div className="grid grid-cols-2 gap-2">
              {mobileSecondaryReports.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setActive(item.key);
                    setMobileReportPickerOpen(false);
                  }}
                  className={`min-h-[48px] rounded-full border px-3 py-2 text-sm font-semibold transition-colors ${
                    active === item.key
                      ? "border-primary/30 bg-primary-soft text-primary shadow-sm"
                      : "border-border/70 bg-background text-foreground/85"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Desktop: primary tabs + date filter separated */}
      <div className="hidden md:block space-y-4">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card px-4 py-4 shadow-sm">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/6 via-card to-card" />
          <div className="relative space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground">
                  রিপোর্ট হাব
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  যে রিপোর্ট দেখতে চান, নিচে থেকে বেছে নিন
                </p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {NAV.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setActive(item.key)}
                  className={`min-h-[44px] rounded-full border px-3 py-2 text-sm font-semibold transition-colors ${
                    active === item.key
                      ? "border-primary/30 bg-primary-soft text-primary shadow-sm"
                      : "border-border/70 bg-background text-foreground/85"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-card border border-border shadow-sm px-4 py-3 space-y-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground">সময়</p>
            {rangeLabel ? (
              <p className="mt-1 text-[11px] text-muted-foreground">{rangeLabel}</p>
            ) : null}
          </div>
          <div className="relative">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar rounded-full bg-muted/70 p-1 pr-12 pb-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
              {PRESETS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setPreset(key)}
                  className={`h-9 px-4 rounded-full text-sm font-semibold whitespace-nowrap border border-transparent transition-colors ${
                    preset === key
                      ? "bg-card text-foreground border-border shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-card to-transparent" />
          </div>
          {preset === "custom" && (
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                className="h-9 rounded-xl border border-border bg-card px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={customFrom ?? ""}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
              <input
                type="date"
                className="h-9 rounded-xl border border-border bg-card px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={customTo ?? ""}
                onChange={(e) => setCustomTo(e.target.value)}
              />
              {customRangeValidation.message ? (
                <p
                  className={`basis-full text-xs ${
                    customRangeValidation.isValid
                      ? "text-muted-foreground"
                      : "text-danger"
                  }`}
                >
                  {customRangeValidation.message}
                </p>
              ) : null}
            </div>
          )}
          {summaryLoading && (
            <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse"
              />
              রিফ্রেশ হচ্ছে...
            </span>
          )}
        </div>
      </div>
      {/* Desktop: summary OR active report — never both */}
      <div className="hidden md:block">
        {active === "summary" ? (
          <div className="bg-card border border-border rounded-2xl p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            {hasSummary ? (
              <SummaryCards
                summary={liveSummary!}
                previousSummary={comparisonSummary}
                comparisonLabel={comparisonLabel}
                needsCogs={needsCogs}
                onSelectTab={handleSelectTab}
                className="grid grid-cols-1 md:grid-cols-2 gap-3"
              />
            ) : (
              <SummaryCardsSkeleton
                needsCogs={needsCogs}
                className="grid grid-cols-1 md:grid-cols-2 gap-3"
              />
            )}
          </div>
        ) : (
          <div className="border border-border rounded-2xl p-6 bg-card shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            {renderReport()}
          </div>
        )}
      </div>

      {/* Mobile single report view */}
      <div className="md:hidden animate-fade-in">{renderReport()}</div>
    </div>
  );
}


