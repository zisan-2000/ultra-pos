// app/actions/auth.ts

"use server";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { auth } from "@/lib/auth";

type LogoutState = { error?: string };

export async function logout(_: LogoutState): Promise<LogoutState> {
  const ctx = await auth.$context;
  const cookieStore = await cookies();
  const headerStore = await headers();
  const host = headerStore.get("host") || "";
  const proto =
    headerStore.get("x-forwarded-proto") ||
    (ctx.baseURL?.startsWith("https://") ? "https" : "http");

  try {
    const cookieHeader = cookieStore
      .getAll()
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");

    const baseURL =
      (host ? `${proto}://${host}` : undefined) ||
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
      ctx.baseURL?.replace(/\/$/, "") ||
      "http://localhost:3000";

    await fetch(`${baseURL}/api/auth/sign-out`, {
      method: "POST",
      headers: {
        cookie: cookieHeader,
        "content-type": "application/json",
      },
      body: "{}",
      cache: "no-store",
    });
  } catch (e) {
    // best-effort; continue to redirect
  }

  // Ensure auth cookies are cleared on the response we send back to the browser.
  const authCookies = ctx.authCookies;
  const cookieDefs = [
    authCookies?.sessionToken,
    authCookies?.sessionData,
    authCookies?.accountData,
    authCookies?.dontRememberToken,
  ].filter(Boolean);

  const expandCookieNames = (name: string) => {
    if (name.startsWith("__Secure-")) {
      return [name, name.replace(/^__Secure-/, "")];
    }
    return [name, `__Secure-${name}`];
  };

  const normalizeSameSite = (
    raw: unknown
  ): "lax" | "strict" | "none" | undefined => {
    if (typeof raw === "string") {
      const lowered = raw.toLowerCase();
      if (lowered === "lax" || lowered === "strict" || lowered === "none") {
        return lowered;
      }
      return undefined;
    }
    if (raw === true) return "lax";
    return undefined;
  };

  const domainVariants: (string | undefined)[] = [undefined];
  if (host && !host.includes("localhost") && host.includes(".")) {
    const baseDomain = host.split(":")[0];
    domainVariants.push(baseDomain);
    domainVariants.push(`.${baseDomain}`);
  }

  for (const def of cookieDefs) {
    const options = def!.options ?? {};
    const { sameSite: rawSameSite, prefix: _prefix, ...rest } =
      options as Record<string, unknown>;
    const normalizedSameSite = normalizeSameSite(rawSameSite);
    const secure =
      typeof options.secure === "boolean"
        ? options.secure
        : proto === "https" || def!.name.startsWith("__Secure-");

    const names = expandCookieNames(def!.name);
    for (const name of names) {
      for (const domain of domainVariants) {
        cookieStore.set(name, "", {
          ...(rest as Record<string, unknown>),
          ...(normalizedSameSite ? { sameSite: normalizedSameSite } : {}),
          ...(domain ? { domain } : {}),
          secure: secure || name.startsWith("__Secure-"),
          path: "/",
          maxAge: 0,
        });
      }
    }
  }

  // Fallback cleanup for any leftover better-auth cookies.
  cookieStore
    .getAll()
    .filter((cookie) => cookie.name.includes("better-auth"))
    .forEach((cookie) => {
      const names = expandCookieNames(cookie.name);
      for (const name of names) {
        for (const domain of domainVariants) {
          cookieStore.set(name, "", {
            ...(domain ? { domain } : {}),
            secure: proto === "https" || name.startsWith("__Secure-"),
            path: "/",
            maxAge: 0,
          });
        }
      }
    });

  redirect("/login");
}
