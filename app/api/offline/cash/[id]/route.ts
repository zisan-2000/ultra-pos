import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { requirePermission } from "@/lib/rbac";
import { assertShopAccess } from "@/lib/shop-access";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireUser();
    requirePermission(user, "view_cashbook");

    const entry = await prisma.cashEntry.findUnique({
      where: { id: params.id },
    });

    if (!entry) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await assertShopAccess(entry.shopId, user);

    return NextResponse.json({
      id: entry.id,
      shopId: entry.shopId,
      entryType: entry.entryType,
      amount: entry.amount?.toString?.() ?? "0",
      reason: entry.reason,
      createdAt: entry.createdAt?.toISOString?.() ?? entry.createdAt,
      updatedAt: entry.updatedAt?.toISOString?.() ?? entry.createdAt?.toISOString?.(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
