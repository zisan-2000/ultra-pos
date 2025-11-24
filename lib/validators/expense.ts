// lib/validators/expense.ts
import { z } from "zod";

export const expenseSchema = z.object({
  shopId: z.string().uuid(),
  amount: z.string().regex(/^\d+(\.\d+)?$/, "Invalid amount format"),
  category: z.string().min(1, "Category is required"),
  expenseDate: z.string().optional(),
  note: z.string().optional(),
});

export type ExpenseInput = z.infer<typeof expenseSchema>;
