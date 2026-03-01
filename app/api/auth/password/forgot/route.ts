import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { rateLimit } from "@/lib/rate-limit";
import {
  canSendPasswordResetEmail,
  sendPasswordResetEmail,
} from "@/lib/email/password-reset";

const RESET_TYPE = "password_reset";
const EXPIRY_MINUTES = 30;
const COOLDOWN_SECONDS = 60;

type ForgotRequest = { email?: string };

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function buildBaseUrl(req: Request) {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (envUrl) return envUrl;

  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (!host) return "http://localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") || "http";
  return `${proto}://${host}`.replace(/\/$/, "");
}

function hashResetToken(rawToken: string) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export async function POST(req: Request) {
  try {
    const rl = await rateLimit(req, {
      windowMs: 10 * 60_000,
      max: 10,
      keyPrefix: "auth-forgot-password",
    });
    if (rl.limited) {
      return NextResponse.json({ success: true }, { headers: rl.headers });
    }

    const body = (await req.json()) as ForgotRequest;
    const email = body.email?.trim().toLowerCase();

    if (!email || !isValidEmail(email)) {
      // Always return success to avoid enumeration.
      return NextResponse.json({ success: true });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ success: true });
    }

    const lastReset = await prisma.verification.findFirst({
      where: { userId: user.id, type: RESET_TYPE },
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    if (lastReset) {
      const ageMs = Date.now() - lastReset.createdAt.getTime();
      if (ageMs < COOLDOWN_SECONDS * 1000) {
        return NextResponse.json({ success: true });
      }
    }

    const rawToken = crypto.randomBytes(32).toString("base64url");
    const token = hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000);

    await prisma.$transaction([
      prisma.verification.deleteMany({
        where: { userId: user.id, type: RESET_TYPE },
      }),
      prisma.verification.create({
        data: {
          token,
          identifier: email,
          type: RESET_TYPE,
          expiresAt,
          userId: user.id,
        },
      }),
    ]);

    const baseURL = buildBaseUrl(req);
    const resetUrl = `${baseURL}/reset-password?token=${encodeURIComponent(rawToken)}`;

    if (canSendPasswordResetEmail()) {
      try {
        await sendPasswordResetEmail({
          toEmail: email,
          resetUrl,
          expiresInMinutes: EXPIRY_MINUTES,
        });
      } catch (error) {
        console.error("Failed to send password reset email", error);
      }
    }

    return NextResponse.json({
      success: true,
      ...(process.env.NODE_ENV !== "production" && !canSendPasswordResetEmail()
        ? { resetUrl }
        : {}),
    });
  } catch (error) {
    console.error("Forgot password request failed", error);
    return NextResponse.json({ success: true });
  }
}
