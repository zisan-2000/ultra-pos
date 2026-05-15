import { headers } from "next/headers";

export type AuditRequestContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

function firstForwardedIp(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

export async function getServerAuditRequestContext(): Promise<AuditRequestContext> {
  try {
    const h = await headers();
    return {
      ipAddress:
        firstForwardedIp(h.get("x-forwarded-for")) ??
        h.get("x-real-ip") ??
        h.get("cf-connecting-ip"),
      userAgent: h.get("user-agent"),
    };
  } catch {
    return {};
  }
}

export function getRequestAuditContext(request: Request): AuditRequestContext {
  return {
    ipAddress:
      firstForwardedIp(request.headers.get("x-forwarded-for")) ??
      request.headers.get("x-real-ip") ??
      request.headers.get("cf-connecting-ip"),
    userAgent: request.headers.get("user-agent"),
  };
}

