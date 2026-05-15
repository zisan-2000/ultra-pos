import type { AuditActor } from "./types";

export function auditMoney(value: unknown) {
  const n = Number((value as any)?.toString?.() ?? value ?? 0);
  return `৳ ${Number.isFinite(n) ? n.toLocaleString("bn-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) : "0.00"}`;
}

export function actorName(actor?: AuditActor) {
  return actor?.name?.trim() || actor?.email?.trim() || "সিস্টেম";
}

export function saleCreateSummary(args: {
  invoiceNo?: string | null;
  totalAmount: unknown;
  paymentMethod?: string | null;
  itemCount?: number;
  actor?: AuditActor;
}) {
  const invoice = args.invoiceNo ? `ইনভয়েস ${args.invoiceNo}` : "নতুন বিক্রি";
  return `${actorName(args.actor)} ${invoice} করেছেন: ${auditMoney(args.totalAmount)} · ${args.itemCount ?? 0} আইটেম · ${args.paymentMethod || "cash"}`;
}

export function saleVoidSummary(args: {
  saleId: string;
  totalAmount: unknown;
  reason?: string | null;
  actor?: AuditActor;
}) {
  return `${actorName(args.actor)} বিক্রি #${args.saleId} বাতিল করেছেন: ${auditMoney(args.totalAmount)}${args.reason ? ` · কারণ: ${args.reason}` : ""}`;
}

export function cashSummary(action: "create" | "update" | "delete", args: {
  entryType?: string | null;
  amount: unknown;
  reason?: string | null;
  actor?: AuditActor;
}) {
  const verb = action === "create" ? "ক্যাশ এন্ট্রি করেছেন" : action === "update" ? "ক্যাশ এন্ট্রি সম্পাদনা করেছেন" : "ক্যাশ এন্ট্রি মুছে ফেলেছেন";
  return `${actorName(args.actor)} ${verb}: ${args.entryType || "IN"} ${auditMoney(args.amount)}${args.reason ? ` · ${args.reason}` : ""}`;
}

export function expenseSummary(action: "create" | "update" | "delete", args: {
  amount: unknown;
  category?: string | null;
  actor?: AuditActor;
}) {
  const verb = action === "create" ? "খরচ যোগ করেছেন" : action === "update" ? "খরচ সম্পাদনা করেছেন" : "খরচ মুছে ফেলেছেন";
  return `${actorName(args.actor)} ${verb}: ${auditMoney(args.amount)} · ${args.category || "অন্যান্য"}`;
}

export function productSummary(action: "create" | "update" | "delete" | "price", args: {
  name?: string | null;
  actor?: AuditActor;
  oldSellPrice?: unknown;
  newSellPrice?: unknown;
}) {
  const name = args.name || "পণ্য";
  if (action === "create") return `${actorName(args.actor)} "${name}" পণ্য তৈরি করেছেন`;
  if (action === "delete") return `${actorName(args.actor)} "${name}" পণ্য মুছে/আর্কাইভ করেছেন`;
  if (action === "price") return `${actorName(args.actor)} "${name}" পণ্যের বিক্রিমূল্য বদলেছেন: ${auditMoney(args.oldSellPrice)} → ${auditMoney(args.newSellPrice)}`;
  return `${actorName(args.actor)} "${name}" পণ্য সম্পাদনা করেছেন`;
}

export function stockAdjustmentSummary(args: {
  productName?: string | null;
  variantLabel?: string | null;
  previousQty: unknown;
  newQty: unknown;
  reason?: string | null;
  actor?: AuditActor;
}) {
  const label = args.variantLabel ? `${args.productName || "পণ্য"} (${args.variantLabel})` : args.productName || "পণ্য";
  return `${actorName(args.actor)} "${label}" স্টক সমন্বয় করেছেন: ${args.previousQty} → ${args.newQty}${args.reason ? ` · ${args.reason}` : ""}`;
}
