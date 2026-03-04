import { NextResponse } from "next/server";
import { runDailySmsSummaryJob } from "@/lib/sms-summary-jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const json = (payload: Record<string, unknown>, status = 200) =>
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

async function handleRequest(request: Request) {
  const secret = process.env.SMS_SUMMARY_CRON_SECRET || process.env.BILLING_CRON_SECRET;
  if (!secret && process.env.NODE_ENV !== "development") {
    return json(
      { ok: false, error: "SMS_SUMMARY_CRON_SECRET is not configured" },
      500
    );
  }

  if (!isAuthorized(request, secret)) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  const { searchParams } = new URL(request.url);
  const businessDate = searchParams.get("date") || undefined;
  const forceResend = searchParams.get("force") === "1";
  const dryRun = searchParams.get("dryRun") === "1";
  const limitRaw = searchParams.get("limit");
  const limit =
    limitRaw && Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : undefined;

  try {
    const result = await runDailySmsSummaryJob({
      now: new Date(),
      businessDate,
      forceResend,
      dryRun,
      limit,
    });

    return json({
      ok: true,
      ranAt: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "SMS summary cron failed";
    return json({ ok: false, error: message }, 500);
  }
}

export async function GET(request: Request) {
  return handleRequest(request);
}

export async function POST(request: Request) {
  return handleRequest(request);
}
