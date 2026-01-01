-- CreateIndex
CREATE INDEX "idx_cash_entries_shop_created" ON "cash_entries"("shop_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_products_low_stock" ON "products"("shop_id", "is_active", "stock_qty");

-- CreateIndex
CREATE INDEX "idx_sales_shop_sale_date" ON "sales"("shop_id", "sale_date");

-- CreateIndex
CREATE INDEX "idx_sales_shop_status_sale_date" ON "sales"("shop_id", "status", "sale_date");
