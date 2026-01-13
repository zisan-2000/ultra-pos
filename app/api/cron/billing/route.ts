import { NextResponse } from "next/server";
import { runBillingDailyJob } from "@/lib/billing-jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const buildResponse = (
  payload: Record<string, unknown>,
  status = 200,
) =>
  NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });

const isAuthorized = (request: Request, secret: string | undefined) => {
  if (!secret) {
    return process.env.NODE_ENV === "development";
  }

  const authHeader = request.headers.get("authorization") || "";
  if (authHeader === `Bearer ${secret}`) return true;

  const cronHeader = request.headers.get("x-cron-secret") || "";
  return cronHeader === secret;
};

const handleRequest = async (request: Request) => {
  const secret = process.env.BILLING_CRON_SECRET;
  if (!secret && process.env.NODE_ENV !== "development") {
    return buildResponse(
      { ok: false, error: "BILLING_CRON_SECRET is not configured" },
      500,
    );
  }

  if (!isAuthorized(request, secret)) {
    return buildResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  try {
    const result = await runBillingDailyJob(new Date());
    return buildResponse({
      ok: true,
      ranAt: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Billing job failed";
    return buildResponse({ ok: false, error: message }, 500);
  }
};

export async function GET(request: Request) {
  return handleRequest(request);
}

export async function POST(request: Request) {
  return handleRequest(request);
}
