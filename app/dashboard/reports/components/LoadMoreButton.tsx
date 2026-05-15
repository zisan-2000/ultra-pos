// app/dashboard/reports/components/LoadMoreButton.tsx
//
// Replaces the previous "← আগের পাতা | পরের পাতা →" stepper with a single
// "Load more" pattern that works equally well on mobile and desktop (the
// pattern used by Stripe, Linear, GitHub).
//
// Behaviour:
//   - When there are more rows: shows a primary button. Disabled + animated
//     while a fetch is in flight.
//   - When no more rows: shows a quiet, italic "সব দেখানো হয়েছে" line so the
//     user knows the list is complete (instead of just disappearing).
"use client";

import { UnifiedPagination } from "@/components/pagination/UnifiedPagination";

type Props = {
  hasMore: boolean;
  loading: boolean;
  /** Disable when offline / when no online context is available. */
  disabled?: boolean;
  onLoadMore: () => void;
  /** Total rows currently displayed (used in the status line). */
  loadedCount: number;
  /** Optional label override; defaults to "আরও দেখুন". */
  label?: string;
  className?: string;
};

export function LoadMoreButton({
  hasMore,
  loading,
  disabled = false,
  onLoadMore,
  loadedCount,
  label = "আরও দেখুন",
  className,
}: Props) {
  return (
    <UnifiedPagination
      mode="loadMore"
      hasMore={hasMore}
      loading={loading}
      disabled={disabled}
      onLoadMore={onLoadMore}
      loadedCount={loadedCount}
      label={label}
      className={className}
    />
  );
}
