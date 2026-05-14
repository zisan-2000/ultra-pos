// app/dashboard/reports/components/ReportEmptyState.tsx
//
// Single, professional empty-state visual used across every report. Avoids the
// previous flat "এই সময়ে কোনো বিক্রি নেই" text by giving the user:
//   1. A clear icon so it's recognisable at a glance
//   2. A descriptive title + hint about *why* the section is empty
//   3. An optional CTA so the user can act (e.g. "নতুন বিক্রি করুন")
"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type EmptyAction = {
  label: string;
  href: string;
  variant?: "primary" | "secondary";
};

type Props = {
  /** Big emoji or short symbol used as the visual anchor. */
  icon?: string;
  title: string;
  description?: string;
  /** Up to two actions; rendered as side-by-side buttons on desktop. */
  actions?: EmptyAction[];
  /** Vertical compactness — "compact" fits in small cards, "comfortable" gives breathing room. */
  size?: "compact" | "comfortable";
  /** Optional inline slot rendered above the description, e.g. tiny stat strip. */
  children?: ReactNode;
};

export function ReportEmptyState({
  icon = "📊",
  title,
  description,
  actions,
  size = "comfortable",
  children,
}: Props) {
  const padding = size === "compact" ? "px-4 py-8" : "px-4 py-12";
  const iconSize = size === "compact" ? "h-12 w-12 text-2xl" : "h-16 w-16 text-3xl";

  return (
    <div className={cn("flex flex-col items-center text-center", padding)}>
      <div
        aria-hidden="true"
        className={cn(
          "inline-flex items-center justify-center rounded-full bg-muted/60 text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]",
          iconSize
        )}
      >
        {icon}
      </div>
      <p className="mt-4 text-base font-semibold text-foreground">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-xs text-muted-foreground leading-relaxed">
          {description}
        </p>
      ) : null}
      {children ? <div className="mt-3">{children}</div> : null}
      {actions && actions.length > 0 ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {actions.map((action, idx) => {
            const isPrimary =
              action.variant === "primary" || (!action.variant && idx === 0);
            const cls = isPrimary
              ? "inline-flex h-10 items-center justify-center rounded-xl border border-primary/30 bg-primary text-primary-foreground px-4 text-sm font-semibold shadow-sm transition hover:opacity-90"
              : "inline-flex h-10 items-center justify-center rounded-xl border border-border bg-card text-foreground px-4 text-sm font-semibold transition hover:bg-muted";
            return (
              <Link key={`${action.label}-${idx}`} href={action.href} className={cls}>
                {action.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
