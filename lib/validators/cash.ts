// lib/validators/cash.ts
import { z } from "zod";

export const cashSchema = z.object({
  shopId: z.string().uuid(),
  entryType: z.enum(["IN", "OUT"]),
  amount: z.string().regex(/^\d+(\.\d+)?$/, "Invalid amount"),
  reason: z.string().optional(),
});

export type CashInput = z.infer<typeof cashSchema>;
