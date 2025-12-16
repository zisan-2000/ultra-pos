// prisma/seed/pos/seedExpenses.ts

import { PrismaClient } from "@prisma/client";
import type { ShopMap } from "../utils";
import { toMoney } from "../utils";

export async function seedExpenses(prisma: PrismaClient, shops: ShopMap) {
  const expenseSeed: Record<
    string,
    Array<{
      amount: number;
      category: string;
      expenseDate: Date;
      note?: string | null;
    }>
  > = {
    tea: [
      {
        amount: 850,
        category: "Utilities",
        expenseDate: new Date("2024-12-01"),
        note: "Gas line refill",
      },
      {
        amount: 1320,
        category: "Supplies",
        expenseDate: new Date("2024-12-02"),
        note: "Milk and tea leaves",
      },
    ],
    grocery: [
      {
        amount: 5100,
        category: "Inventory Purchase",
        expenseDate: new Date("2024-12-03"),
        note: "Dry goods supplier",
      },
      {
        amount: 1250,
        category: "Utilities",
        expenseDate: new Date("2024-12-02"),
        note: "Generator fuel and power",
      },
    ],
    hotel: [
      {
        amount: 2500,
        category: "Kitchen Supplies",
        expenseDate: new Date("2024-12-03"),
        note: "Rice, vegetables, spices",
      },
      {
        amount: 900,
        category: "Utilities",
        expenseDate: new Date("2024-12-03"),
        note: "Gas & electricity",
      },
      {
        amount: 1200,
        category: "Staff Salary",
        expenseDate: new Date("2024-12-04"),
        note: "Daily wages",
      },
    ],
  };

  for (const [shopKey, entries] of Object.entries(expenseSeed)) {
    for (const exp of entries) {
      await prisma.expense.create({
        data: {
          shopId: shops[shopKey].id,
          amount: toMoney(exp.amount),
          category: exp.category,
          expenseDate: exp.expenseDate,
          note: exp.note || "",
        },
      });
    }
  }
}
