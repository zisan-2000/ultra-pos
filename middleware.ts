// middleware.ts
import { NextResponse, type NextRequest } from "next/server";

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

async function getAuthContext(req: NextRequest) {
  try {
    const res = await fetch(new URL("/api/auth/session-rbac", req.url), {
      method: "GET",
      headers: {
        cookie: req.headers.get("cookie") ?? "",
      },
      cache: "no-store",
    });

    const setCookies = getSetCookies(res);
    const data = res.ok ? await res.json() : null;

    return {
      session: data?.session ?? null,
      user: data?.user ?? null,
      setCookies,
    };
  } catch (error) {
    console.error("Auth context lookup failed in middleware", error);
    return { session: null, user: null, setCookies: [] };
  }
}

const appendCookies = (res: NextResponse, cookies: string[]) => {
  cookies.filter(Boolean).forEach((c) => res.headers.append("set-cookie", c));
  return res;
};

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  if (pathname.startsWith("/api/")) {
    const res = NextResponse.next();
    // Attach a request id for downstream tracing if not provided by the client.
    if (!req.headers.get("x-request-id")) {
      res.headers.set("x-request-id", crypto.randomUUID());
    }
    return res;
  }

  const isAuthPage =
    pathname.startsWith("/login") || pathname.startsWith("/register");
  const roleMatch = pathname.match(/^\/([A-Za-z0-9_-]+)(\/.*)?$/);
  const roleSlug = roleMatch?.[1] ?? null;
  const remainder = roleMatch?.[2] ?? "";
  const reserved = new Set(["dashboard", "login", "register", "api", "_next"]);
  const looksRolePrefixed = Boolean(roleSlug && !reserved.has(roleSlug));
  const isDashboardPath =
    pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const isProtectedRoute = isDashboardPath || looksRolePrefixed;

  if (!isAuthPage && !isProtectedRoute) {
    return NextResponse.next();
  }

  const { session, setCookies } = await getAuthContext(req);

  const cookiesToSet = setCookies;

  if (!session && isProtectedRoute && !isAuthPage) {
    return appendCookies(
      NextResponse.redirect(new URL("/login", req.url)),
      cookiesToSet,
    );
  }

  if (session && isAuthPage) {
    return appendCookies(
      NextResponse.redirect(new URL("/dashboard", req.url)),
      cookiesToSet,
    );
  }

  if (!isProtectedRoute) {
    return appendCookies(NextResponse.next(), cookiesToSet);
  }

  const { search } = req.nextUrl;

  if (isDashboardPath) {
    return appendCookies(NextResponse.next(), cookiesToSet);
  }

  // Allow super-admin system settings to resolve directly
  if (pathname.startsWith("/super-admin/system-settings")) {
    return appendCookies(NextResponse.next(), cookiesToSet);
  }

  if (looksRolePrefixed) {
    const normalized = remainder || "/dashboard";
    const rewriteTarget =
      normalized === "/dashboard" ? "/dashboard" : "/dashboard" + normalized;
    return appendCookies(
      NextResponse.redirect(new URL(rewriteTarget + search, req.url)),
      cookiesToSet,
    );
  }

  return appendCookies(NextResponse.next(), cookiesToSet);
}

export const config = {
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon\\.ico|service-worker\\.js|.*\\..*).*)",
  ],
};
