import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { requirePermission } from "@/lib/rbac";
import { assertShopAccess } from "@/lib/shop-access";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireUser();
    requirePermission(user, "view_expenses");

    const expense = await prisma.expense.findUnique({
      where: { id },
    });

    if (!expense) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await assertShopAccess(expense.shopId, user);

    return NextResponse.json({
      id: expense.id,
      shopId: expense.shopId,
      amount: expense.amount?.toString?.() ?? "0",
      category: expense.category,
      note: expense.note,
      expenseDate: expense.expenseDate?.toISOString?.() ?? expense.expenseDate,
      createdAt: expense.createdAt?.toISOString?.() ?? expense.createdAt,
      updatedAt: expense.updatedAt?.toISOString?.() ?? expense.createdAt?.toISOString?.(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
