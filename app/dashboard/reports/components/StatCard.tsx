// app/dashboard/reports/components/StatCard.tsx
import { ScrollText } from "lucide-react";

type StatCardProps = {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: string;
  tone?: "success" | "danger" | "primary" | "warning" | "neutral";
  amountInWords?: string;
  expanded?: boolean;
  onToggleWords?: () => void;
  wordsId?: string;
};

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  tone = "neutral",
  amountInWords,
  expanded = false,
  onToggleWords,
  wordsId,
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
          <div className="mt-1 flex items-end gap-2">
            <p className={`min-w-0 text-2xl font-bold tracking-tight ${styles.value}`}>
              {value}
            </p>
            {amountInWords ? (
              <button
                type="button"
                onClick={onToggleWords}
                aria-expanded={expanded}
                aria-controls={wordsId}
                aria-label={expanded ? "টাকার কথা লুকান" : "টাকার কথা দেখুন"}
                title={expanded ? "টাকার কথা লুকান" : "টাকার কথা দেখুন"}
                className={`group relative mb-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ease-out ${
                  expanded
                    ? "border-primary/40 bg-gradient-to-br from-primary-soft via-card to-warning-soft/70 text-primary shadow-[0_10px_22px_rgba(15,23,42,0.12)]"
                    : "border-border/80 bg-gradient-to-br from-card via-card to-primary-soft/30 text-muted-foreground hover:-translate-y-0.5 hover:scale-105 hover:border-primary/35 hover:text-primary hover:shadow-[0_10px_22px_rgba(15,23,42,0.12)]"
                }`}
              >
                <span className="absolute inset-0 rounded-full bg-gradient-to-br from-white/35 to-transparent opacity-70" />
                <ScrollText
                  className={`relative h-4 w-4 transition-transform duration-300 ease-out ${
                    expanded
                      ? "scale-110 -rotate-6"
                      : "group-hover:scale-110 group-hover:-rotate-3"
                  }`}
                />
              </button>
            ) : null}
          </div>
          {amountInWords ? (
            <div
              className={`grid transition-all duration-300 ease-out ${
                expanded
                  ? "mt-2 grid-rows-[1fr] opacity-100"
                  : "mt-0 grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="overflow-hidden">
                <p
                  id={wordsId}
                  className="text-xs leading-relaxed text-muted-foreground"
                >
                  {amountInWords}
                </p>
              </div>
            </div>
          ) : null}
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
