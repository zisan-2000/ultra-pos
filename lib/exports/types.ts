// lib/exports/types.ts
// Shared types for the reports export pipeline (CSV / Excel / PDF).

export type ExportFormat = "csv" | "xlsx" | "pdf";

export type ExportTarget =
  | "summary"
  | "sales"
  | "expenses"
  | "cash"
  | "payment"
  | "profit"
  | "products"
  | "stock"
  | "valuation";

export type ExportColumnKind = "text" | "money" | "number" | "datetime" | "date";

export type ExportColumn = {
  /** Object key on each row. */
  key: string;
  /** Header text shown to the user (Bengali). */
  header: string;
  /** Cell semantic. Drives Excel format string + PDF cell alignment. */
  kind?: ExportColumnKind;
  /** Optional custom getter; receives the full row. */
  getValue?: (row: any) => string | number | null | undefined;
};

export type ExportDataset = {
  target: ExportTarget;
  /** Human-readable Bengali title used in PDF heading + Excel sheet name. */
  title: string;
  /** Optional one-line subtitle (range / context). */
  subtitle?: string;
  columns: ExportColumn[];
  rows: any[];
  /** Optional KPI summary cards rendered at the top of the PDF. */
  kpis?: Array<{
    label: string;
    value: string;
    tone?: "success" | "danger" | "warning" | "primary" | "neutral";
  }>;
  /** Optional total row appended to the bottom (for PDF + Excel). */
  totalRow?: Record<string, string | number>;
};

export type ExportMeta = {
  shopName: string;
  rangeLabel: string | null;
  rangeFrom: string | null;
  rangeTo: string | null;
  generatedAt: Date;
};

export type ExportResult = {
  filename: string;
  rows: number;
};
