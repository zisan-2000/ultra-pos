"use client";

import OfflineAwareLink from "@/components/offline-aware-link";
import type { OwnerCopilotInsight } from "@/lib/owner-copilot";

export default function CopilotInsightPanel({
  insight,
}: {
  insight: OwnerCopilotInsight;
}) {
  const primaryInsights = insight.bullets.slice(0, 3);
  const remainingMetrics = insight.metrics;
  const remainingInsights = insight.bullets.slice(3);
  const primaryPlaybook = insight.playbook[0] ?? null;
  const remainingPlaybooks = insight.playbook.slice(1);
  const primaryAction = insight.actions[0] ?? null;
  const remainingActions = insight.actions.slice(1);
  const hasMoreDetails =
    remainingMetrics.length > 0 ||
    remainingInsights.length > 0 ||
    remainingPlaybooks.length > 0 ||
    remainingActions.length > 0;

  const renderMetricValue = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed.startsWith("৳")) {
      return (
        <div className="text-[1.15rem] font-black leading-none tracking-tight text-foreground sm:text-[1.35rem]">
          {value}
        </div>
      );
    }

    const amount = trimmed.replace(/^৳\s*/, "").trim();

    return (
      <div className="flex min-w-0 items-end gap-1">
        <span className="shrink-0 text-sm font-semibold leading-none text-foreground/75">
          ৳
        </span>
        <div className="truncate text-[1.2rem] font-black leading-none tracking-tight text-foreground tabular-nums sm:text-[1.45rem]">
          {amount}
        </div>
      </div>
    );
  };

  const toneMap: Record<string, string> = {
    success: "border-success/15 bg-background",
    warning: "border-warning/15 bg-background",
    danger: "border-danger/15 bg-background",
    primary: "border-primary/15 bg-background",
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

  const accentMap: Record<string, string> = {
    success: "bg-success/80",
    warning: "bg-warning/80",
    danger: "bg-danger/80",
    primary: "bg-primary/80",
  };

  const metricVisualMap: Record<string, { chipClass: string }> = {
    "বিক্রি": {
      chipClass: "bg-primary-soft/70 text-primary border-primary/25",
    },
    "লাভ": {
      chipClass: "bg-success-soft/70 text-success border-success/25",
    },
    "খরচ": {
      chipClass: "bg-warning-soft/70 text-warning border-warning/25",
    },
    "ক্যাশ": {
      chipClass: "bg-sky-500/10 text-sky-700 border-sky-200/60",
    },
  };

  const playbookToneMap: Record<string, string> = {
    success: "border-success/15 bg-success-soft/15",
    warning: "border-warning/15 bg-warning-soft/15",
    danger: "border-danger/15 bg-danger-soft/15",
    primary: "border-primary/15 bg-primary-soft/15",
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

        <div className="rounded-[22px] border border-border/60 bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                badgeToneMap[insight.tone] ?? badgeToneMap.primary
              }`}
            >
              আজকের ৩টা insight
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              short summary
            </span>
          </div>
          <div className="space-y-2.5">
            {primaryInsights.map((bullet, index) => (
              <div
                key={`${index}-${bullet}`}
                className="rounded-2xl border border-border/60 bg-background px-3 py-3"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      badgeToneMap[insight.tone] ?? badgeToneMap.primary
                    }`}
                  >
                    {index + 1}
                  </span>
                  <p className="text-sm leading-6 text-foreground/90">{bullet}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {primaryPlaybook ? (
          <div
            className={`rounded-[22px] border p-4 shadow-[0_8px_20px_rgba(15,23,42,0.03)] ${
              playbookToneMap[primaryPlaybook.tone] ?? playbookToneMap.primary
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">এখন যা করবেন</div>
                <p className="mt-1 text-xs text-muted-foreground">একটা clear next step</p>
              </div>
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                  playbookBadgeMap[primaryPlaybook.tone] ?? playbookBadgeMap.primary
                }`}
              >
                {primaryPlaybook.confidenceLabel}
              </span>
            </div>

            <div className="mt-3 space-y-3">
              <div>
                <h3 className="text-base font-semibold leading-6 text-foreground">
                  {primaryPlaybook.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-foreground/90">
                  {primaryPlaybook.action}
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/80 px-3 py-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  কেন এটা জরুরি
                </div>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                  {primaryPlaybook.reason}
                </p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background px-3 py-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  সতর্কতা
                </div>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                  {primaryPlaybook.guardrail}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="rounded-[22px] border border-border/60 bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-foreground">দ্রুত কাজ</div>
            <span className="text-xs text-muted-foreground">কম, কিন্তু কাজে লাগবে</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {primaryAction ? (
              <OfflineAwareLink
                href={primaryAction.href}
                className={`inline-flex items-center rounded-full border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors ${
                  actionToneMap[insight.tone] ?? actionToneMap.primary
                }`}
              >
                {primaryAction.label}
              </OfflineAwareLink>
            ) : (
              <span className="text-sm text-muted-foreground">আজ আলাদা shortcut দরকার নেই।</span>
            )}
          </div>
        </div>

        {hasMoreDetails ? (
          <details className="group rounded-[22px] border border-border/60 bg-card p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-foreground">আরও দেখুন</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  চাইলে extra metrics আর backup guidance দেখুন
                </p>
              </div>
              <span className="inline-flex items-center rounded-full border border-border/70 bg-background px-2.5 py-1 text-[11px] font-semibold text-muted-foreground group-open:hidden">
                খুলুন
              </span>
              <span className="hidden items-center rounded-full border border-border/70 bg-background px-2.5 py-1 text-[11px] font-semibold text-muted-foreground group-open:inline-flex">
                বন্ধ
              </span>
            </summary>

            <div className="mt-4 space-y-4">
              {remainingMetrics.length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {remainingMetrics.map((metric) => (
                    <article
                      key={metric.label}
                      className="min-w-0 rounded-2xl border border-border/70 bg-background p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          {metric.label}
                        </div>
                        <span
                          className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                            metricVisualMap[metric.label]?.chipClass ??
                            "bg-muted text-muted-foreground border-border/60"
                          }`}
                        >
                          {metric.label}
                        </span>
                      </div>
                      <div className="mt-2 min-w-0">{renderMetricValue(metric.value)}</div>
                      <p className="mt-2 text-[11px] text-muted-foreground">{metric.trendLabel}</p>
                    </article>
                  ))}
                </div>
              ) : null}

              {remainingInsights.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    আরও insight
                  </div>
                  <div className="space-y-2">
                    {remainingInsights.map((bullet, index) => (
                      <p
                        key={`${index}-${bullet}`}
                        className="rounded-2xl border border-border/60 bg-background px-3 py-2.5 text-sm leading-6 text-foreground/90"
                      >
                        {bullet}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}

              {remainingPlaybooks.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Backup action
                  </div>
                  <div className="space-y-2.5">
                    {remainingPlaybooks.map((item) => (
                      <div
                        key={item.id}
                        className={`rounded-2xl border px-3 py-3 ${
                          playbookToneMap[item.tone] ?? playbookToneMap.primary
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-semibold text-foreground">{item.title}</h4>
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                              playbookBadgeMap[item.tone] ?? playbookBadgeMap.primary
                            }`}
                          >
                            {item.confidenceLabel}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-foreground/90">{item.action}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {remainingActions.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    আরও shortcut
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {remainingActions.map((action) => (
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
              ) : null}
            </div>
          </details>
        ) : null}
      </div>
    </section>
  );
}
