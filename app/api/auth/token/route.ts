import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET(req: Request) {
  const cookieHeader = req.headers.get("cookie") ?? "";

  try {
    const result: any = await (auth as any).api?.getToken?.({
      headers: { cookie: cookieHeader },
    });
    const token = result?.data?.token ?? result?.token ?? null;

    if (typeof token !== "string" || token.length === 0) {
      return NextResponse.json(
        { token: null, error: "Unauthorized" },
        {
          status: 401,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    return NextResponse.json(
      { token },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch {
    return NextResponse.json(
      { token: null, error: "Unauthorized" },
      {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
