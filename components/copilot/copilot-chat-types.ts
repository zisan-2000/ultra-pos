import type { OwnerCopilotActionDraft } from "@/lib/owner-copilot-actions";

export type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export type AskResponse = {
  supported: boolean;
  answer: string;
  intent?: string;
  matchedCustomerName?: string | null;
  suggestions?: readonly string[];
  clarificationChoices?: readonly ClarificationChoice[];
  conversationId?: string;
  requiresConfirmation?: boolean;
  actionDraft?: OwnerCopilotActionDraft | null;
  engine?: string;
  provider?: string;
  model?: string;
  toolNames?: readonly string[];
  fallbackUsed?: boolean;
  responseMode?: ResponseMode;
};

export type ResponseMode = "auto" | "verified" | "fast";

export type AssistantTrace = {
  engine?: string;
  provider?: string;
  model?: string;
  toolNames?: readonly string[];
  fallbackUsed?: boolean;
  actionKind?: string;
  requiresConfirmation?: boolean;
  responseMode?: ResponseMode;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  trace?: AssistantTrace;
  clarificationChoices?: readonly ClarificationChoice[];
};

export type ClarificationChoice = {
  prompt: string;
  title: string;
  subtitle?: string;
  badge?: string;
  details?: ReadonlyArray<{
    label: string;
    value: string;
  }>;
};

export function buildMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const RESPONSE_MODE_STORAGE_KEY = "owner-copilot-response-mode";

export const RESPONSE_MODE_OPTIONS: Array<{
  value: ResponseMode;
  label: string;
  description: string;
}> = [
  {
    value: "auto",
    label: "Auto",
    description: "সবচেয়ে balanced অভিজ্ঞতা",
  },
  {
    value: "verified",
    label: "ডাটা দিয়ে যাচাই",
    description: "যেখানে সম্ভব shop data আগে দেখা হবে",
  },
  {
    value: "fast",
    label: "দ্রুত উত্তর",
    description: "সহজ প্রশ্নে দ্রুত উত্তরকে অগ্রাধিকার",
  },
];

export function getTraceStatusLabel(engine?: string) {
  switch (engine) {
    case "llm-tools":
    case "rule":
      return "ডাটা দিয়ে যাচাই করা";
    case "llm":
      return "AI উত্তর";
    case "action-draft":
      return "Confirm দরকার";
    case "action-confirm":
      return "কাজ সম্পন্ন";
    case "action-clarification":
      return "আরও তথ্য দরকার";
    case "blocked":
      return "এখন unavailable";
    default:
      return null;
  }
}

export function getThinkingLabel(
  pendingAction: OwnerCopilotActionDraft | null,
  responseMode: ResponseMode
) {
  if (pendingAction) return "Draft confirmation প্রস্তুত হচ্ছে...";
  if (responseMode === "verified") {
    return "দোকানের ডাটা দেখে উত্তর প্রস্তুত হচ্ছে...";
  }
  if (responseMode === "fast") {
    return "দ্রুত উত্তর প্রস্তুত হচ্ছে...";
  }
  return "প্রশ্ন, context আর ডাটা মিলিয়ে উত্তর প্রস্তুত হচ্ছে...";
}

export function hasBanglaText(value: string) {
  return /[ঀ-৿]/.test(value);
}

export function getVoiceAttemptLabel(lang?: string) {
  if (lang?.toLowerCase().startsWith("bn")) return "Bangla listening";
  if (lang?.toLowerCase().startsWith("en")) return "English fallback listening";
  return "Voice listening";
}

export function renderActionDetails(pendingAction: OwnerCopilotActionDraft) {
  if (pendingAction.kind === "expense") {
    return [
      { label: "Action", value: "Quick expense" },
      { label: "Amount", value: `৳ ${pendingAction.amount}` },
      { label: "Category", value: pendingAction.category },
      { label: "Note", value: pendingAction.note || "None" },
    ];
  }

  if (pendingAction.kind === "due_collection") {
    return [
      { label: "Action", value: "Due collection" },
      { label: "Customer", value: pendingAction.customerName },
      { label: "Amount", value: `৳ ${pendingAction.amount}` },
      { label: "Note", value: pendingAction.note || "None" },
    ];
  }

  if (pendingAction.kind === "due_entry") {
    return [
      { label: "Action", value: "Due entry" },
      { label: "Customer", value: pendingAction.customerName },
      { label: "Amount", value: `৳ ${pendingAction.amount}` },
      { label: "Note", value: pendingAction.note || "None" },
    ];
  }

  if (pendingAction.kind === "supplier_payment") {
    return [
      { label: "Action", value: "Supplier payment" },
      { label: "Supplier", value: pendingAction.supplierName },
      { label: "Amount", value: `৳ ${pendingAction.amount}` },
      { label: "Method", value: pendingAction.method || "cash" },
      { label: "Note", value: pendingAction.note || "None" },
    ];
  }

  if (pendingAction.kind === "stock_adjustment") {
    return [
      { label: "Action", value: "Stock adjustment" },
      { label: "Product", value: pendingAction.productQuery },
      { label: "Target stock", value: pendingAction.targetStock },
      { label: "Note", value: pendingAction.note || "None" },
    ];
  }

  if (pendingAction.kind === "product_price_update") {
    return [
      { label: "Action", value: "Price update" },
      { label: "Product", value: pendingAction.productQuery },
      { label: "New price", value: `৳ ${pendingAction.targetPrice}` },
      { label: "Note", value: pendingAction.note || "None" },
    ];
  }

  if (pendingAction.kind === "product_toggle_active") {
    return [
      { label: "Action", value: pendingAction.nextActiveState ? "Activate product" : "Deactivate product" },
      { label: "Product", value: pendingAction.productQuery },
      { label: "Next state", value: pendingAction.nextActiveState ? "Active" : "Inactive" },
    ];
  }

  if (pendingAction.kind === "void_sale") {
    return [
      { label: "Action", value: "Void sale" },
      { label: "Invoice", value: pendingAction.invoiceNo || pendingAction.saleQuery },
      { label: "Reason", value: pendingAction.note || "No reason" },
    ];
  }

  if (pendingAction.kind === "create_customer") {
    return [
      { label: "Action", value: "Create customer" },
      { label: "Name", value: pendingAction.name },
      { label: "Phone", value: pendingAction.phone || "None" },
    ];
  }

  if (pendingAction.kind === "create_supplier") {
    return [
      { label: "Action", value: "Create supplier" },
      { label: "Name", value: pendingAction.name },
      { label: "Phone", value: pendingAction.phone || "None" },
    ];
  }

  if (pendingAction.kind === "create_product") {
    return [
      { label: "Action", value: "Create product" },
      { label: "Name", value: pendingAction.name },
      { label: "Sell price", value: `৳ ${pendingAction.sellPrice}` },
      { label: "Category", value: pendingAction.category || "Uncategorized" },
      { label: "Base unit", value: pendingAction.baseUnit || "pcs" },
      { label: "Opening stock", value: pendingAction.stockQty || "0" },
    ];
  }

  return [
    { label: "Action", value: pendingAction.entryType === "IN" ? "Cash in" : "Cash out" },
    { label: "Amount", value: `৳ ${pendingAction.amount}` },
    { label: "Type", value: pendingAction.entryType },
    { label: "Reason", value: pendingAction.reason || "None" },
  ];
}

export function stopSpeaking() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
}

export type EditableField = {
  field: string;
  label: string;
  type: "text" | "number";
};

export type DraftFieldInfo = {
  actionLabel: string;
  readOnlyFields: Array<{ label: string; value: string }>;
  editableFields: EditableField[];
};

export function getDraftFieldInfo(draft: OwnerCopilotActionDraft): DraftFieldInfo {
  switch (draft.kind) {
    case "expense":
      return {
        actionLabel: "Quick expense",
        readOnlyFields: [],
        editableFields: [
          { field: "amount", label: "Amount (৳)", type: "number" },
          { field: "category", label: "Category", type: "text" },
          { field: "note", label: "Note", type: "text" },
        ],
      };
    case "cash_entry":
      return {
        actionLabel: draft.entryType === "IN" ? "Cash in" : "Cash out",
        readOnlyFields: [
          { label: "Type", value: draft.entryType },
        ],
        editableFields: [
          { field: "amount", label: "Amount (৳)", type: "number" },
          { field: "reason", label: "Reason", type: "text" },
        ],
      };
    case "due_collection":
      return {
        actionLabel: "Due collection",
        readOnlyFields: [],
        editableFields: [
          { field: "customerName", label: "Customer", type: "text" },
          { field: "amount", label: "Amount (৳)", type: "number" },
          { field: "note", label: "Note", type: "text" },
        ],
      };
    case "due_entry":
      return {
        actionLabel: "Due entry",
        readOnlyFields: [],
        editableFields: [
          { field: "customerName", label: "Customer", type: "text" },
          { field: "amount", label: "Amount (৳)", type: "number" },
          { field: "note", label: "Note", type: "text" },
        ],
      };
    case "supplier_payment":
      return {
        actionLabel: "Supplier payment",
        readOnlyFields: [],
        editableFields: [
          { field: "supplierName", label: "Supplier", type: "text" },
          { field: "amount", label: "Amount (৳)", type: "number" },
          { field: "method", label: "Method", type: "text" },
          { field: "note", label: "Note", type: "text" },
        ],
      };
    case "stock_adjustment":
      return {
        actionLabel: "Stock adjustment",
        readOnlyFields: [
          { label: "Product", value: draft.productQuery },
        ],
        editableFields: [
          { field: "targetStock", label: "Target stock", type: "number" },
          { field: "note", label: "Note", type: "text" },
        ],
      };
    case "product_price_update":
      return {
        actionLabel: "Price update",
        readOnlyFields: [
          { label: "Product", value: draft.productQuery },
        ],
        editableFields: [
          { field: "targetPrice", label: "New price (৳)", type: "number" },
          { field: "note", label: "Note", type: "text" },
        ],
      };
    case "product_toggle_active":
      return {
        actionLabel: draft.nextActiveState ? "Activate product" : "Deactivate product",
        readOnlyFields: [
          { label: "Product", value: draft.productQuery },
          { label: "Next state", value: draft.nextActiveState ? "Active" : "Inactive" },
        ],
        editableFields: [],
      };
    case "void_sale":
      return {
        actionLabel: "Void sale",
        readOnlyFields: [
          { label: "Invoice", value: draft.invoiceNo || draft.saleQuery },
        ],
        editableFields: [
          { field: "note", label: "Reason", type: "text" },
        ],
      };
    case "create_customer":
      return {
        actionLabel: "Create customer",
        readOnlyFields: [],
        editableFields: [
          { field: "name", label: "Name", type: "text" },
          { field: "phone", label: "Phone", type: "text" },
        ],
      };
    case "create_supplier":
      return {
        actionLabel: "Create supplier",
        readOnlyFields: [],
        editableFields: [
          { field: "name", label: "Name", type: "text" },
          { field: "phone", label: "Phone", type: "text" },
        ],
      };
    case "create_product":
      return {
        actionLabel: "Create product",
        readOnlyFields: [],
        editableFields: [
          { field: "name", label: "Name", type: "text" },
          { field: "sellPrice", label: "Sell price (৳)", type: "number" },
          { field: "category", label: "Category", type: "text" },
          { field: "baseUnit", label: "Base unit", type: "text" },
          { field: "stockQty", label: "Opening stock", type: "number" },
        ],
      };
  }
}

export function getConfirmButtonLabel(pendingAction: OwnerCopilotActionDraft, confirmingAction: boolean) {
  if (confirmingAction) return "Confirm হচ্ছে...";

  switch (pendingAction.kind) {
    case "expense":
      return "Expense Save করুন";
    case "cash_entry":
      return "Entry Save করুন";
    case "due_collection":
      return "Payment Collect করুন";
    case "due_entry":
      return "Due Add করুন";
    case "supplier_payment":
      return "Payment Submit করুন";
    case "stock_adjustment":
      return "Stock Update করুন";
    case "product_price_update":
      return "Price Update করুন";
    case "product_toggle_active":
      return pendingAction.nextActiveState ? "Product Activate করুন" : "Product Deactivate করুন";
    case "void_sale":
      return "Sale Void করুন";
    case "create_customer":
      return "Customer Create করুন";
    case "create_supplier":
      return "Supplier Create করুন";
    case "create_product":
      return "Product Create করুন";
    default:
      return "Confirm করুন";
  }
}
