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
        <div className="text-[1.25rem] font-black leading-none tracking-tight text-foreground sm:text-[1.6rem]">
          {value}
        </div>
      );
    }

    const amount = trimmed.replace(/^৳\s*/, "").trim();

    return (
      <div className="flex min-w-0 items-end gap-1">
        <span className="shrink-0 text-base font-semibold leading-none text-foreground/75">
          ৳
        </span>
        <div className="truncate text-[1.35rem] font-black leading-none tracking-tight text-foreground tabular-nums sm:text-[1.8rem]">
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

  const metricVisualMap: Record<
    string,
    { icon: string; iconClass: string; trendChipClass: string }
  > = {
    বিক্রি: {
      icon: "🛍",
      iconClass: "bg-primary-soft text-primary border-primary/25",
      trendChipClass: "bg-primary-soft/70 text-primary border-primary/25",
    },
    লাভ: {
      icon: "📈",
      iconClass: "bg-success-soft text-success border-success/25",
      trendChipClass: "bg-success-soft/70 text-success border-success/25",
    },
    খরচ: {
      icon: "🧾",
      iconClass: "bg-warning-soft text-warning border-warning/25",
      trendChipClass: "bg-warning-soft/70 text-warning border-warning/25",
    },
    ক্যাশ: {
      icon: "💵",
      iconClass: "bg-sky-500/10 text-sky-700 border-sky-200/60",
      trendChipClass: "bg-sky-500/10 text-sky-700 border-sky-200/60",
    },
  };

  const playbookToneMap: Record<string, string> = {
    success: "border-success/20 bg-success-soft/18",
    warning: "border-warning/20 bg-warning-soft/18",
    danger: "border-danger/20 bg-danger-soft/18",
    primary: "border-primary/20 bg-primary-soft/18",
  };

  const playbookBadgeMap: Record<string, string> = {
    success: "bg-success/10 text-success border-success/20",
    warning: "bg-warning/10 text-warning border-warning/20",
    danger: "bg-danger/10 text-danger border-danger/20",
    primary: "bg-primary/10 text-primary border-primary/20",
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

        <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
          {insight.metrics.map((metric) => (
            <article
              key={metric.label}
              className="min-w-0 rounded-2xl border border-border/70 bg-card p-3 shadow-[0_8px_20px_rgba(15,23,42,0.03)] sm:p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:text-xs">
                  {metric.label}
                </div>
                <span
                  className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs ${
                    metricVisualMap[metric.label]?.iconClass ??
                    "bg-muted text-muted-foreground border-border/60"
                  }`}
                >
                  {metricVisualMap[metric.label]?.icon ?? "•"}
                </span>
              </div>
              <div className="mt-2.5 min-w-0">
                {renderMetricValue(metric.value)}
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <span
                  className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${
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
                <span
                  title={metric.trendLabel}
                  className={`inline-flex min-w-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold sm:text-[11px] ${
                    metricVisualMap[metric.label]?.trendChipClass ??
                    "bg-muted/60 text-muted-foreground border-border/60"
                  }`}
                >
                  <span className="truncate">{metric.trendLabel}</span>
                </span>
              </div>
              <p
                className={`mt-2 text-[10px] font-medium ${
                  metric.tone === "success"
                    ? "text-success/85"
                    : metric.tone === "warning"
                      ? "text-warning/85"
                      : metric.tone === "danger"
                        ? "text-danger/85"
                        : "text-muted-foreground"
                }`}
              >
                গতকালের তুলনায়
              </p>
            </article>
          ))}
        </div>

        <div className="grid gap-4">
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
            {insight.playbook.length > 0 ? (
              <div className="rounded-[22px] border border-border/60 bg-card p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-foreground">
                      লাভ বাড়ানোর প্ল্যান
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">আজ কী করবেন</p>
                  </div>
                  <span className="inline-flex items-center rounded-full border border-border/70 bg-background px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                    {insight.playbook.length}টি সাজেশন
                  </span>
                </div>
                <div className="space-y-2.5">
                  {insight.playbook.map((item, index) => (
                    <div
                      key={item.id}
                      className={`rounded-[22px] border px-3 py-3 shadow-[0_8px_20px_rgba(15,23,42,0.03)] ${
                        playbookToneMap[item.tone] ?? playbookToneMap.primary
                      }`}
                    >
                      <details className="group">
                        <summary className="flex cursor-pointer list-none items-start gap-2">
                          <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-background/70 bg-background text-xs font-bold text-foreground shadow-sm">
                            {index + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm font-semibold leading-5 text-foreground">
                              {item.title}
                            </h3>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <span
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                                  playbookBadgeMap[item.tone] ?? playbookBadgeMap.primary
                                }`}
                              >
                                {item.confidenceLabel}
                              </span>
                              <span className="inline-flex items-center rounded-full border border-success/20 bg-success-soft/60 px-2 py-0.5 text-[11px] font-semibold text-foreground">
                                {item.impactLabel}
                              </span>
                              <span className="inline-flex items-center rounded-full border border-border/70 bg-background px-2 py-0.5 text-[10px] font-semibold text-muted-foreground group-open:hidden">
                                বিস্তারিত
                              </span>
                              <span className="hidden items-center rounded-full border border-border/70 bg-background px-2 py-0.5 text-[10px] font-semibold text-muted-foreground group-open:inline-flex">
                                বন্ধ
                              </span>
                            </div>
                          </div>
                        </summary>

                        <div className="mt-2.5 space-y-2.5">
                          <div className="rounded-2xl border border-border/50 bg-background/90 px-3 py-2.5">
                            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                              এখন যা করবেন
                            </div>
                            <p className="mt-1 text-sm leading-6 text-foreground/90">
                              {item.action}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-border/60 bg-background/80 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
                            <p>{item.reason}</p>
                            <p className="mt-1.5">
                              <span className="font-semibold text-foreground/80">
                                সতর্কতা:
                              </span>{" "}
                              {item.guardrail}
                            </p>
                          </div>
                        </div>
                      </details>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-[22px] border border-border/60 bg-card p-4">
              <div className="mb-3 text-sm font-semibold text-foreground">
                দ্রুত কাজ
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
