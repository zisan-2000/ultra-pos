import assert from "node:assert/strict";
import {
  getOwnerCopilotActionClarification,
  parseOwnerCopilotActionDraft,
} from "../../lib/owner-copilot-actions.ts";
import { getOwnerCopilotActionSuggestions } from "../../lib/owner-copilot-action-planner.ts";
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
    {
      name: "creates due collection draft from natural prompt",
      fn: () => {
        const draft = parseOwnerCopilotActionDraft("রহিমের 500 টাকা বাকি নাও");

        assert.ok(draft);
        assert.equal(draft?.kind, "due_collection");
        if (draft?.kind === "due_collection") {
          assert.equal(draft.customerName, "রহিম");
          assert.equal(draft.amount, "500");
        }
      },
    },
    {
      name: "creates supplier payment draft from natural prompt",
      fn: () => {
        const draft = parseOwnerCopilotActionDraft(
          "করিম supplier-কে 800 টাকা payment করো"
        );

        assert.ok(draft);
        assert.equal(draft?.kind, "supplier_payment");
        if (draft?.kind === "supplier_payment") {
          assert.equal(draft.supplierName, "করিম");
          assert.equal(draft.amount, "800");
        }
      },
    },
    {
      name: "creates stock adjustment draft from natural prompt",
      fn: () => {
        const draft = parseOwnerCopilotActionDraft("চিনির stock 25 করো");

        assert.ok(draft);
        assert.equal(draft?.kind, "stock_adjustment");
        if (draft?.kind === "stock_adjustment") {
          assert.equal(draft.productQuery, "চিনি");
          assert.equal(draft.targetStock, "25");
        }
      },
    },
    {
      name: "creates customer create draft from natural prompt",
      fn: () => {
        const draft = parseOwnerCopilotActionDraft("নতুন customer রহিম যোগ করো");

        assert.ok(draft);
        assert.equal(draft?.kind, "create_customer");
        if (draft?.kind === "create_customer") {
          assert.equal(draft.name, "রহিম");
        }
      },
    },
    {
      name: "creates supplier create draft from natural prompt",
      fn: () => {
        const draft = parseOwnerCopilotActionDraft(
          "নতুন supplier করিম ট্রেডার্স যোগ করো"
        );

        assert.ok(draft);
        assert.equal(draft?.kind, "create_supplier");
        if (draft?.kind === "create_supplier") {
          assert.equal(draft.name, "করিম ট্রেডার্স");
        }
      },
    },
    {
      name: "creates product create draft from natural prompt",
      fn: () => {
        const draft = parseOwnerCopilotActionDraft(
          "নতুন product চিনি 120 টাকা দামে যোগ করো"
        );

        assert.ok(draft);
        assert.equal(draft?.kind, "create_product");
        if (draft?.kind === "create_product") {
          assert.equal(draft.name, "চিনি");
          assert.equal(draft.sellPrice, "120");
        }
      },
    },
    {
      name: "creates due entry draft from natural prompt",
      fn: () => {
        const draft = parseOwnerCopilotActionDraft(
          "রহিমের নামে 300 টাকা বাকি যোগ করো"
        );

        assert.ok(draft);
        assert.equal(draft?.kind, "due_entry");
        if (draft?.kind === "due_entry") {
          assert.equal(draft.customerName, "রহিম");
          assert.equal(draft.amount, "300");
        }
      },
    },
    {
      name: "creates sale void draft from natural prompt",
      fn: () => {
        const draft = parseOwnerCopilotActionDraft("INV-1001 invoice void করো");

        assert.ok(draft);
        assert.equal(draft?.kind, "void_sale");
        if (draft?.kind === "void_sale") {
          assert.equal(draft.saleQuery, "INV-1001");
        }
      },
    },
    {
      name: "returns clarification for incomplete stock adjustment prompt",
      fn: () => {
        const clarification = getOwnerCopilotActionClarification("চিনির stock update করো");

        assert.ok(clarification);
        assert.match(clarification?.answer ?? "", /target stock/i);
      },
    },
    {
      name: "returns clarification for incomplete supplier payment prompt",
      fn: () => {
        const clarification = getOwnerCopilotActionClarification(
          "করিম supplier-কে payment করো"
        );

        assert.ok(clarification);
        assert.match(clarification?.answer ?? "", /amount/i);
      },
    },
    {
      name: "returns confirmed suggestions for stock adjustment follow-up",
      fn: () => {
        const draft = parseOwnerCopilotActionDraft("চিনির stock 25 করো");
        assert.ok(draft && draft.kind === "stock_adjustment");
        if (!draft || draft.kind !== "stock_adjustment") return;

        const suggestions = getOwnerCopilotActionSuggestions(draft, "confirmed");

        assert.ok(suggestions.some((item) => /stock/i.test(item) || /inventory/i.test(item)));
      },
    },
  ]);
}
