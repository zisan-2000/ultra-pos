"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type PaginationMode = "loadMore" | "cursor" | "offset";

type Props = {
  mode: PaginationMode;
  page?: number;
  totalPages?: number;
  totalCount?: number;
  loadedCount?: number;
  pageSize?: number;
  hasMore?: boolean;
  loading?: boolean;
  disabled?: boolean;
  prevHref?: string | null;
  nextHref?: string | null;
  pageNumbers?: number[];
  /**
   * Optional href factory for the page-number buttons. When provided, each
   * page number renders as a Link — works from server components (no
   * function-prop boundary issue) and gives the user proper right-click /
   * middle-click semantics for opening pages in new tabs.
   */
  buildPageHref?: (page: number) => string;
  onLoadMore?: () => void;
  onNavigate?: (page: number) => void;
  label?: string;
  prevLabel?: string;
  nextLabel?: string;
  emptyLabel?: string;
  className?: string;
  /**
   * Enable ←/→ keyboard shortcuts when the user is not focused in an input.
   * Default true. Set false to opt out (e.g. when multiple paginators on the
   * same page would otherwise compete for the same keys).
   */
  enableKeyboardShortcuts?: boolean;
};

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

function toBn(value?: number | string | null) {
  if (value === undefined || value === null) return "";
  return String(value).replace(/[0-9]/g, (digit) => BN_DIGITS[Number(digit)]);
}

function countLabel(count?: number | null) {
  if (!count || count <= 0) return null;
  return `${toBn(count.toLocaleString("en-IN"))} টি`;
}

function NavButton({
  href,
  onClick,
  disabled,
  children,
  tone = "neutral",
}: {
  href?: string | null;
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
  tone?: "primary" | "neutral";
}) {
  const classes = cn(
    "inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold shadow-sm transition active:scale-[0.98]",
    tone === "primary"
      ? "border-primary/30 bg-primary-soft text-primary hover:border-primary/40 hover:bg-primary/15"
      : "border-border bg-card text-foreground hover:bg-muted",
    disabled && "pointer-events-none cursor-not-allowed opacity-50"
  );

  if (href && !disabled) {
    return (
      <Link href={href} className={classes} aria-disabled={disabled}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={classes}>
      {children}
    </button>
  );
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  if (target.getAttribute("role") === "textbox") return true;
  return false;
}

export function UnifiedPagination({
  mode,
  page = 1,
  totalPages,
  totalCount,
  loadedCount = 0,
  pageSize,
  hasMore = false,
  loading = false,
  disabled = false,
  prevHref,
  nextHref,
  pageNumbers,
  buildPageHref,
  onLoadMore,
  onNavigate,
  label = "আরও দেখুন",
  prevLabel,
  nextLabel,
  emptyLabel = "সব দেখানো হয়েছে",
  className,
  enableKeyboardShortcuts = true,
}: Props) {
  const router = useRouter();
  const safePage = Math.max(1, Number(page) || 1);
  const canGoPrev = mode === "offset" ? safePage > 1 : Boolean(prevHref);
  const canGoNext =
    mode === "offset"
      ? Boolean(nextHref) || (typeof totalPages === "number" && safePage < totalPages)
      : hasMore || Boolean(nextHref);
  const loadedText = countLabel(loadedCount);
  const totalText = countLabel(totalCount);

  // ←/→ arrow-key shortcuts. Skipped when the user is typing in any
  // editable element so we never hijack their input. Also skipped while a
  // fetch is in flight to mirror the disabled button behaviour.
  useEffect(() => {
    if (!enableKeyboardShortcuts) return;
    if (typeof window === "undefined") return;

    const handle = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
        return;
      if (isEditableElement(event.target)) return;
      if (loading || disabled) return;

      const isPrev = event.key === "ArrowLeft";
      const isNext = event.key === "ArrowRight";
      if (!isPrev && !isNext) return;

      if (isPrev && canGoPrev) {
        event.preventDefault();
        if (prevHref) {
          router.push(prevHref);
        } else if (onNavigate) {
          onNavigate(safePage - 1);
        }
      } else if (isNext && canGoNext) {
        event.preventDefault();
        if (mode === "loadMore" && onLoadMore) {
          onLoadMore();
        } else if (mode === "cursor" && onLoadMore && !nextHref) {
          onLoadMore();
        } else if (nextHref) {
          router.push(nextHref);
        } else if (onNavigate) {
          onNavigate(safePage + 1);
        }
      }
    };

    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [
    enableKeyboardShortcuts,
    canGoPrev,
    canGoNext,
    loading,
    disabled,
    prevHref,
    nextHref,
    onNavigate,
    onLoadMore,
    router,
    mode,
    safePage,
  ]);
  const pageText =
    typeof totalPages === "number" && totalPages > 0
      ? `পৃষ্ঠা ${toBn(safePage)} / ${toBn(totalPages)}`
      : `পৃষ্ঠা ${toBn(safePage)}`;

  if (mode === "loadMore") {
    if (!hasMore) {
      if (loadedCount === 0) return null;
      return (
        <div
          className={cn(
            "flex items-center justify-center gap-2 border-t border-border bg-muted/10 px-4 py-4",
            className
          )}
        >
          <span className="text-[11px] font-medium italic text-muted-foreground">
            {emptyLabel}{loadedText ? ` · ${loadedText}` : ""}
          </span>
        </div>
      );
    }

    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 border-t border-border bg-muted/10 px-4 py-3 sm:flex-row sm:gap-3",
          className
        )}
      >
        <NavButton
          tone="primary"
          onClick={onLoadMore}
          disabled={loading || disabled}
        >
          {loading ? (
            <>
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"
              />
              <span role="status" aria-live="polite">
                লোড হচ্ছে...
              </span>
            </>
          ) : (
            <>↓ {label}</>
          )}
        </NavButton>
        {loadedText ? (
          <span className="text-[11px] text-muted-foreground">
            এখন পর্যন্ত {loadedText} দেখানো হচ্ছে
          </span>
        ) : null}
      </div>
    );
  }

  const pageButtons =
    mode === "offset" && Array.isArray(pageNumbers) && pageNumbers.length > 1
      ? pageNumbers
      : [];

  // When there's no actual navigation possible (single page of data, no prev
  // and no next), the rounded card with two disabled buttons just looks
  // broken to users. Collapse to the same compact "সব দেখানো হয়েছে" line
  // that loadMore mode uses — or render nothing at all if the list is empty.
  if (!canGoPrev && !canGoNext) {
    if (loadedCount <= 0) return null;
    return (
      <div
        className={cn(
          "flex items-center justify-center gap-2 border-t border-border bg-muted/10 px-4 py-4",
          className
        )}
      >
        <span className="text-[11px] font-medium italic text-muted-foreground">
          {emptyLabel}
          {loadedText ? ` · ${loadedText}` : ""}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card p-3 shadow-sm",
        className
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{pageText}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {(() => {
              // In cursor mode the per-page count is the only honest figure
              // we can show. While there's more data behind the next cursor
              // we hint "আরও আছে"; once hasMore turns false we know the
              // running tally is the actual total and surface "মোট".
              if (mode === "cursor") {
                const baseLabel = loadedText ?? `${toBn(pageSize ?? 0)} টি`;
                if (canGoNext) {
                  return `${baseLabel} এই পাতায় · আরও আছে`;
                }
                return `মোট ${baseLabel}`;
              }
              if (totalText) {
                if (loadedText && loadedText !== totalText) {
                  return `${loadedText} / মোট ${totalText} দেখানো হচ্ছে`;
                }
                return `মোট ${totalText}`;
              }
              if (loadedText) return `${loadedText} দেখানো হচ্ছে`;
              return "তালিকা";
            })()}
            {!canGoNext && loadedCount > 0 ? ` · ${emptyLabel}` : ""}
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <NavButton
            href={prevHref}
            onClick={onNavigate ? () => onNavigate(safePage - 1) : undefined}
            disabled={!canGoPrev || loading || disabled}
          >
            ← {prevLabel ?? (mode === "cursor" ? "নতুনগুলো" : "আগের")}
          </NavButton>

          {pageButtons.length > 0 ? (
            <div className="hidden max-w-55 items-center gap-1.5 overflow-x-auto md:flex">
              {pageButtons.map((pageNumber) => {
                const isActive = pageNumber === safePage;
                const buttonClass = cn(
                  "inline-flex h-9 min-w-9 items-center justify-center rounded-full border px-2 text-sm font-semibold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50",
                  isActive
                    ? "border-primary/40 bg-primary-soft text-primary shadow-sm"
                    : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
                );
                const isDisabled = loading || disabled;
                // Prefer href-based navigation when the consumer provides a
                // page-href factory (server-component friendly + middle-click
                // friendly). Fall back to onClick otherwise.
                if (buildPageHref && !isActive && !isDisabled) {
                  return (
                    <Link
                      key={pageNumber}
                      href={buildPageHref(pageNumber)}
                      className={buttonClass}
                      aria-current={isActive ? "page" : undefined}
                    >
                      {toBn(pageNumber)}
                    </Link>
                  );
                }
                return (
                  <button
                    key={pageNumber}
                    type="button"
                    onClick={() => onNavigate?.(pageNumber)}
                    disabled={isDisabled || isActive}
                    aria-current={isActive ? "page" : undefined}
                    className={buttonClass}
                  >
                    {toBn(pageNumber)}
                  </button>
                );
              })}
            </div>
          ) : null}

          <NavButton
            href={nextHref}
            onClick={
              mode === "cursor" && onLoadMore
                ? onLoadMore
                : onNavigate
                  ? () => onNavigate(safePage + 1)
                  : undefined
            }
            disabled={!canGoNext || loading || disabled}
            tone="primary"
          >
            {loading ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                লোড হচ্ছে...
              </>
            ) : (
              <>{nextLabel ?? (mode === "cursor" ? "আরও দেখুন" : "পরের")} →</>
            )}
          </NavButton>
        </div>
      </div>
    </div>
  );
}
