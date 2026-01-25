"use server";

import type { RealtimeEventName, RealtimeEventPayload } from "./events";

const REALTIME_URL = process.env.REALTIME_SERVER_URL;
const REALTIME_SECRET = process.env.REALTIME_API_SECRET;
const PUBLISH_TIMEOUT_MS = Number(
  process.env.REALTIME_PUBLISH_TIMEOUT_MS || 2_500
);
const PUBLISH_RETRIES = Number(process.env.REALTIME_PUBLISH_RETRIES || 1);
const RETRY_DELAY_MS = Number(process.env.REALTIME_PUBLISH_RETRY_DELAY_MS || 200);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function publishRealtimeEvent(
  event: RealtimeEventName,
  shopId: string,
  data?: Record<string, unknown>
) {
  if (!REALTIME_URL || !REALTIME_SECRET) return;

  const payload: RealtimeEventPayload = {
    event,
    shopId,
    data,
    at: Date.now(),
  };

  const endpoint = `${REALTIME_URL.replace(/\/$/, "")}/emit`;
  const maxAttempts =
    Number.isFinite(PUBLISH_RETRIES) && PUBLISH_RETRIES >= 0
      ? PUBLISH_RETRIES + 1
      : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Number.isFinite(PUBLISH_TIMEOUT_MS) ? PUBLISH_TIMEOUT_MS : 2500
    );

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${REALTIME_SECRET}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (res.ok) {
        return;
      }

      const text = await res.text().catch(() => "");
      console.warn("Realtime publish non-OK", {
        status: res.status,
        statusText: res.statusText,
        body: text.slice(0, 500),
        event,
        shopId,
        attempt,
      });

      if (res.status >= 500 && attempt < maxAttempts) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      return;
    } catch (error) {
      const shouldRetry = attempt < maxAttempts;
      console.warn("Realtime publish failed", {
        error: error instanceof Error ? error.message : String(error),
        event,
        shopId,
        attempt,
      });
      if (shouldRetry) {
        await sleep(RETRY_DELAY_MS);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
