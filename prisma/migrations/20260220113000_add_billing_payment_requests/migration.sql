-- CreateEnum
CREATE TYPE "BillingPaymentRequestStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "billing_payment_requests" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "owner_id" TEXT NOT NULL,
    "shop_id" UUID NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "status" "BillingPaymentRequestStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ(6),

    CONSTRAINT "billing_payment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_billing_payment_requests_invoice_id" ON "billing_payment_requests"("invoice_id");

-- CreateIndex
CREATE INDEX "idx_billing_payment_requests_owner_id" ON "billing_payment_requests"("owner_id");

-- CreateIndex
CREATE INDEX "idx_billing_payment_requests_status" ON "billing_payment_requests"("status");

-- AddForeignKey
ALTER TABLE "billing_payment_requests" ADD CONSTRAINT "billing_payment_requests_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "billing_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_payment_requests" ADD CONSTRAINT "billing_payment_requests_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_payment_requests" ADD CONSTRAINT "billing_payment_requests_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
