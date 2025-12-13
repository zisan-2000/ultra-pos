// middleware.ts
import { NextResponse, type NextRequest } from "next/server";

const toRoleBasePath = (role: string | null | undefined) => {
  if (!role) return "/dashboard";
  return `/${role.replace(/_/g, "-")}`;
};

const resolveBasePath = (roles: string[] | null | undefined) => {
  if (!roles || roles.length === 0) return "/dashboard";
  if (roles.includes("super_admin")) return "/super-admin";
  return toRoleBasePath(roles[0]);
};

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

async function getRbacUser(req: NextRequest) {
  try {
    const res = await fetch(new URL("/api/rbac/me", req.url), {
      method: "GET",
      headers: {
        cookie: req.headers.get("cookie") ?? "",
      },
      cache: "no-store",
    });
    const setCookie = res.headers.get("set-cookie");
    const data = res.ok ? await res.json() : null;
    return { user: data?.user || null, setCookie };
  } catch (error) {
    console.error("RBAC lookup failed in middleware", error);
    return { user: null, setCookie: null };
  }
}

const appendCookies = (res: NextResponse, cookies: Array<string | null>) => {
  cookies.filter(Boolean).forEach((c) => {
    if (c) res.headers.append("set-cookie", c);
  });
  return res;
};

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
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

  const { session, setCookie: sessionCookie } = await getSession(req);

  const cookiesToSet: Array<string | null> = [];
  if (sessionCookie) cookiesToSet.push(sessionCookie);

  if (!session && isProtectedRoute && !isAuthPage) {
    return appendCookies(
      NextResponse.redirect(new URL("/login", req.url)),
      cookiesToSet,
    );
  }

  if (session && isAuthPage) {
    const { user, setCookie } = await getRbacUser(req);
    if (setCookie) cookiesToSet.push(setCookie);
    const basePath = resolveBasePath(user?.roles ?? []);
    const target = `${basePath}/dashboard`;
    return appendCookies(NextResponse.redirect(new URL(target, req.url)), cookiesToSet);
  }

  if (!isProtectedRoute) {
    return appendCookies(NextResponse.next(), cookiesToSet);
  }

  const { search } = req.nextUrl;

  if (isDashboardPath) {
    // If user has a role-prefixed base path, normalize /dashboard to that base.
    if (pathname === "/dashboard" && session) {
      const { user, setCookie } = await getRbacUser(req);
      if (setCookie) cookiesToSet.push(setCookie);
      const basePath = resolveBasePath(user?.roles ?? []);
      if (basePath !== "/dashboard") {
        const target = `${basePath}/dashboard${search}`;
        return appendCookies(NextResponse.redirect(new URL(target, req.url)), cookiesToSet);
      }
    }
    return appendCookies(NextResponse.next(), cookiesToSet);
  }

  if (looksRolePrefixed) {
    const normalized = remainder || "/dashboard";
    const rewriteTarget =
      normalized === "/dashboard" ? "/dashboard" : "/dashboard" + normalized;
    return appendCookies(
      NextResponse.rewrite(new URL(rewriteTarget + search, req.url)),
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
