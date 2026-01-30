import { prisma } from "@/lib/prisma";

export const SHOP_TYPES_WITH_COGS = new Set([
  "mini_grocery",
  "pharmacy",
  "clothing",
  "cosmetics_gift",
  "mini_wholesale",
]);

export async function shopNeedsCogs(shopId: string) {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { businessType: true },
  });
  if (!shop?.businessType) return false;
  return SHOP_TYPES_WITH_COGS.has(shop.businessType);
}
