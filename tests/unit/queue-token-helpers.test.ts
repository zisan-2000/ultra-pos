import assert from "node:assert/strict";
import {
  canCreateQueueToken,
  canPrintQueueToken,
  canUpdateQueueTokenStatus,
  canViewQueueBoard,
  formatQueueTokenLabel,
  resolveQueueTokenPrefix,
  sanitizeQueueTokenPrefix,
} from "../../lib/queue-token.ts";
import { runSuite } from "./test-utils.ts";

const baseUser = {
  id: "u1",
  email: "owner@example.com",
  name: "Owner",
  roles: ["owner"],
  permissions: [] as string[],
  staffShopId: null,
};

export async function runQueueTokenHelperTests() {
  await runSuite("queue-token helpers", [
    {
      name: "sanitizes token prefix to uppercase alnum with max length",
      fn: () => {
        const sanitized = sanitizeQueueTokenPrefix(" tk-2026_main! ");
        assert.equal(sanitized, "TK2026MAIN");
      },
    },
    {
      name: "falls back to default prefix when empty",
      fn: () => {
        assert.equal(resolveQueueTokenPrefix(null), "TK");
      },
    },
    {
      name: "formats token label with padded serial",
      fn: () => {
        assert.equal(formatQueueTokenLabel("q", 7), "Q-0007");
        assert.equal(formatQueueTokenLabel(undefined, 0), "TK-0001");
      },
    },
    {
      name: "permission checks for queue capabilities",
      fn: () => {
        const full = {
          ...baseUser,
          permissions: [
            "view_queue_board",
            "create_queue_token",
            "update_queue_token_status",
            "print_queue_token",
          ],
        };

        assert.equal(canViewQueueBoard(full), true);
        assert.equal(canCreateQueueToken(full), true);
        assert.equal(canUpdateQueueTokenStatus(full), true);
        assert.equal(canPrintQueueToken(full), true);

        assert.equal(canViewQueueBoard(baseUser), false);
        assert.equal(canCreateQueueToken(baseUser), false);
        assert.equal(canUpdateQueueTokenStatus(baseUser), false);
        assert.equal(canPrintQueueToken(baseUser), false);
      },
    },
  ]);
}
