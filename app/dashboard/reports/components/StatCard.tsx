// app/dashboard/reports/components/StatCard.tsx
type DeltaInfo = {
  /** Percentage change vs previous period. null = no comparison data, 0 = no change */
  pct: number | null;
  /** Direction: "up" | "down" | "flat" — drives icon + color */
  direction: "up" | "down" | "flat";
  /** Whether "up" means good (e.g. sales) or bad (e.g. expense) */
  goodWhen?: "up" | "down";
  /** Optional comparison label, e.g. "আগের ৭ দিনের তুলনায়" */
  label?: string;
};

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
  /** Period-over-period delta. Renders arrow + % chip. */
  delta?: DeltaInfo;
  /** Optional drill-down handler. When provided, card becomes clickable. */
  onClick?: () => void;
  /** Accessible label override for the click action */
  clickLabel?: string;
};

function DeltaChip({ delta }: { delta: DeltaInfo }) {
  if (delta.pct === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
        <span>—</span>
        <span>তুলনার ডাটা নেই</span>
      </span>
    );
  }

  const goodWhen = delta.goodWhen ?? "up";
  const isFlat = delta.direction === "flat" || Math.abs(delta.pct) < 0.5;
  const isPositiveDirection =
    (delta.direction === "up" && goodWhen === "up") ||
    (delta.direction === "down" && goodWhen === "down");

  const tone = isFlat
    ? "border-border bg-muted/60 text-muted-foreground"
    : isPositiveDirection
      ? "border-success/30 bg-success-soft text-success"
      : "border-danger/30 bg-danger-soft text-danger";

  const arrow = isFlat ? "→" : delta.direction === "up" ? "↑" : "↓";

  const formattedPct = `${Math.abs(delta.pct).toFixed(1)}%`;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone}`}
      title={delta.label ?? "আগের সময়ের তুলনায়"}
    >
      <span className="text-[11px] leading-none">{arrow}</span>
      <span className="tabular-nums">{formattedPct}</span>
    </span>
  );
}

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
  delta,
  onClick,
  clickLabel,
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

  const cardClass = `relative overflow-hidden rounded-2xl border bg-card p-4 min-h-[120px] shadow-[0_10px_20px_rgba(15,23,42,0.08)] hover:shadow-[0_14px_26px_rgba(15,23,42,0.12)] hover:-translate-y-0.5 transition-all pressable ${styles.border}${onClick ? " cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 text-left w-full" : ""}`;

  const inner = (
    <>
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${styles.glow}`}
      />
      <div className="relative flex items-start gap-3">
        {icon ? (
          <span
            className={`inline-flex h-10 w-10 items-center justify-center rounded-xl text-lg ${styles.iconBg}`}
          >
            {icon}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate">
              {title}
            </p>
            {onClick ? (
              <span
                aria-hidden="true"
                className="shrink-0 text-muted-foreground/60 text-base leading-none transition-transform group-hover:translate-x-0.5"
              >
                ›
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex items-center gap-2.5">
            <p className={`min-w-0 text-2xl font-bold tracking-tight ${styles.value}`}>
              {value}
            </p>
            {amountInWords ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleWords?.();
                }}
                aria-expanded={expanded}
                aria-controls={wordsId}
                aria-label={expanded ? "টাকার কথা লুকান" : "টাকার কথা দেখুন"}
                title={expanded ? "টাকার কথা লুকান" : "টাকার কথা দেখুন"}
                className={`group inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-200 ease-out ${
                  expanded
                    ? "bg-primary/10 text-primary shadow-[0_6px_16px_rgba(15,23,42,0.08)]"
                    : "text-muted-foreground hover:bg-primary/8 hover:text-primary"
                }`}
              >
                <span className="text-[17px] leading-none transition-transform duration-200 ease-out group-hover:scale-105">
                  {expanded ? "🙈" : "👁"}
                </span>
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
          {delta ? (
            <div className="mt-1.5">
              <DeltaChip delta={delta} />
            </div>
          ) : null}
          {subtitle ? (
            <p className="text-xs text-muted-foreground mt-1 leading-snug line-clamp-2">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
    </>
  );

  if (onClick) {
    // Use a div with role="button" instead of a real <button> so we can
    // safely nest the "টাকার কথা" toggle button inside. <button> inside
    // <button> is invalid HTML and breaks SSR hydration.
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
        aria-label={clickLabel ?? `${title} বিস্তারিত দেখুন`}
        className={`group ${cardClass}`}
      >
        {inner}
      </div>
    );
  }

  return <div className={cardClass}>{inner}</div>;
}
