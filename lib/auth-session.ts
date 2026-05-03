// lib/auth-session.ts

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  getUserWithRolesAndPermissionsCached,
  type UserContext,
} from "./rbac";
import { prisma } from "./prisma";
import { getCurrentSessionRecordFromCookieHeader } from "./impersonation";

type SessionPayload = {
  session: { userId: string } | null;
  user: { id: string; email?: string | null } | null;
};

const fetchSession = async (): Promise<SessionPayload | null> => {
  const headerStore = await headers();
  const cookieHeader = headerStore.get("cookie") ?? "";
  if (!cookieHeader) return null;

  try {
    const result: any = await (auth as any).api?.getSession?.({
      headers: {
        cookie: cookieHeader,
      },
    });

    const session = result?.data?.session ?? result?.session ?? null;
    const user = result?.data?.user ?? result?.user ?? null;
    const userId = session?.userId ?? user?.id ?? null;
    if (!userId) return null;

    return {
      session: { userId },
      user: user ? { id: user.id, email: user.email ?? null } : null,
    };
  } catch {
    return null;
  }
};

export async function getCurrentUser(): Promise<UserContext | null> {
  const payload = await fetchSession();
  const headerStore = await headers();
  const cookieHeader = headerStore.get("cookie") ?? "";
  const sessionRow = cookieHeader
    ? await getCurrentSessionRecordFromCookieHeader(cookieHeader)
    : null;
  const effectiveUserId =
    sessionRow?.userId ?? payload?.session?.userId ?? payload?.user?.id ?? null;
  if (!effectiveUserId) return null;

  const ctx = await getUserWithRolesAndPermissionsCached(effectiveUserId);
  if (!ctx) return null;

  let impersonatorName: string | null = null;
  let impersonatorEmail: string | null = null;
  if (sessionRow?.impersonatedBy) {
    const impersonator = await prisma.user.findUnique({
      where: { id: sessionRow.impersonatedBy },
      select: { name: true, email: true },
    });
    impersonatorName = impersonator?.name ?? null;
    impersonatorEmail = impersonator?.email ?? null;
  }

  return {
    ...ctx,
    actorUserId: sessionRow?.impersonatedBy ?? effectiveUserId,
    effectiveUserId,
    sessionId: sessionRow?.id ?? null,
    isImpersonating: Boolean(sessionRow?.impersonatedBy),
    impersonatedBy: sessionRow?.impersonatedBy ?? null,
    impersonatorName,
    impersonatorEmail,
  };
}

export async function requireUser(): Promise<UserContext> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Not authenticated");
  }
  return user;
}
