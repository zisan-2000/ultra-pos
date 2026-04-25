function parseBoolean(rawValue: string | undefined, fallback: boolean) {
  if (rawValue == null || rawValue.trim() === "") return fallback;
  const normalized = rawValue.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parsePercent(rawValue: string | undefined, fallback = 100) {
  const numeric = Number(rawValue ?? fallback);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(100, Math.max(0, Math.round(numeric)));
}

function parseCsvSet(rawValue: string | undefined) {
  return new Set(
    String(rawValue ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function computeStablePercent(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 10_000;
  }
  return hash % 100;
}

export function getOwnerCopilotRuntimeConfig() {
  return {
    enabled: parseBoolean(process.env.OWNER_COPILOT_ENABLED, true),
    toolsEnabled: parseBoolean(process.env.OWNER_COPILOT_TOOLS_ENABLED, true),
    actionsEnabled: parseBoolean(process.env.OWNER_COPILOT_ACTIONS_ENABLED, true),
    rolloutPercent: parsePercent(process.env.OWNER_COPILOT_ROLLOUT_PERCENT, 100),
    allowedUserIds: parseCsvSet(process.env.OWNER_COPILOT_ALLOWED_USER_IDS),
    allowedShopIds: parseCsvSet(process.env.OWNER_COPILOT_ALLOWED_SHOP_IDS),
  };
}

export function isOwnerCopilotEnabledForContext({
  userId,
  shopId,
}: {
  userId: string;
  shopId: string;
}) {
  const config = getOwnerCopilotRuntimeConfig();
  if (!config.enabled) {
    return { enabled: false, reason: "disabled" as const, config };
  }

  if (config.allowedUserIds.size > 0 && !config.allowedUserIds.has(userId)) {
    return { enabled: false, reason: "user_not_allowlisted" as const, config };
  }

  if (config.allowedShopIds.size > 0 && !config.allowedShopIds.has(shopId)) {
    return { enabled: false, reason: "shop_not_allowlisted" as const, config };
  }

  const bucket = computeStablePercent(`${userId}:${shopId}`);
  if (bucket >= config.rolloutPercent) {
    return { enabled: false, reason: "rollout_blocked" as const, config };
  }

  return { enabled: true, reason: "enabled" as const, config };
}
