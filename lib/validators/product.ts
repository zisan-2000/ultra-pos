// lib/validators/product.ts
import { z } from "zod";

export const productSchema = z.object({
  shopId: z.string().uuid("Invalid shop ID"),
  name: z.string().min(1, "Product name is required"),
  sellPrice: z.string().regex(/^\d+(\.\d+)?$/, "Invalid price format"),
  stockQty: z.string().regex(/^\d+(\.\d+)?$/, "Invalid stock quantity"),
  isActive: z.boolean(),
});

export type ProductInput = z.infer<typeof productSchema>;
