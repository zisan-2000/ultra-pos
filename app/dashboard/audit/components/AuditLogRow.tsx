// app/dashboard/audit/components/AuditLogRow.tsx
"use client";

import { ChevronRight } from "lucide-react";
import { getAuditActionLabel } from "@/lib/audit/actions";
import {
  getAuditCategory,
  severityVisual,
} from "@/lib/audit/category";
import {
  formatAbsoluteBn,
  formatRelativeBn,
} from "@/lib/audit/relative-time";

export type AuditLogItem = {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  summary: string;
  metadata: unknown;
  severity: string;
  userId: string | null;
  userName: string | null;
  userRoles: string[];
  ipAddress: string | null;
  userAgent: string | null;
  correlationId: string | null;
  businessDate: string;
  at: string;
};

function bnRolesLabel(roles: string[] = []) {
  if (!roles?.length) return "—";
  const labels: Record<string, string> = {
    owner: "মালিক",
    manager: "ম্যানেজার",
    cashier: "ক্যাশিয়ার",
    staff: "কর্মী",
    sales: "বিক্রয়কর্মী",
  };
  return roles
    .map((r) => labels[r.toLowerCase()] ?? r)
    .join(" · ");
}

export default function AuditLogRow({
  item,
  onOpen,
}: {
  item: AuditLogItem;
  onOpen: () => void;
}) {
  const category = getAuditCategory(item.action);
  const sev = severityVisual(item.severity);
  const actionLabel = getAuditActionLabel(item.action);
  const actorName = item.userName?.trim() || "সিস্টেম";
  const roleLabel = bnRolesLabel(item.userRoles);
  const relative = formatRelativeBn(item.at);
  const absolute = formatAbsoluteBn(item.at);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group block w-full text-left px-3 py-3 sm:px-4 sm:py-3.5 transition-colors hover:bg-muted/30 focus:outline-none focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-inset"
    >
      <div className="flex items-start gap-3 sm:gap-4">
        {/* ── Left: category icon badge ─────────────────────────── */}
        <div
          className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${category.tone.border} ${category.tone.bg} text-xl`}
          aria-hidden="true"
        >
          <span>{category.icon}</span>
          {/* Severity indicator dot (top-right) */}
          <span
            className={`absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-card ${sev.dot}`}
            aria-label={`severity: ${item.severity}`}
          />
        </div>

        {/* ── Middle: summary + meta ────────────────────────────── */}
        <div className="min-w-0 flex-1">
          {/* Top line: action label + relative time on the right (mobile-friendly) */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {category.label} · {actionLabel}
              </p>
              <p className="mt-0.5 text-sm font-bold leading-snug text-foreground sm:text-[15px]">
                {item.summary}
              </p>
            </div>
            <span
              title={absolute}
              className="shrink-0 text-[11px] font-semibold text-muted-foreground sm:text-xs"
            >
              {relative}
            </span>
          </div>

          {/* Bottom line: actor + severity chip */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] sm:text-xs">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold ${sev.chip}`}
            >
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${sev.dot}`} />
              {sev.label}
            </span>
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <span className="font-semibold text-foreground">{actorName}</span>
              {roleLabel !== "—" ? (
                <span className="text-muted-foreground">· {roleLabel}</span>
              ) : null}
            </span>
          </div>
        </div>

        {/* ── Right: chevron, desktop-only ───────────────────────── */}
        <ChevronRight className="hidden h-5 w-5 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 sm:block" />
      </div>
    </button>
  );
}
