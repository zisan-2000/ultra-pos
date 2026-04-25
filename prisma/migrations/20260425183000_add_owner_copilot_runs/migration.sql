CREATE TYPE "OwnerCopilotRunStatus" AS ENUM ('success', 'fallback', 'blocked', 'error');

CREATE TABLE "owner_copilot_runs" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "conversation_id" UUID,
    "route_key" TEXT NOT NULL,
    "question_preview" TEXT NOT NULL,
    "answer_preview" TEXT,
    "engine" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "tool_names_json" JSONB,
    "status" "OwnerCopilotRunStatus" NOT NULL DEFAULT 'success',
    "fallback_used" BOOLEAN NOT NULL DEFAULT false,
    "requires_confirmation" BOOLEAN NOT NULL DEFAULT false,
    "latency_ms" INTEGER,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "owner_copilot_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_owner_copilot_runs_shop_created"
ON "owner_copilot_runs"("shop_id", "created_at");

CREATE INDEX "idx_owner_copilot_runs_user_created"
ON "owner_copilot_runs"("user_id", "created_at");

CREATE INDEX "idx_owner_copilot_runs_conversation_created"
ON "owner_copilot_runs"("conversation_id", "created_at");

CREATE INDEX "idx_owner_copilot_runs_route_created"
ON "owner_copilot_runs"("route_key", "created_at");

ALTER TABLE "owner_copilot_runs"
ADD CONSTRAINT "owner_copilot_runs_shop_id_fkey"
FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "owner_copilot_runs"
ADD CONSTRAINT "owner_copilot_runs_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "owner_copilot_runs"
ADD CONSTRAINT "owner_copilot_runs_conversation_id_fkey"
FOREIGN KEY ("conversation_id") REFERENCES "owner_copilot_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
