-- CreateTable
CREATE TABLE "business_product_templates" (
    "id" UUID NOT NULL,
    "business_type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "default_sell_price" DECIMAL(12,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "business_product_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_business_product_templates_type" ON "business_product_templates"("business_type");

-- CreateIndex
CREATE INDEX "idx_business_product_templates_active" ON "business_product_templates"("business_type", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "uq_business_product_templates_type_name" ON "business_product_templates"("business_type", "name");
