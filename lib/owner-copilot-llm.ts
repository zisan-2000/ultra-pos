import { z } from "zod";
import { generateTextWithGemini } from "@/lib/ai/gemini";
import { getAiProviderConfig } from "@/lib/ai/provider";
import { buildOwnerCopilotInsight } from "@/lib/owner-copilot";
import type { OwnerCopilotConversationTurn } from "@/lib/owner-copilot-memory";
import type { TodaySummary } from "@/lib/reports/today-summary";
import type { OwnerCopilotSnapshot } from "@/lib/owner-copilot";

type OwnerCopilotPayloadForLlm = {
  summary: TodaySummary;
  payables: {
    totalDue: number;
    dueCount: number;
    supplierCount: number;
  };
  snapshot: OwnerCopilotSnapshot;
};

const llmResponseSchema = z.object({
  supported: z.boolean(),
  answer: z.string().trim().min(1),
  confidence: z.enum(["high", "medium", "low"]).default("low"),
  needsRuleFallback: z.boolean().default(false),
  suggestions: z.array(z.string().trim().min(1)).max(4).optional(),
});

export type OwnerCopilotLlmAnswer = z.infer<typeof llmResponseSchema> & {
  engine: "llm";
  provider: "gemini";
  model: string;
};

function extractJsonObject(rawText: string) {
  const trimmed = rawText.trim();
  const cleaned = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return null;
    }
    try {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    } catch {
      return null;
    }
  }
}

function buildContext(payload: OwnerCopilotPayloadForLlm) {
  const insight = buildOwnerCopilotInsight("shop", payload.summary, payload.snapshot);

  return {
    today: {
      salesTotal: Number(payload.summary.sales.total ?? 0),
      salesCount: Number(payload.summary.sales.count ?? 0),
      profit: Number(payload.summary.profit ?? 0),
      expenseTotal:
        Number(payload.summary.expenses.total ?? 0) +
        Number(payload.summary.expenses.cogs ?? 0),
      cashBalance: Number(payload.summary.cash.balance ?? 0),
    },
    snapshot: {
      shopName: payload.snapshot.shopName,
      businessLabel: payload.snapshot.businessLabel,
      lowStockCount: Number(payload.snapshot.lowStockCount ?? 0),
      lowestStockName: payload.snapshot.lowestStockName ?? null,
      lowestStockQty:
        payload.snapshot.lowestStockQty === null
          ? null
          : Number(payload.snapshot.lowestStockQty ?? 0),
      dueTotal: Number(payload.snapshot.dueTotal ?? 0),
      dueCustomerCount: Number(payload.snapshot.dueCustomerCount ?? 0),
      topDueCustomerName: payload.snapshot.topDueCustomerName ?? null,
      topDueCustomerAmount: Number(payload.snapshot.topDueCustomerAmount ?? 0),
      payablesTotal: Number(payload.snapshot.payablesTotal ?? 0),
      payableSupplierCount: Number(payload.snapshot.payableSupplierCount ?? 0),
      queuePendingCount: Number(payload.snapshot.queuePendingCount ?? 0),
      topProductName: payload.snapshot.topProductName ?? null,
      topProductQty: Number(payload.snapshot.topProductQty ?? 0),
      topProductRevenue: Number(payload.snapshot.topProductRevenue ?? 0),
      topExpenseCategoryName: payload.snapshot.topExpenseCategoryName ?? null,
      topExpenseCategoryAmount: Number(payload.snapshot.topExpenseCategoryAmount ?? 0),
      yesterday: {
        sales: Number(payload.snapshot.yesterday.sales ?? 0),
        profit: Number(payload.snapshot.yesterday.profit ?? 0),
        expenses: Number(payload.snapshot.yesterday.expenses ?? 0),
        cashBalance: Number(payload.snapshot.yesterday.cashBalance ?? 0),
      },
      average7d: {
        sales: Number(payload.snapshot.average7d.sales ?? 0),
        profit: Number(payload.snapshot.average7d.profit ?? 0),
        expenses: Number(payload.snapshot.average7d.expenses ?? 0),
        cashBalance: Number(payload.snapshot.average7d.cashBalance ?? 0),
      },
    },
    payables: {
      totalDue: Number(payload.payables.totalDue ?? 0),
      dueCount: Number(payload.payables.dueCount ?? 0),
      supplierCount: Number(payload.payables.supplierCount ?? 0),
    },
    insight: {
      tone: insight.tone,
      badge: insight.badge,
      headline: insight.headline,
      overview: insight.overview,
      priorityLabel: insight.priorityLabel,
      bullets: insight.bullets,
      actionNotes: insight.actionNotes,
      playbook: insight.playbook.map((item) => ({
        title: item.title,
        reason: item.reason,
        action: item.action,
        impactLabel: item.impactLabel,
        confidenceLabel: item.confidenceLabel,
        guardrail: item.guardrail,
      })),
      metrics: insight.metrics.map((metric) => ({
        label: metric.label,
        value: metric.value,
        trendLabel: metric.trendLabel,
        tone: metric.tone,
      })),
    },
    supportedQuestionThemes: [
      "আজ দোকান কেমন চলছে",
      "আজ কী নিয়ে focus দেওয়া উচিত",
      "আজ biggest problem / risk কী",
      "গতকালের তুলনায় কী change হয়েছে",
      "৭ দিনের গড়ের তুলনায় আজ কেমন",
      "আজ কোন product সবচেয়ে ভালো চলছে",
      "low stock risk আছে কি না",
      "due / payable pressure কেমন",
      "queue pressure কেমন",
      "আজ কোন খাতে বেশি খরচ হয়েছে",
      "billing status safe নাকি attention দরকার",
    ],
  };
}

function buildPrompt(
  question: string,
  payload: OwnerCopilotPayloadForLlm,
  conversationTurns: OwnerCopilotConversationTurn[]
) {
  return [
    "USER_QUESTION:",
    question.trim(),
    "",
    "RECENT_CONVERSATION_JSON:",
    JSON.stringify(conversationTurns),
    "",
    "SHOP_CONTEXT_JSON:",
    JSON.stringify(buildContext(payload)),
    "",
    "RULES:",
    "- শুধু SHOP_CONTEXT_JSON থেকে উত্তর দাও।",
    "- summary/insight/snapshot scope-এর মধ্যে থাকলে answered business guidance দাও।",
    "- নির্দিষ্ট customer/product lookup, transaction history drilldown, create/update/delete action, or any data not present in SHOP_CONTEXT_JSON লাগলে supported=false এবং needsRuleFallback=true দাও।",
    "- answer সহজ, ছোট, business-friendly বাংলা হবে।",
    "- RECENT_CONVERSATION_JSON-এ recent turns থাকলে follow-up reference যেমন 'ওটা', 'এটার', 'আগেরটার' resolve করার চেষ্টা করো।",
    "- business owner action-oriented প্রশ্ন করলে provided insight/playbook/metrics থেকে grounded recommendation দাও।",
    "- data compare প্রশ্নে provided today / yesterday / average7d values use করো।",
    "- billing, queue, due, payable, expense category, low stock, top product, overall focus questions answer করা যাবে if context exists.",
    "- amount/count বানিয়ে বলবে না।",
    "- markdown, bullet, code fence দেবে না। শুধু JSON দেবে।",
    "- যদি support করো, চাইলে 2-3টি short Bengali follow-up suggestion দিতে পারো।",
    "",
    "EXAMPLES:",
    '- question: "আজ কোন দিকে ফোকাস দেওয়া উচিত?" -> use insight.priorityLabel + playbook/actionNotes',
    '- question: "আজ সবচেয়ে বড় সমস্যা কী?" -> use tone, lowStock/due/expense/queue/billing signals from context',
    '- question: "গতকালের তুলনায় কী change হয়েছে?" -> compare today vs yesterday values from context',
    '- question: "আজ কোন খাতে বেশি খরচ হয়েছে?" -> use topExpenseCategoryName/topExpenseCategoryAmount if present',
    '- question: "billing অবস্থা কেমন?" -> use billingStatus from context',
    "",
    'RETURN_JSON: {"supported":true,"answer":"...","confidence":"high|medium|low","needsRuleFallback":false,"suggestions":["..."]}',
  ].join("\n");
}

const systemInstruction = [
  "You are Dokan Copilot, a grounded retail business assistant.",
  "You answer in simple Bengali for Bangladeshi shop owners.",
  "Never invent numbers, customers, products, or actions.",
  "If the provided context is insufficient, explicitly request rule fallback in JSON.",
].join(" ");

export async function maybeAnswerOwnerCopilotWithLlm({
  question,
  payload,
  conversationTurns = [],
}: {
  question: string;
  payload: OwnerCopilotPayloadForLlm;
  conversationTurns?: OwnerCopilotConversationTurn[];
}): Promise<OwnerCopilotLlmAnswer | null> {
  const config = getAiProviderConfig();

  if (!config.enabled || config.provider !== "gemini") {
    return null;
  }

  const result = await generateTextWithGemini({
    apiKey: config.apiKey,
    model: config.model,
    timeoutMs: config.timeoutMs,
    systemInstruction,
    prompt: buildPrompt(question, payload, conversationTurns),
  });

  const parsed = extractJsonObject(result.text);
  if (!parsed) {
    return null;
  }

  const validated = llmResponseSchema.safeParse(parsed);
  if (!validated.success) {
    return null;
  }

  return {
    ...validated.data,
    engine: "llm",
    provider: "gemini",
    model: result.model,
  };
}
