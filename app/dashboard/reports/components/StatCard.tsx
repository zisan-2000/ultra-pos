// app/dashboard/reports/components/StatCard.tsx

type StatCardProps = {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: string;
  tone?: "success" | "danger" | "primary" | "warning" | "neutral";
};

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  tone = "neutral",
}: StatCardProps) {
  const toneStyles: Record<
    string,
    {
      border: string;
      glow: string;
      iconBg: string;
      value: string;
    }
  > = {
    success: {
      border: "border-success/20",
      glow: "from-success-soft/60 via-card to-transparent",
      iconBg: "bg-success/15 text-success",
      value: "text-success",
    },
    danger: {
      border: "border-danger/20",
      glow: "from-danger-soft/60 via-card to-transparent",
      iconBg: "bg-danger/15 text-danger",
      value: "text-danger",
    },
    primary: {
      border: "border-primary/20",
      glow: "from-primary-soft/60 via-card to-transparent",
      iconBg: "bg-primary/15 text-primary",
      value: "text-primary",
    },
    warning: {
      border: "border-warning/20",
      glow: "from-warning-soft/60 via-card to-transparent",
      iconBg: "bg-warning/15 text-warning",
      value: "text-warning",
    },
    neutral: {
      border: "border-border",
      glow: "from-muted/40 via-card to-transparent",
      iconBg: "bg-muted text-foreground",
      value: "text-foreground",
    },
  };
  const styles = toneStyles[tone] ?? toneStyles.neutral;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border bg-card p-4 min-h-[120px] shadow-[0_10px_20px_rgba(15,23,42,0.08)] hover:shadow-[0_14px_26px_rgba(15,23,42,0.12)] hover:-translate-y-0.5 transition-all pressable ${styles.border}`}
    >
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${styles.glow}`}
      />
      <div className="relative flex items-start gap-3">
        {icon ? (
          <span
            className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl text-lg ${styles.iconBg}`}
          >
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {title}
          </p>
          <p className={`text-2xl font-bold mt-1 tracking-tight ${styles.value}`}>
            {value}
          </p>
          {subtitle ? (
            <p className="text-xs text-muted-foreground mt-1 leading-snug line-clamp-2">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
