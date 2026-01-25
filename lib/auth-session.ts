// lib/auth-session.ts

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  getUserWithRolesAndPermissionsCached,
  type UserContext,
} from "./rbac";

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
  const userId = payload?.session?.userId;
  if (!userId) return null;

  const ctx = await getUserWithRolesAndPermissionsCached(userId);
  return ctx;
}

export async function requireUser(): Promise<UserContext> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Not authenticated");
  }
  return user;
}
