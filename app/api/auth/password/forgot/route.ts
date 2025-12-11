import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

const RESET_TYPE = "password_reset";
const EXPIRY_MINUTES = 30;

type ForgotRequest = { email?: string };

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: Request) {
  try {
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

    const token = crypto.randomBytes(32).toString("hex");
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

    // In production, you would send an email. For now, only expose in non-production for easier testing.
    const baseURL =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
      "http://localhost:3000";
    const resetUrl = `${baseURL}/reset-password?token=${token}`;

    return NextResponse.json({
      success: true,
      ...(process.env.NODE_ENV !== "production" ? { resetUrl } : {}),
    });
  } catch (error) {
    return NextResponse.json({ success: true });
  }
}
