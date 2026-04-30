// prisma/seed/pos/seedProducts.ts

import { PrismaClient } from "@prisma/client";
import type { ProductMap, ShopMap } from "../utils";
import { toMoney } from "../utils";

type VariantSeed = { label: string; sellPrice: number; sortOrder: number };

type ProductSeed = {
  name: string;
  category: string;
  unit: string;
  buyPrice: number | null;
  sellPrice: number;
  stockQty: number;
  trackStock: boolean;
  variants?: VariantSeed[];
};

export async function seedProducts(
  prisma: PrismaClient,
  shops: ShopMap
): Promise<ProductMap> {
  const productSeed: Record<string, ProductSeed[]> = {
    tea: [
      { name: "Milk Tea",           category: "Beverages", unit: "pcs", buyPrice: 12,  sellPrice: 25,  stockQty: 180, trackStock: true },
      { name: "Black Coffee",       category: "Beverages", unit: "pcs", buyPrice: 18,  sellPrice: 40,  stockQty: 90,  trackStock: true },
      { name: "Paratha",            category: "Snacks",    unit: "pcs", buyPrice: 8,   sellPrice: 15,  stockQty: 140, trackStock: true },
      { name: "Veg Sandwich",       category: "Snacks",    unit: "pcs", buyPrice: 38,  sellPrice: 60,  stockQty: 60,  trackStock: true },
      { name: "Bottled Water 500ml",category: "Beverages", unit: "pcs", buyPrice: 8,   sellPrice: 15,  stockQty: 120, trackStock: true },
    ],
    grocery: [
      { name: "Miniket Rice 5kg",       category: "Grains",    unit: "pcs", buyPrice: 320, sellPrice: 360, stockQty: 30, trackStock: true },
      { name: "Soybean Oil 1L",         category: "Groceries", unit: "pcs", buyPrice: 165, sellPrice: 185, stockQty: 55, trackStock: true },
      { name: "Brown Bread",            category: "Bakery",    unit: "pcs", buyPrice: 55,  sellPrice: 75,  stockQty: 45, trackStock: true },
      { name: "Eggs (Dozen)",           category: "Dairy",     unit: "pcs", buyPrice: 135, sellPrice: 155, stockQty: 60, trackStock: true },
      { name: "Toothpaste Family Pack", category: "Household", unit: "pcs", buyPrice: 70,  sellPrice: 99,  stockQty: 80, trackStock: true },
      { name: "Dish Soap 500ml",        category: "Household", unit: "pcs", buyPrice: 55,  sellPrice: 78,  stockQty: 70, trackStock: true },
    ],
    hotel: [
      { name: "Plain Rice",      category: "Main Dish", unit: "pcs", buyPrice: 25, sellPrice: 40,  stockQty: 200, trackStock: true },
      { name: "Chicken Curry",   category: "Curry",     unit: "pcs", buyPrice: 90, sellPrice: 140, stockQty: 80,  trackStock: true },
      { name: "Dal",             category: "Side Dish", unit: "pcs", buyPrice: 15, sellPrice: 30,  stockQty: 120, trackStock: true },
      { name: "Vegetable Bhaji", category: "Side Dish", unit: "pcs", buyPrice: 20, sellPrice: 35,  stockQty: 100, trackStock: true },
      { name: "Egg Curry",       category: "Curry",     unit: "pcs", buyPrice: 35, sellPrice: 60,  stockQty: 60,  trackStock: true },
      { name: "Mineral Water",   category: "Beverages", unit: "pcs", buyPrice: 10, sellPrice: 20,  stockQty: 150, trackStock: true },
    ],
    hardware: [
      // Simple products
      { name: "সিমেন্ট (৫০ কেজি)",      category: "সিমেন্ট/বিল্ডিং", unit: "bag",   buyPrice: 440, sellPrice: 480, stockQty: 200, trackStock: true },
      { name: "এলবো ১ ইঞ্চি",           category: "পাইপ/ফিটিংস",      unit: "pcs",   buyPrice: 8,   sellPrice: 12,  stockQty: 150, trackStock: true },
      { name: "সুইচ (সিঙ্গেল)",         category: "ইলেকট্রিক্যাল",    unit: "pcs",   buyPrice: 35,  sellPrice: 45,  stockQty: 100, trackStock: true },
      { name: "সকেট (২ পিন)",           category: "ইলেকট্রিক্যাল",    unit: "pcs",   buyPrice: 30,  sellPrice: 40,  stockQty: 100, trackStock: true },
      { name: "পেরেক ২ ইঞ্চি",          category: "সিমেন্ট/বিল্ডিং", unit: "kg",    buyPrice: 100, sellPrice: 120, stockQty: 80,  trackStock: true },
      { name: "স্ক্রু সেট",             category: "সিমেন্ট/বিল্ডিং", unit: "box",   buyPrice: 45,  sellPrice: 60,  stockQty: 60,  trackStock: true },
      { name: "ইট",                     category: "সিমেন্ট/বিল্ডিং", unit: "pcs",   buyPrice: 10,  sellPrice: 12,  stockQty: 1000,trackStock: true },

      // Variant: রড — by size
      {
        name: "রড", category: "সিমেন্ট/বিল্ডিং", unit: "kg",
        buyPrice: 78, sellPrice: 85, stockQty: 800, trackStock: true,
        variants: [
          { label: "৮মিমি",  sellPrice: 80,  sortOrder: 1 },
          { label: "১০মিমি", sellPrice: 83,  sortOrder: 2 },
          { label: "১২মিমি", sellPrice: 85,  sortOrder: 3 },
          { label: "১৬মিমি", sellPrice: 90,  sortOrder: 4 },
        ],
      },

      // Variant: PVC পাইপ — by diameter
      {
        name: "PVC পাইপ", category: "পাইপ/ফিটিংস", unit: "ft",
        buyPrice: 28, sellPrice: 35, stockQty: 700, trackStock: true,
        variants: [
          { label: "½ ইঞ্চি",   sellPrice: 22,  sortOrder: 1 },
          { label: "¾ ইঞ্চি",   sellPrice: 28,  sortOrder: 2 },
          { label: "১ ইঞ্চি",   sellPrice: 35,  sortOrder: 3 },
          { label: "১.৫ ইঞ্চি", sellPrice: 50,  sortOrder: 4 },
          { label: "২ ইঞ্চি",   sellPrice: 70,  sortOrder: 5 },
        ],
      },

      // Variant: তার — by size
      {
        name: "তার", category: "ইলেকট্রিক্যাল", unit: "coil",
        buyPrice: 350, sellPrice: 420, stockQty: 80, trackStock: true,
        variants: [
          { label: "১ স্কোয়ার",   sellPrice: 380, sortOrder: 1 },
          { label: "১.৫ স্কোয়ার", sellPrice: 450, sortOrder: 2 },
          { label: "২.৫ স্কোয়ার", sellPrice: 680, sortOrder: 3 },
          { label: "৪ স্কোয়ার",   sellPrice: 950, sortOrder: 4 },
        ],
      },

      // Variant: রং — by size
      {
        name: "রং (অ্যাপেক্স)", category: "রং/কেমিক্যাল", unit: "liter",
        buyPrice: 290, sellPrice: 350, stockQty: 100, trackStock: true,
        variants: [
          { label: "১ লিটার",  sellPrice: 350,  sortOrder: 1 },
          { label: "৪ লিটার",  sellPrice: 1300, sortOrder: 2 },
          { label: "১০ লিটার", sellPrice: 3100, sortOrder: 3 },
          { label: "১৮ লিটার", sellPrice: 5400, sortOrder: 4 },
        ],
      },

      // Variant: টাইলস — by size
      {
        name: "টাইলস", category: "সিমেন্ট/বিল্ডিং", unit: "pcs",
        buyPrice: 45, sellPrice: 55, stockQty: 500, trackStock: true,
        variants: [
          { label: "১×১ ফুট",   sellPrice: 55,  sortOrder: 1 },
          { label: "১.৫×১.৫ ফুট", sellPrice: 110, sortOrder: 2 },
          { label: "২×২ ফুট",   sellPrice: 180, sortOrder: 3 },
        ],
      },
    ],
  };

  const products: ProductMap = {};

  for (const [shopKey, entries] of Object.entries(productSeed)) {
    if (!shops[shopKey]) continue;
    products[shopKey] = {};

    for (const product of entries) {
      const existing = await prisma.product.findFirst({
        where: { shopId: shops[shopKey].id, name: product.name },
        include: { variants: true },
      });

      const row =
        existing ??
        (await prisma.product.create({
          data: {
            shopId: shops[shopKey].id,
            name: product.name,
            category: product.category,
            baseUnit: product.unit,
            buyPrice: product.buyPrice === null ? null : toMoney(product.buyPrice),
            sellPrice: toMoney(product.sellPrice),
            stockQty: toMoney(product.stockQty),
            trackStock: product.trackStock,
            isActive: true,
          },
        }));

      // Seed variants if defined and not yet seeded
      if (product.variants?.length) {
        const existingVariants = existing?.variants ?? [];
        for (const v of product.variants) {
          const alreadyExists = existingVariants.some((ev) => ev.label === v.label);
          if (!alreadyExists) {
            await prisma.productVariant.create({
              data: {
                shopId: shops[shopKey].id,
                productId: row.id,
                label: v.label,
                sellPrice: toMoney(v.sellPrice),
                sortOrder: v.sortOrder,
                isActive: true,
              },
            });
          }
        }
      }

      products[shopKey][product.name] = row;
    }
  }

  return products;
}
