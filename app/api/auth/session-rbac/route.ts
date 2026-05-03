import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-session";

export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json({
      session: user
        ? {
            userId: user.id,
            actorUserId: user.actorUserId ?? user.id,
            effectiveUserId: user.effectiveUserId ?? user.id,
            sessionId: user.sessionId ?? null,
            isImpersonating: user.isImpersonating ?? false,
            impersonatedBy: user.impersonatedBy ?? null,
          }
        : null,
      user,
    });
  } catch (error) {
    console.error("session-rbac endpoint failed", error);
    return NextResponse.json({ session: null, user: null }, { status: 200 });
  }
}
