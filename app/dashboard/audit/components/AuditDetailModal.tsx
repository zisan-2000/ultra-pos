"use client";

import { X } from "lucide-react";
import { getAuditActionLabel } from "@/lib/audit/actions";
import type { AuditLogItem } from "./AuditLogRow";

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value ?? "");
  }
}

export default function AuditDetailModal({
  item,
  onClose,
}: {
  item: AuditLogItem | null;
  onClose: () => void;
}) {
  if (!item) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92dvh] w-full max-w-3xl overflow-hidden rounded-t-[2rem] border border-border bg-card shadow-2xl sm:rounded-[2rem]">
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">
              Audit Detail
            </p>
            <h2 className="mt-1 text-xl font-black text-foreground">
              {getAuditActionLabel(item.action)}
            </h2>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              {new Date(item.at).toLocaleString("bn-BD")} · {item.businessDate}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background"
            aria-label="Close audit detail"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[70dvh] space-y-4 overflow-y-auto p-5">
          <div className="rounded-2xl border border-border bg-muted/20 p-4">
            <p className="text-sm font-black text-foreground">{item.summary}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Info label="Severity" value={item.severity} />
            <Info label="User" value={item.userName || "সিস্টেম"} />
            <Info label="Target" value={`${item.targetType}${item.targetId ? ` #${item.targetId}` : ""}`} />
            <Info label="Correlation" value={item.correlationId || "—"} />
            <Info label="IP" value={item.ipAddress || "—"} />
            <Info label="User Agent" value={item.userAgent || "—"} />
          </div>
          <div>
            <p className="mb-2 text-sm font-black text-foreground">Metadata</p>
            <pre className="max-h-[360px] overflow-auto rounded-2xl border border-border bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">
              {prettyJson(item.metadata)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-3">
      <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

