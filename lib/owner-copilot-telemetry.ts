import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function toPreview(value: string | null | undefined, maxLength: number) {
  const compact = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!compact) return null;
  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength - 3)}...`;
}

export async function logOwnerCopilotRun(params: {
  shopId: string;
  userId: string;
  conversationId?: string | null;
  routeKey: "ask" | "confirm";
  question: string;
  answer?: string | null;
  engine?: string | null;
  provider?: string | null;
  model?: string | null;
  toolNames?: readonly string[] | null;
  fallbackUsed?: boolean;
  requiresConfirmation?: boolean;
  status: "success" | "fallback" | "blocked" | "error";
  latencyMs?: number | null;
  errorMessage?: string | null;
}) {
  try {
    await prisma.ownerCopilotRun.create({
      data: {
        shopId: params.shopId,
        userId: params.userId,
        conversationId: params.conversationId ?? null,
        routeKey: params.routeKey,
        questionPreview: toPreview(params.question, 240) ?? "unknown",
        answerPreview: toPreview(params.answer, 400),
        engine: params.engine ?? null,
        provider: params.provider ?? null,
        model: params.model ?? null,
        toolNamesJson: params.toolNames
          ? (Array.from(params.toolNames) as Prisma.InputJsonValue)
          : undefined,
        status: params.status,
        fallbackUsed: Boolean(params.fallbackUsed),
        requiresConfirmation: Boolean(params.requiresConfirmation),
        latencyMs: params.latencyMs ?? null,
        errorMessage: toPreview(params.errorMessage, 240),
      },
    });
  } catch (error) {
    console.warn("owner copilot telemetry log failed", error);
  }
}
