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

import { cn } from "@/lib/utils";

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

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
const toBn = (n: number | string) =>
  String(n).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);

export function LoadMoreButton({
  hasMore,
  loading,
  disabled = false,
  onLoadMore,
  loadedCount,
  label = "আরও দেখুন",
  className,
}: Props) {
  if (!hasMore) {
    if (loadedCount === 0) return null;
    return (
      <div
        className={cn(
          "flex items-center justify-center gap-2 px-4 py-4 border-t border-border bg-muted/10",
          className
        )}
      >
        <span className="text-[11px] font-medium text-muted-foreground italic">
          সব দেখানো হয়েছে · {toBn(loadedCount.toLocaleString("en-IN"))} টি
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-3 px-4 py-3 border-t border-border bg-muted/10",
        className
      )}
    >
      <button
        type="button"
        onClick={onLoadMore}
        disabled={loading || disabled}
        className="inline-flex h-10 min-w-[160px] items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary-soft text-primary px-5 text-sm font-semibold transition hover:bg-primary/15 hover:border-primary/40 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse"
            />
            লোড হচ্ছে...
          </>
        ) : (
          <>↓ {label}</>
        )}
      </button>
      {loadedCount > 0 ? (
        <span className="text-[11px] text-muted-foreground hidden sm:inline">
          এখন পর্যন্ত {toBn(loadedCount.toLocaleString("en-IN"))} টি দেখানো হচ্ছে
        </span>
      ) : null}
    </div>
  );
}
