// app/actions/shops.ts

"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { assertShopAccess } from "@/lib/shop-access";

async function getCurrentUser() {
  return requireUser();
}

// ------------------------------
// CREATE SHOP
// ------------------------------
export async function createShop(data: {
  name: string;
  address?: string;
  phone?: string;
  businessType?: string;
  ownerId?: string;
}) {
  const user = await getCurrentUser();
  const isSuperAdmin = user.roles?.includes("super_admin") ?? false;
  const isOwner = user.roles?.includes("owner") ?? false;
  const requestedOwnerId = data.ownerId?.trim() || undefined;

  if (!isSuperAdmin) {
    if (!isOwner) {
      throw new Error("Only super admin can create shops");
    }

    if (requestedOwnerId && requestedOwnerId !== user.id) {
      throw new Error("Owner cannot create shop for another user");
    }

    const existingCount = await prisma.shop.count({
      where: { ownerId: user.id },
    });

    if (existingCount > 0) {
      throw new Error(
        "Owner can only create the first shop. Please contact super admin to create additional shops."
      );
    }
  }

  if (requestedOwnerId && isSuperAdmin) {
    const targetOwner = await prisma.user.findUnique({
      where: { id: requestedOwnerId },
      select: { id: true, roles: { select: { name: true } } },
    });
    if (!targetOwner || !targetOwner.roles.some((r) => r.name === "owner")) {
      throw new Error("Target owner is not valid");
    }
  }

  const targetOwnerId = isSuperAdmin ? requestedOwnerId ?? user.id : user.id;

  await prisma.shop.create({
    data: {
      ownerId: targetOwnerId,
      name: data.name,
      address: data.address || "",
      phone: data.phone || "",
      businessType: data.businessType || "tea_stall",
    },
  });

  return { success: true };
}

// ------------------------------
// GET OWNER OPTIONS (SUPER ADMIN)
// ------------------------------
export async function getOwnerOptions() {
  const user = await getCurrentUser();
  const isSuperAdmin = user.roles?.includes("super_admin") ?? false;
  if (!isSuperAdmin) {
    throw new Error("Forbidden");
  }

  return prisma.user.findMany({
    where: { roles: { some: { name: "owner" } } },
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
}

// ------------------------------
// GET SHOPS BY USER
// ------------------------------
export async function getShopsByUser() {
  const user = await getCurrentUser();
  const isOwner = user.roles?.includes("owner");
  const isStaff = user.roles?.includes("staff");

  if (isStaff && !isOwner) {
    if (!user.staffShopId) return [];
    const shop = await prisma.shop.findUnique({
      where: { id: user.staffShopId },
    });
    return shop ? [shop] : [];
  }

  return prisma.shop.findMany({
    where: { ownerId: user.id },
  });
}

// ------------------------------
// GET SINGLE SHOP
// ------------------------------
export async function getShop(id: string) {
  const user = await getCurrentUser();
  return assertShopAccess(id, user);
}

// ------------------------------
// UPDATE SHOP
// ------------------------------
export async function updateShop(id: string, data: any) {
  const user = await getCurrentUser();
  const shop = await assertShopAccess(id, user);
  if (shop.ownerId !== user.id) {
    throw new Error("Unauthorized");
  }
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
  const shop = await assertShopAccess(id, user);
  if (shop.ownerId !== user.id) {
    throw new Error("Unauthorized");
  }

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
