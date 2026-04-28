import { z } from "zod";
import { normalizeCopilotQuestion } from "@/lib/copilot-ask";

const amountPattern = /(\d+(?:[.,]\d+)?)/;
const bangladeshPhonePattern = /((?:\+?88)?01[3-9]\d{8})/;

const expenseCategoryKeywords = [
  "বিদ্যুৎ",
  "electricity",
  "ভাড়া",
  "rent",
  "চা",
  "নাস্তা",
  "snacks",
  "বেতন",
  "salary",
  "যাতায়াত",
  "transport",
  "internet",
  "ইন্টারনেট",
  "গ্যাস",
  "gas",
  "বাজার",
  "stationery",
  "স্টেশনারি",
] as const;

function normalizeDigits(value: string) {
  return value.replace(/[০-৯]/g, (digit) =>
    String("০১২৩৪৫৬৭৮৯".indexOf(digit))
  );
}

function extractAmount(question: string) {
  const match = normalizeDigits(question).match(amountPattern);
  return match ? match[1].replace(",", "") : null;
}

function extractReason(question: string, amount: string) {
  return question
    .replace(amount, " ")
    .replace(/[?？！!।,]/g, " ")
    .replace(/\b(টাকা|taka|tk|৳|খরচ|expense|add|যোগ|করো|করুন|লেখো|write|cash|ক্যাশ|in|out|ইন|আউট|entry|এন্ট্রি)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPhone(question: string) {
  const match = question.match(bangladeshPhonePattern);
  return match?.[1]?.trim() || "";
}

function inferExpenseCategory(rawQuestion: string, fallbackReason: string) {
  const normalized = normalizeCopilotQuestion(rawQuestion);
  const matched = expenseCategoryKeywords.find((keyword) =>
    normalized.includes(keyword)
  );

  if (matched) {
    return matched
      .replace(/^./, (char) => char.toUpperCase())
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  if (fallbackReason) {
    const firstChunk = fallbackReason.split(" ").slice(0, 3).join(" ").trim();
    if (firstChunk) return firstChunk;
  }

  return "অন্যান্য";
}

const expenseDraftSchema = z.object({
  kind: z.literal("expense"),
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  category: z.string().min(1),
  note: z.string().optional().default(""),
  summary: z.string().min(1),
  confirmationText: z.string().min(1),
});

const cashDraftSchema = z.object({
  kind: z.literal("cash_entry"),
  entryType: z.enum(["IN", "OUT"]),
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  reason: z.string().optional().default(""),
  summary: z.string().min(1),
  confirmationText: z.string().min(1),
});

const dueCollectionDraftSchema = z.object({
  kind: z.literal("due_collection"),
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  customerName: z.string().min(1),
  customerId: z.string().optional(),
  note: z.string().optional().default(""),
  summary: z.string().min(1),
  confirmationText: z.string().min(1),
});

const supplierPaymentDraftSchema = z.object({
  kind: z.literal("supplier_payment"),
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  supplierName: z.string().min(1),
  supplierId: z.string().optional(),
  method: z.string().optional().default("cash"),
  note: z.string().optional().default(""),
  summary: z.string().min(1),
  confirmationText: z.string().min(1),
});

const stockAdjustmentDraftSchema = z.object({
  kind: z.literal("stock_adjustment"),
  productQuery: z.string().min(1),
  productId: z.string().optional(),
  targetStock: z.string().regex(/^\d+(\.\d+)?$/),
  note: z.string().optional().default(""),
  summary: z.string().min(1),
  confirmationText: z.string().min(1),
});

const productPriceUpdateDraftSchema = z.object({
  kind: z.literal("product_price_update"),
  productQuery: z.string().min(1),
  productId: z.string().optional(),
  targetPrice: z.string().regex(/^\d+(\.\d+)?$/),
  note: z.string().optional().default(""),
  summary: z.string().min(1),
  confirmationText: z.string().min(1),
});

const productToggleActiveDraftSchema = z.object({
  kind: z.literal("product_toggle_active"),
  productQuery: z.string().min(1),
  productId: z.string().optional(),
  nextActiveState: z.boolean(),
  note: z.string().optional().default(""),
  summary: z.string().min(1),
  confirmationText: z.string().min(1),
});

const dueEntryDraftSchema = z.object({
  kind: z.literal("due_entry"),
  customerName: z.string().min(1),
  customerId: z.string().optional(),
  amount: z.string().regex(/^\d+(\.\d+)?$/),
  note: z.string().optional().default(""),
  summary: z.string().min(1),
  confirmationText: z.string().min(1),
});

const saleVoidDraftSchema = z.object({
  kind: z.literal("void_sale"),
  saleQuery: z.string().min(1),
  saleId: z.string().optional(),
  invoiceNo: z.string().optional(),
  note: z.string().optional().default(""),
  summary: z.string().min(1),
  confirmationText: z.string().min(1),
});

const customerCreateDraftSchema = z.object({
  kind: z.literal("create_customer"),
  name: z.string().min(1),
  phone: z.string().optional().default(""),
  summary: z.string().min(1),
  confirmationText: z.string().min(1),
});

const supplierCreateDraftSchema = z.object({
  kind: z.literal("create_supplier"),
  name: z.string().min(1),
  phone: z.string().optional().default(""),
  summary: z.string().min(1),
  confirmationText: z.string().min(1),
});

const productCreateDraftSchema = z.object({
  kind: z.literal("create_product"),
  name: z.string().min(1),
  sellPrice: z.string().regex(/^\d+(\.\d+)?$/),
  category: z.string().optional().default("Uncategorized"),
  baseUnit: z.string().optional().default("pcs"),
  stockQty: z.string().regex(/^\d+(\.\d+)?$/).optional().default("0"),
  trackStock: z.boolean().optional().default(false),
  summary: z.string().min(1),
  confirmationText: z.string().min(1),
});

export const ownerCopilotActionDraftSchema = z.discriminatedUnion("kind", [
  expenseDraftSchema,
  cashDraftSchema,
  dueCollectionDraftSchema,
  supplierPaymentDraftSchema,
  stockAdjustmentDraftSchema,
  productPriceUpdateDraftSchema,
  productToggleActiveDraftSchema,
  dueEntryDraftSchema,
  saleVoidDraftSchema,
  customerCreateDraftSchema,
  supplierCreateDraftSchema,
  productCreateDraftSchema,
]);

export type OwnerCopilotActionDraft = z.infer<
  typeof ownerCopilotActionDraftSchema
>;

function buildExpenseDraft(question: string): OwnerCopilotActionDraft | null {
  const amount = extractAmount(question);
  if (!amount) return null;
  const note = extractReason(question, amount);
  const category = inferExpenseCategory(question, note);

  return {
    kind: "expense",
    amount,
    category,
    note,
    summary: `নতুন খরচ draft: ৳ ${amount} | ${category}${note ? ` | ${note}` : ""}`,
    confirmationText: `৳ ${amount} টাকার খরচ ${category} category-তে যোগ করব${note ? ` (${note})` : ""}?`,
  };
}

function buildCashDraft(
  question: string,
  entryType: "IN" | "OUT"
): OwnerCopilotActionDraft | null {
  const amount = extractAmount(question);
  if (!amount) return null;
  const reason = extractReason(question, amount);
  const label = entryType === "IN" ? "ক্যাশ ইন" : "ক্যাশ আউট";

  return {
    kind: "cash_entry",
    entryType,
    amount,
    reason,
    summary: `নতুন ${label} draft: ৳ ${amount}${reason ? ` | ${reason}` : ""}`,
    confirmationText: `৳ ${amount} এর ${label} এন্ট্রি করব${reason ? ` (${reason})` : ""}?`,
  };
}

function cleanEntityPhrase(raw: string) {
  return raw
    .replace(/[?？！!।,\-]/g, " ")
    .replace(/\b(টাকা|taka|tk|৳|due|payment|collect|supplier|customer|stock|set|update|adjust|করো|করুন|দাও|দিন|নাও|নিন|নিলাম|গ্রহণ|জমা|pay|পরিশোধ|সাপ্লায়ার|সরবরাহকারী|product|পণ্য)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(?:ের|য়ের|র|কে)$/u, "")
    .trim();
}

function buildDueCollectionDraft(question: string): OwnerCopilotActionDraft | null {
  const amount = extractAmount(question);
  if (!amount) return null;
  const customerName = cleanEntityPhrase(question.split(amount)[0] || "");
  if (!customerName) return null;
  const note = extractReason(question, amount);

  return {
    kind: "due_collection",
    amount,
    customerName,
    note,
    summary: `বাকি সংগ্রহ draft: ${customerName} | ৳ ${amount}${note ? ` | ${note}` : ""}`,
    confirmationText: `${customerName}-এর কাছ থেকে ৳ ${amount} বাকি collect করব${note ? ` (${note})` : ""}?`,
  };
}

function buildSupplierPaymentDraft(question: string): OwnerCopilotActionDraft | null {
  const amount = extractAmount(question);
  if (!amount) return null;
  const supplierName = cleanEntityPhrase(question.split(amount)[0] || "");
  if (!supplierName) return null;
  const note = extractReason(question, amount);

  return {
    kind: "supplier_payment",
    amount,
    supplierName,
    method: "cash",
    note,
    summary: `Supplier payment draft: ${supplierName} | ৳ ${amount}${note ? ` | ${note}` : ""}`,
    confirmationText: `${supplierName}-কে ৳ ${amount} supplier payment করব${note ? ` (${note})` : ""}?`,
  };
}

function buildStockAdjustmentDraft(question: string): OwnerCopilotActionDraft | null {
  const amount = extractAmount(question);
  if (!amount) return null;
  const productQuery = cleanEntityPhrase(question.split(amount)[0] || "");
  if (!productQuery) return null;
  const note = extractReason(question, amount);

  return {
    kind: "stock_adjustment",
    productQuery,
    targetStock: amount,
    note,
    summary: `Stock adjustment draft: ${productQuery} | target ${amount}${note ? ` | ${note}` : ""}`,
    confirmationText: `${productQuery}-এর stock ${amount}-এ set করব${note ? ` (${note})` : ""}?`,
  };
}

function buildProductPriceUpdateDraft(question: string): OwnerCopilotActionDraft | null {
  const amount = extractAmount(question);
  if (!amount) return null;
  const productQuery = stripBanglaPossessiveSuffix(
    question
      .split(amount)[0]
      ?.replace(/[?？！!।,\-]/g, " ")
      .replace(/sell price/gi, " ")
      .replace(/price|দাম|update|set|করো|করুন/gi, " ")
      .replace(/\s+/g, " ")
      .trim() || ""
  );
  if (!productQuery) return null;
  const note = extractReason(question, amount);

  return {
    kind: "product_price_update",
    productQuery,
    targetPrice: amount,
    note,
    summary: `Price update draft: ${productQuery} | target price ৳ ${amount}${note ? ` | ${note}` : ""}`,
    confirmationText: `${productQuery}-এর sell price ৳ ${amount} করব${note ? ` (${note})` : ""}?`,
  };
}

function buildProductToggleActiveDraft(
  question: string,
  nextActiveState: boolean
): OwnerCopilotActionDraft | null {
  const productQuery = stripBanglaPossessiveSuffix(
    question
      .replace(/[?？！!।,\-]/g, " ")
      .replace(/product|পণ্য|item|active|inactive|enable|disable|চালু|বন্ধ|করো|করুন/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
  if (!productQuery) return null;

  return {
    kind: "product_toggle_active",
    productQuery,
    nextActiveState,
    note: "",
    summary: `${nextActiveState ? "Activate" : "Deactivate"} product draft: ${productQuery}`,
    confirmationText: `${productQuery} product ${nextActiveState ? "active" : "inactive"} করব?`,
  };
}

function buildDueEntryDraft(question: string): OwnerCopilotActionDraft | null {
  const amount = extractAmount(question);
  if (!amount) return null;
  const customerName = stripBanglaPossessiveSuffix(
    cleanEntityPhrase(question.split(amount)[0] || "")
  );
  if (!customerName) return null;
  const note = extractReason(question, amount);

  return {
    kind: "due_entry",
    customerName,
    amount,
    note,
    summary: `Due entry draft: ${customerName} | ৳ ${amount}${note ? ` | ${note}` : ""}`,
    confirmationText: `${customerName}-এর নামে ৳ ${amount} বাকি যোগ করব${note ? ` (${note})` : ""}?`,
  };
}

function extractSaleQuery(question: string) {
  return question
    .replace(/[?？！!।,]/g, " ")
    .replace(/\b(void|cancel|cancelled|sale|invoice|ইনভয়েস|delete)\b/gi, " ")
    .replace(/বাতিল|বিক্রি|করো|করুন/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSaleVoidDraft(question: string): OwnerCopilotActionDraft | null {
  const saleQuery = extractSaleQuery(question);
  if (!saleQuery) return null;

  return {
    kind: "void_sale",
    saleQuery,
    note: "",
    summary: `Sale void draft: ${saleQuery}`,
    confirmationText: `${saleQuery} sale/invoice void করতে চান? Confirm করলে action execute হবে।`,
  };
}

function cleanCreationName(raw: string) {
  return raw
    .replace(/[?？！!।,\-]/g, " ")
    .replace(bangladeshPhonePattern, " ")
    .replace(/নতুন/gi, " ")
    .replace(/customer/gi, " ")
    .replace(/supplier/gi, " ")
    .replace(/product/gi, " ")
    .replace(/item/gi, " ")
    .replace(/কাস্টমার/gi, " ")
    .replace(/সাপ্লায়ার/gi, " ")
    .replace(/সরবরাহকারী/gi, " ")
    .replace(/পণ্য/gi, " ")
    .replace(/যোগ/gi, " ")
    .replace(/add/gi, " ")
    .replace(/create/gi, " ")
    .replace(/করো/gi, " ")
    .replace(/করুন/gi, " ")
    .replace(/বানাও/gi, " ")
    .replace(/খুলো/gi, " ")
    .replace(/লেখো/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripBanglaPossessiveSuffix(value: string) {
  let next = value.trim();
  if (next.endsWith("নামে")) {
    next = next.slice(0, -4).trim();
  }
  if (next.endsWith("য়ের")) {
    next = next.slice(0, -3).trim();
  } else if (next.endsWith("ের")) {
    next = next.slice(0, -2).trim();
  } else if (next.endsWith("র")) {
    next = next.slice(0, -1).trim();
  }
  return next;
}

function buildCustomerCreateDraft(question: string): OwnerCopilotActionDraft | null {
  const phone = extractPhone(question);
  const name = cleanCreationName(question);
  if (!name) return null;

  return {
    kind: "create_customer",
    name,
    phone,
    summary: `নতুন customer draft: ${name}${phone ? ` | ${phone}` : ""}`,
    confirmationText: `${name} নামে নতুন customer তৈরি করব${phone ? ` (${phone})` : ""}?`,
  };
}

function buildSupplierCreateDraft(question: string): OwnerCopilotActionDraft | null {
  const phone = extractPhone(question);
  const name = cleanCreationName(question);
  if (!name) return null;

  return {
    kind: "create_supplier",
    name,
    phone,
    summary: `নতুন supplier draft: ${name}${phone ? ` | ${phone}` : ""}`,
    confirmationText: `${name} নামে নতুন supplier তৈরি করব${phone ? ` (${phone})` : ""}?`,
  };
}

function buildProductCreateDraft(question: string): OwnerCopilotActionDraft | null {
  const amount = extractAmount(question);
  if (!amount) return null;
  const name = cleanCreationName(question.split(amount)[0] || "");
  if (!name) return null;

  return {
    kind: "create_product",
    name,
    sellPrice: amount,
    category: "Uncategorized",
    baseUnit: "pcs",
    stockQty: "0",
    trackStock: false,
    summary: `নতুন product draft: ${name} | sell price ৳ ${amount}`,
    confirmationText: `${name} নামে নতুন product ৳ ${amount} sell price-এ তৈরি করব?`,
  };
}

export function parseOwnerCopilotActionDraft(
  question: string
): OwnerCopilotActionDraft | null {
  const normalized = normalizeCopilotQuestion(question);
  if (!normalized) return null;

  const expenseIntent =
    (normalized.includes("খরচ") || normalized.includes("expense")) &&
    (normalized.includes("যোগ") ||
      normalized.includes("করো") ||
      normalized.includes("করুন") ||
      normalized.includes("লেখো") ||
      normalized.includes("add") ||
      normalized.includes("write"));

  if (expenseIntent) {
    return buildExpenseDraft(question);
  }

  const cashInIntent =
    (normalized.includes("ক্যাশ ইন") ||
      normalized.includes("ক্যাশ in") ||
      normalized.includes("cash in") ||
      normalized.includes("cash ইন") ||
      normalized.includes("জমা") ||
      normalized.includes("ঢুকাও") ||
      (normalized.includes("ক্যাশ") &&
        includesAny(normalized, [" in ", " ইন ", "যুক্ত", "যোগ", "add"]))) &&
    Boolean(extractAmount(question));

  if (cashInIntent) {
    return buildCashDraft(question, "IN");
  }

  const cashOutIntent =
    (normalized.includes("ক্যাশ আউট") ||
      normalized.includes("ক্যাশ out") ||
      normalized.includes("cash out") ||
      normalized.includes("cash আউট") ||
      normalized.includes("ক্যাশ থেকে বের") ||
      normalized.includes("উঠাও") ||
      (normalized.includes("ক্যাশ") &&
        includesAny(normalized, [" out ", " আউট ", "বের", "withdraw"]))) &&
    Boolean(extractAmount(question));

  if (cashOutIntent) {
    return buildCashDraft(question, "OUT");
  }

  const dueCollectionIntent =
    includesAny(normalized, ["বাকি", "due"]) &&
    includesAny(normalized, [
      "collect",
      "নাও",
      "নিন",
      "নিলাম",
      "গ্রহণ",
      "জমা",
      "received",
    ]) &&
    Boolean(extractAmount(question));

  if (dueCollectionIntent) {
    return buildDueCollectionDraft(question);
  }

  const supplierPaymentIntent =
    includesAny(normalized, ["supplier", "সাপ্লায়ার", "সরবরাহকারী", "পাইকার", "payable"]) &&
    includesAny(normalized, ["payment", "পরিশোধ", "pay", "করো", "করুন", "দাও", "দিন"]) &&
    Boolean(extractAmount(question));

  if (supplierPaymentIntent) {
    return buildSupplierPaymentDraft(question);
  }

  const stockAdjustmentIntent =
    includesAny(normalized, ["stock", "স্টক"]) &&
    includesAny(normalized, ["set", "সেট", "update", "adjust", "করো", "করুন", "ঠিক"]) &&
    !includesAny(normalized, ["কত", "কি", "কী", "আছে"]) &&
    Boolean(extractAmount(question));

  if (stockAdjustmentIntent) {
    return buildStockAdjustmentDraft(question);
  }

  const productCreateIntent =
    includesAny(normalized, ["product", "পণ্য", "item"]) &&
    includesAny(normalized, ["নতুন", "new", "add", "create", "যোগ"]) &&
    Boolean(extractAmount(question));

  if (productCreateIntent) {
    return buildProductCreateDraft(question);
  }

  const productPriceUpdateIntent =
    includesAny(normalized, ["দাম", "price"]) &&
    includesAny(normalized, ["করো", "করুন", "set", "update"]) &&
    !includesAny(normalized, ["stock", "স্টক", "কত", "কি", "কী", "আছে"]) &&
    Boolean(extractAmount(question));

  if (productPriceUpdateIntent) {
    return buildProductPriceUpdateDraft(question);
  }

  const productDeactivateIntent =
    includesAny(normalized, ["inactive", "disable", "বন্ধ"]) &&
    includesAny(normalized, ["product", "পণ্য", "item", "করো", "করুন"]);

  if (productDeactivateIntent) {
    return buildProductToggleActiveDraft(question, false);
  }

  const productActivateIntent =
    includesAny(normalized, ["active", "enable", "চালু"]) &&
    includesAny(normalized, ["product", "পণ্য", "item", "করো", "করুন"]);

  if (productActivateIntent) {
    return buildProductToggleActiveDraft(question, true);
  }

  const dueEntryIntent =
    includesAny(normalized, ["বাকি", "due"]) &&
    includesAny(normalized, ["যোগ", "add", "create", "করো", "করুন", "লেখো"]) &&
    Boolean(extractAmount(question));

  if (dueEntryIntent) {
    return buildDueEntryDraft(question);
  }

  const saleVoidIntent =
    includesAny(normalized, ["void", "cancel", "বাতিল"]) &&
    includesAny(normalized, ["sale", "invoice", "ইনভয়েস", "বিক্রি"]);

  if (saleVoidIntent) {
    return buildSaleVoidDraft(question);
  }

  const customerCreateIntent =
    includesAny(normalized, ["customer", "কাস্টমার"]) &&
    includesAny(normalized, ["নতুন", "new", "add", "create", "যোগ"]);

  if (customerCreateIntent) {
    return buildCustomerCreateDraft(question);
  }

  const supplierCreateIntent =
    includesAny(normalized, ["supplier", "সাপ্লায়ার", "সরবরাহকারী"]) &&
    includesAny(normalized, ["নতুন", "new", "add", "create", "যোগ"]);

  if (supplierCreateIntent) {
    return buildSupplierCreateDraft(question);
  }

  return null;
}

function includesAny(source: string, patterns: readonly string[]) {
  return patterns.some((pattern) => source.includes(pattern));
}

export function getOwnerCopilotActionClarification(question: string) {
  const normalized = normalizeCopilotQuestion(question);
  if (!normalized) return null;

  const actionLike = includesAny(normalized, [
    "যোগ",
    "add",
    "create",
    "করো",
    "করুন",
    "payment",
    "পরিশোধ",
    "stock",
    "স্টক",
    "বাকি",
    "due",
  ]);

  if (!actionLike) return null;

  if (
    includesAny(normalized, ["product", "পণ্য", "item"]) &&
    includesAny(normalized, ["নতুন", "new", "যোগ", "add"]) &&
    !extractAmount(question)
  ) {
    return {
      kind: "clarification",
      answer:
        "নতুন product create করতে হলে অন্তত নাম আর sell price বলুন। যেমন: নতুন product চিনি 120 টাকা দামে যোগ করো",
      suggestions: [
        "নতুন product চিনি 120 টাকা দামে যোগ করো",
        "নতুন product ডাল 95 টাকা দামে যোগ করো",
      ] as const,
    };
  }

  if (
    includesAny(normalized, ["stock", "স্টক"]) &&
    includesAny(normalized, ["set", "সেট", "update", "adjust", "করো", "করুন"]) &&
    !extractAmount(question)
  ) {
    return {
      kind: "clarification",
      answer:
        "Stock update করতে হলে product name আর target stock বলুন। যেমন: চিনির stock 25 করো",
      suggestions: ["চিনির stock 25 করো", "ডালের stock 12 করো"] as const,
    };
  }

  if (
    includesAny(normalized, ["দাম", "price"]) &&
    includesAny(normalized, ["করো", "করুন", "set", "update"]) &&
    !extractAmount(question)
  ) {
    return {
      kind: "clarification",
      answer:
        "Price update করতে হলে product name আর নতুন দাম বলুন। যেমন: চিনির দাম 130 করো",
      suggestions: ["চিনির দাম 130 করো", "ডালের price 95 করো"] as const,
    };
  }

  if (
    includesAny(normalized, ["বাকি", "due"]) &&
    includesAny(normalized, ["যোগ", "add", "create", "করো", "করুন"]) &&
    !extractAmount(question)
  ) {
    return {
      kind: "clarification",
      answer:
        "Due entry করতে হলে customer name আর amount বলুন। যেমন: রহিমের নামে 300 টাকা বাকি যোগ করো",
      suggestions: [
        "রহিমের নামে 300 টাকা বাকি যোগ করো",
        "করিমের নামে 500 টাকা due add করো",
      ] as const,
    };
  }

  if (
    includesAny(normalized, ["বাকি", "due"]) &&
    includesAny(normalized, ["নাও", "নিন", "collect", "গ্রহণ", "জমা"]) &&
    !extractAmount(question)
  ) {
    return {
      kind: "clarification",
      answer:
        "Due collection করতে হলে customer name আর amount বলুন। যেমন: রহিমের 500 টাকা বাকি নাও",
      suggestions: ["রহিমের 500 টাকা বাকি নাও", "করিমের 200 টাকা due collect করো"] as const,
    };
  }

  if (
    includesAny(normalized, ["supplier", "সাপ্লায়ার", "সরবরাহকারী"]) &&
    includesAny(normalized, ["payment", "পরিশোধ", "pay"]) &&
    !extractAmount(question)
  ) {
    return {
      kind: "clarification",
      answer:
        "Supplier payment করতে হলে supplier name আর amount বলুন। যেমন: করিম supplier-কে 800 টাকা payment করো",
      suggestions: [
        "করিম supplier-কে 800 টাকা payment করো",
        "ABC Traders-কে 1500 টাকা supplier payment করো",
      ] as const,
    };
  }

  return null;
}
