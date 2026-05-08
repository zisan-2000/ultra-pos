// prisma/seed/reset.ts

import { PrismaClient } from "@prisma/client";

export async function resetDatabase(prisma: PrismaClient) {
  await prisma.batchAllocation.deleteMany();
  await prisma.remnantPiece.deleteMany();
  await prisma.stockAdjustment.deleteMany();
  await prisma.serialNumber.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.purchaseReturnItem.deleteMany();
  await prisma.purchaseReturn.deleteMany();
  await prisma.purchasePayment.deleteMany();
  await prisma.purchaseItem.deleteMany();
  await prisma.purchase.deleteMany();
  await prisma.supplierLedger.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.saleReturnExchangeItem.deleteMany();
  await prisma.saleReturnItem.deleteMany();
  await prisma.saleReturn.deleteMany();
  await prisma.queueTokenItem.deleteMany();
  await prisma.queueToken.deleteMany();
  await prisma.billingPaymentRequest.deleteMany();
  await prisma.invoicePayment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.shopSubscription.deleteMany();
  await prisma.subscriptionPlan.deleteMany();
  await prisma.supportTicketReply.deleteMany();
  await prisma.supportTicket.deleteMany();
  await prisma.ownerCopilotRun.deleteMany();
  await prisma.ownerCopilotConversationMessage.deleteMany();
  await prisma.ownerCopilotConversation.deleteMany();
  await prisma.saleItem.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.cashEntry.deleteMany();
  await prisma.customerLedger.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.productUnitConversion.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.shop.deleteMany();

  await prisma.impersonationAudit.deleteMany();
  await prisma.shopCreationRequest.deleteMany();
  await prisma.featureAccessRequest.deleteMany();
  await prisma.adminSyncAction.deleteMany();
  await prisma.session.deleteMany();
  await prisma.verification.deleteMany();
  await prisma.account.deleteMany();

  await prisma.userPermissionOverride.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.role.deleteMany();
  await prisma.permission.deleteMany();

  await prisma.user.deleteMany();
}
