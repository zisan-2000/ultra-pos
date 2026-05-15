import type { AuditAction, AuditSeverity } from "./types";

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "sale.create": "বিক্রি তৈরি",
  "sale.void": "বিক্রি বাতিল",
  "invoice.issue": "ইনভয়েস ইস্যু",
  "cash.create": "ক্যাশ এন্ট্রি",
  "cash.update": "ক্যাশ সম্পাদনা",
  "cash.delete": "ক্যাশ মুছে ফেলা",
  "expense.create": "খরচ যোগ",
  "expense.update": "খরচ সম্পাদনা",
  "expense.delete": "খরচ মুছে ফেলা",
  "product.create": "পণ্য তৈরি",
  "product.update": "পণ্য সম্পাদনা",
  "product.price.change": "দাম পরিবর্তন",
  "product.delete": "পণ্য মুছে/আর্কাইভ",
  "stock.adjust": "স্টক সমন্বয়",
  "purchase.create": "পণ্য ক্রয়",
  "purchase.return": "ক্রয় রিটার্ন",
  "auth.login.success": "লগইন সফল",
  "auth.login.fail": "লগইন ব্যর্থ",
  "auth.logout": "লগআউট",
  "permission.change": "পারমিশন পরিবর্তন",
  "user.create": "ব্যবহারকারী তৈরি",
  "user.update": "ব্যবহারকারী সম্পাদনা",
  "user.delete": "ব্যবহারকারী মুছে ফেলা",
};

export const AUDIT_SEVERITY_LABELS: Record<AuditSeverity, string> = {
  info: "তথ্য",
  warning: "সতর্কতা",
  critical: "গুরুত্বপূর্ণ",
};

export function getAuditActionLabel(action: AuditAction | string) {
  return AUDIT_ACTION_LABELS[action] ?? action.replace(/\./g, " ");
}
