// lib/products/product-events.ts

export const PRODUCT_EVENT_NAME = "pos:products";

export type ProductEventDetail = {
  shopId: string;
  at: number;
  source?: "create" | "update" | "delete" | "refresh" | "local";
};

type EventHandler = (detail: ProductEventDetail) => void;

export function emitProductEvent(detail: ProductEventDetail) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new CustomEvent(PRODUCT_EVENT_NAME, { detail }));

  if (typeof BroadcastChannel !== "undefined") {
    try {
      const channel = new BroadcastChannel(PRODUCT_EVENT_NAME);
      channel.postMessage(detail);
      channel.close();
    } catch (err) {
      console.warn("Product broadcast failed", err);
    }
  } else {
    try {
      const payload = JSON.stringify({
        ...detail,
        nonce: Math.random().toString(36).slice(2),
      });
      localStorage.setItem(PRODUCT_EVENT_NAME, payload);
    } catch (err) {
      console.warn("Product storage event failed", err);
    }
  }
}

export function subscribeProductEvent(handler: EventHandler) {
  if (typeof window === "undefined") return () => {};

  const handleEvent = (event: Event) => {
    const detail = (event as CustomEvent<ProductEventDetail>).detail;
    if (!detail) return;
    handler(detail);
  };

  window.addEventListener(PRODUCT_EVENT_NAME, handleEvent);

  let channel: BroadcastChannel | null = null;
  const handleMessage = (event: MessageEvent) => {
    if (!event?.data) return;
    handler(event.data as ProductEventDetail);
  };

  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(PRODUCT_EVENT_NAME);
    channel.addEventListener("message", handleMessage);
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== PRODUCT_EVENT_NAME || !event.newValue) return;
    try {
      const detail = JSON.parse(event.newValue) as ProductEventDetail;
      if (!detail?.shopId) return;
      handler(detail);
    } catch (err) {
      console.warn("Product storage parse failed", err);
    }
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(PRODUCT_EVENT_NAME, handleEvent);
    window.removeEventListener("storage", handleStorage);
    if (channel) {
      channel.removeEventListener("message", handleMessage);
      channel.close();
    }
  };
}
