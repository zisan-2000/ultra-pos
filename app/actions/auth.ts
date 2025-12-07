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
      .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
      .join("; ");

    const baseURL =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
      ctx.baseURL?.replace(/\/$/, "") ||
      "http://localhost:3000";

    await fetch(`${baseURL}/api/auth/sign-out`, {
      method: "POST",
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });
  } catch (e) {
    // best-effort; continue to redirect
  }

  // Ensure auth cookies are cleared on the response we send back to the browser.
  cookieStore
    .getAll()
    .filter((cookie) => cookie.name.includes("better-auth"))
    .forEach((cookie) => cookieStore.delete(cookie.name));

  redirect("/login");
}
