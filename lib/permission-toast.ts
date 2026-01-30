import { toast } from "sonner";

const PERMISSION_PREFIX = "forbidden: missing permission";
let lastToastAt = 0;

function getMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}

export function getMissingPermission(err: unknown): string | null {
  const message = getMessage(err).trim();
  if (!message) return null;
  const normalized = message.toLowerCase();
  if (!normalized.startsWith(PERMISSION_PREFIX)) return null;
  const parts = message.split(" ");
  const permission = parts[parts.length - 1];
  return permission || null;
}

export function handlePermissionError(err: unknown): boolean {
  const message = getMessage(err).trim();
  if (!message) return false;
  const normalized = message.toLowerCase();
  const isForbidden = normalized.startsWith("forbidden");
  const isMissingPermission = normalized.includes("missing permission");
  if (!isForbidden && !isMissingPermission) return false;

  const now = Date.now();
  if (now - lastToastAt < 1200) return true;
  lastToastAt = now;
  toast.error("এই কাজের অনুমতি নেই।");
  return true;
}
