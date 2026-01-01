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
      // Aggressive caching is safe; SW versioning is controlled via CACHE_NAME bump.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
