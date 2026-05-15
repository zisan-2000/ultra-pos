import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getDhakaDateString } from "@/lib/dhaka-date";
import type { AuditActor, AuditEvent } from "./types";

type AuditClient = Prisma.TransactionClient | typeof prisma;

function sanitize(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Prisma.Decimal) return value.toString();
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item) ?? null) as Prisma.InputJsonArray;
  }
  if (typeof value === "object") {
    const out: Record<string, Prisma.InputJsonValue> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      const lowered = key.toLowerCase();
      if (
        lowered.includes("password") ||
        lowered.includes("token") ||
        lowered.includes("secret") ||
        lowered.includes("hash")
      ) {
        out[key] = "[redacted]";
        continue;
      }
      const cleaned = sanitize(raw);
      if (cleaned !== undefined) out[key] = cleaned;
    }
    return out;
  }
  if (["string", "number", "boolean"].includes(typeof value)) {
    return value as Prisma.InputJsonValue;
  }
  return String(value);
}

export function auditActorSnapshot(actor: AuditActor) {
  return {
    userId: actor?.id ?? null,
    userName: actor?.name ?? actor?.email ?? null,
    userRoles: actor?.roles ?? [],
  };
}

export async function logAudit(
  event: AuditEvent,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const client: AuditClient = tx ?? prisma;
  try {
    await client.auditLog.create({
      data: {
        shopId: event.shopId,
        userId: event.userId ?? null,
        userName: event.userName ?? null,
        userRoles: event.userRoles ?? [],
        action: event.action,
        targetType: event.targetType,
        targetId: event.targetId ?? null,
        summary: event.summary,
        metadata: sanitize(event.metadata) ?? Prisma.JsonNull,
        severity: event.severity ?? "info",
        ipAddress: event.ipAddress ?? null,
        userAgent: event.userAgent ?? null,
        correlationId: event.correlationId ?? null,
        at: event.at ?? new Date(),
        businessDate: event.businessDate ?? getDhakaDateString(event.at ?? new Date()),
      },
    });
  } catch (err) {
    if (tx) throw err;
    console.error("[audit] non-transactional log failed", {
      action: event.action,
      targetType: event.targetType,
      targetId: event.targetId,
      err,
    });
  }
}
