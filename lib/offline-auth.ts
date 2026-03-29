"use client";

import { setDbUser } from "@/lib/dexie/db";
import {
  safeLocalStorageGet,
  safeLocalStorageRemove,
  safeLocalStorageSet,
} from "@/lib/storage";

export type OfflineAuthUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  roles?: string[];
  permissions?: string[];
  staffShopId?: string | null;
};

export type OfflineRememberedProfile = {
  version: 1;
  userId: string;
  email: string | null;
  name: string | null;
  roles: string[];
  permissions: string[];
  staffShopId: string | null;
  deviceId: string;
  lastOnlineAt: number;
  expiresAt: number;
};

const DEVICE_KEY = "offline:auth:deviceId";
const PROFILE_KEY = "offline:auth:profile";
const OFFLINE_USER_KEY = "offline:userId";
const PROFILE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function readJson<T>(key: string): T | null {
  const raw = safeLocalStorageGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    safeLocalStorageRemove(key);
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  safeLocalStorageSet(key, JSON.stringify(value));
}

function isOfflineCapableUser(user: OfflineAuthUser | null | undefined) {
  if (!user?.id) return false;
  if (user.roles?.includes("super_admin")) return true;
  return Boolean(user.permissions?.includes("use_offline_pos"));
}

export function getOrCreateOfflineDeviceId() {
  const stored = safeLocalStorageGet(DEVICE_KEY)?.trim();
  if (stored) return stored;
  const next = crypto.randomUUID();
  safeLocalStorageSet(DEVICE_KEY, next);
  return next;
}

export function clearRememberedOfflineAuth() {
  safeLocalStorageRemove(PROFILE_KEY);
}

export function getRememberedOfflineProfile(): OfflineRememberedProfile | null {
  const profile = readJson<OfflineRememberedProfile>(PROFILE_KEY);
  if (!profile) return null;
  if (profile.version !== 1 || !profile.userId || !profile.deviceId) {
    clearRememberedOfflineAuth();
    return null;
  }
  if (profile.expiresAt <= Date.now()) {
    clearRememberedOfflineAuth();
    return null;
  }
  return profile;
}

export function rememberOfflineUser(user: OfflineAuthUser) {
  if (!isOfflineCapableUser(user)) {
    clearRememberedOfflineAuth();
    return null;
  }

  const deviceId = getOrCreateOfflineDeviceId();
  const now = Date.now();
  const profile: OfflineRememberedProfile = {
    version: 1,
    userId: user.id,
    email: user.email ?? null,
    name: user.name ?? null,
    roles: Array.isArray(user.roles) ? [...user.roles] : [],
    permissions: Array.isArray(user.permissions) ? [...user.permissions] : [],
    staffShopId: user.staffShopId ?? null,
    deviceId,
    lastOnlineAt: now,
    expiresAt: now + PROFILE_TTL_MS,
  };

  writeJson(PROFILE_KEY, profile);
  safeLocalStorageSet(OFFLINE_USER_KEY, user.id);
  setDbUser(user.id);
  return profile;
}

export function getOfflineProfileExpiryLabel(
  profile: OfflineRememberedProfile | null
) {
  if (!profile) return null;
  return new Intl.DateTimeFormat("bn-BD", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(profile.expiresAt));
}

export { isOfflineCapableUser };
