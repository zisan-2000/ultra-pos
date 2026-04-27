import { z } from "zod";
import { generateTextWithGemini } from "@/lib/ai/gemini";
import { getAiProviderConfig } from "@/lib/ai/provider";
import { getCopilotLanguageInstruction } from "@/lib/copilot-language";
import { getOwnerCopilotRuntimeConfig } from "@/lib/owner-copilot-config";
import {
  listOwnerCopilotToolDefinitions,
  runOwnerCopilotToolCall,
  type OwnerCopilotToolCall,
  type OwnerCopilotToolName,
  type OwnerCopilotToolResult,
  validateOwnerCopilotToolCall,
} from "@/lib/owner-copilot-tools";
import type { OwnerCopilotConversationTurn } from "@/lib/owner-copilot-memory";
import type { TodaySummary } from "@/lib/reports/today-summary";
import type { OwnerCopilotSnapshot } from "@/lib/owner-copilot";

type OwnerCopilotPayloadForTools = {
  summary: TodaySummary;
  payables: {
    totalDue: number;
    dueCount: number;
    supplierCount: number;
  };
  snapshot: OwnerCopilotSnapshot;
};

const toolNames = listOwnerCopilotToolDefinitions().map(
  (definition) => definition.name
) as [OwnerCopilotToolName, ...OwnerCopilotToolName[]];

const toolPlanningSchema = z.object({
  needsRuleFallback: z.boolean().default(false),
  toolCalls: z
    .array(
      z.object({
        tool: z.enum(toolNames),
        args: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .max(3)
    .default([]),
});

const toolAnswerSchema = z.object({
  supported: z.boolean().default(true),
  answer: z.string().trim().optional().default(""),
  confidence: z.enum(["high", "medium", "low"]).default("low"),
  needsRuleFallback: z.boolean().default(false),
  suggestions: z.array(z.string().trim().min(1)).max(4).optional(),
});

type ToolOrchestratedAnswer = z.infer<typeof toolAnswerSchema> & {
  engine: "llm-tools";
  provider: "gemini";
  model: string;
  toolNames: OwnerCopilotToolName[];
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

function buildPlannerPrompt(
  question: string,
  payload: OwnerCopilotPayloadForTools,
  conversationTurns: OwnerCopilotConversationTurn[]
) {
  return [
    "USER_QUESTION:",
    question.trim(),
    "",
    "RECENT_CONVERSATION_JSON:",
    JSON.stringify(conversationTurns),
    "",
    "LIGHT_CONTEXT_JSON:",
    JSON.stringify({
      today: {
        salesTotal: Number(payload.summary.sales.total ?? 0),
        salesCount: Number(payload.summary.sales.count ?? 0),
        profit: Number(payload.summary.profit ?? 0),
        cashBalance: Number(payload.summary.cash.balance ?? 0),
      },
      snapshot: {
        shopName: payload.snapshot.shopName,
        businessLabel: payload.snapshot.businessLabel,
        topProductName: payload.snapshot.topProductName,
        lowStockCount: Number(payload.snapshot.lowStockCount ?? 0),
        dueTotal: Number(payload.snapshot.dueTotal ?? 0),
        payablesTotal: Number(payload.snapshot.payablesTotal ?? 0),
        queuePendingCount: Number(payload.snapshot.queuePendingCount ?? 0),
        billingStatus: payload.snapshot.billingStatus,
      },
    }),
    "",
    "AVAILABLE_TOOLS_JSON:",
    JSON.stringify(listOwnerCopilotToolDefinitions()),
    "",
    "RULES:",
    "- শুধুমাত্র AVAILABLE_TOOLS_JSON-এর tool names use করো।",
    "- RECENT_CONVERSATION_JSON use করে follow-up references যেমন 'ওটা', 'আগেরটা', 'এটার' resolve করো।",
    "- Tool দরকার না হলে toolCalls empty রাখো।",
    "- Specific product/customer/recent sale/ranked item/detail question হলে matching tool use করো।",
    "- Inventory-wide প্রশ্ন যেমন total product count, active/inactive count, out-of-stock, dead stock, highest/lowest stock হলে inventory tools prefer করো।",
    "- Stock value, inventory value, reorder, restock, high-stock-risk, dead-stock-risk প্রশ্ন হলে inventory value / reorder / dead-stock tools prefer করো।",
    "- Sales intelligence প্রশ্ন যেমন কোন category বেশি বিক্রি, payment method breakdown, average order value, specific product sales summary হলে sales tools prefer করো।",
    "- Customer intelligence প্রশ্ন যেমন total customers, top due customers, repeat customers, inactive customers হলে customer tools prefer করো।",
    "- Supplier/purchase intelligence প্রশ্ন যেমন total suppliers, top suppliers, supplier payable list, recent purchases, purchase gap items হলে supplier tools prefer করো।",
    "- Profitability প্রশ্ন যেমন top profit products, low margin products, category margin summary, profit trend হলে profitability tools prefer করো।",
    "- Summary context দিয়েই answer সম্ভব হলে needsRuleFallback=false এবং toolCalls empty রাখো।",
    "- User যদি এমন কিছু চায় যা tools-এ নেই বা write action চায়, needsRuleFallback=true দাও।",
    "- Same question-এ maximum 3 tools।",
    "",
    'RETURN_JSON: {"needsRuleFallback":false,"toolCalls":[{"tool":"get_product_details","args":{"query":"ডাল"}}]}',
  ].join("\n");
}

function buildSynthesisPrompt(
  question: string,
  payload: OwnerCopilotPayloadForTools,
  toolResults: OwnerCopilotToolResult[],
  conversationTurns: OwnerCopilotConversationTurn[]
) {
  return [
    "USER_QUESTION:",
    question.trim(),
    "",
    "RECENT_CONVERSATION_JSON:",
    JSON.stringify(conversationTurns),
    "",
    "BASE_CONTEXT_JSON:",
    JSON.stringify({
      shopName: payload.snapshot.shopName,
      businessLabel: payload.snapshot.businessLabel,
      todaySales: Number(payload.summary.sales.total ?? 0),
      todayProfit: Number(payload.summary.profit ?? 0),
      todayCash: Number(payload.summary.cash.balance ?? 0),
    }),
    "",
    "TOOL_RESULTS_JSON:",
    JSON.stringify(toolResults),
    "",
    "RULES:",
    "- শুধু BASE_CONTEXT_JSON এবং TOOL_RESULTS_JSON থেকে grounded answer দাও।",
    "- RECENT_CONVERSATION_JSON use করে follow-up wording resolve করতে পারো, but facts অবশ্যই TOOL_RESULTS_JSON থেকে নিতে হবে।",
    `- ${getCopilotLanguageInstruction(question)}`,
    "- matched=false হলে সেটা স্পষ্টভাবে বলো।",
    "- number/value বানিয়ে বলবে না।",
    "- create/update/delete action করবে না।",
    "- unsupported হলে needsRuleFallback=true দাও।",
    "- চাইলে 2-3টি short Bengali follow-up suggestion দিতে পারো।",
    "- markdown বা code fence দেবে না। শুধু JSON।",
    "",
    'RETURN_JSON: {"supported":true,"answer":"...","confidence":"high|medium|low","needsRuleFallback":false,"suggestions":["..."]}',
  ].join("\n");
}

const planningSystemInstruction = [
  "You are Dokan Copilot tool planner.",
  "Plan safe read-only tool calls only.",
  "Do not answer the user directly.",
  "Respond in JSON only.",
].join(" ");

const synthesisSystemInstruction = [
  "You are Dokan Copilot, a grounded retail business assistant.",
  "Answer in simple Bengali using only the provided tool results.",
  "Never invent numbers, records, or actions.",
].join(" ");

async function planToolCalls({
  question,
  payload,
  conversationTurns,
  apiKey,
  model,
  timeoutMs,
}: {
  question: string;
  payload: OwnerCopilotPayloadForTools;
  conversationTurns: OwnerCopilotConversationTurn[];
  apiKey: string;
  model: string;
  timeoutMs: number;
}) {
  const result = await generateTextWithGemini({
    apiKey,
    model,
    timeoutMs,
    systemInstruction: planningSystemInstruction,
    prompt: buildPlannerPrompt(question, payload, conversationTurns),
    temperature: 0.1,
  });

  const parsed = extractJsonObject(result.text);
  if (!parsed) return null;

  const validated = toolPlanningSchema.safeParse(parsed);
  if (!validated.success) return null;

  const toolCalls = validated.data.toolCalls
    .map((toolCall) =>
      validateOwnerCopilotToolCall({
        tool: toolCall.tool,
        args: toolCall.args ?? {},
      } as OwnerCopilotToolCall)
    )
    .filter(Boolean) as Array<{ tool: OwnerCopilotToolName; args: Record<string, unknown> }>;

  return {
    needsRuleFallback: validated.data.needsRuleFallback,
    toolCalls,
    model: result.model,
  };
}

async function synthesizeToolAnswer({
  question,
  payload,
  toolResults,
  conversationTurns,
  apiKey,
  model,
  timeoutMs,
}: {
  question: string;
  payload: OwnerCopilotPayloadForTools;
  toolResults: OwnerCopilotToolResult[];
  conversationTurns: OwnerCopilotConversationTurn[];
  apiKey: string;
  model: string;
  timeoutMs: number;
}) {
  const result = await generateTextWithGemini({
    apiKey,
    model,
    timeoutMs,
    systemInstruction: synthesisSystemInstruction,
    prompt: buildSynthesisPrompt(question, payload, toolResults, conversationTurns),
    temperature: 0.2,
  });

  const parsed = extractJsonObject(result.text);
  if (!parsed) return null;

  const validated = toolAnswerSchema.safeParse(parsed);
  if (!validated.success) return null;

  return {
    ...validated.data,
    model: result.model,
  };
}

export async function maybeAnswerOwnerCopilotWithTools({
  question,
  shopId,
  payload,
  conversationTurns = [],
}: {
  question: string;
  shopId: string;
  payload: OwnerCopilotPayloadForTools;
  conversationTurns?: OwnerCopilotConversationTurn[];
}): Promise<ToolOrchestratedAnswer | null> {
  const config = getAiProviderConfig();
  const runtimeConfig = getOwnerCopilotRuntimeConfig();

  if (!runtimeConfig.toolsEnabled || !config.enabled || config.provider !== "gemini") {
    return null;
  }

  const plan = await planToolCalls({
    question,
    payload,
    conversationTurns,
    apiKey: config.apiKey,
    model: config.model,
    timeoutMs: config.timeoutMs,
  });

  if (!plan) {
    return null;
  }

  if (plan.toolCalls.length === 0) {
    return plan.needsRuleFallback
      ? {
          supported: false,
          answer: "",
          confidence: "low",
          needsRuleFallback: true,
          engine: "llm-tools",
          provider: "gemini",
          model: plan.model,
          toolNames: [],
        }
      : null;
  }

  const toolResults: OwnerCopilotToolResult[] = [];
  for (const toolCall of plan.toolCalls) {
    toolResults.push(
      await runOwnerCopilotToolCall({
        shopId,
        payload,
        toolCall,
      })
    );
  }

  const synthesized = await synthesizeToolAnswer({
    question,
    payload,
    toolResults,
    conversationTurns,
    apiKey: config.apiKey,
    model: config.model,
    timeoutMs: config.timeoutMs,
  });

  if (!synthesized) {
    return null;
  }

  return {
    ...synthesized,
    engine: "llm-tools",
    provider: "gemini",
    model: synthesized.model,
    toolNames: plan.toolCalls.map((toolCall) => toolCall.tool),
  };
}
