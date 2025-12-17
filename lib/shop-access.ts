import { prisma } from "@/lib/prisma";
import type { UserContext } from "@/lib/rbac";

export async function assertShopAccess(shopId: string, user: UserContext) {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) {
    throw new Error("Shop not found");
  }

  const isOwner = shop.ownerId === user.id;
  const isStaffForShop =
    user.roles.includes("staff") && user.staffShopId === shopId;

  if (!isOwner && !isStaffForShop) {
    throw new Error("Unauthorized access to this shop");
  }

  return shop;
}
