"use server";

import type { RealtimeEventName } from "./events";

export async function publishRealtimeEvent(
  _event: RealtimeEventName,
  _shopId: string,
  _data?: Record<string, unknown>
) {
  // Polling-only mode: realtime publishing is intentionally disabled.
}
