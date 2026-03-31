"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  getPollingProfile,
  type PollingProfile,
  type PollingProfileKey,
} from "@/lib/polling/config";

export type SmartPollingReason =
  | "poll"
  | "event"
  | "focus"
  | "sync"
  | "reconnect"
  | "manual";

type SmartPollingOptions = {
  profile: PollingProfileKey | PollingProfile;
  enabled?: boolean;
  online: boolean;
  isVisible: boolean;
  blocked?: boolean;
  syncToken?: string | number | null;
  canRefresh?: () => boolean;
  markRefreshStarted?: () => void;
  onRefresh: (reason: SmartPollingReason) => void;
};

type TriggerOptions = {
  force?: boolean;
  at?: number;
};

export function useSmartPolling({
  profile: profileInput,
  enabled = true,
  online,
  isVisible,
  blocked = false,
  syncToken,
  canRefresh,
  markRefreshStarted,
  onRefresh,
}: SmartPollingOptions) {
  const profile = useMemo(
    () =>
      typeof profileInput === "string"
        ? getPollingProfile(profileInput)
        : profileInput,
    [profileInput]
  );
  const lastRefreshAtRef = useRef(0);
  const lastEventAtRef = useRef(0);
  const lastSyncTokenRef = useRef(syncToken);
  const wasVisibleRef = useRef(isVisible);
  const wasOnlineRef = useRef(online);

  const triggerRefresh = useCallback(
    (reason: SmartPollingReason, options?: TriggerOptions) => {
      const now = options?.at ?? Date.now();
      const force = options?.force ?? false;

      if (!enabled || !online) return false;
      if ((reason === "poll" || reason === "focus") && !isVisible) return false;
      if (blocked && reason !== "manual") return false;
      if (canRefresh && !canRefresh()) return false;
      if (
        reason === "event" &&
        !force &&
        now - lastEventAtRef.current < profile.eventDebounceMs
      ) {
        return false;
      }
      if (
        !force &&
        now - lastRefreshAtRef.current < profile.minRefreshMs
      ) {
        return false;
      }

      if (reason === "event") {
        lastEventAtRef.current = now;
      }
      lastRefreshAtRef.current = now;
      markRefreshStarted?.();
      onRefresh(reason);
      return true;
    },
    [
      enabled,
      online,
      isVisible,
      blocked,
      canRefresh,
      profile.eventDebounceMs,
      profile.minRefreshMs,
      markRefreshStarted,
      onRefresh,
    ]
  );

  useEffect(() => {
    const previousSyncToken = lastSyncTokenRef.current;
    lastSyncTokenRef.current = syncToken;
    if (!syncToken || previousSyncToken === syncToken) return;
    triggerRefresh("sync");
  }, [syncToken, triggerRefresh]);

  useEffect(() => {
    if (!enabled || !online || !isVisible || blocked) return;

    const intervalId = setInterval(() => {
      const now = Date.now();
      const quietWindowMs = profile.intervalMs * profile.eventQuietWindowRatio;
      if (now - lastEventAtRef.current < quietWindowMs) return;
      triggerRefresh("poll", { at: now });
    }, profile.intervalMs);

    return () => clearInterval(intervalId);
  }, [
    enabled,
    online,
    isVisible,
    blocked,
    profile.intervalMs,
    profile.eventQuietWindowRatio,
    triggerRefresh,
  ]);

  useEffect(() => {
    const wasVisible = wasVisibleRef.current;
    wasVisibleRef.current = isVisible;
    if (wasVisible === isVisible || !isVisible) return;
    triggerRefresh("focus", { force: true });
  }, [isVisible, triggerRefresh]);

  useEffect(() => {
    const wasOnline = wasOnlineRef.current;
    wasOnlineRef.current = online;
    if (wasOnline || !online || !isVisible) return;
    triggerRefresh("reconnect", { force: true });
  }, [online, isVisible, triggerRefresh]);

  return {
    triggerRefresh,
    getLastRefreshAt: () => lastRefreshAtRef.current,
  };
}
