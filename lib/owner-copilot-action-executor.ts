import { revalidatePath } from "next/cache";
import { requirePermission, type UserContext } from "@/lib/rbac";
import { assertShopAccess } from "@/lib/shop-access";
import { ownerCopilotActionDraftSchema, type OwnerCopilotActionDraft } from "@/lib/owner-copilot-actions";
import { prisma } from "@/lib/prisma";
import { publishRealtimeEvent } from "@/lib/realtime/publisher";
import { REALTIME_EVENTS } from "@/lib/realtime/events";
import { revalidateReportsForCash, revalidateReportsForExpense } from "@/lib/reports/revalidate";
import { toDhakaBusinessDate } from "@/lib/dhaka-date";

function revalidateExpensePaths() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/expenses");
  revalidatePath("/dashboard/reports");
  revalidatePath("/dashboard/cash");
}

function revalidateCashPaths() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/cash");
  revalidatePath("/dashboard/reports");
}

export async function executeOwnerCopilotActionDraft({
  shopId,
  user,
  actionDraft,
}: {
  shopId: string;
  user: UserContext;
  actionDraft: OwnerCopilotActionDraft;
}) {
  const parsed = ownerCopilotActionDraftSchema.parse(actionDraft);
  await assertShopAccess(shopId, user);

  if (parsed.kind === "expense") {
    requirePermission(user, "create_expense");

    let createdExpenseId = "";
    await prisma.$transaction(async (tx) => {
      const expenseDate = toDhakaBusinessDate();
      const created = await tx.expense.create({
        data: {
          shopId,
          amount: parsed.amount,
          category: parsed.category,
          expenseDate,
          note: parsed.note || "",
        },
      });
      createdExpenseId = created.id;

      await tx.cashEntry.create({
        data: {
          shopId,
          entryType: "OUT",
          amount: created.amount,
          reason: `Expense: ${created.category} (#${created.id})`,
          businessDate: expenseDate,
        },
      });
    });

    await publishRealtimeEvent(REALTIME_EVENTS.expenseCreated, shopId, {
      expenseId: createdExpenseId,
      amount: Number(parsed.amount),
      category: parsed.category,
    });
    await publishRealtimeEvent(REALTIME_EVENTS.cashUpdated, shopId, {
      amount: Number(parsed.amount),
      entryType: "OUT",
    });
    revalidateExpensePaths();
    revalidateReportsForExpense();

    return {
      success: true,
      answer: `খরচ যোগ হয়েছে। ৳ ${parsed.amount} | ${parsed.category}${parsed.note ? ` | ${parsed.note}` : ""}`,
    };
  }

  requirePermission(user, "create_cash_entry");

  await prisma.cashEntry.create({
    data: {
      shopId,
      entryType: parsed.entryType,
      amount: parsed.amount,
      reason: parsed.reason || "",
      businessDate: toDhakaBusinessDate(),
    },
  });

  await publishRealtimeEvent(REALTIME_EVENTS.cashUpdated, shopId, {
    amount: Number(parsed.amount),
    entryType: parsed.entryType,
  });
  revalidateCashPaths();
  revalidateReportsForCash();

  return {
    success: true,
    answer: `${parsed.entryType === "IN" ? "ক্যাশ ইন" : "ক্যাশ আউট"} এন্ট্রি যোগ হয়েছে। ৳ ${parsed.amount}${parsed.reason ? ` | ${parsed.reason}` : ""}`,
  };
}
