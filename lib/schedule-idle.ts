type IdleGlobal = typeof globalThis & {
  requestIdleCallback?: (cb: () => void, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

export function scheduleIdle(callback: () => void, timeout = 200) {
  const g = globalThis as IdleGlobal;
  if (typeof g.requestIdleCallback === "function") {
    const id = g.requestIdleCallback(callback, { timeout });
    return () => g.cancelIdleCallback?.(id);
  }
  const id = setTimeout(callback, Math.min(timeout, 50));
  return () => clearTimeout(id);
}
