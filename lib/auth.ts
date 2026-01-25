// lib/auth.ts

import { randomUUID } from "crypto";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { jwt } from "better-auth/plugins";
import { prisma } from "@/lib/prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  secret: process.env.BETTER_AUTH_SECRET,

  // Add these two lines ↓↓↓↓↓
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  origins: [
    "http://localhost:3000",
    process.env.NEXT_PUBLIC_APP_URL!, // Production URL allowed
  ],

  session: {
    // Always validate sessions against the database (no cookie cache).
    cookieCache: { enabled: false },
  },

  emailAndPassword: {
    enabled: true,
  },

  plugins: [jwt()],
});

export type Auth = typeof auth;
