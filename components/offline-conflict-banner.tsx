"use client";

import Link from "next/link";
import { useConflictCounts } from "@/lib/sync/conflict-status";

export default function OfflineConflictBanner() {
  const counts = useConflictCounts();

  if (!counts.total) return null;

  return (
    <div className="rounded-2xl border border-warning/30 bg-warning-soft/60 px-4 py-3 text-sm text-warning-foreground shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="font-semibold text-warning">Offline conflict detected</span>
          <span className="text-xs text-warning/80">
            {counts.total} item(s) need review before syncing.
          </span>
        </div>
        <Link
          href="/offline/conflicts"
          className="inline-flex h-9 items-center justify-center rounded-xl border border-warning/40 bg-card px-3 text-xs font-semibold text-warning hover:bg-warning/10"
        >
          Resolve Now
        </Link>
      </div>
    </div>
  );
}
