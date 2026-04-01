"use client";

import OfflineAwareLink from "@/components/offline-aware-link";
import type { OwnerCopilotInsight } from "@/lib/owner-copilot";

export default function CopilotInsightPanel({
  insight,
}: {
  insight: OwnerCopilotInsight;
}) {
  const toneMap: Record<string, string> = {
    success:
      "border-success/20 bg-gradient-to-br from-success-soft/70 via-card to-card",
    warning:
      "border-warning/20 bg-gradient-to-br from-warning-soft/70 via-card to-card",
    danger:
      "border-danger/20 bg-gradient-to-br from-danger-soft/65 via-card to-card",
    primary:
      "border-primary/20 bg-gradient-to-br from-primary-soft/70 via-card to-card",
  };

  const badgeToneMap: Record<string, string> = {
    success: "bg-success/15 text-success ring-success/20",
    warning: "bg-warning/15 text-warning ring-warning/20",
    danger: "bg-danger/15 text-danger ring-danger/20",
    primary: "bg-primary/15 text-primary ring-primary/20",
  };

  const actionToneMap: Record<string, string> = {
    success: "hover:border-success/30 hover:text-success",
    warning: "hover:border-warning/30 hover:text-warning",
    danger: "hover:border-danger/30 hover:text-danger",
    primary: "hover:border-primary/30 hover:text-primary",
  };

  const metricToneMap: Record<string, string> = {
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    danger: "bg-danger/15 text-danger",
    muted: "bg-muted text-muted-foreground",
  };

  return (
    <section
      className={`relative overflow-hidden rounded-[28px] border p-4 shadow-[0_16px_34px_rgba(15,23,42,0.08)] sm:p-5 ${
        toneMap[insight.tone] ?? toneMap.primary
      }`}
    >
      <div className="pointer-events-none absolute inset-y-0 right-0 w-40 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.24),transparent_62%)]" />
      <div className="relative space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ring-1 ${
                  badgeToneMap[insight.tone] ?? badgeToneMap.primary
                }`}
              >
                Smart Copilot
              </span>
              <span className="text-xs font-medium text-muted-foreground">
                {insight.badge}
              </span>
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
                {insight.headline}
              </h2>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                {insight.overview}
              </p>
            </div>
          </div>
          <div className="inline-flex w-fit items-center rounded-2xl border border-border/70 bg-background/75 px-3 py-2 text-sm font-semibold text-foreground shadow-sm">
            {insight.priorityLabel}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
          {insight.metrics.map((metric) => (
            <div
              key={metric.label}
              className="min-h-[108px] rounded-[22px] border border-border/60 bg-background/80 p-3 shadow-[0_10px_22px_rgba(15,23,42,0.04)] sm:min-h-[116px] sm:p-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {metric.label}
                </div>
                <span
                  className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                    metricToneMap[metric.tone] ?? metricToneMap.muted
                  }`}
                >
                  {metric.tone === "success"
                    ? "↑"
                    : metric.tone === "danger"
                      ? "↓"
                      : metric.tone === "warning"
                        ? "!"
                        : "•"}
                </span>
              </div>
              <div className="mt-3 text-[1.75rem] font-extrabold leading-none tracking-tight text-foreground sm:text-[1.9rem]">
                {metric.value}
              </div>
              <div
                className={`mt-2 text-[11px] font-semibold leading-5 ${
                  metric.tone === "success"
                    ? "text-success"
                    : metric.tone === "warning"
                      ? "text-warning"
                      : metric.tone === "danger"
                        ? "text-danger"
                        : "text-muted-foreground"
                }`}
              >
                {metric.trendLabel}
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {insight.bullets.map((bullet, index) => (
            <div
              key={`${index}-${bullet}`}
              className="rounded-2xl border border-border/60 bg-background/70 p-3 shadow-[0_10px_22px_rgba(15,23,42,0.04)]"
            >
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Insight {index + 1}
              </div>
              <p className="text-sm leading-6 text-foreground/90">{bullet}</p>
            </div>
          ))}
        </div>

        {insight.actionNotes.length > 0 ? (
          <div className="rounded-2xl border border-border/60 bg-background/75 p-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Profit Playbook
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              {insight.actionNotes.map((note) => (
                <div
                  key={note}
                  className="rounded-2xl border border-border/60 bg-card/90 px-3 py-2 text-sm font-medium leading-6 text-foreground/90"
                >
                  {note}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {insight.actions.map((action) => (
            <OfflineAwareLink
              key={action.href}
              href={action.href}
              className={`inline-flex items-center rounded-full border border-border bg-background/80 px-3 py-2 text-sm font-semibold text-foreground transition-colors ${
                actionToneMap[insight.tone] ?? actionToneMap.primary
              }`}
            >
              {action.label}
            </OfflineAwareLink>
          ))}
        </div>
      </div>
    </section>
  );
}
