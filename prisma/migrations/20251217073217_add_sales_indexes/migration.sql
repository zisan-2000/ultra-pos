-- CreateIndex
CREATE INDEX "idx_sales_shop_created_id" ON "sales"("shop_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "idx_sales_shop_status_created" ON "sales"("shop_id", "status", "created_at");
