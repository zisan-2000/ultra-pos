import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { reportError } from "@/lib/monitoring";

type TraceContext = {
  requestId: string;
};

export async function withTracing<T>(
  req: Request,
  label: string,
  fn: (ctx: TraceContext) => Promise<T>,
): Promise<T> {
  const requestId = req.headers.get("x-request-id") || randomUUID();
  const start = Date.now();

  try {
    const result = await fn({ requestId });
    if (result instanceof NextResponse) {
      result.headers.set("x-request-id", requestId);
    }
    return result;
  } catch (error) {
    await reportError(error, { route: label, requestId });
    throw error;
  } finally {
    const duration = Date.now() - start;
    console.info(`[trace] ${label} requestId=${requestId} duration=${duration}ms`);
  }
}
