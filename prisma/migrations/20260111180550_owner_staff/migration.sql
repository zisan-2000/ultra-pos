-- DropForeignKey
ALTER TABLE "user_permission_overrides" DROP CONSTRAINT "user_permission_overrides_userId_fkey";

-- AddForeignKey
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
