// app/actions/shops.ts

"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";

// ------------------------------
// GET CURRENT USER
// ------------------------------
async function getCurrentUser() {
  return await requireUser();
}

// ------------------------------
// ASSERT SHOP BELONGS TO USER
// ------------------------------
async function assertShopBelongsToUser(shopId: string, userId: string) {
  const shop = await prisma.shops.findUnique({
    where: { id: shopId },
  });

  if (!shop || shop.owner_id !== userId) {
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

  await prisma.shops.create({
    data: {
      owner_id: user.id,
      name: data.name,
      address: data.address || "",
      phone: data.phone || "",
      business_type: data.businessType || "tea_stall",
    },
  });

  return { success: true };
}

// ------------------------------
// GET SHOPS BY USER
// ------------------------------
export async function getShopsByUser() {
  const user = await getCurrentUser();

  return await prisma.shops.findMany({
    where: { owner_id: user.id },
    orderBy: { created_at: "desc" },
  });
}

// ------------------------------
// GET SINGLE SHOP
// ------------------------------
export async function getShop(id: string) {
  const user = await getCurrentUser();

  const shop = await prisma.shops.findUnique({
    where: { id },
  });

  if (!shop || shop.owner_id !== user.id) {
    throw new Error("Unauthorized");
  }

  return shop;
}

// ------------------------------
// UPDATE SHOP
// ------------------------------
export async function updateShop(id: string, data: any) {
  const user = await getCurrentUser();
  await assertShopBelongsToUser(id, user.id);

  await prisma.shops.update({
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
    await tx.sale_items.deleteMany({
      where: {
        sale_id: {
          in: (
            await tx.sales.findMany({
              where: { shop_id: id },
              select: { id: true },
            })
          ).map((s) => s.id),
        },
      },
    });

    await tx.customer_ledger.deleteMany({ where: { shop_id: id } });
    await tx.customers.deleteMany({ where: { shop_id: id } });
    await tx.expenses.deleteMany({ where: { shop_id: id } });
    await tx.cash_entries.deleteMany({ where: { shop_id: id } });
    await tx.sales.deleteMany({ where: { shop_id: id } });
    await tx.products.deleteMany({ where: { shop_id: id } });

    await tx.shops.delete({ where: { id } });
  });

  return { success: true };
}
