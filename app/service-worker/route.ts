import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

export function GET() {
  const filePath = join(process.cwd(), "app/service-worker.js");
  const sw = readFileSync(filePath, "utf8");

  return new NextResponse(sw, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
