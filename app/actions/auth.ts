// app/actions/auth.ts

"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";

type LogoutState = { error?: string };

export async function logout(_: LogoutState): Promise<LogoutState> {
  const ctx = await auth.$context;
  const cookieStore = await cookies();

  try {
    const cookieHeader = cookieStore
      .getAll()
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");

    const baseURL =
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

  for (const def of cookieDefs) {
    const options = def!.options ?? {};
    const { sameSite: rawSameSite, prefix: _prefix, ...rest } =
      options as Record<string, unknown>;
    let normalizedSameSite: "lax" | "strict" | "none" | undefined;
    if (typeof rawSameSite === "string") {
      const lowered = rawSameSite.toLowerCase();
      if (lowered === "lax" || lowered === "strict" || lowered === "none") {
        normalizedSameSite = lowered;
      }
    } else if (rawSameSite === true) {
      normalizedSameSite = "lax";
    }
    cookieStore.set(def!.name, "", {
      ...(rest as Record<string, unknown>),
      ...(normalizedSameSite ? { sameSite: normalizedSameSite } : {}),
      maxAge: 0,
    });
  }

  // Fallback cleanup for any leftover better-auth cookies.
  cookieStore
    .getAll()
    .filter((cookie) => cookie.name.includes("better-auth"))
    .forEach((cookie) => cookieStore.set({ name: cookie.name, value: "", maxAge: 0 }));

  redirect("/login");
}
