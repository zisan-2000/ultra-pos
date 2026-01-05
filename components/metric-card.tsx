import { cn } from "@/lib/utils";

type MetricCardProps = {
  label: string;
  value: number | string;
  helper?: string;
  accent?: "primary" | "success" | "warning" | "danger";
  className?: string;
};

const accentStyles: Record<NonNullable<MetricCardProps["accent"]>, string> = {
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

export function MetricCard({
  label,
  value,
  helper,
  accent,
  className,
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "bg-card border border-border rounded-2xl p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all pressable",
        className,
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 text-2xl font-bold text-foreground",
          accent ? accentStyles[accent] : null,
        )}
      >
        {value}
      </p>
      {helper ? (
        <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
      ) : null}
    </div>
  );
}
