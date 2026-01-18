// lib/due/customer-events.ts

export const DUE_CUSTOMERS_EVENT_NAME = "pos:dueCustomers";

export type DueCustomersEventDetail = {
  shopId: string;
  at: number;
  source?: "refresh" | "create" | "payment" | "sync" | "local";
};

type EventHandler = (detail: DueCustomersEventDetail) => void;

export function emitDueCustomersEvent(detail: DueCustomersEventDetail) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent(DUE_CUSTOMERS_EVENT_NAME, { detail })
  );

  if (typeof BroadcastChannel !== "undefined") {
    try {
      const channel = new BroadcastChannel(DUE_CUSTOMERS_EVENT_NAME);
      channel.postMessage(detail);
      channel.close();
    } catch (err) {
      console.warn("Due customer broadcast failed", err);
    }
  } else {
    try {
      const payload = JSON.stringify({
        ...detail,
        nonce: Math.random().toString(36).slice(2),
      });
      localStorage.setItem(DUE_CUSTOMERS_EVENT_NAME, payload);
    } catch (err) {
      console.warn("Due customer storage event failed", err);
    }
  }
}

export function subscribeDueCustomersEvent(handler: EventHandler) {
  if (typeof window === "undefined") return () => {};

  const handleEvent = (event: Event) => {
    const detail = (event as CustomEvent<DueCustomersEventDetail>).detail;
    if (!detail) return;
    handler(detail);
  };

  window.addEventListener(DUE_CUSTOMERS_EVENT_NAME, handleEvent);

  let channel: BroadcastChannel | null = null;
  const handleMessage = (event: MessageEvent) => {
    if (!event?.data) return;
    handler(event.data as DueCustomersEventDetail);
  };

  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(DUE_CUSTOMERS_EVENT_NAME);
    channel.addEventListener("message", handleMessage);
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== DUE_CUSTOMERS_EVENT_NAME || !event.newValue) return;
    try {
      const detail = JSON.parse(
        event.newValue
      ) as DueCustomersEventDetail;
      if (!detail?.shopId) return;
      handler(detail);
    } catch (err) {
      console.warn("Due customer storage parse failed", err);
    }
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(DUE_CUSTOMERS_EVENT_NAME, handleEvent);
    window.removeEventListener("storage", handleStorage);
    if (channel) {
      channel.removeEventListener("message", handleMessage);
      channel.close();
    }
  };
}
