// app/dashboard/reports/components/ReportsClient.tsx

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ShopSelectorClient from "../ShopSelectorClient";
import { StatCard } from "./StatCard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useOnlineStatus } from "@/lib/sync/net-status";
import {
  PREFETCH_PRESETS,
  computeRange,
  computePresetRange,
  getDateRangeSpanDays,
  type RangePreset,
} from "@/lib/reporting-range";
import { REPORT_MAX_RANGE_DAYS, REPORT_ROW_LIMIT } from "@/lib/reporting-config";
import { scheduleIdle } from "@/lib/schedule-idle";
import { handlePermissionError } from "@/lib/permission-toast";
import { reportEvents } from "@/lib/events/reportEvents";
import { useRealtimeStatus } from "@/lib/realtime/status";
import { usePageVisibility } from "@/lib/use-page-visibility";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";
import { generateCSV } from "@/lib/utils/csv";
import { downloadFile } from "@/lib/utils/download";

type Summary = {
  sales: {
    totalAmount: number;
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
  summary: Summary;
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

function LazyReport({
  children,
  fallback,
  rootMargin = "200px",
}: {
  children: ReactNode;
  fallback?: ReactNode;
  rootMargin?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  const scheduleStateUpdate = useCallback((fn: () => void) => {
    if (typeof queueMicrotask === "function") {
      queueMicrotask(fn);
      return;
    }
    Promise.resolve().then(fn);
  }, []);

  useEffect(() => {
    if (visible) return;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      scheduleStateUpdate(() => setVisible(true));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [visible, rootMargin, scheduleStateUpdate]);

  return <div ref={ref}>{visible ? children : fallback}</div>;
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
  stock: [],
};

const PREFETCH_REPORT_DATA_BY_TAB: Record<ReportKey, ReportKey[]> = {
  summary: ["sales", "expenses", "cash"],
  sales: ["expenses", "cash"],
  expenses: ["sales", "cash"],
  cash: ["payment", "profit"],
  payment: ["profit"],
  profit: ["payment"],
  products: ["stock"],
  stock: ["products"],
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
] as const;

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

type ExportCursor = { at: string; id: string };

type ExportTarget =
  | "summary"
  | "sales"
  | "expenses"
  | "cash"
  | "payment"
  | "profit"
  | "products"
  | "stock";

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
  summary,
}: Props) {
  const online = useOnlineStatus();
  const realtime = useRealtimeStatus();
  const isVisible = usePageVisibility();
  const queryClient = useQueryClient();

  const [active, setActive] = useState<(typeof NAV)[number]["key"]>("summary");
  const [preset, setPreset] = useState<RangePreset>("today");
  const [customFrom, setCustomFrom] = useState<string | undefined>(undefined);
  const [customTo, setCustomTo] = useState<string | undefined>(undefined);
  const [realTimeIndicator, setRealTimeIndicator] = useState(false);
  const [lowStockThreshold, setLowStockThreshold] = useState(
    EXPORT_LOW_STOCK_THRESHOLD
  );
  const [exportOpen, setExportOpen] = useState(false);
  const [exportingKey, setExportingKey] = useState<ExportKey | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const lastEventAtRef = useRef(0);
  const wasVisibleRef = useRef(isVisible);
  const indicatorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalMs = realtime.connected ? 60_000 : 10_000;
  const pollingEnabled = !realtime.connected;
  const EVENT_DEBOUNCE_MS = 600;
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
  const presetLabel = useMemo(
    () => PRESETS.find((item) => item.key === preset)?.label ?? "",
    [preset]
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
    queryFn: () => fetchSummary(range.from, range.to),
    enabled: online,
    initialData: () => readCachedSummary(range.from, range.to) ?? summary,
    placeholderData: (prev) => prev ?? summary,
  });

  const liveSummary = summaryQuery.data ?? summary;
  const summaryLoading = summaryQuery.isFetching && online;
  const summarySnapshot = `${liveSummary.sales.totalAmount.toFixed(1)} ৳ বিক্রি | লাভ ${liveSummary.profit.profit.toFixed(1)} ৳`;

  const refreshSummaryFresh = useCallback(async () => {
    if (!online) return;
    try {
      const freshData = await fetchSummary(range.from, range.to, true);
      if (freshData) {
        queryClient.setQueryData(summaryQueryKey, freshData);
      }
    } catch (err) {
      handlePermissionError(err);
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
      queryKey: ["reports", "top-products", shopId, REPORT_ROW_LIMIT],
    });
  }, [queryClient, shopId]);

  const invalidateLowStock = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["reports", "low-stock", shopId],
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
  ]);

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

    refreshSummaryFresh();
    invalidateSales();
    invalidateExpenses();
    invalidateCash();
    invalidatePayment();
    invalidateProfit();
    invalidateTopProducts();
    invalidateLowStock();

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

    const maybeDebounce = () => {
      const now = Date.now();
      if (now - lastEventAtRef.current < EVENT_DEBOUNCE_MS) return false;
      lastEventAtRef.current = now;
      return true;
    };

    const saleUpdateListener = reportEvents.addListener(
      "sale-update",
      (event) => {
        if (event.shopId !== shopId) return;
        handleIndicator();
        if (!maybeDebounce()) return;
        refreshSummaryFresh();
        invalidateSales();
        invalidateProfit();
        invalidatePayment();
        invalidateTopProducts();
      },
      { shopId, priority: 10 }
    );

    const expenseUpdateListener = reportEvents.addListener(
      "expense-update",
      (event) => {
        if (event.shopId !== shopId) return;
        handleIndicator();
        if (!maybeDebounce()) return;
        refreshSummaryFresh();
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
        if (!maybeDebounce()) return;
        refreshSummaryFresh();
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
  ]);

  useEffect(() => {
    if (!online || typeof window === "undefined") return;
    const cancel = scheduleIdle(() => {
      PREFETCH_PRESETS.forEach((presetKey) => {
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
    if (!online || !isVisible || !pollingEnabled) return;
    const intervalId = setInterval(() => {
      const now = Date.now();
      if (now - lastEventAtRef.current < pollIntervalMs / 2) return;
      refreshSummaryFresh();
      invalidateActiveReport();
    }, pollIntervalMs);
    return () => clearInterval(intervalId);
  }, [
    online,
    isVisible,
    pollingEnabled,
    refreshSummaryFresh,
    invalidateActiveReport,
    pollIntervalMs,
  ]);

  useEffect(() => {
    if (!online) return;
    if (wasVisibleRef.current === isVisible) return;
    wasVisibleRef.current = isVisible;
    if (!isVisible) return;
    lastEventAtRef.current = Date.now();
    refreshSummaryFresh();
    invalidateActiveReport();
  }, [online, isVisible, refreshSummaryFresh, invalidateActiveReport]);

  useEffect(() => {
    if (!online) return;
    const connection = (navigator as any)?.connection;
    if (connection?.saveData) return;
    if (["slow-2g", "2g"].includes(connection?.effectiveType)) return;

    const dataTargets = PREFETCH_REPORT_DATA_BY_TAB[active] ?? [];
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
    const topProductsKey = ["reports", "top-products", shopId, REPORT_ROW_LIMIT];
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
                  `/api/reports/sales?${params.toString()}`
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
                  `/api/reports/expenses?${params.toString()}`
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
                  `/api/reports/cash?${params.toString()}`
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
                const params = new URLSearchParams({ shopId, fresh: "1" });
                if (range.from) params.append("from", range.from);
                if (range.to) params.append("to", range.to);
                const res = await fetch(
                  `/api/reports/payment-method?${params.toString()}`,
                  { cache: "no-cache" }
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
                const params = new URLSearchParams({ shopId, fresh: "1" });
                if (range.from) params.append("from", range.from);
                if (range.to) params.append("to", range.to);
                const res = await fetch(
                  `/api/reports/profit-trend?${params.toString()}`,
                  { cache: "no-cache" }
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
                  fresh: "1",
                });
                const res = await fetch(
                  `/api/reports/top-products?${params.toString()}`,
                  { cache: "no-cache" }
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
                  fresh: "1",
                });
                const res = await fetch(
                  `/api/reports/low-stock?${params.toString()}`,
                  { cache: "no-cache" }
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
      return Array.isArray(json?.data) ? json.data : json;
    },
    []
  );

  const exportSingle = useCallback(
    async (target: ExportTarget) => {
      switch (target) {
        case "summary": {
          const summaryData = await fetchSummary(range.from, range.to, true);
          const salesCount =
            summaryData.sales.count ?? summaryData.sales.completedCount ?? 0;
          const summaryCsv = generateCSV(
            [
              "range_from",
              "range_to",
              "sales_total",
              "sales_count",
              "sales_voided",
              "expense_total",
              "expense_count",
              "cash_in",
              "cash_out",
              "cash_balance",
              "profit",
              "cogs",
            ],
            [
              {
                range_from: range.from ?? "all",
                range_to: range.to ?? "all",
                sales_total: summaryData.sales.totalAmount ?? 0,
                sales_count: salesCount,
                sales_voided: summaryData.sales.voidedCount ?? 0,
                expense_total: summaryData.expense.totalAmount ?? 0,
                expense_count: summaryData.expense.count ?? 0,
                cash_in: summaryData.cash.totalIn ?? 0,
                cash_out: summaryData.cash.totalOut ?? 0,
                cash_balance: summaryData.cash.balance ?? 0,
                profit: summaryData.profit.profit ?? 0,
                cogs: summaryData.profit.cogs ?? 0,
              },
            ]
          );
          downloadFile(`summary-${exportSuffix}.csv`, summaryCsv);
          return;
        }
        case "sales": {
          const rows = await fetchAllRows(
            "/api/reports/sales",
            range.from,
            range.to
          );
          const csv = generateCSV(
            ["id", "saleDate", "totalAmount", "paymentMethod", "note"],
            rows
          );
          downloadFile(`sales-${exportSuffix}.csv`, csv);
          return;
        }
        case "expenses": {
          const rows = await fetchAllRows(
            "/api/reports/expenses",
            range.from,
            range.to
          );
          const csv = generateCSV(
            ["id", "expenseDate", "amount", "category"],
            rows
          );
          downloadFile(`expenses-${exportSuffix}.csv`, csv);
          return;
        }
        case "cash": {
          const rows = await fetchAllRows(
            "/api/reports/cash",
            range.from,
            range.to
          );
          const csv = generateCSV(
            ["id", "createdAt", "entryType", "amount", "reason"],
            rows
          );
          downloadFile(`cashbook-${exportSuffix}.csv`, csv);
          return;
        }
        case "payment": {
          const params = new URLSearchParams({ shopId, fresh: "1" });
          if (range.from) params.append("from", range.from);
          if (range.to) params.append("to", range.to);
          const rows = await fetchReportData(
            "/api/reports/payment-method",
            params
          );
          const csv = generateCSV(["name", "value", "count"], rows);
          downloadFile(`payment-method-${exportSuffix}.csv`, csv);
          return;
        }
        case "profit": {
          const params = new URLSearchParams({ shopId, fresh: "1" });
          if (range.from) params.append("from", range.from);
          if (range.to) params.append("to", range.to);
          const rows = await fetchReportData("/api/reports/profit-trend", params);
          const normalized = Array.isArray(rows)
            ? rows.map((row: any) => ({
                date: row.date,
                sales: row.sales ?? 0,
                expense: row.expense ?? 0,
                profit: Number(row.sales ?? 0) - Number(row.expense ?? 0),
              }))
            : [];
          const csv = generateCSV(["date", "sales", "expense", "profit"], normalized);
          downloadFile(`profit-trend-${exportSuffix}.csv`, csv);
          return;
        }
        case "products": {
          const params = new URLSearchParams({
            shopId,
            limit: String(REPORT_ROW_LIMIT),
            fresh: "1",
          });
          const rows = await fetchReportData("/api/reports/top-products", params);
          const csv = generateCSV(["name", "qty", "revenue"], rows);
          downloadFile("top-products-all.csv", csv);
          return;
        }
        case "stock": {
          const params = new URLSearchParams({
            shopId,
            limit: String(REPORT_ROW_LIMIT),
            threshold: String(lowStockThreshold),
            fresh: "1",
          });
          const rows = await fetchReportData("/api/reports/low-stock", params);
          const csv = generateCSV(["id", "name", "stockQty"], rows);
          downloadFile("low-stock-all.csv", csv);
          return;
        }
        default:
          return;
      }
    },
    [
      exportSuffix,
      fetchAllRows,
      fetchReportData,
      fetchSummary,
      lowStockThreshold,
      range.from,
      range.to,
      shopId,
    ]
  );

  const handleExport = useCallback(
    async (key: ExportKey) => {
      if (!online) {
        toast.error("অফলাইনে রিপোর্ট ডাউনলোড করা যাবে না");
        return;
      }
      setExportingKey(key);
      setExportError(null);
      const toastId = toast.success("রিপোর্ট ডাউনলোড হচ্ছে...");

      try {
        if (key === "all") {
          const targets: ExportTarget[] = [
            "summary",
            "sales",
            "expenses",
            "cash",
            "payment",
            "profit",
            "products",
            "stock",
          ];
          for (const target of targets) {
            await exportSingle(target);
          }
        } else if (key === "active") {
          const target =
            active === "summary"
              ? "summary"
              : (active as Exclude<ReportKey, "summary">);
          await exportSingle(target);
        } else {
          await exportSingle(key);
        }

        toast.success("CSV ডাউনলোড হয়েছে", { id: toastId });
        setExportOpen(false);
      } catch (err) {
        handlePermissionError(err);
        setExportError("CSV ডাউনলোড করা যায়নি");
        toast.error("CSV ডাউনলোড করা যায়নি", { id: toastId });
      } finally {
        setExportingKey(null);
      }
    },
    [active, exportSingle, online]
  );

  const renderReport = () => {
    switch (active) {
      case "summary":
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <StatCard
              title="মোট বিক্রি"
              value={`${liveSummary.sales.totalAmount.toFixed(2)} ৳`}
              subtitle={`মোট বিল: ${liveSummary.sales.completedCount ?? 0}${
                typeof liveSummary.sales.voidedCount === "number"
                  ? ` · বাতিল: ${liveSummary.sales.voidedCount}`
                  : ""
              }`}
              icon="🧾"
              tone="success"
            />
            <StatCard
              title="খরচ"
              value={`${liveSummary.expense.totalAmount.toFixed(2)} ৳`}
              subtitle={`মোট খরচ: ${liveSummary.expense.count ?? 0}`}
              icon="💸"
              tone="danger"
            />
            <StatCard
              title="ক্যাশ ব্যালান্স"
              value={`${liveSummary.cash.balance.toFixed(2)} ৳`}
              subtitle={`ইন: ${liveSummary.cash.totalIn.toFixed(
                2
              )} ৳ | আউট: ${liveSummary.cash.totalOut.toFixed(2)} ৳`}
              icon="💵"
              tone="warning"
            />
            <StatCard
              title="লাভ"
              value={`${liveSummary.profit.profit.toFixed(2)} ৳`}
              subtitle={`বিক্রি: ${liveSummary.profit.salesTotal.toFixed(
                2
              )} ৳ | খরচ: ${liveSummary.profit.expenseTotal.toFixed(2)} ৳`}
              icon="📈"
              tone="primary"
            />
          </div>
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
          <ProfitTrendReport shopId={shopId} from={range.from} to={range.to} />
        );
      case "products":
        return <TopProductsReport shopId={shopId} />;
      case "stock":
        return (
          <LowStockReport
            shopId={shopId}
            threshold={lowStockThreshold}
            onThresholdChange={setLowStockThreshold}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 pb-24">
      {!online && (
        <div className="rounded-xl border border-warning/30 bg-warning-soft text-warning text-xs font-semibold px-3 py-2 shadow-sm">
          অফলাইন: আগের রিপোর্ট ডাটা দেখানো হচ্ছে।
        </div>
      )}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_16px_36px_rgba(15,23,42,0.08)] animate-fade-in">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-soft/50 via-card to-card" />
        <div className="pointer-events-none absolute -bottom-16 right-0 h-32 w-32 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative space-y-4 p-4 sm:p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0 space-y-1">
            <h1 className="text-3xl font-bold text-foreground leading-tight">
              রিপোর্ট ও বিশ্লেষণ
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              দোকান: <span className="font-semibold">{shopName}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              বিক্রি, খরচ, ক্যাশ, লাভ এক জায়গায়
            </p>
            </div>

            <div className="w-full md:w-auto">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <ShopSelectorClient shops={shops} selectedShopId={shopId} />
                <Dialog
                  open={exportOpen}
                  onOpenChange={(open) => {
                    setExportOpen(open);
                    if (!open) setExportError(null);
                  }}
                >
                  <div className="inline-flex items-center gap-2">
                    <DialogTrigger asChild>
                      <button
                        type="button"
                        disabled={!online || exportingKey !== null}
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-primary/30 bg-primary-soft px-4 text-sm font-semibold text-primary shadow-sm transition hover:bg-primary/20 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {exportingKey ? "এক্সপোর্ট হচ্ছে..." : "CSV এক্সপোর্ট"}
                      </button>
                    </DialogTrigger>
                    <button
                      type="button"
                      onClick={() =>
                        toast.message("সব রিপোর্ট মানে একাধিক CSV ফাইল ডাউনলোড হবে")
                      }
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-xs text-muted-foreground hover:bg-muted transition"
                      title="সব রিপোর্ট মানে একাধিক CSV ফাইল ডাউনলোড হবে"
                      aria-label="এক্সপোর্ট তথ্য"
                    >
                      ℹ️
                    </button>
                  </div>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>CSV এক্সপোর্ট</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="rounded-xl border border-border/70 bg-muted/40 px-4 py-3 text-xs text-muted-foreground space-y-1">
                        <p>রেঞ্জ: {rangeLabel ?? "সব সময়"}</p>
                        <p>
                          বর্তমান ট্যাব:{" "}
                          {NAV.find((item) => item.key === active)?.label ??
                            "সারাংশ"}
                        </p>
                        <p>টপ পণ্য ও লো স্টক সবসময় সামগ্রিক ডেটা দেখায়।</p>
                        <p>বড় রিপোর্টে কিছু সময় লাগতে পারে।</p>
                      </div>

                      <div className="space-y-2">
                        {[
                          { key: "active", label: "বর্তমান ট্যাব" },
                          { key: "summary", label: "সারাংশ" },
                          { key: "sales", label: "বিক্রি" },
                          { key: "expenses", label: "খরচ" },
                          { key: "cash", label: "ক্যাশ" },
                          { key: "payment", label: "পেমেন্ট" },
                          { key: "profit", label: "লাভ" },
                          { key: "products", label: "টপ পণ্য" },
                          { key: "stock", label: "লো স্টক" },
                          { key: "all", label: "সব রিপোর্ট" },
                        ].map((option) => (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() => handleExport(option.key as ExportKey)}
                            disabled={exportingKey !== null}
                            className="w-full flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground hover:bg-muted transition disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            <span>{option.label}</span>
                            <span className="text-xs text-muted-foreground">
                              {exportingKey === option.key
                                ? "ডাউনলোড হচ্ছে..."
                                : "ডাউনলোড"}
                            </span>
                          </button>
                        ))}
                      </div>

                      {exportError ? (
                        <div className="rounded-lg border border-danger/40 bg-danger-soft/60 px-3 py-2 text-xs text-danger">
                          {exportError}
                        </div>
                      ) : null}

                      {!online ? (
                        <div className="rounded-lg border border-warning/40 bg-warning-soft/60 px-3 py-2 text-xs text-warning">
                          অফলাইনে CSV এক্সপোর্ট করা যাবে না।
                        </div>
                      ) : null}
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="inline-flex h-7 items-center rounded-full border px-3">
              {presetLabel}
            </span>
            {rangeLabel ? (
              <span className="inline-flex h-7 items-center rounded-full border border-border bg-card/80 px-3 text-muted-foreground">
                {rangeLabel}
              </span>
            ) : null}
            <span
              className={`inline-flex h-7 items-center rounded-full border px-3 transition-all duration-300 ${
                summaryLoading
                  ? "bg-yellow-soft text-yellow border-yellow/30 animate-pulse"
                  : realTimeIndicator
                  ? "bg-green-soft text-green border-green/30 animate-pulse"
                  : "bg-primary-soft text-primary border-primary/30"
              }`}
            >
              <>
                {summarySnapshot}
                {realTimeIndicator && (
                  <span className="ml-1 text-xs">🔄 LIVE</span>
                )}
              </>
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
        <div className="sticky top-0 z-30 bg-card/95 backdrop-blur border-b border-border/70 pt-3 pb-2">
          <div className="px-3 space-y-2">
            <p className="text-[11px] font-semibold text-muted-foreground"> রিপোর্ট</p>
            <div className="relative">
              <div className="flex gap-2 overflow-x-auto no-scrollbar rounded-full bg-muted/70 p-1 pr-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                {NAV.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setActive(item.key)}
                    className={`h-9 px-4 rounded-full text-sm font-semibold whitespace-nowrap border border-transparent transition-colors ${
                      active === item.key
                        ? "bg-card text-foreground border-border shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-card to-transparent" />
            </div>
          </div>
        </div>

        <div className="px-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-muted-foreground"> সময়</p>
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
          <div>
            <div className="rounded-xl border border-primary/30 bg-primary-soft px-3 py-2 text-xs font-semibold text-primary shadow-sm">
              {summarySnapshot}
            </div>
          </div>
        </div>
      </div>
      {/* Desktop: primary tabs + date filter separated */}
      <div className="hidden md:block space-y-4">
        <div className="rounded-2xl bg-card border border-border shadow-sm px-4 py-3 relative">
          <p className="text-xs font-semibold text-muted-foreground mb-2"> রিপোর্ট</p>
          <div className="relative">
            <div className="flex gap-2 overflow-x-auto no-scrollbar rounded-full bg-muted/70 p-1 pr-10 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
              {NAV.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setActive(item.key)}
                  className={`h-9 px-4 rounded-full text-sm font-semibold whitespace-nowrap border border-transparent transition-colors ${
                    active === item.key
                      ? "bg-card text-foreground border-border shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-card to-transparent" />
          </div>
        </div>

        <div className="rounded-2xl bg-card border border-border shadow-sm px-4 py-3 space-y-4">
          <p className="text-xs font-semibold text-muted-foreground"> সময়</p>
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
                className="h-9 rounded-lg border border-border bg-card px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={customFrom ?? ""}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
              <input
                type="date"
                className="h-9 rounded-lg border border-border bg-card px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
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
          <div className="rounded-xl border border-primary/20 bg-primary-soft px-3 py-2 text-xs font-semibold text-primary">
            {summarySnapshot}
          </div>
          {summaryLoading && (
            <span className="text-xs text-muted-foreground">রিফ্রেশ হচ্ছে...</span>
          )}
        </div>
      </div>
      {/* Desktop grid */}
      <div className="hidden md:block space-y-6">
        <div className="bg-card border border-border rounded-2xl p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <StatCard
              title="মোট বিক্রি"
              value={`${liveSummary.sales.totalAmount.toFixed(2)} ৳`}
              subtitle={`মোট বিল: ${liveSummary.sales.completedCount ?? 0}${
                typeof liveSummary.sales.voidedCount === "number"
                  ? ` · বাতিল: ${liveSummary.sales.voidedCount}`
                  : ""
              }`}
              icon="🧾"
              tone="success"
            />
            <StatCard
              title="খরচ"
              value={`${liveSummary.expense.totalAmount.toFixed(2)} ৳`}
              subtitle={`মোট খরচ: ${liveSummary.expense.count ?? 0}`}
              icon="💸"
              tone="danger"
            />
            <StatCard
              title="ক্যাশ ব্যালান্স"
              value={`${liveSummary.cash.balance.toFixed(2)} ৳`}
              subtitle={`ইন: ${liveSummary.cash.totalIn.toFixed(
                2
              )} ৳ | আউট: ${liveSummary.cash.totalOut.toFixed(2)} ৳`}
              icon="💵"
              tone="warning"
            />
            <StatCard
              title="লাভ"
              value={`${liveSummary.profit.profit.toFixed(2)} ৳`}
              subtitle={`বিক্রি: ${liveSummary.profit.salesTotal.toFixed(
                2
              )} ৳ | খরচ: ${liveSummary.profit.expenseTotal.toFixed(2)} ৳`}
              icon="📈"
              tone="primary"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="border border-border rounded-2xl p-6 bg-card shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <LazyReport fallback={<ReportSkeleton />}>
              <SalesReport shopId={shopId} from={range.from} to={range.to} />
            </LazyReport>
          </div>

          <div className="border border-border rounded-2xl p-6 bg-card shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <LazyReport fallback={<ReportSkeleton />}>
              <ExpenseReport shopId={shopId} from={range.from} to={range.to} />
            </LazyReport>
          </div>

          <div className="border border-border rounded-2xl p-6 bg-card shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <LazyReport fallback={<ReportSkeleton />}>
              <CashbookReport shopId={shopId} from={range.from} to={range.to} />
            </LazyReport>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="border border-border rounded-2xl p-6 bg-card shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <LazyReport fallback={<ReportSkeleton />}>
              <PaymentMethodReport
                shopId={shopId}
                from={range.from}
                to={range.to}
              />
            </LazyReport>
          </div>

          <div className="border border-border rounded-2xl p-6 bg-card shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <LazyReport fallback={<ReportSkeleton />}>
              <ProfitTrendReport
                shopId={shopId}
                from={range.from}
                to={range.to}
              />
            </LazyReport>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="border border-border rounded-2xl p-6 bg-card shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <LazyReport fallback={<ReportSkeleton />}>
              <TopProductsReport shopId={shopId} />
            </LazyReport>
          </div>

          <div className="border border-border rounded-2xl p-6 bg-card shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
            <LazyReport fallback={<ReportSkeleton />}>
              <LowStockReport
                shopId={shopId}
                threshold={lowStockThreshold}
                onThresholdChange={setLowStockThreshold}
              />
            </LazyReport>
          </div>
        </div>
      </div>

      {/* Mobile single report view */}
      <div className="md:hidden animate-fade-in">{renderReport()}</div>
    </div>
  );
}

