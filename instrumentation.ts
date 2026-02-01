import { reportError } from "@/lib/monitoring";

export const runtime = "nodejs";

export async function register() {
  // Edge runtime loads this file too; avoid Node-only APIs here.
  // If you need process-level hooks, move them to a custom Node server.
  return;
}
