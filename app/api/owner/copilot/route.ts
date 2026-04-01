import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-session";
import { getOwnerCopilotPayload } from "@/lib/owner-copilot-server";
import { withTracing } from "@/lib/tracing";

export async function GET(req: Request) {
  return withTracing(req, "/api/owner/copilot", async () => {
    try {
      const { searchParams } = new URL(req.url);
      const shopId = searchParams.get("shopId");

      if (!shopId) {
        return NextResponse.json({ error: "shopId missing" }, { status: 400 });
      }

      const user = await requireUser();
      const payload = await getOwnerCopilotPayload(shopId, user);

      return NextResponse.json(
        {
          ...payload,
          generatedAt: new Date().toISOString(),
        },
        {
          status: 200,
          headers: {
            "Cache-Control": "private, no-store",
          },
        }
      );
    } catch (error) {
      console.error("owner copilot route error", error);
      return NextResponse.json(
        { error: "Failed to load owner copilot" },
        { status: 500 }
      );
    }
  });
}
