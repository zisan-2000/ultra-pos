// lib/auth-session.ts

import { cookies } from "next/headers";
import { getUserWithRolesAndPermissions, type UserContext } from "./rbac";

type SessionPayload = {
  session: { userId: string } | null;
  user: { id: string; email?: string | null } | null;
};

async function fetchSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join("; ");

  const baseURL =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";

  const res = await fetch(`${baseURL}/api/auth/get-session`, {
    headers: {
      cookie: cookieHeader,
    },
    cache: "no-store",
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data as SessionPayload;
}

export async function getCurrentUser(): Promise<UserContext | null> {
  const payload = await fetchSession();
  const userId = payload?.session?.userId;
  if (!userId) return null;

  const ctx = await getUserWithRolesAndPermissions(userId);
  return ctx;
}

export async function requireUser(): Promise<UserContext> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Not authenticated");
  }
  return user;
}
