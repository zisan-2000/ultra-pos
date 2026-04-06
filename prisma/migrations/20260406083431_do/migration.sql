-- DropIndex
DROP INDEX IF EXISTS "idx_shops_owner_not_deleted";

-- AlterTable
ALTER TABLE "product_variants" ALTER COLUMN "updated_at" DROP DEFAULT;
