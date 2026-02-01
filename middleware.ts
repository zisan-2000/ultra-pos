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

  const session = hasBetterAuthCookie(req);
  const cookiesToSet: string[] = [];

  if (!session && isProtectedRoute && !isAuthPage) {
    return appendCookies(
      NextResponse.redirect(new URL("/login", req.url)),
      cookiesToSet
    );
  }

  if (session && isAuthPage) {
    return appendCookies(
      NextResponse.redirect(new URL("/dashboard", req.url)),
      cookiesToSet
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
      cookiesToSet
    );
  }

  return appendCookies(NextResponse.next(), cookiesToSet);
}

export const config = {
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon\\.ico|service-worker\\.js|service-worker|.*\\..*).*)",
  ],
};
