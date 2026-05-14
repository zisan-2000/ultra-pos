"use client";

type SelectOption = {
  label: string;
  value: string;
};

type FilterSelect = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
};

type SortOption = SelectOption;

type Props = {
  searchValue?: string;
  searchPlaceholder?: string;
  onSearchChange?: (value: string) => void;
  filters?: FilterSelect[];
  sortValue: string;
  sortDirection: "asc" | "desc";
  sortOptions: SortOption[];
  onSortChange: (value: string) => void;
  onSortDirectionChange: (value: "asc" | "desc") => void;
  onClear: () => void;
  activeCount?: number;
};

const controlClass =
  "h-10 rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20";

export function ReportControls({
  searchValue,
  searchPlaceholder,
  onSearchChange,
  filters = [],
  sortValue,
  sortDirection,
  sortOptions,
  onSortChange,
  onSortDirectionChange,
  onClear,
  activeCount = 0,
}: Props) {
  return (
    <div className="border-b border-border bg-card/80 px-4 py-3">
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(220px,1fr)_auto] lg:items-center">
        {searchPlaceholder ? (
          <div className="min-w-0">
            <input
              type="search"
              value={searchValue ?? ""}
              onChange={(event) => onSearchChange?.(event.target.value)}
              placeholder={searchPlaceholder}
              className={`${controlClass} w-full`}
            />
          </div>
        ) : null}

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {filters.map((filter) => (
            <label key={filter.label} className="min-w-[140px] flex-1 sm:flex-none">
              <span className="sr-only">{filter.label}</span>
              <select
                value={filter.value}
                onChange={(event) => filter.onChange(event.target.value)}
                className={`${controlClass} w-full sm:w-auto`}
              >
                {filter.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ))}

          <label className="min-w-[150px] flex-1 sm:flex-none">
            <span className="sr-only">সাজান</span>
            <select
              value={sortValue}
              onChange={(event) => onSortChange(event.target.value)}
              className={`${controlClass} w-full sm:w-auto`}
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() =>
              onSortDirectionChange(sortDirection === "asc" ? "desc" : "asc")
            }
            className="h-10 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground transition hover:bg-muted"
            aria-label="Sort direction"
          >
            {sortDirection === "asc" ? "↑ Asc" : "↓ Desc"}
          </button>

          <button
            type="button"
            onClick={onClear}
            disabled={activeCount === 0}
            className="h-10 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear{activeCount > 0 ? ` (${activeCount})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

type SortableHeaderProps = {
  label: string;
  active: boolean;
  direction: "asc" | "desc";
  align?: "left" | "center" | "right";
  onClick: () => void;
};

export function SortableHeader({
  label,
  active,
  direction,
  align = "left",
  onClick,
}: SortableHeaderProps) {
  const justify =
    align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex w-full items-center gap-1 ${justify} text-xs font-semibold transition ${
        active ? "text-primary" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <span>{label}</span>
      <span className="text-[10px]">{active ? (direction === "asc" ? "↑" : "↓") : "↕"}</span>
    </button>
  );
}
