export const QUEUE_WORKFLOW_VALUES = [
  "restaurant",
  "salon",
  "generic",
] as const;

export type QueueWorkflow = (typeof QUEUE_WORKFLOW_VALUES)[number];

export const QUEUE_CORE_STATUSES = [
  "WAITING",
  "CALLED",
  "IN_PROGRESS",
  "READY",
  "DONE",
  "CANCELLED",
] as const;

export type QueueCoreStatus = (typeof QUEUE_CORE_STATUSES)[number];
export type QueueOrderTypeOption = {
  value: string;
  label: string;
};

const ORDER_TYPE_OPTIONS_BY_WORKFLOW: Record<
  QueueWorkflow,
  readonly QueueOrderTypeOption[]
> = {
  restaurant: [
    { value: "dine_in", label: "ডাইন-ইন" },
    { value: "takeaway", label: "টেকঅ্যাওয়ে" },
    { value: "delivery", label: "ডেলিভারি" },
  ],
  salon: [
    { value: "walk_in", label: "ওয়াক-ইন" },
    { value: "appointment", label: "অ্যাপয়েন্টমেন্ট" },
    { value: "home_service", label: "হোম সার্ভিস" },
  ],
  generic: [
    { value: "onsite", label: "অন-সাইট" },
    { value: "pickup", label: "পিকআপ" },
    { value: "delivery", label: "ডেলিভারি" },
  ],
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  dine_in: "ডাইন-ইন",
  takeaway: "টেকঅ্যাওয়ে",
  delivery: "ডেলিভারি",
  walk_in: "ওয়াক-ইন",
  appointment: "অ্যাপয়েন্টমেন্ট",
  home_service: "হোম সার্ভিস",
  onsite: "অন-সাইট",
  pickup: "পিকআপ",
};

const ORDER_TYPE_ALIAS_MAP: Record<string, string> = {
  dinein: "dine_in",
  dine_in: "dine_in",
  takeaway: "takeaway",
  take_away: "takeaway",
  pickup: "pickup",
  delivery: "delivery",
  walkin: "walk_in",
  walk_in: "walk_in",
  appointment: "appointment",
  home_service: "home_service",
  homeservice: "home_service",
  onsite: "onsite",
  on_site: "onsite",
};

const LEGACY_STATUS_MAP: Record<string, QueueCoreStatus> = {
  WAITING: "WAITING",
  CALLED: "CALLED",
  IN_PROGRESS: "IN_PROGRESS",
  IN_KITCHEN: "IN_PROGRESS",
  READY: "READY",
  DONE: "DONE",
  SERVED: "DONE",
  CANCELLED: "CANCELLED",
};

export function sanitizeQueueWorkflow(value?: string | null): QueueWorkflow | null {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return (QUEUE_WORKFLOW_VALUES as readonly string[]).includes(normalized)
    ? (normalized as QueueWorkflow)
    : null;
}

export function resolveQueueWorkflowProfile(input: {
  queueWorkflow?: string | null;
  businessType?: string | null;
}): QueueWorkflow {
  const override = sanitizeQueueWorkflow(input.queueWorkflow);
  if (override) return override;

  const bt = String(input.businessType || "")
    .trim()
    .toLowerCase();

  if (/(salon|barber|beauty|parlou?r|spa)/.test(bt)) {
    return "salon";
  }

  if (/(restaurant|resturant|cafe|food|hotel|tea|coffee|snack)/.test(bt)) {
    return "restaurant";
  }

  return "generic";
}

export function normalizeQueueStatus(value?: string | null): QueueCoreStatus {
  const key = String(value || "").trim().toUpperCase();
  const mapped = LEGACY_STATUS_MAP[key];
  if (!mapped) {
    throw new Error("Invalid queue token status");
  }
  return mapped;
}

function normalizeQueueOrderTypeKey(value?: string | null): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function getQueueOrderTypeOptions(
  workflow: QueueWorkflow
): QueueOrderTypeOption[] {
  return ORDER_TYPE_OPTIONS_BY_WORKFLOW[workflow].map((item) => ({ ...item }));
}

export function normalizeQueueOrderType(
  value: string | null | undefined,
  workflow: QueueWorkflow
): string {
  const options = ORDER_TYPE_OPTIONS_BY_WORKFLOW[workflow];
  const allowed = new Set(options.map((option) => option.value));
  const normalized = normalizeQueueOrderTypeKey(value);
  const canonical = ORDER_TYPE_ALIAS_MAP[normalized] || normalized;
  if (allowed.has(canonical)) {
    return canonical;
  }
  return options[0].value;
}

export function getQueueOrderTypeLabel(
  value: string | null | undefined,
  workflow: QueueWorkflow
): string {
  const workflowLabels = new Map(
    ORDER_TYPE_OPTIONS_BY_WORKFLOW[workflow].map((option) => [
      option.value,
      option.label,
    ])
  );
  const normalized = normalizeQueueOrderTypeKey(value);
  const canonical = ORDER_TYPE_ALIAS_MAP[normalized] || normalized;
  if (workflowLabels.has(canonical)) {
    return workflowLabels.get(canonical)!;
  }
  if (ORDER_TYPE_LABELS[canonical]) {
    return ORDER_TYPE_LABELS[canonical];
  }
  return String(value || "").trim() || ORDER_TYPE_OPTIONS_BY_WORKFLOW[workflow][0].label;
}

export function getQueueStatusSortRank(value?: string | null): number {
  const status = normalizeQueueStatus(value);
  switch (status) {
    case "WAITING":
      return 0;
    case "CALLED":
      return 1;
    case "IN_PROGRESS":
      return 2;
    case "READY":
      return 3;
    case "DONE":
      return 4;
    case "CANCELLED":
      return 5;
    default:
      return 99;
  }
}

export function getQueueStatusLabel(
  value: string | null | undefined,
  workflow: QueueWorkflow
): string {
  const status = normalizeQueueStatus(value);
  switch (status) {
    case "WAITING":
      return "অপেক্ষায়";
    case "CALLED":
      return "ডাকা হয়েছে";
    case "IN_PROGRESS":
      if (workflow === "restaurant") return "কিচেনে";
      if (workflow === "salon") return "সার্ভিসে";
      return "চলমান";
    case "READY":
      return "রেডি";
    case "DONE":
      if (workflow === "restaurant") return "সার্ভড";
      return "সম্পন্ন";
    case "CANCELLED":
      return "বাতিল";
    default:
      return status;
  }
}

export function getQueueNextAction(
  value: string | null | undefined,
  workflow: QueueWorkflow
): { status: QueueCoreStatus; label: string } | null {
  const status = normalizeQueueStatus(value);

  if (status === "CANCELLED" || status === "DONE") {
    return null;
  }

  if (workflow === "restaurant") {
    switch (status) {
      case "WAITING":
        return { status: "CALLED", label: "কল করুন" };
      case "CALLED":
        return { status: "IN_PROGRESS", label: "কিচেনে পাঠান" };
      case "IN_PROGRESS":
        return { status: "READY", label: "রেডি" };
      case "READY":
        return { status: "DONE", label: "সার্ভড" };
      default:
        return null;
    }
  }

  if (workflow === "salon") {
    switch (status) {
      case "WAITING":
        return { status: "CALLED", label: "কল করুন" };
      case "CALLED":
        return { status: "IN_PROGRESS", label: "সার্ভিস শুরু" };
      case "IN_PROGRESS":
        return { status: "DONE", label: "সম্পন্ন" };
      default:
        return null;
    }
  }

  switch (status) {
    case "WAITING":
      return { status: "CALLED", label: "কল করুন" };
    case "CALLED":
      return { status: "IN_PROGRESS", label: "শুরু" };
    case "IN_PROGRESS":
      return { status: "DONE", label: "সম্পন্ন" };
    default:
      return null;
  }
}

export function isQueueTerminalStatus(value: string | null | undefined) {
  const status = normalizeQueueStatus(value);
  return status === "DONE" || status === "CANCELLED";
}
