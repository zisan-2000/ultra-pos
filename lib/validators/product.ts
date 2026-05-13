// lib/validators/product.ts

import { z } from "zod";

export const productSchema = z.object({
  shopId: z.string().uuid("Invalid shop ID"),
  name: z.string().min(1, "Product name is required"),
  sellPrice: z.string().regex(/^\d+(\.\d+)?$/, "Invalid price format"),
  stockQty: z.string().regex(/^\d+(\.\d+)?$/, "Invalid stock quantity"),
  isActive: z.boolean(),
  trackSerialNumbers: z.boolean().optional(),
  trackBatch: z.boolean().optional(),
  trackCutLength: z.boolean().optional(),
  defaultCutLength: z.string().optional().nullable(),
});

export type ProductInput = z.infer<typeof productSchema>;

const numericOrEmpty = z.union([
  z.string().regex(/^\d+(\.\d+)?$/, "সঠিক সংখ্যা লিখুন"),
  z.literal(""),
]);

export const productFormSchema = z.object({
  name: z.string().min(1, "পণ্যের নাম দিন"),
  sellPrice: z.string().regex(/^\d+(\.\d+)?$/, "সঠিক মূল্য লিখুন"),
  buyPrice: numericOrEmpty.optional(),
  stockQty: numericOrEmpty.optional(),
  reorderPoint: numericOrEmpty.optional(),
  warrantyDaysValue: z.union([z.string().regex(/^\d*$/, "সঠিক সংখ্যা লিখুন"), z.literal("")]).optional(),
  sku: z.string().optional(),
  barcode: z.string().optional(),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;
