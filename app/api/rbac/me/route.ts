import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-session";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
}
