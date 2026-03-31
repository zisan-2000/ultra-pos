export type PollingProfileKey =
  | "ownerDashboard"
  | "pos"
  | "salesList"
  | "due"
  | "expenses"
  | "cash"
  | "reports";

export type PollingProfile = {
  intervalMs: number;
  minRefreshMs: number;
  eventDebounceMs: number;
  eventQuietWindowRatio: number;
};

const POLLING_PROFILES: Record<PollingProfileKey, PollingProfile> = {
  ownerDashboard: {
    intervalMs: 5_000,
    minRefreshMs: 5_000,
    eventDebounceMs: 1_500,
    eventQuietWindowRatio: 0.25,
  },
  pos: {
    intervalMs: 10_000,
    minRefreshMs: 10_000,
    eventDebounceMs: 1_500,
    eventQuietWindowRatio: 0.25,
  },
  salesList: {
    intervalMs: 10_000,
    minRefreshMs: 2_000,
    eventDebounceMs: 800,
    eventQuietWindowRatio: 0.5,
  },
  due: {
    intervalMs: 10_000,
    minRefreshMs: 2_000,
    eventDebounceMs: 800,
    eventQuietWindowRatio: 0.5,
  },
  expenses: {
    intervalMs: 10_000,
    minRefreshMs: 2_000,
    eventDebounceMs: 800,
    eventQuietWindowRatio: 0.5,
  },
  cash: {
    intervalMs: 10_000,
    minRefreshMs: 2_000,
    eventDebounceMs: 800,
    eventQuietWindowRatio: 0.5,
  },
  reports: {
    intervalMs: 15_000,
    minRefreshMs: 8_000,
    eventDebounceMs: 800,
    eventQuietWindowRatio: 0.5,
  },
};

export function getPollingProfile(key: PollingProfileKey): PollingProfile {
  return POLLING_PROFILES[key];
}
