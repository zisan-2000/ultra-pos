// app/api/auth/session-rbac/route.ts

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserWithRolesAndPermissions } from "@/lib/rbac";

type SessionPayload = {
  session: { userId: string } | null;
  user: { id: string; email?: string | null } | null;
};

async function fetchSession(req: Request): Promise<SessionPayload | null> {
  const cookieHeader = req.headers.get("cookie") ?? "";

  try {
    const result: any = await (auth as any).api?.getSession?.({
      headers: {
        cookie: cookieHeader,
      },
    });

    const session = result?.data?.session ?? result?.session ?? null;
    const user = result?.data?.user ?? result?.user ?? null;
    const userId = session?.userId ?? user?.id ?? null;
    if (!userId) return { session: null, user: null };

    return {
      session: { userId },
      user: user ? { id: user.id, email: user.email ?? null } : null,
    };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const payload = await fetchSession(req);
    const userId = payload?.session?.userId;
    let user: SessionPayload["user"] = null;
    if (userId !== undefined && userId !== null) {
      try {
        user = await getUserWithRolesAndPermissions(userId);
      } catch (error) {
        console.error("RBAC lookup failed in session-rbac endpoint", error);
      }
    }

    return NextResponse.json({
      session: payload?.session ?? null,
      user,
    });
  } catch (error) {
    console.error("session-rbac endpoint failed", error);
    return NextResponse.json({ session: null, user: null }, { status: 200 });
  }
}
