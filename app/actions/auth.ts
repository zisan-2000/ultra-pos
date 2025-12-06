// app/actions/auth.ts

"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";

type LogoutState = { error?: string };

export async function logout(_: LogoutState): Promise<LogoutState> {
  const ctx = await auth.$context;

  // Best-effort server-side sign out using the BetterAuth endpoint so cookies get cleared.
  try {
    const cookieHeader = (await cookies())
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
    });
  } catch (e) {
    // best-effort; continue to redirect
  }

  redirect("/login");
}
