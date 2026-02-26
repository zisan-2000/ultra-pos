export const REALTIME_EVENTS = {
  saleCommitted: "sale:committed",
  saleVoided: "sale:voided",
  saleReturned: "sale:returned",
  expenseCreated: "expense:created",
  cashUpdated: "cash:updated",
  stockUpdated: "stock:updated",
  ledgerUpdated: "ledger:updated",
} as const;

export type RealtimeEventName =
  (typeof REALTIME_EVENTS)[keyof typeof REALTIME_EVENTS];

export type RealtimeEventPayload = {
  event: RealtimeEventName;
  shopId: string;
  data?: Record<string, unknown>;
  at?: number;
};
