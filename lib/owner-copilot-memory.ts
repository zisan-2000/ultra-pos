import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type OwnerCopilotConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

function buildConversationTitle(question: string) {
  const compact = question.replace(/\s+/g, " ").trim();
  if (!compact) return "নতুন কোপাইলট চ্যাট";
  return compact.length <= 80 ? compact : `${compact.slice(0, 77)}...`;
}

export async function getOrCreateOwnerCopilotConversation({
  conversationId,
  shopId,
  userId,
  firstQuestion,
}: {
  conversationId?: string | null;
  shopId: string;
  userId: string;
  firstQuestion: string;
}) {
  if (conversationId) {
    const existing = await prisma.ownerCopilotConversation.findFirst({
      where: {
        id: conversationId,
        shopId,
        userId,
      },
      select: {
        id: true,
        title: true,
      },
    });

    if (existing) {
      return existing;
    }
  }

  return prisma.ownerCopilotConversation.create({
    data: {
      shopId,
      userId,
      title: buildConversationTitle(firstQuestion),
    },
    select: {
      id: true,
      title: true,
    },
  });
}

export async function listOwnerCopilotConversationTurns(
  conversationId: string,
  limit = 8
): Promise<OwnerCopilotConversationTurn[]> {
  const messages = await prisma.ownerCopilotConversationMessage.findMany({
    where: {
      conversationId,
    },
    select: {
      role: true,
      content: true,
      createdAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: limit,
  });

  return messages
    .reverse()
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}

export async function saveOwnerCopilotConversationExchange({
  conversationId,
  question,
  answer,
  assistantMetadata,
}: {
  conversationId: string;
  question: string;
  answer: string;
  assistantMetadata?: Record<string, unknown>;
}) {
  const now = new Date();

  await prisma.$transaction([
    prisma.ownerCopilotConversationMessage.create({
      data: {
        conversationId,
        role: "user",
        content: question,
      },
    }),
    prisma.ownerCopilotConversationMessage.create({
      data: {
        conversationId,
        role: "assistant",
        content: answer,
        metadata: (assistantMetadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    }),
    prisma.ownerCopilotConversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: now,
      },
    }),
  ]);
}

export async function appendOwnerCopilotConversationMessage({
  conversationId,
  role,
  content,
  metadata,
}: {
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  metadata?: Record<string, unknown>;
}) {
  const now = new Date();

  await prisma.$transaction([
    prisma.ownerCopilotConversationMessage.create({
      data: {
        conversationId,
        role,
        content,
        metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    }),
    prisma.ownerCopilotConversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: now,
      },
    }),
  ]);
}
