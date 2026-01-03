// prisma/seed/pos/seedShops.ts

import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import type { ShopMap } from "../utils";

export async function seedShops(
  prisma: PrismaClient,
  ownerId: string
): Promise<ShopMap> {
  const shopsSeed = [
    {
      key: "tea",
      name: "Lalbagh Tea & Snacks",
      address: "Mirpur 10, Dhaka",
      phone: "01700-100000",
      businessType: "tea_stall",
    },
    {
      key: "grocery",
      name: "Green Leaf Mini Grocery",
      address: "Dhanmondi 27, Dhaka",
      phone: "01700-200000",
      businessType: "mini_grocery",
    },
    {
      key: "hotel",
      name: "Shapla Hotel & Restaurant",
      address: "Station Road, Gazipur",
      phone: "01700-555555",
      businessType: "restaurant",
    },
  ];

  const shops: ShopMap = {};
  for (const shop of shopsSeed) {
    const existing = await prisma.shop.findFirst({
      where: { ownerId, name: shop.name },
    });

    const row =
      existing ??
      (await prisma.shop.create({
        data: {
          id: crypto.randomUUID(),
          ownerId,
          name: shop.name,
          address: shop.address,
          phone: shop.phone,
          businessType: shop.businessType,
        },
      }));
    shops[shop.key] = row;
  }
  return shops;
}
