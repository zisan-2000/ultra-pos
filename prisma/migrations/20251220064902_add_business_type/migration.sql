-- CreateTable
CREATE TABLE "business_types" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "field_rules" JSONB NOT NULL,
    "stock_rules" JSONB NOT NULL,
    "unit_rules" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "business_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_types_key_key" ON "business_types"("key");
