"use client";

type Props = {
  onSelect: (from: string, to: string) => void;
};

export function QuickDateFilter({ onSelect }: Props) {
  function format(d: Date) {
    return d.toISOString().split("T")[0];
  }

  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  const last7 = new Date(Date.now() - 6 * 86400000);
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onSelect(format(today), format(today))}
        className="px-2 py-1 border rounded text-xs"
      >
        Today
      </button>

      <button
        onClick={() => onSelect(format(yesterday), format(yesterday))}
        className="px-2 py-1 border rounded text-xs"
      >
        Yesterday
      </button>

      <button
        onClick={() => onSelect(format(last7), format(today))}
        className="px-2 py-1 border rounded text-xs"
      >
        Last 7 Days
      </button>

      <button
        onClick={() => onSelect(format(firstOfMonth), format(today))}
        className="px-2 py-1 border rounded text-xs"
      >
        This Month
      </button>

      <button
        onClick={() => onSelect(format(lastMonthStart), format(lastMonthEnd))}
        className="px-2 py-1 border rounded text-xs"
      >
        Last Month
      </button>
    </div>
  );
}
