// app/dashboard/reports/components/ReportsExportDialog.tsx
"use client";

import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toBengaliDigits } from "./charts/ChartShell";

export type ExportTargetKey =
  | "summary"
  | "sales"
  | "expenses"
  | "cash"
  | "payment"
  | "profit"
  | "products"
  | "stock"
  | "valuation";

export type ExportKey = ExportTargetKey | "active" | "all";

export type ExportFormat = "csv" | "xlsx" | "pdf";

export type ExportStatus = "pending" | "in-progress" | "done" | "error";

export type ExportHistoryItem = {
  at: number;
  label: string;
  filename: string;
  rows: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  online: boolean;
  rangeLabel: string | null;
  activeTabKey: ExportTargetKey;
  activeTabLabel: string;
  needsCogs: boolean;

  /** Estimated row counts shown next to each report. null = unknown. */
  rowCounts: Partial<Record<ExportTargetKey, number | null>>;

  exportingKey: ExportKey | null;
  /** Per-target progress; populated while a bulk export is running. */
  exportProgress: Partial<Record<ExportTargetKey, ExportStatus>>;
  exportError: string | null;

  exportHistory: ExportHistoryItem[];
  onClearHistory: () => void;

  /** Triggered when the user picks an export action. */
  onExport: (key: ExportKey, filenamePrefix: string, format: ExportFormat) => void;
};

type ReportOption = {
  key: ExportTargetKey;
  label: string;
  description: string;
  /** Always-on flag — only set false for ones we want to hide (e.g. cogs). */
  show?: boolean;
};

const FORMAT_OPTIONS: Array<{
  key: ExportFormat;
  label: string;
  description: string;
  icon: string;
}> = [
  {
    key: "csv",
    label: "CSV",
    description: "যেকোনো spreadsheet-এ import করা যাবে",
    icon: "📄",
  },
  {
    key: "xlsx",
    label: "Excel",
    description: "Bengali heading সহ styled .xlsx",
    icon: "📊",
  },
  {
    key: "pdf",
    label: "PDF",
    description: "প্রিন্ট-যোগ্য পেশাদার রিপোর্ট",
    icon: "📑",
  },
];

function buildReportOptions(needsCogs: boolean): ReportOption[] {
  return [
    {
      key: "summary",
      label: "সারাংশ",
      description: "এক সারিতে মোট বিক্রি · খরচ · লাভ · ক্যাশ",
    },
    {
      key: "sales",
      label: "বিক্রি",
      description: "সব বিল · গ্রাহক · পেমেন্ট পদ্ধতি",
    },
    {
      key: "expenses",
      label: "খরচ",
      description: "ক্যাটাগরি অনুযায়ী খরচ এন্ট্রি",
    },
    {
      key: "cash",
      label: "ক্যাশ",
      description: "ক্যাশ ইন/আউট লেজার",
    },
    {
      key: "payment",
      label: "পেমেন্ট পদ্ধতি",
      description: "ক্যাশ · বিকাশ · কার্ড — পদ্ধতিভিত্তিক ভাগ",
    },
    {
      key: "profit",
      label: "লাভ-ক্ষতি",
      description: needsCogs
        ? "দিনভিত্তিক বিক্রি · COGS · নিট লাভ"
        : "দিনভিত্তিক বিক্রি · খরচ · নিট লাভ",
    },
    {
      key: "products",
      label: "টপ পণ্য",
      description: "সবচেয়ে বেশি বিক্রি হওয়া পণ্য",
    },
    {
      key: "stock",
      label: "লো স্টক",
      description: "যেসব পণ্যের স্টক কম",
    },
    {
      key: "valuation",
      label: "স্টক মূল্য",
      description: "প্রতিটা পণ্যের বর্তমান মূল্য",
    },
  ];
}

function formatRelativeTime(at: number): string {
  const diff = Date.now() - at;
  if (diff < 60_000) return "এইমাত্র";
  if (diff < 3_600_000) {
    const mins = Math.floor(diff / 60_000);
    return `${toBengaliDigits(mins)} মিনিট আগে`;
  }
  if (diff < 86_400_000) {
    const hours = Math.floor(diff / 3_600_000);
    return `${toBengaliDigits(hours)} ঘণ্টা আগে`;
  }
  const days = Math.floor(diff / 86_400_000);
  return `${toBengaliDigits(days)} দিন আগে`;
}

function StatusBadge({ status }: { status: ExportStatus | undefined }) {
  if (status === "in-progress") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft text-primary border border-primary/30 px-2 py-0.5 text-[10px] font-semibold">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
        ডাউনলোড হচ্ছে
      </span>
    );
  }
  if (status === "done") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success-soft text-success border border-success/30 px-2 py-0.5 text-[10px] font-semibold">
        <span className="leading-none">✓</span>
        সম্পন্ন
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft text-danger border border-danger/30 px-2 py-0.5 text-[10px] font-semibold">
        ব্যর্থ
      </span>
    );
  }
  return null;
}

export function ReportsExportDialog({
  open,
  onOpenChange,
  online,
  rangeLabel,
  activeTabKey,
  activeTabLabel,
  needsCogs,
  rowCounts,
  exportingKey,
  exportProgress,
  exportError,
  exportHistory,
  onClearHistory,
  onExport,
}: Props) {
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [filenamePrefix, setFilenamePrefix] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  const reports = useMemo(() => buildReportOptions(needsCogs), [needsCogs]);

  const isBusy = exportingKey !== null;

  const totalEstimatedRows = useMemo(() => {
    let total = 0;
    let anyKnown = false;
    for (const r of reports) {
      const count = rowCounts[r.key];
      if (typeof count === "number") {
        anyKnown = true;
        total += count;
      }
    }
    return anyKnown ? total : null;
  }, [reports, rowCounts]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isBusy && !next) return; // don't allow closing mid-export
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] overflow-x-hidden overflow-y-auto border-border/70 p-0 sm:w-[calc(100vw-2rem)] sm:max-w-2xl">
        <DialogHeader className="min-w-0 border-b border-border/60 px-4 py-4 sm:px-5">
          <DialogTitle className="text-base">রিপোর্ট ডাউনলোড</DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            নির্বাচিত সময়ের ডাটা CSV ফাইল হিসেবে সেভ করুন।
          </p>
        </DialogHeader>

        <div className="min-w-0 space-y-4 px-4 py-4 sm:px-5">
          {/* Context strip */}
          <div className="min-w-0 rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5 text-xs space-y-1">
            <p className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">সময়</span>
              <span className="min-w-0 max-w-[58%] truncate text-right font-semibold text-foreground">
                {rangeLabel ?? "সব সময়"}
              </span>
            </p>
            <p className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">বর্তমান ট্যাব</span>
              <span className="min-w-0 max-w-[58%] truncate text-right font-semibold text-foreground">
                {activeTabLabel}
              </span>
            </p>
            {totalEstimatedRows !== null ? (
              <p className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">আনুমানিক মোট সারি</span>
                <span className="shrink-0 font-semibold text-foreground tabular-nums">
                  {toBengaliDigits(totalEstimatedRows.toLocaleString("en-IN"))}
                </span>
              </p>
            ) : null}
          </div>

          {/* Format toggle */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">
              ফরম্যাট
            </p>
            <div
              role="radiogroup"
              aria-label="Export format"
              className="grid grid-cols-1 sm:grid-cols-3 gap-2"
            >
              {FORMAT_OPTIONS.map((opt) => {
                const active = format === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={isBusy}
                    onClick={() => setFormat(opt.key)}
                    className={`relative flex flex-col items-start gap-1 rounded-xl border px-3 py-2.5 text-left transition-all ${
                      active
                        ? "border-primary/50 bg-primary-soft shadow-[0_4px_12px_rgba(15,23,42,0.06)] ring-2 ring-primary/30"
                        : "border-border bg-card hover:border-primary/30 hover:bg-muted/50"
                    } ${isBusy ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-base" aria-hidden="true">
                        {opt.icon}
                      </span>
                      <span
                        className={`text-sm font-bold ${
                          active ? "text-primary" : "text-foreground"
                        }`}
                      >
                        {opt.label}
                      </span>
                      {active ? (
                        <span
                          aria-hidden="true"
                          className="ml-auto inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground"
                        >
                          ✓
                        </span>
                      ) : null}
                    </span>
                    <span className="text-[10.5px] text-muted-foreground leading-snug">
                      {opt.description}
                    </span>
                  </button>
                );
              })}
            </div>
            {format === "pdf" ? (
              <p className="text-[11px] text-muted-foreground">
                PDF তৈরি হতে কয়েক সেকেন্ড সময় নিতে পারে (বড় রিপোর্টে আরও বেশি)।
              </p>
            ) : null}
          </div>

          {/* Filename prefix */}
          <div className="space-y-2">
            <label
              htmlFor="export-filename-prefix"
              className="text-xs font-semibold text-muted-foreground"
            >
              ফাইল-নামের prefix (ঐচ্ছিক)
            </label>
            <input
              id="export-filename-prefix"
              type="text"
              value={filenamePrefix}
              onChange={(e) =>
                setFilenamePrefix(
                  e.target.value.replace(/[^A-Za-z0-9_\-]+/g, "")
                )
              }
              disabled={isBusy}
              placeholder="যেমন: shop-name বা owner-monthly"
              className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
            />
            <p className="text-[11px] text-muted-foreground">
              ফাইলগুলো এই prefix দিয়ে শুরু হবে। শুধু ইংরেজি অক্ষর, সংখ্যা, _ এবং
              - ব্যবহার করুন।
            </p>
          </div>

          {/* Bulk actions */}
          <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => onExport("active", filenamePrefix, format)}
              disabled={!online || isBusy}
              className="inline-flex min-w-0 h-auto min-h-11 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary px-4 py-3 text-center text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              ↓ {activeTabLabel} (এই ট্যাব)
            </button>
            <button
              type="button"
              onClick={() => onExport("all", filenamePrefix, format)}
              disabled={!online || isBusy}
              className="inline-flex min-w-0 h-auto min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-center text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {format === "csv"
                ? "⤓ সব রিপোর্ট আলাদা ফাইলে"
                : format === "xlsx"
                  ? "⤓ সব রিপোর্ট এক Excel-এ"
                  : "⤓ সব রিপোর্ট এক PDF-এ"}
            </button>
          </div>

          {/* Per-report list */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground">
              আলাদাভাবে ডাউনলোড
            </p>
            <ul className="min-w-0 rounded-xl border border-border/70 overflow-hidden divide-y divide-border/60 bg-card">
              {reports.map((opt) => {
                const status = exportProgress[opt.key];
                const count = rowCounts[opt.key];
                const isActiveTab = opt.key === activeTabKey;
                const disabled = !online || isBusy;
                return (
                  <li key={opt.key}>
                    <button
                      type="button"
                      onClick={() => onExport(opt.key, filenamePrefix, format)}
                      disabled={disabled}
                      className="flex w-full min-w-0 items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/60 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {opt.label}
                          </p>
                          {isActiveTab ? (
                            <span className="rounded-full bg-primary-soft text-primary border border-primary/30 px-1.5 py-0.5 text-[9px] font-semibold">
                              বর্তমান
                            </span>
                          ) : null}
                          <StatusBadge status={status} />
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          {opt.description}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 pl-2">
                        <span className="max-w-[84px] truncate text-right text-[11px] text-muted-foreground tabular-nums whitespace-nowrap sm:max-w-none">
                          {typeof count === "number"
                            ? `${toBengaliDigits(count.toLocaleString("en-IN"))} সারি`
                            : "—"}
                        </span>
                        <span
                          aria-hidden="true"
                          className="text-muted-foreground/60"
                        >
                          ↓
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Error */}
          {exportError ? (
            <div className="rounded-lg border border-danger/40 bg-danger-soft/60 px-3 py-2 text-xs text-danger">
              {exportError}
            </div>
          ) : null}

          {/* Offline notice */}
          {!online ? (
            <div className="rounded-lg border border-warning/40 bg-warning-soft/60 px-3 py-2 text-xs text-warning">
              অফলাইনে রিপোর্ট ডাউনলোড করা যাবে না।
            </div>
          ) : null}

          {/* History */}
          {exportHistory.length > 0 ? (
            <div className="rounded-xl border border-border/70 overflow-hidden">
              <button
                type="button"
                onClick={() => setHistoryOpen((v) => !v)}
                className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left hover:bg-muted/40 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">
                    সর্বশেষ ডাউনলোড
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {toBengaliDigits(exportHistory.length)} টি ফাইল
                  </p>
                </div>
                <span
                  aria-hidden="true"
                  className="text-xs text-muted-foreground"
                >
                  {historyOpen ? "−" : "+"}
                </span>
              </button>
              {historyOpen ? (
                <>
                  <ul className="divide-y divide-border/60 max-h-56 overflow-y-auto">
                    {exportHistory.map((item, idx) => (
                      <li
                        key={`${item.filename}-${item.at}-${idx}`}
                        className="px-3.5 py-2 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">
                            {item.label}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate font-mono">
                            {item.filename}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[11px] text-muted-foreground">
                            {formatRelativeTime(item.at)}
                          </p>
                          <p className="text-[11px] text-muted-foreground tabular-nums">
                            {toBengaliDigits(item.rows.toLocaleString("en-IN"))}{" "}
                            সারি
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="border-t border-border/60 px-3.5 py-2 flex justify-end">
                    <button
                      type="button"
                      onClick={onClearHistory}
                      className="text-[11px] font-semibold text-muted-foreground transition-colors hover:text-danger"
                    >
                      ইতিহাস মুছুন
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
