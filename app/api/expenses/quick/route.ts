import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth-session";
import { requirePermission } from "@/lib/rbac";
import { assertShopAccess } from "@/lib/shop-access";
import { expenseSchema } from "@/lib/validators/expense";
import { prisma } from "@/lib/prisma";
import { withTracing } from "@/lib/tracing";
import { publishRealtimeEvent } from "@/lib/realtime/publisher";
import { REALTIME_EVENTS } from "@/lib/realtime/events";
import { revalidateReportsForExpense } from "@/lib/reports/revalidate";
import { getDhakaDateString, toDhakaBusinessDate } from "@/lib/dhaka-date";

function normalizeExpenseDate(raw?: string | null) {
  const trimmed = raw?.trim();
  const fallbackDay = getDhakaDateString();
  const fallbackDate = new Date(`${fallbackDay}T00:00:00.000Z`);
  const date = trimmed ? new Date(trimmed) : fallbackDate;
  if (Number.isNaN(date.getTime())) return fallbackDate;
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function revalidateExpensePaths() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/expenses");
  revalidatePath("/dashboard/reports");
  revalidatePath("/dashboard/cash");
}

export async function POST(req: Request) {
  return withTracing(req, "/api/expenses/quick", async () => {
    try {
      const body = (await req.json()) as {
        shopId?: string;
        amount?: string | number;
        category?: string;
        note?: string;
        expenseDate?: string;
      };

      const parsed = expenseSchema.parse({
        shopId: String(body.shopId ?? ""),
        amount: String(body.amount ?? ""),
        category: String(body.category ?? "").trim() || "অন্যান্য",
        note: String(body.note ?? ""),
        expenseDate: String(body.expenseDate ?? ""),
      });

      const user = await requireUser();
      requirePermission(user, "create_expense");
      await assertShopAccess(parsed.shopId, user);

      let createdExpenseId = "";
      await prisma.$transaction(async (tx) => {
        const expenseDate = normalizeExpenseDate(parsed.expenseDate);
        const created = await tx.expense.create({
          data: {
            shopId: parsed.shopId,
            amount: parsed.amount,
            category: parsed.category,
            expenseDate,
            note: parsed.note || "",
          },
        });
        createdExpenseId = created.id;

        await tx.cashEntry.create({
          data: {
            shopId: parsed.shopId,
            entryType: "OUT",
            amount: created.amount,
            reason: `Expense: ${created.category} (#${created.id})`,
            businessDate: toDhakaBusinessDate(expenseDate),
          },
        });
      });

      await publishRealtimeEvent(REALTIME_EVENTS.expenseCreated, parsed.shopId, {
        expenseId: createdExpenseId,
        amount: Number(parsed.amount),
        category: parsed.category,
      });
      await publishRealtimeEvent(REALTIME_EVENTS.cashUpdated, parsed.shopId, {
        amount: Number(parsed.amount),
        entryType: "OUT",
      });
      revalidateExpensePaths();
      revalidateReportsForExpense();

      return NextResponse.json({ success: true });
    } catch (error: any) {
      const message =
        error?.name === "ZodError"
          ? "তথ্য ঠিকভাবে দিন"
          : typeof error?.message === "string"
            ? error.message
            : "দ্রুত খরচ যোগ করা যায়নি";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  });
}

