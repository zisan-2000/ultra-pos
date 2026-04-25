import { z } from "zod";
import { normalizeCopilotQuestion } from "@/lib/copilot-ask";

const amountPattern = /(\d+(?:[.,]\d+)?)/;

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

function extractAmount(question: string) {
  const match = question.match(amountPattern);
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

export const ownerCopilotActionDraftSchema = z.discriminatedUnion("kind", [
  expenseDraftSchema,
  cashDraftSchema,
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
      normalized.includes("cash in") ||
      normalized.includes("জমা") ||
      normalized.includes("ঢুকাও")) &&
    Boolean(extractAmount(question));

  if (cashInIntent) {
    return buildCashDraft(question, "IN");
  }

  const cashOutIntent =
    (normalized.includes("ক্যাশ আউট") ||
      normalized.includes("cash out") ||
      normalized.includes("ক্যাশ থেকে বের") ||
      normalized.includes("উঠাও")) &&
    Boolean(extractAmount(question));

  if (cashOutIntent) {
    return buildCashDraft(question, "OUT");
  }

  return null;
}
