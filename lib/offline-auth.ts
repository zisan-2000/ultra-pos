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
  pinSalt: string | null;
  pinHash: string | null;
  pinConfiguredAt: number | null;
};

type OfflineUnlockSession = {
  userId: string;
  deviceId: string;
  unlockedAt: number;
  expiresAt: number;
};

const DEVICE_KEY = "offline:auth:deviceId";
const PROFILE_KEY = "offline:auth:profile";
const UNLOCK_KEY = "offline:auth:unlock";
const OFFLINE_USER_KEY = "offline:userId";
const PROFILE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const UNLOCK_TTL_MS = 12 * 60 * 60 * 1000;

const encoder = new TextEncoder();

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

function hex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function randomHex(bytes = 16) {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return hex(array);
}

async function sha256(input: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return hex(new Uint8Array(digest));
}

async function hashPin(
  pin: string,
  salt: string,
  userId: string,
  deviceId: string
) {
  return sha256(`${deviceId}:${userId}:${salt}:${pin}`);
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

export function clearOfflineUnlock() {
  safeLocalStorageRemove(UNLOCK_KEY);
}

export function clearRememberedOfflineAuth() {
  safeLocalStorageRemove(PROFILE_KEY);
  clearOfflineUnlock();
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

export function hasConfiguredOfflinePin(
  profile: OfflineRememberedProfile | null = getRememberedOfflineProfile()
) {
  return Boolean(profile?.pinHash && profile?.pinSalt);
}

export function rememberOfflineUser(user: OfflineAuthUser) {
  if (!isOfflineCapableUser(user)) {
    clearRememberedOfflineAuth();
    return null;
  }

  const existing = getRememberedOfflineProfile();
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
    pinSalt:
      existing && existing.userId === user.id && existing.deviceId === deviceId
        ? existing.pinSalt
        : null,
    pinHash:
      existing && existing.userId === user.id && existing.deviceId === deviceId
        ? existing.pinHash
        : null,
    pinConfiguredAt:
      existing && existing.userId === user.id && existing.deviceId === deviceId
        ? existing.pinConfiguredAt
        : null,
  };

  writeJson(PROFILE_KEY, profile);
  safeLocalStorageSet(OFFLINE_USER_KEY, user.id);
  setDbUser(user.id);
  return profile;
}

export function activateOfflineUnlock(
  profile: OfflineRememberedProfile | null = getRememberedOfflineProfile()
) {
  if (!profile) return null;
  const now = Date.now();
  const unlock: OfflineUnlockSession = {
    userId: profile.userId,
    deviceId: profile.deviceId,
    unlockedAt: now,
    expiresAt: now + UNLOCK_TTL_MS,
  };
  writeJson(UNLOCK_KEY, unlock);
  safeLocalStorageSet(OFFLINE_USER_KEY, profile.userId);
  setDbUser(profile.userId);
  return unlock;
}

export function getOfflineUnlockSession() {
  const unlock = readJson<OfflineUnlockSession>(UNLOCK_KEY);
  const profile = getRememberedOfflineProfile();
  if (!unlock || !profile) return null;
  if (
    unlock.userId !== profile.userId ||
    unlock.deviceId !== profile.deviceId ||
    unlock.expiresAt <= Date.now()
  ) {
    clearOfflineUnlock();
    return null;
  }
  return unlock;
}

export function isOfflineUnlocked() {
  return Boolean(getOfflineUnlockSession());
}

function validatePin(pin: string) {
  if (!/^\d{4,6}$/.test(pin)) {
    throw new Error("PIN অবশ্যই ৪ থেকে ৬ সংখ্যার হতে হবে");
  }
}

export async function configureOfflinePin(pin: string) {
  validatePin(pin);
  const profile = getRememberedOfflineProfile();
  if (!profile) {
    throw new Error("আগে online login করতে হবে");
  }

  const salt = randomHex(16);
  const pinHash = await hashPin(pin, salt, profile.userId, profile.deviceId);
  const next: OfflineRememberedProfile = {
    ...profile,
    pinSalt: salt,
    pinHash,
    pinConfiguredAt: Date.now(),
  };
  writeJson(PROFILE_KEY, next);
  activateOfflineUnlock(next);
  return next;
}

export async function verifyOfflinePin(pin: string) {
  validatePin(pin);
  const profile = getRememberedOfflineProfile();
  if (!profile || !profile.pinSalt || !profile.pinHash) {
    throw new Error("এই ডিভাইসে offline PIN সেট করা নেই");
  }

  const actual = await hashPin(
    pin,
    profile.pinSalt,
    profile.userId,
    profile.deviceId
  );

  if (actual !== profile.pinHash) {
    throw new Error("PIN ঠিক নয়");
  }

  activateOfflineUnlock(profile);
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
