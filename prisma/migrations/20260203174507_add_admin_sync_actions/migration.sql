-- CreateTable
CREATE TABLE "admin_sync_actions" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_sync_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_admin_sync_actions_user" ON "admin_sync_actions"("user_id");

-- AddForeignKey
ALTER TABLE "admin_sync_actions" ADD CONSTRAINT "admin_sync_actions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
