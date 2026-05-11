import { usesCogsByDefault, usesInventoryByDefault } from "@/lib/business-types";

export const LEGACY_SHOP_TYPES_WITH_COGS = new Set([
  "grocery",
  "mini_mart",
  "fruits_vegetables",
  "snacks_shop",
  "stationery",
  "pharmacy",
  "clothing",
  "cosmetics_gift",
  "mobile_accessories",
  "electronics",
  "hardware",
  "wholesale",
  "general_retail",
  "mini_grocery",
  "mini_wholesale",
  "fruits_veg",
  "snacks_stationery",
]);

export function isLegacyCogsBusinessType(businessType?: string | null) {
  return usesInventoryByDefault(businessType);
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
  return usesInventoryByDefault(shop.businessType);
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
  return resolveInventoryModuleEnabled(shop) && usesCogsByDefault(shop.businessType);
}
