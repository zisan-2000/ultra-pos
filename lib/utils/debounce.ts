// lib/utils/debounce.ts
import { useState, useEffect, useRef, useCallback } from "react";

function scheduleStateUpdate(fn: () => void) {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(fn);
    return;
  }
  Promise.resolve().then(fn);
}

/**
 * Debounce a function to prevent it from being called too frequently
 * @param func The function to debounce
 * @param wait The time to wait in milliseconds
 * @returns The debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * React hook for debounced values
 * Returns a debounced version of the input value
 * @param value The value to debounce
 * @param delay The delay in milliseconds
 * @returns The debounced value
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * React hook for debounced callbacks
 * Returns a debounced version of the callback
 * @param callback The callback to debounce
 * @param delay The delay in milliseconds
 * @returns The debounced callback
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const debouncedCallback = useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    },
    [callback, delay]
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return debouncedCallback;
}

/**
 * React hook for throttled values
 * Returns a throttled version of the input value (updated at most once per interval)
 * @param value The value to throttle
 * @param interval The interval in milliseconds
 * @returns The throttled value
 */
export function useThrottledValue<T>(value: T, interval: number): T {
  const [throttledValue, setThrottledValue] = useState<T>(value);
  const lastUpdatedRef = useRef<number>(0);

  useEffect(() => {
    if (lastUpdatedRef.current === 0) {
      lastUpdatedRef.current = Date.now();
      scheduleStateUpdate(() => setThrottledValue(value));
      return;
    }

    const now = Date.now();
    if (now >= lastUpdatedRef.current + interval) {
      lastUpdatedRef.current = now;
      scheduleStateUpdate(() => setThrottledValue(value));
    } else {
      const handler = setTimeout(() => {
        lastUpdatedRef.current = Date.now();
        setThrottledValue(value);
      }, interval - (now - lastUpdatedRef.current));

      return () => clearTimeout(handler);
    }
  }, [value, interval]);

  return throttledValue;
}
