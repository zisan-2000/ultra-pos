-- DropForeignKey
ALTER TABLE "queue_token_items" DROP CONSTRAINT "queue_token_items_token_id_fkey";

-- AlterTable
ALTER TABLE "queue_tokens" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "queue_token_items" ADD CONSTRAINT "queue_token_items_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "queue_tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
