import { auth } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth-session";
import { logAudit } from "@/lib/audit/logger";
import { getRequestAuditContext } from "@/lib/audit/request-context";
import { prisma } from "@/lib/prisma";

// BetterAuth expects both GET and POST routed through the same handler.
export const GET = auth.handler;

async function getShopIdsForUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      staffShopId: true,
      shops: { select: { id: true } },
    },
  });
  const ids = new Set<string>();
  if (user?.staffShopId) ids.add(user.staffShopId);
  for (const shop of user?.shops ?? []) ids.add(shop.id);
  return Array.from(ids);
}

async function logAuthEventForEmail(
  request: Request,
  action: "auth.login.success" | "auth.login.fail",
  email: string | null,
  status: number,
) {
  if (!email) return;
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      roles: { select: { name: true } },
    },
  });
  if (!user) return;
  const shopIds = await getShopIdsForUser(user.id);
  const requestContext = getRequestAuditContext(request);
  await Promise.all(
    shopIds.map((shopId) =>
      logAudit({
        shopId,
        userId: user.id,
        userName: user.name ?? user.email,
        userRoles: user.roles.map((role) => role.name),
        action,
        targetType: "auth",
        targetId: user.id,
        summary:
          action === "auth.login.success"
            ? `${user.name || user.email} লগইন করেছেন`
            : `${user.name || user.email} লগইন করতে ব্যর্থ হয়েছেন`,
        metadata: { email, status },
        severity: action === "auth.login.success" ? "info" : "critical",
        correlationId: user.id,
        ...requestContext,
      }),
    ),
  );
}

export async function POST(request: Request) {
  const pathname = new URL(request.url).pathname;
  const isLoginAttempt = pathname.includes("sign-in");
  const isLogoutAttempt = pathname.includes("sign-out");
  const requestContext = getRequestAuditContext(request);
  const logoutUser = isLogoutAttempt ? await getCurrentUser().catch(() => null) : null;
  const loginBody = isLoginAttempt
    ? await request
        .clone()
        .json()
        .catch(() => null)
    : null;
  const email =
    typeof loginBody?.email === "string"
      ? loginBody.email.trim().toLowerCase()
      : null;

  const response = await auth.handler(request);

  if (isLoginAttempt) {
    await logAuthEventForEmail(
      request,
      response.ok ? "auth.login.success" : "auth.login.fail",
      email,
      response.status,
    ).catch((err) => console.error("[audit] auth login log failed", err));
  }

  if (isLogoutAttempt && logoutUser) {
    const shopIds = await getShopIdsForUser(logoutUser.id).catch(() => []);
    await Promise.all(
      shopIds.map((shopId) =>
        logAudit({
          shopId,
          userId: logoutUser.id,
          userName: logoutUser.name ?? logoutUser.email,
          userRoles: logoutUser.roles,
          action: "auth.logout",
          targetType: "auth",
          targetId: logoutUser.id,
          summary: `${logoutUser.name || logoutUser.email || "ব্যবহারকারী"} লগআউট করেছেন`,
          metadata: { status: response.status },
          severity: "info",
          correlationId: logoutUser.id,
          ...requestContext,
        }),
      ),
    ).catch((err) => console.error("[audit] auth logout log failed", err));
  }

  return response;
}
