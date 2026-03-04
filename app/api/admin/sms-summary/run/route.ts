import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-session";
import { runDailySmsSummaryJob } from "@/lib/sms-summary-jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseBodySafe(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function handleRequest(request: Request) {
  const user = await requireUser();
  const isSuperAdmin = user.roles?.includes("super_admin") ?? false;
  if (!isSuperAdmin) {
    return NextResponse.json(
      { ok: false, error: "Only super admin can run SMS summary job" },
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  const queryDate = url.searchParams.get("date") || undefined;
  const queryForce = url.searchParams.get("force") === "1";
  const queryDryRun = url.searchParams.get("dryRun") === "1";
  const queryLimitRaw = url.searchParams.get("limit");
  const queryLimit =
    queryLimitRaw && Number.isFinite(Number(queryLimitRaw))
      ? Number(queryLimitRaw)
      : undefined;

  let body: Record<string, unknown> = {};
  if (request.method === "POST") {
    const raw = await request.text();
    body = parseBodySafe(raw);
  }

  const date =
    typeof body.businessDate === "string" && body.businessDate.trim()
      ? body.businessDate.trim()
      : queryDate;
  const forceResend =
    typeof body.forceResend === "boolean" ? body.forceResend : queryForce;
  const dryRun = typeof body.dryRun === "boolean" ? body.dryRun : queryDryRun;
  const limit =
    typeof body.limit === "number" && Number.isFinite(body.limit)
      ? body.limit
      : queryLimit;

  try {
    const result = await runDailySmsSummaryJob({
      now: new Date(),
      businessDate: date,
      forceResend,
      dryRun,
      limit,
    });
    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "SMS summary run failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handleRequest(request);
}

export async function POST(request: Request) {
  return handleRequest(request);
}
