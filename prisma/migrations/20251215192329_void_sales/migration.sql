-- AlterTable
ALTER TABLE "sales" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'COMPLETED',
ADD COLUMN     "void_at" TIMESTAMPTZ(6),
ADD COLUMN     "void_by_user_id" TEXT,
ADD COLUMN     "void_reason" TEXT;
