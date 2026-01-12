// prisma/seed/reset.ts

import { PrismaClient } from "@prisma/client";

export async function resetDatabase(prisma: PrismaClient) {
  await prisma.saleItem.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.cashEntry.deleteMany();
  await prisma.customerLedger.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.product.deleteMany();
  await prisma.shop.deleteMany();

  await prisma.session.deleteMany();
  await prisma.verification.deleteMany();
  await prisma.account.deleteMany();

  await prisma.userPermissionOverride.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.role.deleteMany();
  await prisma.permission.deleteMany();

  await prisma.user.deleteMany();
}
