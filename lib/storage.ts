"use client";

const UNSCOPED_PREFIXES = ["offline:"];
const UNSCOPED_KEYS = new Set(["pos.theme"]);
const USER_SCOPE_PREFIX = "user:";

const getRawLocalStorageItem = (key: string) => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const setRawLocalStorageItem = (key: string, value: string) => {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

const removeRawLocalStorageItem = (key: string) => {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};

const shouldScopeKey = (key: string) => {
  if (UNSCOPED_KEYS.has(key)) return false;
  return !UNSCOPED_PREFIXES.some((prefix) => key.startsWith(prefix));
};

const scopeKey = (key: string) => {
  if (!shouldScopeKey(key)) return key;
  const userId = getRawLocalStorageItem("offline:userId") || "anon";
  return `${USER_SCOPE_PREFIX}${userId}:${key}`;
};

export const safeLocalStorageGet = (key: string) => {
  const scoped = scopeKey(key);
  return getRawLocalStorageItem(scoped);
};

export const safeLocalStorageSet = (key: string, value: string) => {
  const scoped = scopeKey(key);
  return setRawLocalStorageItem(scoped, value);
};

export const safeLocalStorageRemove = (key: string) => {
  const scoped = scopeKey(key);
  return removeRawLocalStorageItem(scoped);
};
