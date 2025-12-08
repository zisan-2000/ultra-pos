// lib/auth-session.ts

import { cookies } from "next/headers";

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

export async function getCurrentUser() {
  const payload = await fetchSession();
  return payload?.user ?? null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Not authenticated");
  }
  return user;
}
