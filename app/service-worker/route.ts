import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

// Cache the service worker script in-memory to avoid per-request disk reads.
const swPath = join(process.cwd(), "app/service-worker.js");
const swSource = readFileSync(swPath, "utf8");

export function GET() {
  return new NextResponse(swSource, {
    headers: {
      "Content-Type": "application/javascript",
      // Ensure the browser checks for SW updates on each navigation.
      "Cache-Control": "no-cache, max-age=0, must-revalidate",
      "Service-Worker-Allowed": "/",
    },
  });
}
