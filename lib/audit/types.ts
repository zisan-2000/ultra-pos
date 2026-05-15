import type { Prisma } from "@prisma/client";
import type { UserContext } from "@/lib/rbac";

export type AuditSeverity = "info" | "warning" | "critical";

export const AUDIT_ACTIONS = [
  "sale.create",
  "sale.void",
  "invoice.issue",
  "cash.create",
  "cash.update",
  "cash.delete",
  "expense.create",
  "expense.update",
  "expense.delete",
  "product.create",
  "product.update",
  "product.price.change",
  "product.delete",
  "stock.adjust",
  "purchase.create",
  "purchase.return",
  "auth.login.success",
  "auth.login.fail",
  "auth.logout",
  "permission.change",
  "user.create",
  "user.update",
  "user.delete",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number] | (string & {});

export type AuditEvent = {
  shopId: string;
  userId?: string | null;
  userName?: string | null;
  userRoles?: string[] | null;
  action: AuditAction;
  targetType: string;
  targetId?: string | null;
  summary: string;
  metadata?: Prisma.InputJsonValue | Record<string, unknown> | null;
  severity?: AuditSeverity;
  ipAddress?: string | null;
  userAgent?: string | null;
  correlationId?: string | null;
  at?: Date;
  businessDate?: string;
};

export type AuditActor = Pick<UserContext, "id" | "name" | "email" | "roles"> | null;
