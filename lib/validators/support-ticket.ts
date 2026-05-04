import { z } from "zod";

export const createTicketSchema = z.object({
  shopId: z.string().uuid(),
  title: z.string().min(5, "শিরোনাম কমপক্ষে ৫ অক্ষরের হতে হবে"),
  description: z.string().min(10, "বিবরণ কমপক্ষে ১০ অক্ষরের হতে হবে"),
  category: z.enum(["technical", "billing", "feature_request", "other"]),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
});

export const replyTicketSchema = z.object({
  ticketId: z.string().uuid(),
  content: z.string().min(1, "উত্তর খালি রাখা যাবে না"),
});

export const updateTicketStatusSchema = z.object({
  ticketId: z.string().uuid(),
  status: z.enum(["open", "in_progress", "resolved", "closed"]),
  resolvedNote: z.string().optional(),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type ReplyTicketInput = z.infer<typeof replyTicketSchema>;
export type UpdateTicketStatusInput = z.infer<typeof updateTicketStatusSchema>;
