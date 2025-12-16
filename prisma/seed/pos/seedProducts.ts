// prisma/seed/pos/seedProducts.ts

import { PrismaClient } from "@prisma/client";
import type { ProductMap, ShopMap } from "../utils";
import { toMoney } from "../utils";

export async function seedProducts(
  prisma: PrismaClient,
  shops: ShopMap
): Promise<ProductMap> {
  const productSeed: Record<
    string,
    Array<{
      name: string;
      category: string;
      buyPrice: number | null;
      sellPrice: number;
      stockQty: number;
      trackStock: boolean;
    }>
  > = {
    tea: [
      {
        name: "Milk Tea",
        category: "Beverages",
        buyPrice: 12,
        sellPrice: 25,
        stockQty: 180,
        trackStock: true,
      },
      {
        name: "Black Coffee",
        category: "Beverages",
        buyPrice: 18,
        sellPrice: 40,
        stockQty: 90,
        trackStock: true,
      },
      {
        name: "Paratha",
        category: "Snacks",
        buyPrice: 8,
        sellPrice: 15,
        stockQty: 140,
        trackStock: true,
      },
      {
        name: "Veg Sandwich",
        category: "Snacks",
        buyPrice: 38,
        sellPrice: 60,
        stockQty: 60,
        trackStock: true,
      },
      {
        name: "Bottled Water 500ml",
        category: "Beverages",
        buyPrice: 8,
        sellPrice: 15,
        stockQty: 120,
        trackStock: true,
      },
    ],
    grocery: [
      {
        name: "Miniket Rice 5kg",
        category: "Grains",
        buyPrice: 320,
        sellPrice: 360,
        stockQty: 30,
        trackStock: true,
      },
      {
        name: "Soybean Oil 1L",
        category: "Groceries",
        buyPrice: 165,
        sellPrice: 185,
        stockQty: 55,
        trackStock: true,
      },
      {
        name: "Brown Bread",
        category: "Bakery",
        buyPrice: 55,
        sellPrice: 75,
        stockQty: 45,
        trackStock: true,
      },
      {
        name: "Eggs (Dozen)",
        category: "Dairy",
        buyPrice: 135,
        sellPrice: 155,
        stockQty: 60,
        trackStock: true,
      },
      {
        name: "Toothpaste Family Pack",
        category: "Household",
        buyPrice: 70,
        sellPrice: 99,
        stockQty: 80,
        trackStock: true,
      },
      {
        name: "Dish Soap 500ml",
        category: "Household",
        buyPrice: 55,
        sellPrice: 78,
        stockQty: 70,
        trackStock: true,
      },
    ],
    hotel: [
      {
        name: "Plain Rice",
        category: "Main Dish",
        buyPrice: 25,
        sellPrice: 40,
        stockQty: 200,
        trackStock: true,
      },
      {
        name: "Chicken Curry",
        category: "Curry",
        buyPrice: 90,
        sellPrice: 140,
        stockQty: 80,
        trackStock: true,
      },
      {
        name: "Dal",
        category: "Side Dish",
        buyPrice: 15,
        sellPrice: 30,
        stockQty: 120,
        trackStock: true,
      },
      {
        name: "Vegetable Bhaji",
        category: "Side Dish",
        buyPrice: 20,
        sellPrice: 35,
        stockQty: 100,
        trackStock: true,
      },
      {
        name: "Egg Curry",
        category: "Curry",
        buyPrice: 35,
        sellPrice: 60,
        stockQty: 60,
        trackStock: true,
      },
      {
        name: "Mineral Water",
        category: "Beverages",
        buyPrice: 10,
        sellPrice: 20,
        stockQty: 150,
        trackStock: true,
      },
    ],
  };

  const products: ProductMap = {};

  for (const [shopKey, entries] of Object.entries(productSeed)) {
    products[shopKey] = {};

    for (const product of entries) {
      const row = await prisma.product.create({
        data: {
          shopId: shops[shopKey].id,
          name: product.name,
          category: product.category,
          buyPrice:
            product.buyPrice === null ? null : toMoney(product.buyPrice),
          sellPrice: toMoney(product.sellPrice),
          stockQty: toMoney(product.stockQty),
          trackStock: product.trackStock,
          isActive: true,
        },
      });

      products[shopKey][product.name] = row;
    }
  }

  return products;
}
