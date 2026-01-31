import { prisma } from "@/lib/prisma";
import { SHOP_TYPES_WITH_COGS } from "@/lib/accounting/cogs-types";

export { SHOP_TYPES_WITH_COGS };

export async function shopNeedsCogs(shopId: string) {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { businessType: true },
  });
  if (!shop?.businessType) return false;
  return SHOP_TYPES_WITH_COGS.has(shop.businessType);
}
