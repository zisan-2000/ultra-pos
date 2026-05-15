"use client";

import { Clock, ExternalLink } from "lucide-react";
import { getAuditActionLabel, AUDIT_SEVERITY_LABELS } from "@/lib/audit/actions";

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

const severityClass: Record<string, string> = {
  info: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  critical: "bg-rose-50 text-rose-700 border-rose-200",
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("bn-BD", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function AuditLogRow({
  item,
  onOpen,
}: {
  item: AuditLogItem;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid w-full grid-cols-1 gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/30 md:grid-cols-[180px_1fr_180px_120px]"
    >
      <div>
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black ${severityClass[item.severity] ?? severityClass.info}`}>
          {AUDIT_SEVERITY_LABELS[item.severity as "info"] ?? item.severity}
        </span>
        <p className="mt-2 text-xs font-bold text-muted-foreground">{getAuditActionLabel(item.action)}</p>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-black text-foreground">{item.summary}</p>
        <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">
          {item.targetType}{item.targetId ? ` #${item.targetId}` : ""} · {item.correlationId || "no correlation"}
        </p>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-foreground">{item.userName || "সিস্টেম"}</p>
        <p className="truncate text-xs text-muted-foreground">{item.userRoles?.join(", ") || "no role"}</p>
      </div>
      <div className="flex items-center justify-between gap-2 md:justify-end">
        <span className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          {formatTime(item.at)}
        </span>
        <ExternalLink className="h-4 w-4 text-muted-foreground" />
      </div>
    </button>
  );
}

