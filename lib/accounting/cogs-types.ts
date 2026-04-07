export const LEGACY_SHOP_TYPES_WITH_COGS = new Set([
  "mini_grocery",
  "pharmacy",
  "clothing",
  "cosmetics_gift",
  "mini_wholesale",
]);

export function isLegacyCogsBusinessType(businessType?: string | null) {
  if (!businessType) return false;
  return LEGACY_SHOP_TYPES_WITH_COGS.has(businessType);
}

export function resolveInventoryModuleEnabled(shop: {
  inventoryFeatureEntitled?: boolean | null;
  inventoryEnabled?: boolean | null;
  businessType?: string | null;
}) {
  const hasExplicitToggle =
    typeof shop.inventoryFeatureEntitled === "boolean" ||
    typeof shop.inventoryEnabled === "boolean";
  if (hasExplicitToggle) {
    return Boolean(shop.inventoryFeatureEntitled) && Boolean(shop.inventoryEnabled);
  }
  return isLegacyCogsBusinessType(shop.businessType);
}

export function resolveCogsEnabled(shop: {
  cogsFeatureEntitled?: boolean | null;
  cogsEnabled?: boolean | null;
  inventoryFeatureEntitled?: boolean | null;
  inventoryEnabled?: boolean | null;
  businessType?: string | null;
}) {
  const hasExplicitCogsToggle =
    typeof shop.cogsFeatureEntitled === "boolean" ||
    typeof shop.cogsEnabled === "boolean";
  if (hasExplicitCogsToggle) {
    return Boolean(shop.cogsFeatureEntitled) && Boolean(shop.cogsEnabled);
  }
  return resolveInventoryModuleEnabled(shop);
}
