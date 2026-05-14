"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

function paramName(namespace: string, key: string) {
  return `${namespace}${key.charAt(0).toUpperCase()}${key.slice(1)}`;
}

export function useNamespacedReportState<T extends Record<string, string>>(
  namespace: string,
  defaults: T
) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const keys = useMemo(() => Object.keys(defaults) as Array<keyof T>, [defaults]);

  const values = useMemo(() => {
    const next = { ...defaults };
    for (const key of keys) {
      const raw = searchParams.get(paramName(namespace, String(key)));
      if (raw !== null) {
        next[key] = raw as T[keyof T];
      }
    }
    return next;
  }, [defaults, keys, namespace, searchParams]);

  const replaceParams = useCallback(
    (updater: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      updater(params);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const setValue = useCallback(
    (key: keyof T, value: string) => {
      const name = paramName(namespace, String(key));
      const fallback = defaults[key];
      replaceParams((params) => {
        if (!value || value === fallback) {
          params.delete(name);
        } else {
          params.set(name, value);
        }
      });
    },
    [defaults, namespace, replaceParams]
  );

  const reset = useCallback(() => {
    replaceParams((params) => {
      for (const key of keys) {
        params.delete(paramName(namespace, String(key)));
      }
    });
  }, [keys, namespace, replaceParams]);

  const activeCount = keys.reduce((count, key) => {
    const value = values[key];
    return value && value !== defaults[key] ? count + 1 : count;
  }, 0);

  return { values, setValue, reset, activeCount };
}
