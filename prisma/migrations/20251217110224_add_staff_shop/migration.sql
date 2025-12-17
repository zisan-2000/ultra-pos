-- AlterTable
ALTER TABLE "users" ADD COLUMN     "staff_shop_id" UUID;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_staff_shop_id_fkey" FOREIGN KEY ("staff_shop_id") REFERENCES "shops"("id") ON DELETE SET NULL ON UPDATE CASCADE;
