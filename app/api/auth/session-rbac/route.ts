// app/api/auth/session-rbac/route.ts

import { NextResponse } from "next/server";
import { getUserWithRolesAndPermissions } from "@/lib/rbac";

type SessionPayload = {
  session: { userId: string } | null;
  user: { id: string; email?: string | null } | null;
};

type SetCookieHeaders = Headers & { getSetCookie?: () => string[] };

const splitSetCookieHeader = (header: string): string[] => {
  const cookies: string[] = [];
  let start = 0;
  let inExpires = false;

  for (let i = 0; i < header.length; i++) {
    const char = header[i];
    if (char === ",") {
      if (!inExpires) {
        const chunk = header.slice(start, i).trim();
        if (chunk) cookies.push(chunk);
        start = i + 1;
      }
      continue;
    }

    if (char === ";") {
      inExpires = false;
      continue;
    }

    if (char === "=") {
      const segment = header.slice(start, i).trimEnd();
      const lastToken = segment.split(";").pop()?.trim().toLowerCase();
      if (lastToken === "expires") {
        inExpires = true;
      }
    }
  }

  const tail = header.slice(start).trim();
  if (tail) cookies.push(tail);
  return cookies;
};

const getSetCookies = (res: Response): string[] => {
  const headers = res.headers as SetCookieHeaders;
  if (typeof headers.getSetCookie === "function") {
    const values = headers.getSetCookie();
    if (values?.length) return values;
  }

  const header = res.headers.get("set-cookie");
  if (!header) return [];
  return splitSetCookieHeader(header);
};

async function fetchSession(req: Request): Promise<{
  payload: SessionPayload | null;
  setCookies: string[];
}> {
  const cookieHeader = req.headers.get("cookie") ?? "";

  const sessionUrl = new URL("/api/auth/get-session", req.url);
  sessionUrl.searchParams.set("disableCookieCache", "true");

  const res = await fetch(sessionUrl, {
    method: "GET",
    headers: {
      cookie: cookieHeader,
    },
    cache: "no-store",
  });

  const setCookies = getSetCookies(res);
  const payload = res.ok ? ((await res.json()) as SessionPayload) : null;

  return { payload, setCookies };
}

export async function GET(req: Request) {
  try {
    const { payload, setCookies } = await fetchSession(req);
    const userId = payload?.session?.userId;
    let user: SessionPayload["user"] = null;
    if (userId !== undefined && userId !== null) {
      try {
        user = await getUserWithRolesAndPermissions(userId);
      } catch (error) {
        console.error("RBAC lookup failed in session-rbac endpoint", error);
      }
    }

    const response = NextResponse.json({
      session: payload?.session ?? null,
      user,
    });
    setCookies.forEach((cookie) => {
      response.headers.append("set-cookie", cookie);
    });
    return response;
  } catch (error) {
    console.error("session-rbac endpoint failed", error);
    return NextResponse.json({ session: null, user: null }, { status: 200 });
  }
}
