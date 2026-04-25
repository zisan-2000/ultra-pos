import assert from "node:assert/strict";
import {
  getOwnerCopilotRuntimeConfig,
  isOwnerCopilotEnabledForContext,
} from "../../lib/owner-copilot-config.ts";
import { runSuite } from "./test-utils.ts";

function withEnv<T>(values: Record<string, string | undefined>, fn: () => T) {
  const snapshot = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    snapshot.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of snapshot.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

export async function runOwnerCopilotConfigTests() {
  await runSuite("owner copilot config", [
    {
      name: "returns enabled defaults",
      fn: () =>
        withEnv(
          {
            OWNER_COPILOT_ENABLED: undefined,
            OWNER_COPILOT_TOOLS_ENABLED: undefined,
            OWNER_COPILOT_ACTIONS_ENABLED: undefined,
            OWNER_COPILOT_ROLLOUT_PERCENT: undefined,
            OWNER_COPILOT_ALLOWED_USER_IDS: undefined,
            OWNER_COPILOT_ALLOWED_SHOP_IDS: undefined,
          },
          () => {
            const config = getOwnerCopilotRuntimeConfig();
            assert.equal(config.enabled, true);
            assert.equal(config.toolsEnabled, true);
            assert.equal(config.actionsEnabled, true);
            assert.equal(config.rolloutPercent, 100);
          }
        ),
    },
    {
      name: "blocks when master flag is disabled",
      fn: () =>
        withEnv(
          {
            OWNER_COPILOT_ENABLED: "0",
          },
          () => {
            const result = isOwnerCopilotEnabledForContext({
              userId: "user-1",
              shopId: "shop-1",
            });
            assert.equal(result.enabled, false);
            assert.equal(result.reason, "disabled");
          }
        ),
    },
    {
      name: "respects allowlists",
      fn: () =>
        withEnv(
          {
            OWNER_COPILOT_ENABLED: "1",
            OWNER_COPILOT_ALLOWED_USER_IDS: "user-allowed",
            OWNER_COPILOT_ALLOWED_SHOP_IDS: "shop-allowed",
          },
          () => {
            const blockedUser = isOwnerCopilotEnabledForContext({
              userId: "other-user",
              shopId: "shop-allowed",
            });
            const blockedShop = isOwnerCopilotEnabledForContext({
              userId: "user-allowed",
              shopId: "other-shop",
            });
            const allowed = isOwnerCopilotEnabledForContext({
              userId: "user-allowed",
              shopId: "shop-allowed",
            });

            assert.equal(blockedUser.enabled, false);
            assert.equal(blockedShop.enabled, false);
            assert.equal(allowed.enabled, true);
          }
        ),
    },
  ]);
}
