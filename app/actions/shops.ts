// app/actions/shops.ts

"use server";

import { db } from "@/db/client";
import { shops } from "@/db/schema";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { createServerClientForRoute } from "@/lib/supabase";

// ------------------------------
// CREATE SHOP
// ------------------------------
export async function createShop(data: {
  name: string;
  address?: string;
  phone?: string;
}) {
  const cookieStore = await cookies(); // ✅ FIXED
  const supabase = createServerClientForRoute(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  await db.insert(shops).values({
    ownerId: user.id,
    name: data.name,
    address: data.address || "",
    phone: data.phone || "",
  });

  return { success: true };
}

// ------------------------------
// GET SHOPS BY USER
// ------------------------------
export async function getShopsByUser() {
  const cookieStore = await cookies(); // ✅ FIXED
  const supabase = createServerClientForRoute(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  return db.select().from(shops).where(eq(shops.ownerId, user.id));
}

// ------------------------------
// GET SINGLE SHOP
// ------------------------------
export async function getShop(id: string) {
  return db.query.shops.findFirst({
    where: eq(shops.id, id),
  });
}

// ------------------------------
// UPDATE SHOP
// ------------------------------
export async function updateShop(id: string, data: any) {
  await db.update(shops).set(data).where(eq(shops.id, id));
  return { success: true };
}

// ------------------------------
// DELETE SHOP
// ------------------------------
export async function deleteShop(id: string) {
  await db.delete(shops).where(eq(shops.id, id));
  return { success: true };
}
