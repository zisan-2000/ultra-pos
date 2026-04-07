import { prisma } from "@/lib/prisma";
import {
  LEGACY_SHOP_TYPES_WITH_COGS,
  resolveCogsEnabled,
  resolveInventoryModuleEnabled,
} from "@/lib/accounting/cogs-types";

// Backward-compatible export for legacy callers.
export const SHOP_TYPES_WITH_COGS = LEGACY_SHOP_TYPES_WITH_COGS;
export { resolveInventoryModuleEnabled, resolveCogsEnabled };

export async function shopNeedsCogs(shopId: string) {
  const shop = await prisma.shop.findFirst({
    where: { id: shopId, deletedAt: null },
    select: {
      businessType: true,
      inventoryFeatureEntitled: true,
      inventoryEnabled: true,
      cogsFeatureEntitled: true,
      cogsEnabled: true,
    },
  });
  if (!shop) return false;
  return resolveCogsEnabled(shop);
}

export async function shopHasInventoryModule(shopId: string) {
  const shop = await prisma.shop.findFirst({
    where: { id: shopId, deletedAt: null },
    select: {
      businessType: true,
      inventoryFeatureEntitled: true,
      inventoryEnabled: true,
    },
  });
  if (!shop) return false;
  return resolveInventoryModuleEnabled(shop);
}
