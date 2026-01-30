import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-session";
import { withTracing } from "@/lib/tracing";
import { getTodaySummaryForShop } from "@/lib/reports/today-summary";
import { jsonWithEtag } from "@/lib/http/etag";

export async function GET(req: Request) {
  return withTracing(req, "/api/reports/today-summary", async () => {
    try {
      const { searchParams } = new URL(req.url);
      const shopId = searchParams.get("shopId");

      if (!shopId) {
        return NextResponse.json({ error: "shopId missing" }, { status: 400 });
      }

      const user = await requireUser();
      const summary = await getTodaySummaryForShop(shopId, user);
      return jsonWithEtag(req, summary, {
        cacheControl: "private, no-store",
      });
    } catch (error) {
      console.error("today-summary error", error);
      return NextResponse.json(
        { error: "Failed to build summary" },
        { status: 500 }
      );
    }
  });
}
