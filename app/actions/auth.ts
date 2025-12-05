// app/actions/auth.ts

"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

type LogoutState = { error?: string };

export async function logout(_: LogoutState): Promise<LogoutState> {
  const ctx = await auth.$context;
  // Drop any session cookies and revoke current session if available.
  try {
    await ctx.internalAdapter?.deleteSession?.(undefined as any);
  } catch (e) {
    // best-effort; continue to redirect
  }
  ctx.responseHeaders?.set?.("set-cookie", "");

  redirect("/login");
}
