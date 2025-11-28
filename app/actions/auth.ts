// app/actions/auth.ts

"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClientForRoute } from "@/lib/supabase";

type LogoutState = { error?: string };

export async function logout(_: LogoutState): Promise<LogoutState> {
  const cookieStore = await cookies();
  const supabase = createServerClientForRoute(cookieStore);

  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("Logout failed", error);
    return { error: "Logout failed. Please try again." };
  }

  redirect("/login");
}
