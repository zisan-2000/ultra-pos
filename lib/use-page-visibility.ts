"use client";

import { useSyncExternalStore } from "react";

let isVisible = true;
let initialized = false;
const listeners = new Set<() => void>();

const readVisibility = () => {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
};

const notify = () => {
  isVisible = readVisibility();
  listeners.forEach((listener) => listener());
};

const ensureListener = () => {
  if (initialized || typeof document === "undefined") return;
  initialized = true;
  isVisible = readVisibility();
  document.addEventListener("visibilitychange", notify, { passive: true });
};

export const subscribePageVisibility = (listener: () => void) => {
  ensureListener();
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getPageVisibility = () => isVisible;

export const usePageVisibility = () =>
  useSyncExternalStore(
    subscribePageVisibility,
    getPageVisibility,
    () => true
  );
