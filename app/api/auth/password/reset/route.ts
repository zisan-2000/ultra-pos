import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";

const RESET_TYPE = "password_reset";

type ResetRequest = { token?: string; password?: string };

function validatePassword(password: string) {
  if (!password || password.length < 8) {
    throw new Error("পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে");
  }

  const checks = [
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];

  if (checks.filter(Boolean).length < 3) {
    throw new Error(
      "বড়-ছোট হাতের অক্ষর, সংখ্যা ও বিশেষ অক্ষরের যেকোনো তিনটি থাকতে হবে"
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ResetRequest;
    const token = body.token?.trim();
    const password = body.password?.trim() ?? "";

    if (!token || !password) {
      return NextResponse.json(
        { success: false, error: "টোকেন বা পাসওয়ার্ড অনুপস্থিত" },
        { status: 400 }
      );
    }

    validatePassword(password);

    const verification = await prisma.verification.findUnique({
      where: { token },
      select: {
        id: true,
        userId: true,
        identifier: true,
        expiresAt: true,
        type: true,
      },
    });

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
