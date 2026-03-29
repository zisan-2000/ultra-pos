import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { assertStrongPassword } from "@/lib/password-policy";
import crypto from "crypto";
import { rateLimit } from "@/lib/rate-limit";

const RESET_TYPE = "password_reset";

type ResetRequest = { token?: string; password?: string };

function hashResetToken(rawToken: string) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export async function POST(req: Request) {
  try {
    const rl = await rateLimit(req, {
      windowMs: 10 * 60_000,
      max: 20,
      keyPrefix: "auth-reset-password",
    });
    if (rl.limited) {
      return NextResponse.json(
        { success: false, error: "অনেকবার চেষ্টা হয়েছে, একটু পরে আবার চেষ্টা করুন" },
        { status: 429, headers: rl.headers }
      );
    }

    const body = (await req.json()) as ResetRequest;
    const token = body.token?.trim();
    const password = body.password?.trim() ?? "";

    if (!token || !password) {
      return NextResponse.json(
        { success: false, error: "টোকেন বা পাসওয়ার্ড অনুপস্থিত" },
        { status: 400 }
      );
    }

    assertStrongPassword(password);
    const hashedToken = hashResetToken(token);

    let verification = await prisma.verification.findUnique({
      where: { token: hashedToken },
      select: {
        id: true,
        userId: true,
        identifier: true,
        expiresAt: true,
        type: true,
      },
    });

    // Backward compatibility for links issued before token hashing rollout.
    if (!verification) {
      verification = await prisma.verification.findUnique({
        where: { token },
        select: {
          id: true,
          userId: true,
          identifier: true,
          expiresAt: true,
          type: true,
        },
      });
    }

    if (
      !verification ||
      verification.type !== RESET_TYPE ||
      verification.expiresAt.getTime() < Date.now() ||
      verification.userId === null
    ) {
      return NextResponse.json(
        { success: false, error: "লিঙ্কটি অবৈধ বা মেয়াদোত্তীর্ণ" },
        { status: 400 }
      );
    }

    const userId = verification.userId;

    const newHash = await hashPassword(password);

    await prisma.$transaction([
      prisma.account.updateMany({
        where: { userId, providerId: "credential" },
        data: { password: newHash },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newHash },
      }),
      prisma.session.deleteMany({ where: { userId } }),
      prisma.verification.deleteMany({
        where: { userId, type: RESET_TYPE },
      }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "পাসওয়ার্ড রিসেট ব্যর্থ হয়েছে";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
