import assert from "node:assert/strict";
import { parseCopilotQuestion } from "../../lib/copilot-ask.ts";
import { parseOwnerCopilotActionDraft } from "../../lib/owner-copilot-actions.ts";
import { runSuite } from "./test-utils.ts";

export async function runOwnerCopilotGoldenTests() {
  await runSuite("owner copilot golden questions", [
    {
      name: "maps known read-only questions to stable intents",
      fn: () => {
        assert.equal(parseCopilotQuestion("আজ লাভ কত?").type, "today_profit");
        assert.equal(parseCopilotQuestion("supplier payable কত?").type, "payables_total");
        assert.equal(parseCopilotQuestion("queue-তে কত token আছে?").type, "queue_pending");
        assert.equal(parseCopilotQuestion("low stock কোনগুলো?").type, "low_stock_list");
      },
    },
    {
      name: "keeps product and customer lookups in explicit intent buckets",
      fn: () => {
        const customer = parseCopilotQuestion("রহিমের কাছে কত বাকি?");
        const product = parseCopilotQuestion("ডালের stock কত?");

        assert.equal(customer.type, "customer_due");
        assert.equal(product.type, "product_query");
      },
    },
    {
      name: "separates write drafts from read-only question parsing",
      fn: () => {
        const readOnly = parseOwnerCopilotActionDraft("আজ দোকান কেমন চলছে?");
        const writeDraft = parseOwnerCopilotActionDraft("500 টাকা বিদ্যুৎ খরচ যোগ করো");

        assert.equal(readOnly, null);
        assert.ok(writeDraft);
      },
    },
  ]);
}
