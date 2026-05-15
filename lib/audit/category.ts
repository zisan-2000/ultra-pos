// lib/audit/category.ts
//
// Maps raw audit-action strings ("sale.create", "product.price.change", ...)
// to a friendly visual category — icon, accent color, and Bengali group label.
// Used by the audit UI to render rows that a non-technical shopkeeper can
// immediately scan and understand.

export type AuditCategoryKey =
  | "sale"
  | "cash"
  | "expense"
  | "product"
  | "stock"
  | "purchase"
  | "auth"
  | "user"
  | "other";

export type AuditCategory = {
  key: AuditCategoryKey;
  /** Emoji icon shown in the row badge. */
  icon: string;
  /** Bengali category label, e.g. "বিক্রয়", "ক্যাশ". */
  label: string;
  /** Tailwind classes for icon background + foreground. */
  tone: {
    bg: string;
    fg: string;
    border: string;
    chip: string; // soft chip background
  };
};

const CATEGORIES: Record<AuditCategoryKey, AuditCategory> = {
  sale: {
    key: "sale",
    icon: "🛒",
    label: "বিক্রয়",
    tone: {
      bg: "bg-emerald-100",
      fg: "text-emerald-700",
      border: "border-emerald-200",
      chip: "bg-emerald-50 text-emerald-700 border-emerald-200",
    },
  },
  cash: {
    key: "cash",
    icon: "💵",
    label: "ক্যাশ",
    tone: {
      bg: "bg-violet-100",
      fg: "text-violet-700",
      border: "border-violet-200",
      chip: "bg-violet-50 text-violet-700 border-violet-200",
    },
  },
  expense: {
    key: "expense",
    icon: "🧾",
    label: "খরচ",
    tone: {
      bg: "bg-rose-100",
      fg: "text-rose-700",
      border: "border-rose-200",
      chip: "bg-rose-50 text-rose-700 border-rose-200",
    },
  },
  product: {
    key: "product",
    icon: "📦",
    label: "পণ্য",
    tone: {
      bg: "bg-amber-100",
      fg: "text-amber-700",
      border: "border-amber-200",
      chip: "bg-amber-50 text-amber-700 border-amber-200",
    },
  },
  stock: {
    key: "stock",
    icon: "📊",
    label: "স্টক",
    tone: {
      bg: "bg-orange-100",
      fg: "text-orange-700",
      border: "border-orange-200",
      chip: "bg-orange-50 text-orange-700 border-orange-200",
    },
  },
  purchase: {
    key: "purchase",
    icon: "🚚",
    label: "ক্রয়",
    tone: {
      bg: "bg-sky-100",
      fg: "text-sky-700",
      border: "border-sky-200",
      chip: "bg-sky-50 text-sky-700 border-sky-200",
    },
  },
  auth: {
    key: "auth",
    icon: "🔐",
    label: "লগইন",
    tone: {
      bg: "bg-slate-200",
      fg: "text-slate-700",
      border: "border-slate-300",
      chip: "bg-slate-100 text-slate-700 border-slate-300",
    },
  },
  user: {
    key: "user",
    icon: "👥",
    label: "টিম",
    tone: {
      bg: "bg-indigo-100",
      fg: "text-indigo-700",
      border: "border-indigo-200",
      chip: "bg-indigo-50 text-indigo-700 border-indigo-200",
    },
  },
  other: {
    key: "other",
    icon: "📝",
    label: "অন্যান্য",
    tone: {
      bg: "bg-muted",
      fg: "text-muted-foreground",
      border: "border-border",
      chip: "bg-muted text-foreground border-border",
    },
  },
};

/** Derive category from a dotted action string ("sale.void" → "sale"). */
export function getAuditCategory(action: string): AuditCategory {
  const root = String(action ?? "").split(".")[0]?.toLowerCase() ?? "";
  switch (root) {
    case "sale":
    case "invoice":
      return CATEGORIES.sale;
    case "cash":
      return CATEGORIES.cash;
    case "expense":
      return CATEGORIES.expense;
    case "product":
      return CATEGORIES.product;
    case "stock":
      return CATEGORIES.stock;
    case "purchase":
      return CATEGORIES.purchase;
    case "auth":
      return CATEGORIES.auth;
    case "user":
    case "permission":
      return CATEGORIES.user;
    default:
      return CATEGORIES.other;
  }
}

/** Severity → Bengali label + tailwind palette. */
export type SeverityKey = "info" | "warning" | "critical";

export const SEVERITY_VISUAL: Record<
  SeverityKey,
  { label: string; dot: string; chip: string; ring: string }
> = {
  info: {
    label: "সাধারণ",
    dot: "bg-emerald-500",
    chip: "bg-emerald-50 text-emerald-700 border-emerald-200",
    ring: "ring-emerald-200",
  },
  warning: {
    label: "সতর্কতা",
    dot: "bg-amber-500",
    chip: "bg-amber-50 text-amber-700 border-amber-200",
    ring: "ring-amber-200",
  },
  critical: {
    label: "গুরুত্বপূর্ণ",
    dot: "bg-rose-500",
    chip: "bg-rose-50 text-rose-700 border-rose-200",
    ring: "ring-rose-200",
  },
};

export function severityVisual(severity: string) {
  return (
    SEVERITY_VISUAL[severity as SeverityKey] ?? SEVERITY_VISUAL.info
  );
}
