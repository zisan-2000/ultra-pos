// lib/auth-client.ts

import { createAuthClient } from "better-auth/client";

const appUrl =
  (typeof window !== "undefined"
    ? window.location.origin
    : process.env.NEXT_PUBLIC_APP_URL) || "http://localhost:3000";

export const authClient = createAuthClient({
  baseURL: `${appUrl.replace(/\/$/, "")}/api/auth`,
});
