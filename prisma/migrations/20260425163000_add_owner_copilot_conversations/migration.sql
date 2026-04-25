CREATE TYPE "CopilotConversationMessageRole" AS ENUM ('user', 'assistant');

CREATE TABLE "owner_copilot_conversations" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT,
    "last_message_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_copilot_conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "owner_copilot_conversation_messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" "CopilotConversationMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_copilot_conversation_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_owner_copilot_conversations_shop_user_last"
ON "owner_copilot_conversations"("shop_id", "user_id", "last_message_at");

CREATE INDEX "idx_owner_copilot_conversations_user_created"
ON "owner_copilot_conversations"("user_id", "created_at");

CREATE INDEX "idx_owner_copilot_messages_conversation_created"
ON "owner_copilot_conversation_messages"("conversation_id", "created_at");

ALTER TABLE "owner_copilot_conversations"
ADD CONSTRAINT "owner_copilot_conversations_shop_id_fkey"
FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "owner_copilot_conversations"
ADD CONSTRAINT "owner_copilot_conversations_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "owner_copilot_conversation_messages"
ADD CONSTRAINT "owner_copilot_conversation_messages_conversation_id_fkey"
FOREIGN KEY ("conversation_id") REFERENCES "owner_copilot_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
