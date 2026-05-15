// app/dashboard/audit/components/AuditDetailModal.tsx
"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Globe2, MapPin, User as UserIcon, X } from "lucide-react";
import { getAuditActionLabel } from "@/lib/audit/actions";
import { getAuditCategory, severityVisual } from "@/lib/audit/category";
import {
  formatAbsoluteBn,
  formatRelativeBn,
} from "@/lib/audit/relative-time";
import {
  renderMetadataLists,
  renderMetadataRows,
} from "@/lib/audit/metadata-renderer";
import type { AuditLogItem } from "./AuditLogRow";

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value ?? "");
  }
}

function bnRolesLabel(roles: string[] = []) {
  if (!roles?.length) return "";
  const labels: Record<string, string> = {
    owner: "মালিক",
    manager: "ম্যানেজার",
    cashier: "ক্যাশিয়ার",
    staff: "কর্মী",
    sales: "বিক্রয়কর্মী",
  };
  return roles.map((r) => labels[r.toLowerCase()] ?? r).join(" · ");
}

export default function AuditDetailModal({
  item,
  onClose,
}: {
  item: AuditLogItem | null;
  onClose: () => void;
}) {
  const [techOpen, setTechOpen] = useState(false);

  // Lock body scroll while open + close on Escape
  useEffect(() => {
    if (!item) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = original;
      window.removeEventListener("keydown", onKey);
    };
  }, [item, onClose]);

  if (!item) return null;

  const category = getAuditCategory(item.action);
  const sev = severityVisual(item.severity);
  const actionLabel = getAuditActionLabel(item.action);
  const actorName = item.userName?.trim() || "সিস্টেম";
  const roleLabel = bnRolesLabel(item.userRoles);
  const metadataRows = renderMetadataRows(item.metadata);
  const metadataLists = renderMetadataLists(item.metadata);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="audit-detail-title"
      onClick={onClose}
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4 animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-[0_30px_60px_rgba(15,23,42,0.25)] sm:rounded-3xl"
      >
        {/* Mobile pull-handle */}
        <div className="mx-auto mt-2 h-1 w-12 rounded-full bg-muted-foreground/30 sm:hidden" />

        {/* ── Header band ─────────────────────────────────────────── */}
        <div className={`relative ${category.tone.bg} px-5 pb-5 pt-4 sm:pt-5`}>
          <button
            type="button"
            onClick={onClose}
            aria-label="বন্ধ করুন"
            className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/70 text-foreground transition hover:bg-white sm:right-4 sm:top-4"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex items-start gap-3 pr-12">
            <div
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border ${category.tone.border} bg-white text-3xl shadow-sm`}
              aria-hidden="true"
            >
              {category.icon}
            </div>
            <div className="min-w-0 flex-1">
              <p
                className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${category.tone.fg}`}
              >
                {category.label}
              </p>
              <h2
                id="audit-detail-title"
                className="mt-0.5 text-lg font-extrabold leading-tight text-foreground sm:text-xl"
              >
                {actionLabel}
              </h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] sm:text-xs">
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold ${sev.chip}`}
                >
                  <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${sev.dot}`} />
                  {sev.label}
                </span>
                <span
                  className="font-semibold text-foreground"
                  title={formatAbsoluteBn(item.at)}
                >
                  {formatRelativeBn(item.at)}
                </span>
                <span className="text-muted-foreground">
                  · {formatAbsoluteBn(item.at)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Scrollable body ─────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {/* Headline summary */}
          <div className="rounded-2xl border border-border bg-muted/30 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              কী হয়েছে
            </p>
            <p className="mt-1 text-[15px] font-semibold leading-relaxed text-foreground">
              {item.summary}
            </p>
          </div>

          {/* Actor */}
          <Section title="কে করেছেন">
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <UserIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-foreground">{actorName}</p>
                {roleLabel ? (
                  <p className="truncate text-xs text-muted-foreground">{roleLabel}</p>
                ) : null}
              </div>
            </div>
          </Section>

          {/* Known/structured metadata */}
          {metadataRows.length > 0 ? (
            <Section title="বিস্তারিত">
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                <dl className="divide-y divide-border">
                  {metadataRows.map((row, idx) => (
                    <div
                      key={`${row.label}-${idx}`}
                      className="grid grid-cols-1 gap-1 px-3 py-2.5 sm:grid-cols-[170px_1fr] sm:items-center sm:gap-3"
                    >
                      <dt
                        className={`text-xs font-semibold ${
                          row.emphasis === "muted"
                            ? "text-muted-foreground"
                            : "text-muted-foreground/90"
                        }`}
                      >
                        {row.label}
                      </dt>
                      <dd
                        className={`break-words text-sm ${
                          row.emphasis === "highlight"
                            ? "font-bold text-foreground"
                            : row.emphasis === "muted"
                              ? "text-muted-foreground"
                              : "text-foreground"
                        }`}
                      >
                        {row.value || "—"}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </Section>
          ) : null}

          {/* Embedded lists (e.g. sale items) */}
          {metadataLists.map((list) => (
            <Section key={list.label} title={list.label}>
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                <ul className="divide-y divide-border">
                  {list.rows.slice(0, 50).map((row, idx) => (
                    <li
                      key={idx}
                      className="grid grid-cols-1 gap-1 px-3 py-2.5 text-xs sm:text-sm"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-semibold text-foreground">
                          {String(row.name ?? row.label ?? row.id ?? `আইটেম ${idx + 1}`)}
                        </span>
                        {row.qty !== undefined ? (
                          <span className="text-muted-foreground">
                            পরিমাণ: <span className="font-semibold text-foreground">{String(row.qty)}</span>
                          </span>
                        ) : null}
                        {row.unitPrice !== undefined ? (
                          <span className="text-muted-foreground">
                            একক: <span className="font-semibold text-foreground">৳ {String(row.unitPrice)}</span>
                          </span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
                {list.rows.length > 50 ? (
                  <p className="px-3 py-2 text-[11px] italic text-muted-foreground">
                    আরও {list.rows.length - 50} টি — সম্পূর্ণ তালিকা technical details-এ দেখুন
                  </p>
                ) : null}
              </div>
            </Section>
          ))}

          {/* Context */}
          <Section title="কোথা থেকে">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <ContextCell
                icon={<MapPin className="h-4 w-4" />}
                label="IP ঠিকানা"
                value={item.ipAddress || "—"}
              />
              <ContextCell
                icon={<Globe2 className="h-4 w-4" />}
                label="ডিভাইস"
                value={item.userAgent ? shortenUA(item.userAgent) : "—"}
              />
            </div>
          </Section>

          {/* Collapsible technical details */}
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setTechOpen((v) => !v)}
              className="inline-flex w-full items-center justify-between rounded-2xl border border-border bg-muted/20 px-4 py-3 text-left text-sm font-semibold text-foreground transition hover:bg-muted/40"
            >
              <span>Technical details (advanced)</span>
              {techOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            {techOpen ? (
              <div className="mt-2 space-y-2">
                <KV label="Audit ID" value={item.id} mono />
                <KV
                  label="Target"
                  value={`${item.targetType}${item.targetId ? ` #${item.targetId}` : ""}`}
                  mono
                />
                {item.correlationId ? (
                  <KV label="Correlation ID" value={item.correlationId} mono />
                ) : null}
                <KV label="Action key" value={item.action} mono />
                <KV label="Business date" value={item.businessDate} mono />
                <details className="overflow-hidden rounded-2xl border border-border">
                  <summary className="cursor-pointer bg-muted/30 px-3 py-2 text-xs font-semibold text-muted-foreground">
                    Raw metadata JSON
                  </summary>
                  <pre className="max-h-[300px] overflow-auto bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-100">
                    {prettyJson(item.metadata)}
                  </pre>
                </details>
              </div>
            ) : null}
          </div>

          <div className="h-2" />
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      {children}
    </section>
  );
}

function ContextCell({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-border bg-card p-3">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 break-all text-xs text-foreground">{value}</p>
      </div>
    </div>
  );
}

function KV({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-1 rounded-xl border border-border bg-card px-3 py-2 sm:grid-cols-[150px_1fr] sm:items-center">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`break-all text-xs text-foreground ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function shortenUA(ua: string): string {
  // Pull out the recognisable browser/OS hints; drop the heavy version noise.
  const trimmed = ua.trim();
  const m =
    /(Edg|Chrome|Firefox|Safari|OPR)\/[\d.]+.*?(Mobile|Tablet|Windows|Macintosh|Linux|Android|iPhone|iPad)?/i.exec(
      trimmed,
    );
  if (!m) return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
  const browser = m[1] === "OPR" ? "Opera" : m[1];
  const platform = m[2] ?? "";
  return platform ? `${browser} · ${platform}` : browser;
}
