-- DropForeignKey
ALTER TABLE "queue_token_items" DROP CONSTRAINT "queue_token_items_token_id_fkey";

-- AlterTable
ALTER TABLE "queue_tokens" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "sale_returns" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "idx_expenses_shop" ON "expenses"("shop_id");

-- CreateIndex
CREATE INDEX "idx_sale_items_sale_product" ON "sale_items"("sale_id", "product_id");

-- CreateIndex
CREATE INDEX "idx_sales_shop_status_business_date" ON "sales"("shop_id", "status", "business_date");

-- AddForeignKey
ALTER TABLE "queue_token_items" ADD CONSTRAINT "queue_token_items_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "queue_tokens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
