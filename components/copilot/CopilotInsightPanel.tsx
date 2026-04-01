"use client";

import OfflineAwareLink from "@/components/offline-aware-link";
import type { OwnerCopilotInsight } from "@/lib/owner-copilot";

export default function CopilotInsightPanel({
  insight,
}: {
  insight: OwnerCopilotInsight;
}) {
  const renderMetricValue = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed.startsWith("৳")) {
      return (
        <div className="text-[1.15rem] font-bold leading-none tracking-tight text-foreground sm:text-[1.45rem]">
          {value}
        </div>
      );
    }

    const amount = trimmed.replace(/^৳\s*/, "").trim();

    return (
      <div className="space-y-1">
        <div className="text-base font-semibold leading-none text-foreground/80">
          ৳
        </div>
        <div className="break-words text-[1.35rem] font-bold leading-none tracking-tight text-foreground sm:text-[1.7rem]">
          {amount}
        </div>
      </div>
    );
  };

  const toneMap: Record<string, string> = {
    success: "border-success/20 bg-background",
    warning: "border-warning/20 bg-background",
    danger: "border-danger/20 bg-background",
    primary: "border-primary/20 bg-background",
  };

  const badgeToneMap: Record<string, string> = {
    success: "bg-success/10 text-success border-success/15",
    warning: "bg-warning/10 text-warning border-warning/15",
    danger: "bg-danger/10 text-danger border-danger/15",
    primary: "bg-primary/10 text-primary border-primary/15",
  };

  const actionToneMap: Record<string, string> = {
    success: "hover:border-success/30 hover:text-success hover:bg-success/5",
    warning: "hover:border-warning/30 hover:text-warning hover:bg-warning/5",
    danger: "hover:border-danger/30 hover:text-danger hover:bg-danger/5",
    primary: "hover:border-primary/30 hover:text-primary hover:bg-primary/5",
  };

  const metricToneMap: Record<string, string> = {
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
    muted: "text-muted-foreground",
  };

  const accentMap: Record<string, string> = {
    success: "bg-success/80",
    warning: "bg-warning/80",
    danger: "bg-danger/80",
    primary: "bg-primary/80",
  };

  return (
    <section
      className={`rounded-[28px] border p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)] sm:p-5 ${
        toneMap[insight.tone] ?? toneMap.primary
      }`}
    >
      <div className="space-y-4">
        <div className="rounded-[24px] border border-border/60 bg-muted/20 p-4">
          <div className="flex items-start gap-3">
            <div
              className={`mt-1 h-12 w-1 shrink-0 rounded-full ${
                accentMap[insight.tone] ?? accentMap.primary
              }`}
            />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                    badgeToneMap[insight.tone] ?? badgeToneMap.primary
                  }`}
                >
                  Smart Copilot
                </span>
                <span className="text-sm font-medium text-muted-foreground">
                  {insight.badge}
                </span>
                <span className="ml-auto inline-flex items-center rounded-full border border-border/70 bg-background px-3 py-1 text-xs font-semibold text-foreground">
                  {insight.priorityLabel}
                </span>
              </div>
              <div className="space-y-1.5">
                <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-[1.7rem]">
                  {insight.headline}
                </h2>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  {insight.overview}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {insight.metrics.map((metric) => (
            <div
              key={metric.label}
              className="min-w-0 rounded-[22px] border border-border/60 bg-card p-3.5 shadow-[0_8px_20px_rgba(15,23,42,0.03)] sm:p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-medium text-muted-foreground">
                  {metric.label}
                </div>
                <span
                  className={`inline-flex items-center text-sm font-semibold ${
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
              <div className="mt-3 min-w-0">
                {renderMetricValue(metric.value)}
              </div>
              <div
                className={`mt-2 break-words text-xs leading-5 ${
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

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)]">
          <div className="rounded-[22px] border border-border/60 bg-card p-4">
            <div className="mb-3 text-sm font-semibold text-foreground">
              Key insights
            </div>
            <div className="space-y-3">
              {insight.bullets.map((bullet, index) => (
                <div key={`${index}-${bullet}`} className="flex items-start gap-3">
                  <span
                    className={`mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      badgeToneMap[insight.tone] ?? badgeToneMap.primary
                    }`}
                  >
                    {index + 1}
                  </span>
                  <p className="text-sm leading-6 text-foreground/90">{bullet}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {insight.actionNotes.length > 0 ? (
              <div className="rounded-[22px] border border-border/60 bg-card p-4">
                <div className="mb-3 text-sm font-semibold text-foreground">
                  Profit playbook
                </div>
                <div className="space-y-2.5">
                  {insight.actionNotes.map((note) => (
                    <div
                      key={note}
                      className="rounded-2xl border border-border/60 bg-muted/20 px-3 py-2.5 text-sm leading-6 text-foreground/90"
                    >
                      {note}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-[22px] border border-border/60 bg-card p-4">
              <div className="mb-3 text-sm font-semibold text-foreground">
                Quick actions
              </div>
              <div className="flex flex-wrap gap-2">
                {insight.actions.map((action) => (
                  <OfflineAwareLink
                    key={action.href}
                    href={action.href}
                    className={`inline-flex items-center rounded-full border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors ${
                      actionToneMap[insight.tone] ?? actionToneMap.primary
                    }`}
                  >
                    {action.label}
                  </OfflineAwareLink>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
