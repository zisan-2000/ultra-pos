import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUserWithRolesAndPermissions } from "@/lib/rbac";

type SessionPayload = {
  session: { userId: string } | null;
  user: { id: string; email?: string | null } | null;
};

async function fetchSession(req: Request): Promise<{
  payload: SessionPayload | null;
  setCookie: string | null;
}> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join("; ");

  const sessionUrl = new URL("/api/auth/get-session", req.url);

  const res = await fetch(sessionUrl, {
    method: "GET",
    headers: {
      cookie: cookieHeader,
    },
    cache: "no-store",
  });

  const setCookie = res.headers.get("set-cookie");
  const payload = res.ok ? ((await res.json()) as SessionPayload) : null;

  return { payload, setCookie };
}

export async function GET(req: Request) {
  try {
    const { payload, setCookie } = await fetchSession(req);
    const userId = payload?.session?.userId;
    const user =
      userId !== undefined && userId !== null
        ? await getUserWithRolesAndPermissions(userId)
        : null;

    const response = NextResponse.json({ session: payload?.session ?? null, user });
    if (setCookie) {
      response.headers.set("set-cookie", setCookie);
    }
    return response;
  } catch (error) {
    console.error("session-rbac endpoint failed", error);
    return NextResponse.json(
      { session: null, user: null },
      { status: 200 },
    );
  }
}
