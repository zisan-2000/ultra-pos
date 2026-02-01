// middleware.ts
import { NextResponse, type NextRequest } from "next/server";

const hasBetterAuthCookie = (req: NextRequest) => {
  try {
    return req.cookies.getAll().some((c) => c.name.includes("better-auth"));
  } catch {
    return false;
  }
};

const appendCookies = (res: NextResponse, cookies: string[]) => {
  cookies.filter(Boolean).forEach((c) => res.headers.append("set-cookie", c));
  return res;
};

const withNoStore = (res: NextResponse) => {
  res.headers.set("Cache-Control", "no-store");
  return res;
};

const clearAuthCookies = (res: NextResponse, req: NextRequest) => {
  req.cookies
    .getAll()
    .filter((c) => c.name.includes("better-auth"))
    .forEach((c) => {
      res.cookies.set({
        name: c.name,
        value: "",
        path: "/",
        maxAge: 0,
      });
    });
  return res;
};

const fetchSession = async (req: NextRequest) => {
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;

  try {
    const url = new URL("/api/auth/session-rbac", req.nextUrl.origin);
    const res = await fetch(url, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.session?.userId ? data : null;
  } catch {
    return null;
  }
};

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  if (pathname.startsWith("/api/")) {
    const res = NextResponse.next();
    // Attach a request id for downstream tracing if not provided by the client.
    if (!req.headers.get("x-request-id")) {
      res.headers.set("x-request-id", crypto.randomUUID());
    }
    // Avoid caching API responses by default to protect sensitive data.
    res.headers.set("Cache-Control", "no-store");
    return res;
  }

  const isAuthPage =
    pathname.startsWith("/login") || pathname.startsWith("/register");
  const roleMatch = pathname.match(/^\/([A-Za-z0-9_-]+)(\/.*)?$/);
  const roleSlug = roleMatch?.[1] ?? null;
  const remainder = roleMatch?.[2] ?? "";
  const reserved = new Set([
    "dashboard",
    "login",
    "register",
    "api",
    "_next",
    "service-worker",
  ]);
  const looksRolePrefixed = Boolean(roleSlug && !reserved.has(roleSlug));
  const isDashboardPath =
    pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const isProtectedRoute = isDashboardPath || looksRolePrefixed;

  if (!isAuthPage && !isProtectedRoute) {
    return NextResponse.next();
  }

  const hasSessionCookie = hasBetterAuthCookie(req);
  const session = hasSessionCookie ? await fetchSession(req) : null;
  const cookiesToSet: string[] = [];

  if (!session && isProtectedRoute && !isAuthPage) {
    const res = NextResponse.redirect(new URL("/login", req.url));
    return appendCookies(withNoStore(clearAuthCookies(res, req)), cookiesToSet);
  }

  if (session && isAuthPage) {
    return appendCookies(
      withNoStore(NextResponse.redirect(new URL("/dashboard", req.url))),
      cookiesToSet
    );
  }

  if (!isProtectedRoute) {
    return appendCookies(withNoStore(NextResponse.next()), cookiesToSet);
  }

  const { search } = req.nextUrl;

  if (isDashboardPath) {
    return appendCookies(withNoStore(NextResponse.next()), cookiesToSet);
  }

  // Allow super-admin system settings to resolve directly
  if (pathname.startsWith("/super-admin/system-settings")) {
    return appendCookies(withNoStore(NextResponse.next()), cookiesToSet);
  }

  if (looksRolePrefixed) {
    const normalized = remainder || "/dashboard";
    const rewriteTarget =
      normalized === "/dashboard" ? "/dashboard" : "/dashboard" + normalized;
    return appendCookies(
      withNoStore(NextResponse.redirect(new URL(rewriteTarget + search, req.url))),
      cookiesToSet
    );
  }

  return appendCookies(withNoStore(NextResponse.next()), cookiesToSet);
}

export const config = {
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon\\.ico|service-worker\\.js|service-worker|.*\\..*).*)",
  ],
};
