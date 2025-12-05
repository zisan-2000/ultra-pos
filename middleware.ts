// middleware.ts
import { NextResponse, type NextRequest } from "next/server";

async function getSession(req: NextRequest) {
  try {
    const sessionRes = await fetch(new URL("/api/auth/get-session", req.url), {
      method: "GET",
      headers: {
        cookie: req.headers.get("cookie") ?? "",
      },
      cache: "no-store",
    });

    const setCookie = sessionRes.headers.get("set-cookie");
    const data = sessionRes.ok ? await sessionRes.json() : null;

    return {
      session: data?.session || null,
      setCookie,
    };
  } catch (error) {
    console.error("BetterAuth get-session failed in middleware", error);
    return { session: null, setCookie: null };
  }
}

export async function middleware(req: NextRequest) {
  const { session, setCookie } = await getSession(req);
  const isAuthPage =
    req.nextUrl.pathname.startsWith("/login") ||
    req.nextUrl.pathname.startsWith("/register");

  const makeResponse = (res: NextResponse) => {
    if (setCookie) {
      res.headers.append("set-cookie", setCookie);
    }
    return res;
  };

  if (!session && !isAuthPage) {
    return makeResponse(NextResponse.redirect(new URL("/login", req.url)));
  }

  if (session && isAuthPage) {
    return makeResponse(NextResponse.redirect(new URL("/dashboard", req.url)));
  }

  return makeResponse(NextResponse.next());
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/register"],
};
