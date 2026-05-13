// app/dashboard/sales/components/pos-header-bar.tsx

"use client";

import RefreshIconButton from "@/components/ui/refresh-icon-button";

type Props = {
  shopName: string;
  syncing: boolean;
  pendingCount: number;
  lastSyncLabel: string | null;
  online: boolean;
  canCreateSale: boolean;
  canUseDueSale: boolean;
  productsRefreshing: boolean;
  onRefresh: () => void;
};

export function PosHeaderBar({
  shopName,
  syncing,
  pendingCount,
  lastSyncLabel,
  canCreateSale,
  canUseDueSale,
  productsRefreshing,
  onRefresh,
}: Props) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_12px_28px_rgba(15,23,42,0.08)] animate-fade-in">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-soft/30 via-card to-card" />
      <div className="pointer-events-none absolute -top-12 right-0 h-24 w-24 rounded-full bg-primary/15 blur-3xl" />
      <div className="relative space-y-2 p-3 sm:p-4">
        <div className="flex items-start justify-between gap-2 sm:items-center">
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-bold text-foreground tracking-tight leading-tight sm:text-3xl">
              নতুন বিক্রি
            </h1>
            <p
              className="truncate text-xs text-muted-foreground"
              title={`দোকান: ${shopName}`}
            >
              দোকান: <span className="font-semibold">{shopName}</span>
            </p>
          </div>
          <RefreshIconButton
            onClick={onRefresh}
            loading={productsRefreshing}
            label="রিফ্রেশ"
            showLabelOnMobile
            className="h-8 shrink-0 px-3 text-xs sm:h-7 sm:px-2.5"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          {pendingCount > 0 ? (
            <span className="inline-flex h-7 items-center rounded-full border border-warning/30 bg-warning-soft px-3 text-warning">
              পেন্ডিং {pendingCount} টি
            </span>
          ) : null}
          {!canCreateSale ? (
            <span className="inline-flex h-7 items-center rounded-full border border-danger/30 bg-danger-soft px-3 text-danger">
              বিক্রি করা নিষ্ক্রিয়
            </span>
          ) : null}
          {canCreateSale && !canUseDueSale ? (
            <span className="inline-flex h-7 items-center rounded-full border border-warning/30 bg-warning-soft px-3 text-warning">
              বাকির বিক্রি নিষ্ক্রিয়
            </span>
          ) : null}
          {syncing ? (
            <span className="inline-flex h-7 items-center rounded-full border border-primary/30 bg-primary-soft px-3 text-primary">
              সিঙ্ক হচ্ছে...
            </span>
          ) : null}
          {lastSyncLabel ? (
            <span className="inline-flex h-7 items-center rounded-full border border-border bg-card/80 px-3 text-muted-foreground">
              শেষ সিঙ্ক: {lastSyncLabel}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
