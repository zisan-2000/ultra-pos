export type StockTone = "danger" | "warning-strong" | "warning" | "ok";

export function getStockTone(stock: number): StockTone {
  if (!Number.isFinite(stock)) return "ok";
  if (stock <= 0) return "danger";
  if (stock <= 3) return "warning-strong";
  if (stock <= 5) return "warning";
  return "ok";
}

export function getStockToneClasses(stock: number) {
  const tone = getStockTone(stock);
  switch (tone) {
    case "danger":
      return {
        badge: "bg-danger-soft text-danger",
        card: "bg-danger-soft border-danger/30",
        label: "text-danger",
        pill: "bg-danger-soft text-danger",
        text: "text-danger",
      };
    case "warning-strong":
      return {
        badge: "bg-warning-soft text-warning",
        card: "bg-warning-soft border-warning/30",
        label: "text-warning",
        pill: "bg-warning-soft text-warning",
        text: "text-warning",
      };
    case "warning":
      return {
        badge: "bg-warning-soft/60 text-warning",
        card: "bg-warning-soft/60 border-warning/20",
        label: "text-warning",
        pill: "bg-warning-soft/60 text-warning",
        text: "text-warning",
      };
    default:
      return {
        badge: "bg-success-soft text-success",
        card: "bg-success-soft border-success/30",
        label: "text-success",
        pill: "bg-success-soft text-success",
        text: "text-success",
      };
  }
}
