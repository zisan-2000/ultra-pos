// app/api/sync/products/route.ts

import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { products } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { newItems = [], updatedItems = [], deletedIds = [] } = body;

    // Insert new
    if (newItems.length > 0) {
      await db.insert(products).values(newItems);
    }

    // Update
    for (const item of updatedItems) {
      await db.update(products).set(item).where(eq(products.id, item.id));
    }

    // Delete
    if (deletedIds.length > 0) {
      await db.delete(products).where(inArray(products.id, deletedIds));
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: 500 }
    );
  }
}
