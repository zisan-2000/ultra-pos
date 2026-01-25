/*
  Warnings:

  - The primary key for the `jwks` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "jwks" DROP CONSTRAINT "jwks_pkey",
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "jwks_pkey" PRIMARY KEY ("id");
