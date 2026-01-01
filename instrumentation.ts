import { reportError } from "@/lib/monitoring";

export async function register() {
  // Guard: process.on is not available in edge runtimes.
  const proc: any = globalThis.process as any;
  if (!proc || typeof proc.on !== "function") {
    return;
  }

  proc.on("unhandledRejection", (reason: unknown) => {
    void reportError(reason, { type: "unhandledRejection" });
  });

  proc.on("uncaughtException", (err: unknown) => {
    void reportError(err, { type: "uncaughtException" });
  });
}
