// app/api/sync/products/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { newItems = [], updatedItems = [], deletedIds = [] } = body;

    // Insert new
    if (newItems.length > 0) {
      await prisma.product.createMany({ data: newItems });
    }

    // Update
    for (const item of updatedItems) {
      const { id, ...rest } = item;
      await prisma.product.update({
        where: { id },
        data: rest,
      });
    }

    // Delete
    if (deletedIds.length > 0) {
      await prisma.product.deleteMany({ where: { id: { in: deletedIds } } });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e.message },
      { status: 500 }
    );
  }
}
