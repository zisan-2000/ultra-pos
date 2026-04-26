import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-session";
import { rateLimit } from "@/lib/rate-limit";
import { getOwnerCopilotRuntimeConfig, isOwnerCopilotEnabledForContext } from "@/lib/owner-copilot-config";
import { logOwnerCopilotRun } from "@/lib/owner-copilot-telemetry";
import { withTracing } from "@/lib/tracing";
import { prisma } from "@/lib/prisma";
import { getOwnerCopilotPayload } from "@/lib/owner-copilot-server";
import { buildOwnerCopilotInsight } from "@/lib/owner-copilot";
import { maybeAnswerOwnerCopilotWithLlm } from "@/lib/owner-copilot-llm";
import { maybeAnswerOwnerCopilotWithTools } from "@/lib/owner-copilot-tool-orchestrator";
import {
  getOrCreateOwnerCopilotConversation,
  listOwnerCopilotConversationMessagesWithMetadata,
  listOwnerCopilotConversationTurns,
  saveOwnerCopilotConversationExchange,
} from "@/lib/owner-copilot-memory";
import {
  getOwnerCopilotActionClarification,
  parseOwnerCopilotActionDraft,
} from "@/lib/owner-copilot-actions";
import {
  getOwnerCopilotActionSuggestions,
  prepareOwnerCopilotActionDraft,
} from "@/lib/owner-copilot-action-planner";
import {
  COPILOT_QUESTION_SUGGESTIONS,
  normalizeCopilotQuestion,
  parseCopilotQuestion,
} from "@/lib/copilot-ask";

function formatMoney(value: number) {
  return `৳ ${new Intl.NumberFormat("bn-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0))}`;
}

function formatCount(value: number) {
  return new Intl.NumberFormat("bn-BD").format(Number(value || 0));
}

function normalizeName(value: string) {
  return normalizeCopilotQuestion(value).replace(/\s+/g, "");
}

function formatCompactValue(value: number) {
  return Number.isInteger(value)
    ? new Intl.NumberFormat("bn-BD").format(value)
    : new Intl.NumberFormat("bn-BD", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(value);
}

function scoreCustomerMatch(customerName: string, askedName: string) {
  const customer = normalizeName(customerName);
  const asked = normalizeName(askedName);
  if (!customer || !asked) return 0;
  if (customer === asked) return 100;
  if (customer.startsWith(asked)) return 80;
  if (customer.includes(asked)) return 60;
  if (asked.includes(customer)) return 40;
  return 0;
}

async function findBestCustomer(shopId: string, askedName: string) {
  const candidates = await prisma.customer.findMany({
    where: {
      shopId,
      name: {
        contains: askedName.trim(),
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      name: true,
      totalDue: true,
    },
    orderBy: [{ totalDue: "desc" }, { name: "asc" }],
    take: 8,
  });

  if (candidates.length === 0) return null;

  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: scoreCustomerMatch(candidate.name, askedName),
    }))
    .sort((a, b) => b.score - a.score || Number(b.candidate.totalDue) - Number(a.candidate.totalDue));

  return scored[0]?.score > 0 ? scored[0].candidate : null;
}

function scoreProductMatch(productName: string, askedName: string) {
  const product = normalizeName(productName);
  const asked = normalizeName(askedName);
  if (!product || !asked) return 0;
  if (product === asked) return 100;
  if (product.startsWith(asked)) return 85;
  if (product.includes(asked)) return 65;
  if (asked.includes(product)) return 45;
  return 0;
}

async function findBestProduct(shopId: string, askedName: string) {
  const candidates = await prisma.product.findMany({
    where: {
      shopId,
      OR: [
        {
          name: {
            contains: askedName.trim(),
            mode: "insensitive",
          },
        },
        {
          sku: {
            contains: askedName.trim(),
            mode: "insensitive",
          },
        },
        {
          barcode: {
            contains: askedName.trim(),
            mode: "insensitive",
          },
        },
      ],
    },
    select: {
      id: true,
      name: true,
      category: true,
      sellPrice: true,
      stockQty: true,
      baseUnit: true,
      sku: true,
      barcode: true,
      isActive: true,
      trackStock: true,
    },
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    take: 10,
  });

  if (candidates.length === 0) return null;

  const scored = candidates
    .map((candidate) => ({
      candidate,
      score: Math.max(
        scoreProductMatch(candidate.name, askedName),
        candidate.sku ? scoreProductMatch(candidate.sku, askedName) - 10 : 0,
        candidate.barcode ? scoreProductMatch(candidate.barcode, askedName) - 10 : 0
      ),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.candidate.isActive) - Number(a.candidate.isActive)
    );

  return scored[0]?.score > 0 ? scored[0].candidate : null;
}

async function getLowStockPreview(shopId: string) {
  return prisma.product.findMany({
    where: {
      shopId,
      isActive: true,
      trackStock: true,
      stockQty: { lte: 10 },
    },
    select: {
      name: true,
      stockQty: true,
      baseUnit: true,
    },
    orderBy: [{ stockQty: "asc" }, { updatedAt: "desc" }],
    take: 3,
  });
}

const responseHeaders = {
  "Cache-Control": "private, no-store",
};

export async function POST(req: Request) {
  return withTracing(req, "/api/owner/copilot/ask", async () => {
    const startedAt = Date.now();
    try {
      const rl = await rateLimit(req, {
        windowMs: 60_000,
        max: 40,
        keyPrefix: "owner-copilot-ask",
      });
      if (rl.limited) {
        return NextResponse.json(
          { error: "অনেক বেশি request হচ্ছে। একটু পরে আবার চেষ্টা করুন।" },
          { status: 429, headers: rl.headers }
        );
      }

      const body = (await req.json()) as {
        shopId?: string;
        question?: string;
        conversationId?: string;
      };

      const shopId = String(body.shopId || "").trim();
      const question = String(body.question || "").trim();
      const requestedConversationId = String(body.conversationId || "").trim() || null;

      if (!shopId || !question) {
        return NextResponse.json(
          { error: "shopId and question are required" },
          { status: 400 }
        );
      }

      const user = await requireUser();
      const availability = isOwnerCopilotEnabledForContext({
        userId: user.id,
        shopId,
      });
      if (!availability.enabled) {
        await logOwnerCopilotRun({
          shopId,
          userId: user.id,
          routeKey: "ask",
          question,
          status: "blocked",
          engine: "availability-gate",
          errorMessage: availability.reason,
          latencyMs: Date.now() - startedAt,
        });
        return NextResponse.json(
          {
            supported: false,
            answer: "Copilot এই account-এর জন্য এখনো চালু হয়নি।",
            suggestions: COPILOT_QUESTION_SUGGESTIONS,
            engine: "blocked",
            fallbackUsed: false,
          },
          { status: 200, headers: responseHeaders }
        );
      }

      const runtimeConfig = getOwnerCopilotRuntimeConfig();
      const payload = await getOwnerCopilotPayload(shopId, user);
      const conversation = await getOrCreateOwnerCopilotConversation({
        conversationId: requestedConversationId,
        shopId,
        userId: user.id,
        firstQuestion: question,
      });
      const conversationTurns = await listOwnerCopilotConversationTurns(conversation.id, 8);
      const recentMessages = await listOwnerCopilotConversationMessagesWithMetadata(
        conversation.id,
        12
      );
      const intent = parseCopilotQuestion(question);
      const actionDraft = parseOwnerCopilotActionDraft(question);
      const actionClarification = getOwnerCopilotActionClarification(question);
      let fallbackUsed = false;

      async function persistAndReturn(data: {
        supported: boolean;
        answer: string;
        suggestions?: readonly string[];
        engine: string;
        provider?: string;
        model?: string;
        toolNames?: readonly string[];
        matchedCustomerName?: string | null;
        intentLabel?: string;
        actionDraft?: unknown;
        requiresConfirmation?: boolean;
      }) {
        await saveOwnerCopilotConversationExchange({
          conversationId: conversation.id,
          question,
          answer: data.answer,
          assistantMetadata: {
            supported: data.supported,
            engine: data.engine,
            provider: data.provider ?? null,
            model: data.model ?? null,
            toolNames: data.toolNames ?? [],
            matchedCustomerName: data.matchedCustomerName ?? null,
            intent: data.intentLabel ?? intent.type,
            actionDraft: data.actionDraft ?? null,
            requiresConfirmation: data.requiresConfirmation ?? false,
          },
        });

        await logOwnerCopilotRun({
          shopId,
          userId: user.id,
          conversationId: conversation.id,
          routeKey: "ask",
          question,
          answer: data.answer,
          engine: data.engine,
          provider: data.provider ?? null,
          model: data.model ?? null,
          toolNames: data.toolNames ?? [],
          fallbackUsed,
          requiresConfirmation: data.requiresConfirmation ?? false,
          status:
            data.engine === "rule" && fallbackUsed
              ? "fallback"
              : data.engine === "blocked"
                ? "blocked"
                : "success",
          latencyMs: Date.now() - startedAt,
        });

        return NextResponse.json(
          {
            supported: data.supported,
            normalizedQuestion: normalizeCopilotQuestion(question),
            intent: data.intentLabel ?? intent.type,
            answer: data.answer,
            matchedCustomerName: data.matchedCustomerName ?? null,
            suggestions: data.suggestions ?? COPILOT_QUESTION_SUGGESTIONS,
            engine: data.engine,
            provider: data.provider,
            model: data.model,
            toolNames: data.toolNames,
            actionDraft: data.actionDraft,
            requiresConfirmation: data.requiresConfirmation ?? false,
            conversationId: conversation.id,
            fallbackUsed,
          },
          { status: 200, headers: responseHeaders }
        );
      }

      if (actionDraft && runtimeConfig.actionsEnabled) {
        const preparedActionPlan = await prepareOwnerCopilotActionDraft({
          shopId,
          actionDraft,
          recentMessages,
        });

        if (preparedActionPlan.status === "clarify") {
          return persistAndReturn({
            supported: true,
            answer: preparedActionPlan.clarification.answer,
            suggestions: preparedActionPlan.clarification.suggestions,
            engine: "action-clarification",
            intentLabel: "action_clarification",
          });
        }

        return persistAndReturn({
          supported: true,
          answer: "আমি draft তৈরি করেছি। নিচে দেখে confirm করলে তখনই action execute হবে।",
          suggestions: getOwnerCopilotActionSuggestions(
            preparedActionPlan.actionDraft,
            "draft"
          ),
          engine: "action-draft",
          actionDraft: preparedActionPlan.actionDraft,
          requiresConfirmation: true,
          intentLabel: "action_draft",
        });
      }

      if (actionDraft && !runtimeConfig.actionsEnabled) {
        return persistAndReturn({
          supported: false,
          answer: "Copilot action draft এখন disabled আছে। আপাতত প্রশ্ন-উত্তর mode ব্যবহার করুন।",
          suggestions: COPILOT_QUESTION_SUGGESTIONS,
          engine: "blocked",
          intentLabel: "action_draft_blocked",
        });
      }

      if (actionClarification) {
        return persistAndReturn({
          supported: true,
          answer: actionClarification.answer,
          suggestions: actionClarification.suggestions,
          engine: "action-clarification",
          intentLabel: "action_clarification",
        });
      }

      try {
        const toolAnswer = await maybeAnswerOwnerCopilotWithTools({
          question,
          shopId,
          payload,
          conversationTurns,
        });

        if (toolAnswer && !toolAnswer.needsRuleFallback && toolAnswer.answer) {
          fallbackUsed = false;
          return persistAndReturn({
            supported: toolAnswer.supported,
            answer: toolAnswer.answer,
            suggestions:
              toolAnswer.suggestions && toolAnswer.suggestions.length > 0
                ? toolAnswer.suggestions
                : COPILOT_QUESTION_SUGGESTIONS,
            engine: toolAnswer.engine,
            provider: toolAnswer.provider,
            model: toolAnswer.model,
            toolNames: toolAnswer.toolNames,
          });
        }

        fallbackUsed = fallbackUsed || Boolean(toolAnswer?.needsRuleFallback);
      } catch (error) {
        fallbackUsed = true;
        console.warn("owner copilot tool orchestration fallback", error);
      }

      try {
        const llmAnswer = await maybeAnswerOwnerCopilotWithLlm({
          question,
          payload,
          conversationTurns,
        });

        if (llmAnswer && !llmAnswer.needsRuleFallback) {
          fallbackUsed = false;
          return persistAndReturn({
            supported: llmAnswer.supported,
            answer: llmAnswer.answer,
            suggestions:
              llmAnswer.suggestions && llmAnswer.suggestions.length > 0
                ? llmAnswer.suggestions
                : COPILOT_QUESTION_SUGGESTIONS,
            engine: llmAnswer.engine,
            provider: llmAnswer.provider,
            model: llmAnswer.model,
          });
        }

        fallbackUsed = fallbackUsed || Boolean(llmAnswer?.needsRuleFallback);
      } catch (error) {
        fallbackUsed = true;
        console.warn("owner copilot llm fallback", error);
      }

      if (intent.type === "unsupported") {
        return persistAndReturn({
          supported: false,
          answer:
            "আমি এখন sales, profit, expense, cash, due, payable, queue, top item, low stock, আর product stock/details type business প্রশ্ন বুঝি। প্রশ্নটা আরেকটু clear করে বলুন।",
          suggestions: COPILOT_QUESTION_SUGGESTIONS,
          engine: "rule",
          intentLabel: "unsupported",
        });
      }

      let answer = "";
      let matchedCustomerName: string | null = null;

      switch (intent.type) {
        case "today_status": {
          const insight = buildOwnerCopilotInsight(
            shopId,
            payload.summary,
            payload.snapshot
          );
          answer = `${insight.headline} ${insight.overview}`;
          break;
        }
        case "today_sales":
          answer = `আজ মোট বিক্রি ${formatMoney(payload.summary.sales.total)}। আজ ${formatCount(payload.summary.sales.count)}টি বিক্রি হয়েছে।`;
          break;
        case "today_profit":
          answer = `আজ মোট লাভ ${formatMoney(payload.summary.profit)}।`;
          break;
        case "today_expenses": {
          const totalExpense =
            Number(payload.summary.expenses.total) +
            Number(payload.summary.expenses.cogs ?? 0);
          answer = `আজ মোট খরচ ${formatMoney(totalExpense)}।`;
          break;
        }
        case "today_cash":
          answer = `আজ ক্যাশ ব্যালেন্স এখন ${formatMoney(payload.summary.cash.balance)}।`;
          break;
        case "yesterday_sales":
          answer = `গতকাল মোট বিক্রি ছিল ${formatMoney(payload.snapshot.yesterday.sales)}।`;
          break;
        case "yesterday_profit":
          answer = `গতকাল মোট লাভ ছিল ${formatMoney(payload.snapshot.yesterday.profit)}।`;
          break;
        case "yesterday_expenses":
          answer = `গতকাল মোট খরচ ছিল ${formatMoney(payload.snapshot.yesterday.expenses)}।`;
          break;
        case "yesterday_cash":
          answer = `গতকাল ক্যাশ ব্যালেন্স ছিল ${formatMoney(payload.snapshot.yesterday.cashBalance)}।`;
          break;
        case "due_total":
          answer =
            payload.snapshot.dueTotal > 0
              ? `মোট বাকি এখন ${formatMoney(payload.snapshot.dueTotal)}। ${formatCount(payload.snapshot.dueCustomerCount)} জন কাস্টমারের কাছে due আছে।`
              : "এখন কোনো customer due নেই।";
          break;
        case "payables_total":
          answer =
            payload.snapshot.payablesTotal > 0
              ? `Supplier payable এখন ${formatMoney(payload.snapshot.payablesTotal)}। ${formatCount(payload.snapshot.payableSupplierCount)} জন supplier-এর কাছে due আছে।`
              : "এখন কোনো supplier payable নেই।";
          break;
        case "queue_pending":
          answer =
            payload.snapshot.queuePendingCount > 0
              ? `এখন queue-তে ${formatCount(payload.snapshot.queuePendingCount)}টি pending token আছে।`
              : "এখন queue-তে কোনো pending token নেই।";
          break;
        case "top_product_today":
          answer = payload.snapshot.topProductName
            ? `আজ সবচেয়ে বেশি টানছে ${payload.snapshot.topProductName}। বিক্রি ${formatCompactValue(payload.snapshot.topProductQty)} ইউনিট এবং revenue ${formatMoney(payload.snapshot.topProductRevenue)}।`
            : "আজ এখনো top-selling item বের করার মতো বিক্রি হয়নি।";
          break;
        case "low_stock_list": {
          const lowStockItems = await getLowStockPreview(shopId);
          if (lowStockItems.length === 0) {
            answer = "এখন low stock-এ কোনো active tracked item নেই।";
            break;
          }
          const preview = lowStockItems
            .map(
              (item) =>
                `${item.name} (${formatCompactValue(Number(item.stockQty ?? 0))} ${item.baseUnit || "pcs"})`
            )
            .join(", ");
          answer = `Low stock-এ ${formatCount(payload.snapshot.lowStockCount)}টি item আছে। সবচেয়ে জরুরি: ${preview}।`;
          break;
        }
        case "customer_due": {
          const customer = await findBestCustomer(shopId, intent.customerName);
          if (!customer) {
            answer = `${intent.customerName} নামে কোনো কাস্টমার খুঁজে পাইনি। নামটা আরেকটু স্পষ্ট করে বলুন।`;
          } else {
            matchedCustomerName = customer.name;
            answer =
              Number(customer.totalDue ?? 0) > 0
                ? `${customer.name}-এর কাছে এখন মোট বাকি ${formatMoney(Number(customer.totalDue ?? 0))}।`
                : `${customer.name}-এর কাছে এখন কোনো বাকি নেই।`;
          }
          break;
        }
        case "product_query": {
          const product = await findBestProduct(shopId, intent.productName);
          if (!product) {
            answer = `${intent.productName} নামে কোনো product খুঁজে পাইনি। নাম, SKU, বা barcode আরেকটু স্পষ্ট করে বলুন।`;
            break;
          }

          const stockQty = Number(product.stockQty ?? 0);
          const stockText = `${formatCompactValue(stockQty)} ${product.baseUnit || "pcs"}`;
          const lowStockNote =
            product.trackStock && stockQty <= 10
              ? " Low stock zone-এ আছে।"
              : "";
          const activeText = product.isActive ? "active" : "inactive";
          const skuText = product.sku ? ` SKU ${product.sku}.` : "";
          const barcodeText = product.barcode ? ` Barcode ${product.barcode}.` : "";

          if (intent.mode === "exists") {
            answer = `${product.name} product আছে। এটা ${activeText} এবং বিক্রয় মূল্য ${formatMoney(Number(product.sellPrice ?? 0))}.${product.trackStock ? ` বর্তমান stock ${stockText}.` : " এই item-এ stock tracking চালু নেই."}${lowStockNote}${skuText}${barcodeText}`;
          } else if (intent.mode === "stock") {
            answer = product.trackStock
              ? `${product.name}-এর বর্তমান stock ${stockText}। বিক্রয় মূল্য ${formatMoney(Number(product.sellPrice ?? 0))}.${lowStockNote}${skuText}${barcodeText}`
              : `${product.name} item-এ stock tracking চালু নেই। বিক্রয় মূল্য ${formatMoney(Number(product.sellPrice ?? 0))}.${skuText}${barcodeText}`;
          } else {
            answer = `${product.name} ${product.isActive ? "active" : "inactive"} product। Category ${product.category}. বিক্রয় মূল্য ${formatMoney(Number(product.sellPrice ?? 0))}.${product.trackStock ? ` বর্তমান stock ${stockText}.` : " Stock tracking চালু নেই."}${lowStockNote}${skuText}${barcodeText}`;
          }
          break;
        }
      }

      return persistAndReturn({
        supported: true,
        answer,
        matchedCustomerName,
        suggestions: COPILOT_QUESTION_SUGGESTIONS,
        engine: "rule",
      });
    } catch (error) {
      console.error("owner copilot ask route error", error);
      const message =
        error instanceof Error ? error.message : "Failed to answer owner copilot question";
      return NextResponse.json(
        { error: "Failed to answer owner copilot question" },
        { status: 500 }
      );
    }
  });
}
