// middleware.ts
import { NextResponse, type NextRequest } from "next/server";

const RESERVED_SLUGS = new Set([
  "dashboard",
  "login",
  "register",
  "offline",
  "api",
  "_next",
  "service-worker",
]);

const hasBetterAuthCookie = (req: NextRequest) => {
  try {
    return req.cookies.getAll().some((c) => c.name.includes("better-auth"));
  } catch {
    return false;
  }
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

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const { search } = req.nextUrl;
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

  // Backward-compatible shortcut routes.
  if (pathname === "/sales" || pathname.startsWith("/sales/")) {
    const suffix = pathname.slice("/sales".length);
    return NextResponse.redirect(
      new URL(`/dashboard/sales${suffix}${search}`, req.url)
    );
  }

  const roleMatch = pathname.match(/^\/([A-Za-z0-9_-]+)(\/.*)?$/);
  const roleSlug = roleMatch?.[1] ?? null;
  const remainder = roleMatch?.[2] ?? "";
  const looksRolePrefixed = Boolean(roleSlug && !RESERVED_SLUGS.has(roleSlug));
  const isDashboardPath =
    pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const isProtectedRoute = isDashboardPath || looksRolePrefixed;

  if (!isAuthPage && !isProtectedRoute) {
    return NextResponse.next();
  }

  if (isAuthPage) {
    return NextResponse.next();
  }

  if (!hasBetterAuthCookie(req)) {
    const res = NextResponse.redirect(new URL("/login", req.url));
    return clearAuthCookies(res, req);
  }

  if (isDashboardPath) {
    return NextResponse.next();
  }

  // Allow super-admin system settings to resolve directly
  if (pathname.startsWith("/super-admin/system-settings")) {
    return NextResponse.next();
  }

  if (looksRolePrefixed) {
    const normalized = remainder || "/dashboard";
    const rewriteTarget =
      normalized === "/dashboard" ? "/dashboard" : "/dashboard" + normalized;
    return NextResponse.redirect(new URL(rewriteTarget + search, req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon\\.ico|service-worker\\.js|service-worker|.*\\..*).*)",
  ],
};
