"use server";

import { headers, cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireUser } from "@/lib/auth-session";
import {
  clearSessionTokenCookie,
  clearAuthCacheCookies,
  clearRestoreCookie,
  createImpersonationSessionToken,
  decodeImpersonationRestoreCookie,
  getCurrentSessionRecordFromCookieHeader,
  IMPERSONATION_RESTORE_COOKIE,
  resolveProto,
  setRestoreCookie,
  setSessionTokenCookie,
} from "@/lib/impersonation";

function getRequestMeta(headerStore: Awaited<ReturnType<typeof headers>>) {
  const host = headerStore.get("host") || "";
  const proto = resolveProto(
    host,
    headerStore.get("x-forwarded-proto"),
    process.env.NEXT_PUBLIC_APP_URL,
  );
  const forwardedFor = headerStore.get("x-forwarded-for") || "";
  const ipAddress = forwardedFor.split(",")[0]?.trim() || null;
  const userAgent = headerStore.get("user-agent") || null;
  return { host, proto, ipAddress, userAgent };
}

function buildExpiry(fromDate: Date) {
  const twoHours = new Date(Date.now() + 2 * 60 * 60 * 1000);
  return fromDate.getTime() < twoHours.getTime() ? fromDate : twoHours;
}

async function resolveCurrentSession(cookieHeader: string) {
  // Primary: parse session token from cookie header via auth cookie definitions
  const session = await getCurrentSessionRecordFromCookieHeader(cookieHeader);
  if (session) return session;

  // Fallback: use better-auth API to get session token, then look up in DB
  const authResult = await (auth as any).api?.getSession?.({
    headers: { cookie: cookieHeader },
  });
  const sessionToken =
    authResult?.data?.session?.token ?? authResult?.session?.token ?? null;
  if (!sessionToken) return null;

  const row = await prisma.session.findUnique({
    where: { token: sessionToken },
    select: { id: true, token: true, userId: true, expiresAt: true, impersonatedBy: true },
  });
  if (!row || row.expiresAt.getTime() <= Date.now()) return null;
  return row;
}

export async function startImpersonation(targetUserId: string, reason?: string | null) {
  const actor = await requireUser();
  if (!actor.roles.includes("super_admin")) {
    throw new Error("Only super admin can impersonate");
  }
  if (actor.isImpersonating) {
    throw new Error("Nested impersonation is not allowed");
  }
  if (!targetUserId) {
    throw new Error("Target user not found");
  }
  if (targetUserId === actor.id) {
    throw new Error("Cannot impersonate yourself");
  }

  const headerStore = await headers();
  const cookieStore = await cookies();
  const cookieHeader = headerStore.get("cookie") ?? "";

  const currentSession = await resolveCurrentSession(cookieHeader);
  if (!currentSession) {
    throw new Error("Current session not found. Please refresh and try again.");
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true },
  });
  if (!targetUser) {
    throw new Error("Target user not found");
  }

  const { host, proto, ipAddress, userAgent } = getRequestMeta(headerStore);
  const expiresAt = buildExpiry(currentSession.expiresAt);
  const impersonationToken = createImpersonationSessionToken();

  const created = await prisma.$transaction(async (tx) => {
    const session = await tx.session.create({
      data: {
        token: impersonationToken,
        userId: targetUser.id,
        expiresAt,
        ipAddress,
        userAgent,
        impersonatedBy: actor.id,
      },
      select: { id: true },
    });

    await tx.impersonationAudit.create({
      data: {
        actorUserId: actor.id,
        targetUserId: targetUser.id,
        startedSessionId: session.id,
        reason: reason?.trim() || null,
        ipAddress,
        userAgent,
        status: "active",
      },
    });

    return session;
  });

  setRestoreCookie({
    cookieStore,
    host,
    proto,
    payload: {
      originalSessionToken: currentSession.token,
      actorUserId: actor.id,
      createdAt: new Date().toISOString(),
    },
  });
  await setSessionTokenCookie({
    cookieStore,
    host,
    proto,
    token: impersonationToken,
    expiresAt,
  });
  await clearAuthCacheCookies({ cookieStore, host, proto });

  return { redirectTo: "/dashboard" };
}

export async function stopImpersonation() {
  const currentUser = await requireUser();
  if (!currentUser.isImpersonating) {
    throw new Error("No active impersonation session");
  }

  const headerStore = await headers();
  const cookieStore = await cookies();
  const cookieHeader = headerStore.get("cookie") ?? "";

  const currentSession = await resolveCurrentSession(cookieHeader);
  if (!currentSession || !currentSession.impersonatedBy) {
    throw new Error("Could not validate impersonation session");
  }

  const { host, proto } = getRequestMeta(headerStore);
  const restoreRaw = cookieStore.get(IMPERSONATION_RESTORE_COOKIE)?.value ?? null;
  const restore = decodeImpersonationRestoreCookie(restoreRaw);

  await prisma.$transaction(async (tx) => {
    await tx.impersonationAudit.updateMany({
      where: {
        startedSessionId: currentSession.id,
        status: "active",
      },
      data: {
        endedAt: new Date(),
        endedByUserId: currentSession.impersonatedBy,
        status: "stopped",
      },
    });
    await tx.session.deleteMany({
      where: { id: currentSession.id },
    });
  });

  clearRestoreCookie({ cookieStore, host, proto });
  await clearAuthCacheCookies({ cookieStore, host, proto });

  if (!restore?.originalSessionToken || restore.actorUserId !== currentSession.impersonatedBy) {
    await clearSessionTokenCookie({ cookieStore, host, proto });
    return { redirectTo: "/login" };
  }

  const originalSession = await prisma.session.findUnique({
    where: { token: restore.originalSessionToken },
    select: { token: true, expiresAt: true },
  });

  if (!originalSession || originalSession.expiresAt.getTime() <= Date.now()) {
    await clearSessionTokenCookie({ cookieStore, host, proto });
    return { redirectTo: "/login" };
  }

  await setSessionTokenCookie({
    cookieStore,
    host,
    proto,
    token: originalSession.token,
    expiresAt: originalSession.expiresAt,
  });

  return { redirectTo: "/dashboard" };
}
