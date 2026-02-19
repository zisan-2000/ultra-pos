import assert from "node:assert/strict";
import {
  getQueueNextAction,
  getQueueOrderTypeLabel,
  getQueueStatusLabel,
  isQueueTerminalStatus,
  normalizeQueueOrderType,
  normalizeQueueStatus,
  resolveQueueWorkflowProfile,
  sanitizeQueueWorkflow,
} from "../../lib/queue-workflow.ts";
import { runSuite } from "./test-utils.ts";

export async function runQueueWorkflowTests() {
  await runSuite("queue workflow helpers", [
    {
      name: "sanitizes supported workflows and rejects unknown values",
      fn: () => {
    assert.equal(sanitizeQueueWorkflow(" restaurant "), "restaurant");
    assert.equal(sanitizeQueueWorkflow("salon"), "salon");
    assert.equal(sanitizeQueueWorkflow("other"), null);
      },
    },

    {
      name: "resolves workflow from business type when explicit workflow is absent",
      fn: () => {
    assert.equal(resolveQueueWorkflowProfile({ businessType: "Tea Restaurant" }), "restaurant");
    assert.equal(resolveQueueWorkflowProfile({ businessType: "Beauty Spa" }), 
      "salon"
    );
    assert.equal(resolveQueueWorkflowProfile({ businessType: "hardware" }), 
      "generic"
    );
      },
    },

    {
      name: "maps legacy queue status to normalized status",
      fn: () => {
    assert.equal(normalizeQueueStatus("in_kitchen"), "IN_PROGRESS");
    assert.equal(normalizeQueueStatus("served"), "DONE");
      },
    },

    {
      name: "throws for invalid queue status",
      fn: () => {
    assert.throws(
      () => normalizeQueueStatus("bad-status"),
      /Invalid queue token status/
    );
      },
    },

    {
      name: "normalizes order type aliases and falls back to workflow default",
      fn: () => {
    assert.equal(normalizeQueueOrderType("dinein", "restaurant"), "dine_in");
    assert.equal(normalizeQueueOrderType("home-service", "salon"), 
      "home_service"
    );
    assert.equal(normalizeQueueOrderType("invalid", "generic"), "onsite");
      },
    },

    {
      name: "returns readable labels and next actions for restaurant workflow",
      fn: () => {
    assert.equal(getQueueOrderTypeLabel("takeaway", "restaurant"), "টেকঅ্যাওয়ে");
    assert.equal(getQueueStatusLabel("IN_PROGRESS", "restaurant"), "কিচেনে");
    assert.deepEqual(getQueueNextAction("CALLED", "restaurant"), {
      status: "IN_PROGRESS",
      label: "কিচেনে পাঠান",
    });
      },
    },

    {
      name: "marks terminal statuses correctly",
      fn: () => {
    assert.equal(isQueueTerminalStatus("DONE"), true);
    assert.equal(isQueueTerminalStatus("CANCELLED"), true);
    assert.equal(isQueueTerminalStatus("WAITING"), false);
      },
    },
  ]);
}
