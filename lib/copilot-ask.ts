export const COPILOT_QUESTION_SUGGESTIONS = [
  "আজ দোকান কেমন চলছে?",
  "আজ কত বিক্রি?",
  "আজ লাভ কত?",
  "আজ খরচ কত?",
  "এই দোকানে মোট কয়টা product আছে?",
  "active আর inactive product কয়টা?",
  "out of stock কয়টা?",
  "কোন category-তে sale বেশি?",
  "payment method breakdown কী?",
  "average order value কত?",
  "মোট customer কয়জন?",
  "সবচেয়ে বেশি due কোন customer-এর?",
  "repeat customer কারা?",
  "মোট supplier কয়জন?",
  "সবচেয়ে বেশি payable কোন supplier-এর?",
  "recent purchaseগুলো দেখাও",
  "সবচেয়ে বেশি profit কোন product থেকে আসছে?",
  "low margin product কোনগুলো?",
  "কোন category-র margin কম?",
  "রহিমের 500 টাকা বাকি নাও",
  "করিম supplier-কে 800 টাকা payment করো",
  "চিনির stock 25 করো",
  "নতুন customer রহিম যোগ করো",
  "নতুন supplier করিম ট্রেডার্স যোগ করো",
  "নতুন product চিনি 120 টাকা দামে যোগ করো",
  "রহিমের নামে 300 টাকা বাকি যোগ করো",
  "আজ কোন দিকে ফোকাস দেওয়া উচিত?",
  "আজ সবচেয়ে বড় সমস্যা কী?",
  "গতকালের তুলনায় আজ কী বদলেছে?",
  "আজ কোন খাতে বেশি খরচ হয়েছে?",
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
      "গতকালের তুলনায় আজ কী বদলেছে?",
    ],
  },
  {
    label: "Quick action",
    questions: [
      "500 টাকা বিদ্যুৎ খরচ যোগ করো",
      "ক্যাশ ইন 1000 বিকাশ",
      "রহিমের 500 টাকা বাকি নাও",
      "করিম supplier-কে 800 টাকা payment করো",
      "চিনির stock 25 করো",
      "নতুন customer রহিম যোগ করো",
      "নতুন supplier করিম ট্রেডার্স যোগ করো",
      "নতুন product চিনি 120 টাকা দামে যোগ করো",
      "রহিমের নামে 300 টাকা বাকি যোগ করো",
    ],
  },
  {
    label: "ফোকাস ও ঝুঁকি",
    questions: [
      "আজ কোন দিকে ফোকাস দেওয়া উচিত?",
      "আজ সবচেয়ে বড় সমস্যা কী?",
      "আজ low stock risk আছে?",
      "billing অবস্থা কেমন?",
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
      "মোট customer কয়জন?",
      "সবচেয়ে বেশি due কোন customer-এর?",
      "repeat customer কারা?",
      "inactive customer কারা?",
      "রহিমের কাছে কত বাকি?",
      "মোট বাকি কত?",
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
      "এই দোকানে মোট কয়টা product আছে?",
      "active আর inactive product কয়টা?",
      "out of stock কয়টা?",
      "৩০ দিনে বিক্রি হয়নি কোন পণ্যগুলো?",
      "সবচেয়ে কম stock কোনগুলো?",
      "low stock কোনগুলো?",
    ],
  },
  {
    label: "অপারেশন",
    questions: [
      "কোন category-তে sale বেশি?",
      "গত ৭ দিনে কোন category বেশি বিক্রি হয়েছে?",
      "payment method breakdown কী?",
      "average order value কত?",
      "ডালের ৭ দিনের sales কেমন?",
      "সবচেয়ে বেশি কোন item বিক্রি হয়েছে?",
      "queue-তে কত token আছে?",
      "আজ কোন খাতে বেশি খরচ হয়েছে?",
    ],
  },
  {
    label: "Supplier ও Purchase",
    questions: [
      "মোট supplier কয়জন?",
      "সবচেয়ে বেশি payable কোন supplier-এর?",
      "top supplier কারা?",
      "recent purchaseগুলো দেখাও",
      "কোন item অনেক দিন purchase করা হয়নি?",
    ],
  },
  {
    label: "Profitability",
    questions: [
      "সবচেয়ে বেশি profit কোন product থেকে আসছে?",
      "low margin product কোনগুলো?",
      "কোন category-র margin কম?",
      "profit trend কেমন?",
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
    /^(.+?)(?:এর|র|য়ের)?\s*কাছে\s*কত\s*বাকি$/i,
    /^(.+?)(?:এর|র|য়ের)?\s*বাকি\s*কত$/i,
    /^(.+?)(?:er|r)?\s*kashe\s*koto\s*baki$/i,
    /^(.+?)(?:er|r)?\s*baki\s*koto$/i,
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
      pattern: /^(.+?)(?:এর|র|য়ের|er|r)?\s*(?:stock|স্টক|stok)\s*(?:কত|আছে|কি|কী|koto|ache)?$/i,
      mode: "stock",
    },
    {
      pattern: /^(.+?)(?:এর|র|য়ের)?\s*(?:বিস্তারিত|details|detail|info|তথ্য)\s*(?:কি|কী)?$/i,
      mode: "details",
    },
    {
      pattern: /^(.+?)(?:এর|র|য়ের|er|r)?\s*(?:দাম|price|dam|daam)\s*(?:কত|কি|কী|koto)?$/i,
      mode: "details",
    },
    {
      pattern: /^(.+?)\s*(?:আছে|ache)(?:\s*কি|\s*নাকি|\s*না|\s*ki)?$/i,
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

  const isToday = includesAny(normalized, ["আজ", "today", "aj", "aaj", "ajke"]);
  const isYesterday = includesAny(normalized, ["কাল", "গতকাল", "yesterday", "kal", "gotokal"]);

  if (
    includesAny(normalized, ["কেমন চলছে", "how running", "status", "আজ কেমন", "আজকের অবস্থা", "kemon cholche", "kemon", "ajker obostha"]) ||
    (isToday && includesAny(normalized, ["দোকান", "shop", "dokan"]) && includesAny(normalized, ["কেমন", "status", "kemon"]))
  ) {
    return { type: "today_status" };
  }

  if (
    includesAny(normalized, ["সবচেয়ে বেশি", "most", "top", "sobcheye beshi"]) &&
    includesAny(normalized, ["বিক্রি", "sale", "sales", "item", "product", "bikri"])
  ) {
    return { type: "top_product_today" };
  }

  if (
    includesAny(normalized, ["low stock", "স্টক কম", "কম স্টক", "শেষ হয়ে", "restock", "stock kom", "kom stock", "stok kom"]) &&
    !includesAny(normalized, ["কত", "stock কত", "koto", "stock koto"])
  ) {
    return { type: "low_stock_list" };
  }

  if (includesAny(normalized, ["payable", "supplier due", "supplier payable", "সাপ্লায়ার", "supplier", "sapplier", "paikar"])) {
    return { type: "payables_total" };
  }

  if (includesAny(normalized, ["queue", "token", "কিউ", "টোকেন", "kiu"])) {
    return { type: "queue_pending" };
  }

  if (
    includesAny(normalized, ["মোট বাকি", "total due", "due total", "mot baki", "total baki"]) &&
    !includesAny(normalized, ["কাছে", "kashe"])
  ) {
    return { type: "due_total" };
  }

  if ((isToday || includesAny(normalized, ["আজকের", "ajker"])) && includesAny(normalized, ["বিক্রি", "sale", "sales", "bikri"])) {
    return { type: "today_sales" };
  }
  if ((isToday || includesAny(normalized, ["আজকের", "ajker"])) && includesAny(normalized, ["লাভ", "profit", "labh", "lab"])) {
    return { type: "today_profit" };
  }
  if ((isToday || includesAny(normalized, ["আজকের", "ajker"])) && includesAny(normalized, ["খরচ", "expense", "expenses", "khoroch", "khorch"])) {
    return { type: "today_expenses" };
  }
  if ((isToday || includesAny(normalized, ["আজকের", "ajker"])) && includesAny(normalized, ["ক্যাশ", "cash"])) {
    return { type: "today_cash" };
  }

  if (isYesterday && includesAny(normalized, ["বিক্রি", "sale", "sales", "bikri"])) {
    return { type: "yesterday_sales" };
  }
  if (isYesterday && includesAny(normalized, ["লাভ", "profit", "labh", "lab"])) {
    return { type: "yesterday_profit" };
  }
  if (isYesterday && includesAny(normalized, ["খরচ", "expense", "expenses", "khoroch", "khorch"])) {
    return { type: "yesterday_expenses" };
  }
  if (isYesterday && includesAny(normalized, ["ক্যাশ", "cash"])) {
    return { type: "yesterday_cash" };
  }

  if (includesAny(normalized, ["বাকি", "baki"])) {
    const customerName = extractCustomerDueName(question);
    if (customerName) {
      return { type: "customer_due", customerName };
    }
  }

  if (
    includesAny(normalized, [
      "স্টক", "stock", "stok",
      "আছে", "ache",
      "details", "detail", "বিস্তারিত",
      "price", "দাম", "dam", "daam",
      "তথ্য", "info",
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

  if (includesAny(normalized, ["বিক্রি", "sale", "sales", "bikri"])) {
    return { type: "today_sales" };
  }
  if (includesAny(normalized, ["লাভ", "profit", "labh", "lab"])) {
    return { type: "today_profit" };
  }
  if (includesAny(normalized, ["খরচ", "expense", "expenses", "khoroch", "khorch"])) {
    return { type: "today_expenses" };
  }
  if (includesAny(normalized, ["ক্যাশ", "cash"])) {
    return { type: "today_cash" };
  }

  return { type: "unsupported" };
}
