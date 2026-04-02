"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import OfflineAwareLink from "@/components/offline-aware-link";
import RefreshIconButton from "@/components/ui/refresh-icon-button";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { useSyncStatus } from "@/lib/sync/sync-status";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";
import { useSmartPolling } from "@/lib/polling/use-smart-polling";
import { usePageVisibility } from "@/lib/use-page-visibility";
import { formatBanglaMoney } from "@/lib/utils/bangla-money";

type Summary = {
  sales: { total: number; count: number };
  expenses: { total: number; count: number; cogs: number };
  profit: number;
  cash: { in: number; out: number; balance: number; count: number };
};

type QuickAction = {
  href: string;
  label: string;
  description: string;
  icon: string;
};

type StaffDashboardData = {
  shopId: string;
  shopName: string;
  canViewSummary: boolean;
  summary: Summary;
  quickActions: QuickAction[];
};

type Props = {
  userId: string;
  initialData: StaffDashboardData;
};

const SUMMARY_CARD_STYLES = [
  {
    key: "sales",
    title: "আজকের বিক্রি",
    tone: "border-success/20 bg-success-soft/40 text-success",
  },
  {
    key: "orders",
    title: "বিল সংখ্যা",
    tone: "border-primary/20 bg-primary-soft/40 text-primary",
  },
  {
    key: "expense",
    title: "আজকের খরচ",
    tone: "border-warning/20 bg-warning-soft/40 text-warning",
  },
  {
    key: "cash",
    title: "ক্যাশ ব্যালেন্স",
    tone: "border-sky-200/50 bg-sky-500/10 text-sky-700",
  },
] as const;

export default function StaffDashboardClient({ userId, initialData }: Props) {
  const router = useRouter();
  const online = useOnlineStatus();
  const isVisible = usePageVisibility();
  const { pendingCount, syncing, lastSyncAt } = useSyncStatus();
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const refreshInFlightRef = useRef(false);
  const serverSnapshotRef = useRef(initialData);

  const cacheKey = useMemo(
    () => `staff:dashboard:${userId}:${initialData.shopId}`,
    [userId, initialData.shopId],
  );

  useEffect(() => {
    if (serverSnapshotRef.current !== initialData) {
      serverSnapshotRef.current = initialData;
      refreshInFlightRef.current = false;
    }
  }, [initialData]);

  useEffect(() => {
    if (!online) return;
    try {
      safeLocalStorageSet(cacheKey, JSON.stringify(initialData));
    } catch {
      // ignore cache failures
    }
  }, [online, cacheKey, initialData]);

  const { data, cacheMissing } = useMemo(() => {
    if (online) {
      return { data: initialData, cacheMissing: false };
    }
    try {
      const raw = safeLocalStorageGet(cacheKey);
      if (!raw) {
        return { data: initialData, cacheMissing: true };
      }
      const parsed = JSON.parse(raw) as StaffDashboardData;
      if (parsed?.shopId) {
        return { data: parsed, cacheMissing: false };
      }
    } catch {
      // ignore cache parse failures
    }
    return { data: initialData, cacheMissing: true };
  }, [online, cacheKey, initialData]);

  const { triggerRefresh } = useSmartPolling({
    profile: {
      intervalMs: 10_000,
      minRefreshMs: 5_000,
      eventDebounceMs: 1_200,
      eventQuietWindowRatio: 0.35,
    },
    enabled: Boolean(data.shopId),
    online,
    isVisible,
    blocked: syncing || pendingCount > 0,
    syncToken: lastSyncAt,
    canRefresh: () => !refreshInFlightRef.current,
    markRefreshStarted: () => {
      refreshInFlightRef.current = true;
    },
    onRefresh: () => {
      router.refresh();
    },
  });

  const handleManualRefresh = useCallback(() => {
    setManualRefreshing(true);
    triggerRefresh("manual", { force: true });
    window.setTimeout(() => setManualRefreshing(false), 1800);
  }, [triggerRefresh]);

  const summaryCards = useMemo(
    () => [
      {
        ...SUMMARY_CARD_STYLES[0],
        value: formatBanglaMoney(Number(data.summary.sales.total ?? 0)),
        helper: `${data.summary.sales.count ?? 0}টি বিক্রি`,
      },
      {
        ...SUMMARY_CARD_STYLES[1],
        value: String(data.summary.sales.count ?? 0),
        helper: "আজকের মোট বিল",
      },
      {
        ...SUMMARY_CARD_STYLES[2],
        value: formatBanglaMoney(Number(data.summary.expenses.total ?? 0)),
        helper: `${data.summary.expenses.count ?? 0}টি খরচ`,
      },
      {
        ...SUMMARY_CARD_STYLES[3],
        value: formatBanglaMoney(Number(data.summary.cash.balance ?? 0)),
        helper: `${data.summary.cash.count ?? 0}টি লেনদেন`,
      },
    ],
    [data.summary],
  );

  const lastSyncLabel = useMemo(() => {
    if (!lastSyncAt) return null;
    return new Intl.DateTimeFormat("bn-BD", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(lastSyncAt));
  }, [lastSyncAt]);

  return (
    <div className="space-y-5 -mt-1 mb-6">
      {!online || cacheMissing ? (
        <div className="space-y-2">
          {!online && (
            <div className="rounded-xl border border-warning/30 bg-warning-soft px-3 py-2 text-xs font-semibold text-warning">
              Offline: cached staff dashboard data দেখানো হচ্ছে।
            </div>
          )}
          {!online && cacheMissing && (
            <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
              Offline: staff dashboard cache পাওয়া যায়নি।
            </div>
          )}
        </div>
      ) : null}

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Staff Desk
            </p>
            <h1 className="text-2xl font-bold text-foreground tracking-tight sm:text-3xl">
              {data.shopName}
            </h1>
            <p className="text-sm text-muted-foreground">
              আজকের কাজ দ্রুত ধরার জন্য simple operational dashboard।
            </p>
          </div>
          <div className="flex items-center gap-2">
            <RefreshIconButton
              onClick={handleManualRefresh}
              loading={manualRefreshing}
              label="রিফ্রেশ"
              className="h-9 px-3 text-xs"
            />
            {lastSyncLabel ? (
              <span className="text-xs text-muted-foreground">
                শেষ আপডেট {lastSyncLabel}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {data.canViewSummary ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {summaryCards.map((card) => (
            <div
              key={card.key}
              className={`rounded-2xl border p-4 shadow-sm ${card.tone}`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground/70">
                {card.title}
              </p>
              <div className="mt-3 text-2xl font-bold leading-none text-foreground">
                {card.value}
              </div>
              <p className="mt-2 text-xs text-foreground/70">{card.helper}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Summary permission নেই। নিচের কাজের shortcut ব্যবহার করুন।
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">আজকের কাজ</h2>
            <p className="text-xs text-muted-foreground mt-1">
              staff-এর জন্য দরকারি quick actions
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {data.quickActions.length}টি shortcut
          </span>
        </div>

        {data.quickActions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
            এই staff user-এর জন্য এখনো কোনো quick action available না।
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {data.quickActions.map((action) => (
              <OfflineAwareLink
                key={action.href}
                href={action.href}
                className="group rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-muted/30 p-4 text-left shadow-[0_8px_18px_rgba(15,23,42,0.06)] transition-all hover:shadow-[0_12px_22px_rgba(15,23,42,0.1)] pressable min-h-[132px]"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-lg text-primary ring-1 ring-primary/20">
                  {action.icon}
                </span>
                <div className="mt-3 space-y-1">
                  <p className="text-sm font-bold text-foreground">{action.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {action.description}
                  </p>
                </div>
              </OfflineAwareLink>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
