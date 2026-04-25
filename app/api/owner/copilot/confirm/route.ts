import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-session";
import { rateLimit } from "@/lib/rate-limit";
import { getOwnerCopilotRuntimeConfig, isOwnerCopilotEnabledForContext } from "@/lib/owner-copilot-config";
import { logOwnerCopilotRun } from "@/lib/owner-copilot-telemetry";
import { withTracing } from "@/lib/tracing";
import { executeOwnerCopilotActionDraft } from "@/lib/owner-copilot-action-executor";
import { getOrCreateOwnerCopilotConversation, saveOwnerCopilotConversationExchange } from "@/lib/owner-copilot-memory";
import { ownerCopilotActionDraftSchema } from "@/lib/owner-copilot-actions";

const responseHeaders = {
  "Cache-Control": "private, no-store",
};

export async function POST(req: Request) {
  return withTracing(req, "/api/owner/copilot/confirm", async () => {
    const startedAt = Date.now();
    try {
      const rl = await rateLimit(req, {
        windowMs: 60_000,
        max: 20,
        keyPrefix: "owner-copilot-confirm",
      });
      if (rl.limited) {
        return NextResponse.json(
          { error: "অনেক বেশি confirm request হচ্ছে। একটু পরে আবার চেষ্টা করুন।" },
          { status: 429, headers: rl.headers }
        );
      }

      const body = (await req.json()) as {
        shopId?: string;
        conversationId?: string;
        actionDraft?: unknown;
      };

      const shopId = String(body.shopId || "").trim();
      const conversationId = String(body.conversationId || "").trim() || null;
      const actionDraft = ownerCopilotActionDraftSchema.parse(body.actionDraft);

      if (!shopId) {
        return NextResponse.json({ error: "shopId is required" }, { status: 400 });
      }

      const user = await requireUser();
      const availability = isOwnerCopilotEnabledForContext({
        userId: user.id,
        shopId,
      });
      const runtimeConfig = getOwnerCopilotRuntimeConfig();
      if (!availability.enabled || !runtimeConfig.actionsEnabled) {
        await logOwnerCopilotRun({
          shopId,
          userId: user.id,
          conversationId,
          routeKey: "confirm",
          question: actionDraft.summary,
          engine: "blocked",
          status: "blocked",
          errorMessage: !availability.enabled ? availability.reason : "actions_disabled",
          latencyMs: Date.now() - startedAt,
          requiresConfirmation: true,
        });
        return NextResponse.json(
          { error: "Copilot action confirm এখন available না।" },
          { status: 400, headers: responseHeaders }
        );
      }

      const conversation = await getOrCreateOwnerCopilotConversation({
        conversationId,
        shopId,
        userId: user.id,
        firstQuestion: actionDraft.summary,
      });

      const executed = await executeOwnerCopilotActionDraft({
        shopId,
        user,
        actionDraft,
      });

      await saveOwnerCopilotConversationExchange({
        conversationId: conversation.id,
        question: `Confirm action: ${actionDraft.summary}`,
        answer: executed.answer,
        assistantMetadata: {
          engine: "action-confirm",
          actionKind: actionDraft.kind,
          actionDraft,
          executed: true,
        },
      });

      await logOwnerCopilotRun({
        shopId,
        userId: user.id,
        conversationId: conversation.id,
        routeKey: "confirm",
        question: actionDraft.summary,
        answer: executed.answer,
        engine: "action-confirm",
        status: "success",
        latencyMs: Date.now() - startedAt,
        requiresConfirmation: true,
      });

      return NextResponse.json(
        {
          success: true,
          answer: executed.answer,
          conversationId: conversation.id,
          engine: "action-confirm",
          actionKind: actionDraft.kind,
          suggestions: [
            "আরেকটা action draft করতে পারেন",
            "আজকের cash balance জিজ্ঞেস করুন",
            "আজ খরচ কত হলো জিজ্ঞেস করুন",
          ],
        },
        {
          status: 200,
          headers: responseHeaders,
        }
      );
    } catch (error: any) {
      const message =
        typeof error?.message === "string"
          ? error.message
          : "Copilot action confirm করা যায়নি";
      try {
        const raw = (await req.clone().json().catch(() => ({}))) as {
          shopId?: string;
          conversationId?: string;
          actionDraft?: { summary?: string };
        };
        const shopId = String(raw.shopId || "").trim();
        const user = await requireUser().catch(() => null);
        if (shopId && user) {
          await logOwnerCopilotRun({
            shopId,
            userId: user.id,
            conversationId: String(raw.conversationId || "").trim() || null,
            routeKey: "confirm",
            question: String(raw.actionDraft?.summary || "confirm"),
            status: "error",
            engine: "action-confirm",
            errorMessage: message,
            latencyMs: Date.now() - startedAt,
            requiresConfirmation: true,
          });
        }
      } catch {}
      return NextResponse.json({ error: message }, { status: 400 });
    }
  });
}
