-- AlterTable
ALTER TABLE "customer_ledger" ADD COLUMN     "sale_id" UUID;

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "credit_limit" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "owner_copilot_conversations" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "due_date" DATE,
ADD COLUMN     "paid_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "idx_customer_ledger_sale" ON "customer_ledger"("sale_id");

-- CreateIndex
CREATE INDEX "idx_sales_shop_payment_due" ON "sales"("shop_id", "payment_method", "due_date");

-- AddForeignKey
ALTER TABLE "customer_ledger" ADD CONSTRAINT "customer_ledger_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
