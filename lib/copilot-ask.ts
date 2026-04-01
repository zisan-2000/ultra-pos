export const COPILOT_QUESTION_SUGGESTIONS = [
  "আজ দোকান কেমন চলছে?",
  "আজ কত বিক্রি?",
  "আজ লাভ কত?",
  "আজ খরচ কত?",
  "আজ ক্যাশ কত?",
  "কাল লাভ কত ছিল?",
  "মোট বাকি কত?",
  "সবচেয়ে বেশি কোন item বিক্রি হয়েছে?",
  "low stock কোনগুলো?",
  "supplier payable কত?",
  "queue-তে কত token আছে?",
  "কোন product-এর stock কত?",
] as const;

export const COPILOT_GROUPED_QUESTION_SUGGESTIONS = [
  {
    label: "আজকের হিসাব",
    questions: [
      "আজ দোকান কেমন চলছে?",
      "আজ কত বিক্রি?",
      "আজ লাভ কত?",
      "আজ খরচ কত?",
      "আজ ক্যাশ কত?",
    ],
  },
  {
    label: "গতকালের তুলনা",
    questions: [
      "কাল বিক্রি কত ছিল?",
      "কাল লাভ কত ছিল?",
      "কাল খরচ কত ছিল?",
      "কাল ক্যাশ কত ছিল?",
    ],
  },
  {
    label: "বাকি ও পেমেন্ট",
    questions: [
      "মোট বাকি কত?",
      "রহিমের কাছে কত বাকি?",
      "supplier payable কত?",
    ],
  },
  {
    label: "পণ্য ও স্টক",
    questions: [
      "ডাল আছে?",
      "ডালের stock কত?",
      "ডালের বিস্তারিত কী?",
      "ডালের দাম কত?",
      "low stock কোনগুলো?",
    ],
  },
  {
    label: "অপারেশন",
    questions: [
      "সবচেয়ে বেশি কোন item বিক্রি হয়েছে?",
      "queue-তে কত token আছে?",
    ],
  },
] as const;

export type CopilotQuestionIntent =
  | { type: "today_status" }
  | { type: "today_sales" }
  | { type: "today_profit" }
  | { type: "today_expenses" }
  | { type: "today_cash" }
  | { type: "yesterday_sales" }
  | { type: "yesterday_profit" }
  | { type: "yesterday_expenses" }
  | { type: "yesterday_cash" }
  | { type: "due_total" }
  | { type: "payables_total" }
  | { type: "queue_pending" }
  | { type: "top_product_today" }
  | { type: "low_stock_list" }
  | { type: "customer_due"; customerName: string }
  | {
      type: "product_query";
      productName: string;
      mode: "exists" | "stock" | "details";
    }
  | { type: "unsupported" };

function normalizeDigits(value: string) {
  return value.replace(/[০-৯]/g, (digit) =>
    String("০১২৩৪৫৬৭৮৯".indexOf(digit))
  );
}

export function normalizeCopilotQuestion(value: string) {
  return normalizeDigits(value)
    .replace(/[?？！!।,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function includesAny(source: string, patterns: string[]) {
  return patterns.some((pattern) => source.includes(pattern));
}

function extractCustomerDueName(question: string) {
  const cleaned = question
    .replace(/[?？！!।,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const patterns = [
    /^(.+?)(?:এর|র|য়ের)?\s*কাছে\s*কত\s*বাকি$/i,
    /^(.+?)(?:এর|র|য়ের)?\s*বাকি\s*কত$/i,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match?.[1]) {
      const name = match[1].trim();
      if (name.length >= 2) {
        return name;
      }
    }
  }

  return null;
}

function extractProductQuery(question: string):
  | { productName: string; mode: "exists" | "stock" | "details" }
  | null {
  const cleaned = question
    .replace(/[?？！!।,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const patterns: Array<{
    pattern: RegExp;
    mode: "exists" | "stock" | "details";
  }> = [
    {
      pattern: /^(.+?)(?:এর|র|য়ের)?\s*(?:stock|স্টক)\s*(?:কত|আছে|কি|কী)?$/i,
      mode: "stock",
    },
    {
      pattern: /^(.+?)(?:এর|র|য়ের)?\s*(?:বিস্তারিত|details|detail|info|তথ্য)\s*(?:কি|কী)?$/i,
      mode: "details",
    },
    {
      pattern: /^(.+?)(?:এর|র|য়ের)?\s*(?:দাম|price)\s*(?:কত|কি|কী)?$/i,
      mode: "details",
    },
    {
      pattern: /^(.+?)\s*আছে(?:\s*কি|\s*নাকি|\s*না)?$/i,
      mode: "exists",
    },
  ];

  for (const { pattern, mode } of patterns) {
    const match = cleaned.match(pattern);
    if (match?.[1]) {
      const productName = match[1].trim();
      if (productName.length >= 2) {
        return { productName, mode };
      }
    }
  }

  return null;
}

export function parseCopilotQuestion(question: string): CopilotQuestionIntent {
  const normalized = normalizeCopilotQuestion(question);
  if (!normalized) {
    return { type: "unsupported" };
  }

  const isToday = includesAny(normalized, ["আজ", "today"]);
  const isYesterday = includesAny(normalized, ["কাল", "গতকাল", "yesterday"]);

  if (
    includesAny(normalized, ["কেমন চলছে", "how running", "status", "আজ কেমন", "আজকের অবস্থা"]) ||
    (isToday && includesAny(normalized, ["দোকান", "shop"]) && includesAny(normalized, ["কেমন", "status"]))
  ) {
    return { type: "today_status" };
  }

  if (
    includesAny(normalized, ["সবচেয়ে বেশি", "most", "top"]) &&
    includesAny(normalized, ["বিক্রি", "sale", "sales", "item", "product"])
  ) {
    return { type: "top_product_today" };
  }

  if (
    includesAny(normalized, ["low stock", "স্টক কম", "কম স্টক", "শেষ হয়ে", "restock"]) &&
    !includesAny(normalized, ["কত", "stock কত"])
  ) {
    return { type: "low_stock_list" };
  }

  if (includesAny(normalized, ["payable", "supplier due", "supplier payable", "সাপ্লায়ার", "supplier"])) {
    return { type: "payables_total" };
  }

  if (includesAny(normalized, ["queue", "token", "কিউ", "টোকেন"])) {
    return { type: "queue_pending" };
  }

  if (
    includesAny(normalized, ["মোট বাকি", "total due", "due total"]) &&
    !normalized.includes("কাছে")
  ) {
    return { type: "due_total" };
  }

  if ((isToday || includesAny(normalized, ["আজকের"])) && includesAny(normalized, ["বিক্রি", "sale", "sales"])) {
    return { type: "today_sales" };
  }
  if ((isToday || includesAny(normalized, ["আজকের"])) && includesAny(normalized, ["লাভ", "profit"])) {
    return { type: "today_profit" };
  }
  if ((isToday || includesAny(normalized, ["আজকের"])) && includesAny(normalized, ["খরচ", "expense", "expenses"])) {
    return { type: "today_expenses" };
  }
  if ((isToday || includesAny(normalized, ["আজকের"])) && includesAny(normalized, ["ক্যাশ", "cash"])) {
    return { type: "today_cash" };
  }

  if (isYesterday && includesAny(normalized, ["বিক্রি", "sale", "sales"])) {
    return { type: "yesterday_sales" };
  }
  if (isYesterday && includesAny(normalized, ["লাভ", "profit"])) {
    return { type: "yesterday_profit" };
  }
  if (isYesterday && includesAny(normalized, ["খরচ", "expense", "expenses"])) {
    return { type: "yesterday_expenses" };
  }
  if (isYesterday && includesAny(normalized, ["ক্যাশ", "cash"])) {
    return { type: "yesterday_cash" };
  }

  if (normalized.includes("বাকি")) {
    const customerName = extractCustomerDueName(question);
    if (customerName) {
      return { type: "customer_due", customerName };
    }
  }

  if (
    includesAny(normalized, [
      "স্টক",
      "stock",
      "আছে",
      "details",
      "detail",
      "বিস্তারিত",
      "price",
      "দাম",
      "তথ্য",
      "info",
    ])
  ) {
    const productQuery = extractProductQuery(question);
    if (productQuery) {
      return {
        type: "product_query",
        productName: productQuery.productName,
        mode: productQuery.mode,
      };
    }
  }

  if (includesAny(normalized, ["বিক্রি", "sale", "sales"])) {
    return { type: "today_sales" };
  }
  if (includesAny(normalized, ["লাভ", "profit"])) {
    return { type: "today_profit" };
  }
  if (includesAny(normalized, ["খরচ", "expense", "expenses"])) {
    return { type: "today_expenses" };
  }
  if (includesAny(normalized, ["ক্যাশ", "cash"])) {
    return { type: "today_cash" };
  }

  return { type: "unsupported" };
}
