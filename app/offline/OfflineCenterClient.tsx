"use client";

import Link from "next/link";
import { liveQuery } from "dexie";
import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/dexie/db";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { useSyncStatus } from "@/lib/sync/sync-status";
import { useSyncQueueDetails } from "@/lib/sync/use-sync-queue-details";
import { clearSyncPause } from "@/lib/sync/pause";
import { queueReviveDead } from "@/lib/sync/queue";
import { runSyncEngine } from "@/lib/sync/sync-engine";
import { getRememberedOfflineProfile } from "@/lib/offline-auth";
import { prepareOfflineForShop } from "@/lib/offline/prepare";
import { safeLocalStorageGet } from "@/lib/storage";
import { useCurrentShop } from "@/hooks/use-current-shop";

type OfflineMetrics = {
  shopId: string | null;
  products: number;
  sales: number;
  expenses: number;
  cash: number;
  dueCustomers: number;
  todaySales: number;
  todayExpenses: number;
  todayDueCollected: number;
  todayCashNet: number;
};

type RouteStatus = {
  href: string;
  label: string;
  cached: boolean;
};

type OwnerSnapshot = {
  salesTotal: number;
  expenseTotal: number;
  profitTotal: number;
  cashBalance: number;
};

const emptyMetrics: OfflineMetrics = {
  shopId: null,
  products: 0,
  sales: 0,
  expenses: 0,
  cash: 0,
  dueCustomers: 0,
  todaySales: 0,
  todayExpenses: 0,
  todayDueCollected: 0,
  todayCashNet: 0,
};

function getDhakaDateString(date: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("bn-BD", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatDateTime(value?: number | null) {
  if (!value) return "এখনও হয়নি";
  return new Intl.DateTimeFormat("bn-BD", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function toRouteStatuses(shopId: string | null): RouteStatus[] {
  const suffix = shopId ? `?shopId=${shopId}` : "";
  return [
    { href: "/dashboard", label: "ড্যাশবোর্ড", cached: false },
    { href: `/dashboard/sales${suffix}`, label: "বিক্রি", cached: false },
    { href: `/dashboard/sales/new${suffix}`, label: "নতুন বিক্রি", cached: false },
    { href: `/dashboard/products${suffix}`, label: "পণ্য", cached: false },
    { href: `/dashboard/expenses${suffix}`, label: "খরচ", cached: false },
    { href: `/dashboard/cash${suffix}`, label: "ক্যাশ", cached: false },
    { href: `/dashboard/due${suffix}`, label: "বাকি", cached: false },
  ];
}

function normalizePathname(href: string) {
  try {
    const url = new URL(href, window.location.origin);
    return url.pathname.endsWith("/") && url.pathname !== "/"
      ? url.pathname.slice(0, -1)
      : url.pathname;
  } catch {
    return href;
  }
}

function readOwnerSnapshot(profileUserId: string | null): OwnerSnapshot | null {
  if (!profileUserId) return null;
  const raw = safeLocalStorageGet(`owner:dashboard:${profileUserId}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      summary?: {
        sales?: { total?: number } | number;
        expenses?: { total?: number } | number;
        profit?: number;
        cash?: { balance?: number } | null;
        balance?: number;
      };
    };
    const sales =
      typeof parsed.summary?.sales === "number"
        ? parsed.summary.sales
        : Number(parsed.summary?.sales?.total ?? 0);
    const expenses =
      typeof parsed.summary?.expenses === "number"
        ? parsed.summary.expenses
        : Number(parsed.summary?.expenses?.total ?? 0);
    const profit = Number(parsed.summary?.profit ?? 0);
    const cashBalance = Number(
      parsed.summary?.cash?.balance ?? parsed.summary?.balance ?? 0
    );
    return {
      salesTotal: sales,
      expenseTotal: expenses,
      profitTotal: profit,
      cashBalance,
    };
  } catch {
    return null;
  }
}

export default function OfflineCenterClient() {
  const online = useOnlineStatus();
  const { shopId: currentShopId } = useCurrentShop();
  const { pendingCount, deadCount, lastSyncAt, lastError, pausedUntil } =
    useSyncStatus();
  const { breakdown, deadItems, pendingItems } = useSyncQueueDetails();
  const [metrics, setMetrics] = useState<OfflineMetrics>(emptyMetrics);
  const [routeStatuses, setRouteStatuses] = useState<RouteStatus[]>(() =>
    toRouteStatuses(currentShopId)
  );
  const [preparing, setPreparing] = useState(false);
  const [forcing, setForcing] = useState(false);
  const [reviving, setReviving] = useState(false);
  const [profile, setProfile] = useState(() => getRememberedOfflineProfile());
  const ownerSnapshot = useMemo(
    () => readOwnerSnapshot(profile?.userId ?? null),
    [profile?.userId]
  );

  useEffect(() => {
    setProfile(getRememberedOfflineProfile());
  }, [online]);

  useEffect(() => {
    const sub = liveQuery(async () => {
      const shopIds = new Set<string>();
      const [products, sales, expenses, cash, dueCustomers] = await Promise.all([
        db.products.toArray(),
        db.sales.toArray(),
        db.expenses.toArray(),
        db.cash.toArray(),
        db.dueCustomers.toArray(),
      ]);

      products.forEach((item) => shopIds.add(item.shopId));
      sales.forEach((item) => shopIds.add(item.shopId));
      expenses.forEach((item) => shopIds.add(item.shopId));
      cash.forEach((item) => shopIds.add(item.shopId));
      dueCustomers.forEach((item) => shopIds.add(item.shopId));

      const activeShopId =
        currentShopId || metrics.shopId || Array.from(shopIds)[0] || null;
      if (!activeShopId) return emptyMetrics;

      const today = getDhakaDateString();
      const todaySales = sales
        .filter((item) => item.shopId === activeShopId)
        .filter((item) => getDhakaDateString(new Date(item.createdAt)) === today)
        .reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
      const todayExpenses = expenses
        .filter((item) => item.shopId === activeShopId && item.expenseDate === today)
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const todayCashNet = cash
        .filter((item) => item.shopId === activeShopId)
        .filter((item) => getDhakaDateString(new Date(item.createdAt)) === today)
        .reduce((sum, item) => {
          const amount = Number(item.amount || 0);
          return sum + (item.entryType === "OUT" ? -amount : amount);
        }, 0);
      const dueCustomerKeys = dueCustomers
        .filter((item) => item.shopId === activeShopId)
        .map((item) => [activeShopId, item.id] as [string, string]);
      const dueLedgerRows =
        dueCustomerKeys.length > 0
          ? await db.dueLedger
              .where("[shopId+customerId]")
              .anyOf(dueCustomerKeys)
              .toArray()
          : [];
      const todayDueCollected = dueLedgerRows
        .filter(
          (item) =>
            item.entryType === "PAYMENT" &&
            getDhakaDateString(new Date(item.entryDate)) === today
        )
        .reduce((sum, item) => sum + Number(item.amount || 0), 0);

      return {
        shopId: activeShopId,
        products: products.filter((item) => item.shopId === activeShopId).length,
        sales: sales.filter((item) => item.shopId === activeShopId).length,
        expenses: expenses.filter((item) => item.shopId === activeShopId).length,
        cash: cash.filter((item) => item.shopId === activeShopId).length,
        dueCustomers: dueCustomers.filter((item) => item.shopId === activeShopId)
          .length,
        todaySales,
        todayExpenses,
        todayDueCollected,
        todayCashNet,
      };
    }).subscribe({
      next: (next) => setMetrics(next),
      error: (err) => console.error("Offline metrics liveQuery failed", err),
    });

    return () => sub.unsubscribe();
  }, [currentShopId, metrics.shopId]);

  useEffect(() => {
    let cancelled = false;

    const checkRoutes = async () => {
      const routes = toRouteStatuses(metrics.shopId || currentShopId);
      if (typeof window === "undefined" || !("caches" in window)) {
        if (!cancelled) setRouteStatuses(routes);
        return;
      }

      const cacheNames = (await caches.keys()).filter((key) =>
        key.startsWith("pos-cache-")
      );
      const next = await Promise.all(
        routes.map(async (route) => {
          const path = normalizePathname(route.href);
          let cached = false;
          for (const cacheName of cacheNames) {
            const cache = await caches.open(cacheName);
            const match = await cache.match(
              new Request(`${window.location.origin}${path}`)
            );
            if (match) {
              cached = true;
              break;
            }
          }
          return { ...route, cached };
        })
      );

      if (!cancelled) {
        setRouteStatuses(next);
      }
    };

    void checkRoutes();

    return () => {
      cancelled = true;
    };
  }, [metrics.shopId, currentShopId, preparing, lastSyncAt]);

  const readyRoutesCount = routeStatuses.filter((route) => route.cached).length;
  const pendingSummary = useMemo(
    () =>
      Object.entries(breakdown)
        .filter(([, count]) => count > 0)
        .map(([type, count]) => `${type}: ${count}`)
        .join(" • "),
    [breakdown]
  );

  const readinessLabel = useMemo(() => {
    if (!profile) return "remembered user নেই";
    if (readyRoutesCount < routeStatuses.length) return "কিছু route এখনো cached না";
    if (metrics.products === 0 || metrics.sales === 0) return "core data cache কম";
    if (pendingCount > 0 || deadCount > 0) return "sync queue pending";
    return "Offline ready";
  }, [
    deadCount,
    metrics.products,
    metrics.sales,
    pendingCount,
    profile,
    readyRoutesCount,
    routeStatuses.length,
  ]);

  const handlePrepare = async () => {
    if (preparing || !online) return;
    setPreparing(true);
    try {
      await prepareOfflineForShop(metrics.shopId || currentShopId, {
        runSync: true,
      });
      await new Promise((resolve) => window.setTimeout(resolve, 1200));
      setProfile(getRememberedOfflineProfile());
    } finally {
      setPreparing(false);
    }
  };

  const handleForceSync = async () => {
    if (forcing || !online) return;
    setForcing(true);
    try {
      clearSyncPause();
      await runSyncEngine();
    } finally {
      setForcing(false);
    }
  };

  const handleRetryDead = async () => {
    if (reviving) return;
    setReviving(true);
    try {
      await queueReviveDead();
      if (online) {
        clearSyncPause();
        await runSyncEngine();
      }
    } finally {
      setReviving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
      <div className="rounded-3xl border border-border bg-card p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              Offline Center
            </p>
            <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
              Offline readiness, sync, summary
            </h1>
            <p className="text-sm text-muted-foreground">
              Core pages, cache readiness, queue health, and today&apos;s offline
              summary in one place.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handlePrepare}
              disabled={!online || preparing}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-primary/30 bg-primary-soft px-4 text-sm font-semibold text-primary hover:bg-primary/10 disabled:opacity-60"
            >
              {preparing ? "Preparing..." : "Offline ready করুন"}
            </button>
            <button
              type="button"
              onClick={handleForceSync}
              disabled={!online || forcing}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60"
            >
              {forcing ? "Syncing..." : "Force sync"}
            </button>
            <Link
              href="/offline/conflicts"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-warning/30 bg-warning-soft px-4 text-sm font-semibold text-warning hover:bg-warning/15"
            >
              Conflict center
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Status</p>
          <p className="mt-2 text-lg font-semibold text-foreground">
            {online ? "অনলাইন" : "অফলাইন"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{readinessLabel}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">শেষ sync</p>
          <p className="mt-2 text-lg font-semibold text-foreground">
            {formatDateTime(lastSyncAt)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {pausedUntil ? "Sync paused আছে" : "Auto sync enabled"}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Queue</p>
          <p className="mt-2 text-lg font-semibold text-foreground">
            {pendingCount} pending / {deadCount} failed
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {pendingSummary || "Queue পরিষ্কার"}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">Remembered user</p>
          <p className="mt-2 text-lg font-semibold text-foreground">
            {profile ? "Ready" : "Not ready"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {profile?.email || "Remembered user নেই"}
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Route readiness
              </h2>
              <p className="text-xs text-muted-foreground">
                Cached routes: {readyRoutesCount}/{routeStatuses.length}
              </p>
            </div>
            <span className="text-xs font-semibold text-muted-foreground">
              Shop: {metrics.shopId || "not selected"}
            </span>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {routeStatuses.map((route) => (
              <div
                key={route.href}
                className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-3 py-2"
              >
                <span className="text-sm font-medium text-foreground">
                  {route.label}
                </span>
                <span
                  className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${
                    route.cached
                      ? "bg-success-soft text-success"
                      : "bg-warning-soft text-warning"
                  }`}
                >
                  {route.cached ? "cached" : "pending"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">
            Local data cache
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <MetricCard label="Products" value={metrics.products} />
            <MetricCard label="Sales" value={metrics.sales} />
            <MetricCard label="Expenses" value={metrics.expenses} />
            <MetricCard label="Cash" value={metrics.cash} />
            <MetricCard label="Customers" value={metrics.dueCustomers} />
            <MetricCard label="Pending" value={pendingCount} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">
            Shift-end offline summary
          </h2>
          <p className="text-xs text-muted-foreground">
            Today&apos;s device-local summary for the active shop.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <MetricCard label="আজ বিক্রি" value={`${formatMoney(metrics.todaySales)} ৳`} />
            <MetricCard
              label="আজ খরচ"
              value={`${formatMoney(metrics.todayExpenses)} ৳`}
            />
            <MetricCard
              label="আজ বাকি আদায়"
              value={`${formatMoney(metrics.todayDueCollected)} ৳`}
            />
            <MetricCard
              label="আজ cash net"
              value={`${formatMoney(metrics.todayCashNet)} ৳`}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">
            Owner snapshot
          </h2>
          <p className="text-xs text-muted-foreground">
            Last cached owner dashboard summary.
          </p>
          {ownerSnapshot ? (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <MetricCard
                label="বিক্রি"
                value={`${formatMoney(ownerSnapshot.salesTotal)} ৳`}
              />
              <MetricCard
                label="খরচ"
                value={`${formatMoney(ownerSnapshot.expenseTotal)} ৳`}
              />
              <MetricCard
                label="লাভ"
                value={`${formatMoney(ownerSnapshot.profitTotal)} ৳`}
              />
              <MetricCard
                label="ক্যাশ"
                value={`${formatMoney(ownerSnapshot.cashBalance)} ৳`}
              />
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
              Cached owner snapshot পাওয়া যায়নি। Owner dashboard একবার online open
              করলে এখানে summary দেখাবে।
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">
            Pending queue order
          </h2>
          <div className="mt-4 space-y-2">
            {pendingItems.length === 0 ? (
              <div className="rounded-xl border border-border bg-muted/30 px-4 py-5 text-sm text-muted-foreground">
                Pending queue নেই।
              </div>
            ) : (
              pendingItems.slice(0, 8).map((item, index) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border bg-muted/30 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {index + 1}. {item.type} / {item.action}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      retry {item.retryCount} • {formatDateTime(item.createdAt)}
                    </p>
                  </div>
                  {item.error ? (
                    <span className="text-[11px] text-warning">{item.error}</span>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-foreground">
              Failed sync items
            </h2>
            <button
              type="button"
              onClick={handleRetryDead}
              disabled={reviving || deadCount === 0}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-danger/30 bg-danger-soft px-3 text-xs font-semibold text-danger hover:bg-danger/10 disabled:opacity-60"
            >
              {reviving ? "Retrying..." : "Retry failed"}
            </button>
          </div>
          <div className="mt-4 space-y-2">
            {deadItems.length === 0 ? (
              <div className="rounded-xl border border-border bg-muted/30 px-4 py-5 text-sm text-muted-foreground">
                Failed item নেই।
              </div>
            ) : (
              deadItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-danger/20 bg-danger-soft/40 px-3 py-2"
                >
                  <p className="text-sm font-semibold text-foreground">
                    {item.type} / {item.action}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    retry {item.retryCount} • {formatDateTime(item.createdAt)}
                  </p>
                  {item.error ? (
                    <p className="mt-1 text-xs text-danger">{item.error}</p>
                  ) : null}
                </div>
              ))
            )}
          </div>
          {lastError ? (
            <div className="mt-3 rounded-xl border border-warning/20 bg-warning-soft/40 px-3 py-2 text-xs text-warning">
              Last sync issue: {lastError}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 px-3 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}
