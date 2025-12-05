// lib/auth/session.ts

import { auth } from "./index";

export async function getSession() {
  return await auth.api.getSession();
}

export async function requireUser() {
  const session = await getSession();
  if (!session?.user) throw new Error("Not authenticated");
  return session.user;
}
