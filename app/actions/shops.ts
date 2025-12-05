// app/actions/shops.ts

"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";

async function getCurrentUser() {
  return requireUser();
}

async function assertShopBelongsToUser(shopId: string, userId: string) {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop || shop.ownerId !== userId) {
    throw new Error("Unauthorized");
  }
  return shop;
}

// ------------------------------
// CREATE SHOP
// ------------------------------
export async function createShop(data: {
  name: string;
  address?: string;
  phone?: string;
  businessType?: string;
}) {
  const user = await getCurrentUser();

  await prisma.shop.create({
    data: {
      ownerId: user.id,
      name: data.name,
      address: data.address || "",
      phone: data.phone || "",
      businessType: data.businessType || "tea_stall",
    },
  });

  return { success: true };
}

// ------------------------------
// GET SHOPS BY USER
// ------------------------------
export async function getShopsByUser() {
  const user = await getCurrentUser();
  return prisma.shop.findMany({
    where: { ownerId: user.id },
  });
}

// ------------------------------
// GET SINGLE SHOP
// ------------------------------
export async function getShop(id: string) {
  const user = await getCurrentUser();
  const shop = await prisma.shop.findUnique({
    where: { id },
  });
  if (!shop || shop.ownerId !== user.id) throw new Error("Unauthorized");
  return shop;
}

// ------------------------------
// UPDATE SHOP
// ------------------------------
export async function updateShop(id: string, data: any) {
  const user = await getCurrentUser();
  await assertShopBelongsToUser(id, user.id);
  await prisma.shop.update({
    where: { id },
    data,
  });
  return { success: true };
}

// ------------------------------
// DELETE SHOP
// ------------------------------
export async function deleteShop(id: string) {
  const user = await getCurrentUser();
  await assertShopBelongsToUser(id, user.id);

  await prisma.$transaction(async (tx) => {
    const saleIds = await tx.sale.findMany({
      where: { shopId: id },
      select: { id: true },
    });
    const productIds = await tx.product.findMany({
      where: { shopId: id },
      select: { id: true },
    });

    if (saleIds.length) {
      await tx.saleItem.deleteMany({
        where: { saleId: { in: saleIds.map((s) => s.id) } },
      });
    }
    if (productIds.length) {
      await tx.saleItem.deleteMany({
        where: { productId: { in: productIds.map((p) => p.id) } },
      });
    }

    await tx.customerLedger.deleteMany({ where: { shopId: id } });
    await tx.expense.deleteMany({ where: { shopId: id } });
    await tx.cashEntry.deleteMany({ where: { shopId: id } });
    await tx.sale.deleteMany({ where: { shopId: id } });
    await tx.customer.deleteMany({ where: { shopId: id } });
    await tx.product.deleteMany({ where: { shopId: id } });
    await tx.shop.delete({ where: { id } });
  });

  return { success: true };
}
