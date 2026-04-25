import assert from "node:assert/strict";
import { parseOwnerCopilotActionDraft } from "../../lib/owner-copilot-actions.ts";
import { runSuite } from "./test-utils.ts";

export async function runOwnerCopilotActionTests() {
  await runSuite("owner copilot actions", [
    {
      name: "creates expense draft from natural Bangla prompt",
      fn: () => {
        const draft = parseOwnerCopilotActionDraft("500 টাকা বিদ্যুৎ খরচ যোগ করো");

        assert.ok(draft);
        assert.equal(draft?.kind, "expense");
        assert.equal(draft?.amount, "500");
        assert.match(draft?.confirmationText ?? "", /500/);
      },
    },
    {
      name: "creates cash in draft from natural prompt",
      fn: () => {
        const draft = parseOwnerCopilotActionDraft("ক্যাশ ইন 1200 বিকাশ");

        assert.ok(draft);
        assert.equal(draft?.kind, "cash_entry");
        if (draft?.kind === "cash_entry") {
          assert.equal(draft.entryType, "IN");
          assert.equal(draft.amount, "1200");
        }
      },
    },
    {
      name: "creates cash out draft from natural prompt",
      fn: () => {
        const draft = parseOwnerCopilotActionDraft("ক্যাশ আউট 300 বাজার");

        assert.ok(draft);
        assert.equal(draft?.kind, "cash_entry");
        if (draft?.kind === "cash_entry") {
          assert.equal(draft.entryType, "OUT");
          assert.equal(draft.amount, "300");
        }
      },
    },
    {
      name: "does not create draft for read-only questions",
      fn: () => {
        const draft = parseOwnerCopilotActionDraft("আজ বিক্রি কত?");
        assert.equal(draft, null);
      },
    },
  ]);
}
