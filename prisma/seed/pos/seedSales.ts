// prisma/seed/pos/seedSales.ts

import { PrismaClient } from "@prisma/client";
import type { CustomerMap, ProductMap, ShopMap } from "../utils";
import { toMoney } from "../utils";

export async function seedSales(
  prisma: PrismaClient,
  shops: ShopMap,
  products: ProductMap,
  customers: CustomerMap
) {
  const salesCountByShop = new Map<string, number>();
  const salesSeed: Array<{
    shopKey: string;
    customerKey?: string;
    paymentMethod: string;
    saleDate: Date;
    note?: string | null;
    items: Array<{ productName: string; qty: number }>;
  }> = [
    {
      shopKey: "tea",
      paymentMethod: "cash",
      saleDate: new Date("2024-12-02T08:30:00Z"),
      note: "Morning rush counter",
      items: [
        { productName: "Milk Tea", qty: 4 },
        { productName: "Paratha", qty: 3 },
        { productName: "Veg Sandwich", qty: 2 },
      ],
    },
    {
      shopKey: "tea",
      customerKey: "kamal",
      paymentMethod: "due",
      saleDate: new Date("2024-12-03T12:20:00Z"),
      note: "Office snacks on credit",
      items: [
        { productName: "Veg Sandwich", qty: 3 },
        { productName: "Black Coffee", qty: 2 },
      ],
    },
    {
      shopKey: "grocery",
      paymentMethod: "cash",
      saleDate: new Date("2024-12-02T10:20:00Z"),
      note: "Walk-in basket",
      items: [
        { productName: "Miniket Rice 5kg", qty: 1 },
        { productName: "Soybean Oil 1L", qty: 1 },
        { productName: "Eggs (Dozen)", qty: 1 },
        { productName: "Toothpaste Family Pack", qty: 1 },
      ],
    },
    {
      shopKey: "grocery",
      customerKey: "rina",
      paymentMethod: "due",
      saleDate: new Date("2024-12-03T16:05:00Z"),
      note: "Monthly groceries on credit",
      items: [
        { productName: "Miniket Rice 5kg", qty: 2 },
        { productName: "Soybean Oil 1L", qty: 1 },
        { productName: "Brown Bread", qty: 1 },
      ],
    },
    {
      shopKey: "grocery",
      customerKey: "shuvo",
      paymentMethod: "due",
      saleDate: new Date("2024-12-05T11:40:00Z"),
      note: "Wholesale cleaning pack",
      items: [
        { productName: "Dish Soap 500ml", qty: 5 },
        { productName: "Toothpaste Family Pack", qty: 4 },
        { productName: "Eggs (Dozen)", qty: 2 },
        { productName: "Brown Bread", qty: 2 },
      ],
    },

    {
      shopKey: "hotel",
      paymentMethod: "cash",
      saleDate: new Date("2024-12-04T12:45:00Z"),
      note: "Lunch rush",
      items: [
        { productName: "Plain Rice", qty: 2 },
        { productName: "Chicken Curry", qty: 1 },
        { productName: "Dal", qty: 1 },
      ],
    },
    {
      shopKey: "hotel",
      customerKey: "rahim",
      paymentMethod: "due",
      saleDate: new Date("2024-12-05T13:25:00Z"),
      note: "Regular customer lunch",
      items: [
        { productName: "Plain Rice", qty: 2 },
        { productName: "Egg Curry", qty: 1 },
        { productName: "Vegetable Bhaji", qty: 1 },
      ],
    },
  ];

  for (const sale of salesSeed) {
    const shop = shops[sale.shopKey];
    if (!shop) continue;

    let existingCount = salesCountByShop.get(shop.id);
    if (existingCount === undefined) {
      existingCount = await prisma.sale.count({ where: { shopId: shop.id } });
      salesCountByShop.set(shop.id, existingCount);
    }

    if (existingCount > 0) {
      continue;
    }

    const missingProducts = sale.items.filter(
      (item) => !products[sale.shopKey]?.[item.productName]
    );
    if (missingProducts.length > 0) {
      console.warn(
        `WARN: Skipping seeded sale for ${sale.shopKey} (missing products).`
      );
      continue;
    }

    const customerId =
      sale.customerKey && customers[sale.shopKey]?.[sale.customerKey]
        ? customers[sale.shopKey][sale.customerKey].id
        : null;

    const items = sale.items.map((item) => {
      const product = products[sale.shopKey]?.[item.productName];

      const qty = Number(item.qty);
      const unitPrice = parseFloat(product.sellPrice.toString());
      const lineTotal = qty * unitPrice;

      return {
        productId: product.id,
        quantity: qty,
        unitPrice,
        lineTotal,
      };
    });

    const totalAmount = items.reduce((sum, item) => sum + item.lineTotal, 0);

    const createdSale = await prisma.sale.create({
      data: {
        shopId: shop.id,
        customerId,
        saleDate: sale.saleDate,
        totalAmount: toMoney(totalAmount),
        paymentMethod: sale.paymentMethod,
        note: sale.note || null,
      },
    });

    await prisma.saleItem.createMany({
      data: items.map((item) => ({
        saleId: createdSale.id,
        productId: item.productId,
        quantity: toMoney(item.quantity),
        unitPrice: toMoney(item.unitPrice),
        lineTotal: toMoney(item.lineTotal),
      })),
    });
  }
}
