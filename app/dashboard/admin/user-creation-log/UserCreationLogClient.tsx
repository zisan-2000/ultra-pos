"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";

type ActivityEntry = {
  createdAt: string;
  createdUser: {
    id: string;
    email: string | null;
    name: string | null;
  };
  createdBy: {
    id: string;
    email: string | null;
    name: string | null;
  } | null;
};

type Creator = {
  id: string;
  email: string | null;
  name: string | null;
};

type Filters = {
  startDate: string;
  endDate: string;
  creatorId: string;
  q: string;
};

type CachePayload = {
  entries: ActivityEntry[];
  creators: Creator[];
  meta: { count: number; updatedAt: string };
};

export function UserCreationLogClient() {
  const online = useOnlineStatus();
  const [filters, setFilters] = useState<Filters>({
    startDate: "",
    endDate: "",
    creatorId: "",
    q: "",
  });
  const [searchDraft, setSearchDraft] = useState("");
  const cacheKey = "admin:user-creation-log";

  const readCache = useCallback((): CachePayload | null => {
    if (typeof window === "undefined") return null;
    try {
      const raw = safeLocalStorageGet(cacheKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CachePayload;
      const cachedEntries = Array.isArray(parsed.entries) ? parsed.entries : [];
      const cachedCreators = Array.isArray(parsed.creators) ? parsed.creators : [];
      const count =
        typeof parsed.meta?.count === "number"
          ? parsed.meta.count
          : cachedEntries.length;
      const updatedAt = parsed.meta?.updatedAt ?? new Date().toISOString();
      return { entries: cachedEntries, creators: cachedCreators, meta: { count, updatedAt } };
    } catch {
      return null;
    }
  }, [cacheKey]);

  const hasInvalidRange = useMemo(() => {
    if (!filters.startDate || !filters.endDate) return false;
    return filters.startDate > filters.endDate;
  }, [filters.endDate, filters.startDate]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) =>
        prev.q === searchDraft ? prev : { ...prev, q: searchDraft },
      );
    }, 350);

    return () => clearTimeout(timer);
  }, [searchDraft]);

  const cachedPayload = useMemo(() => readCache(), [readCache]);

  const queryKey = useMemo(
    () => [
      "admin",
      "user-creation-log",
      filters.startDate || "all",
      filters.endDate || "all",
      filters.creatorId || "all",
      filters.q || "all",
    ],
    [filters.creatorId, filters.endDate, filters.q, filters.startDate]
  );

  const fetchLog = useCallback(async () => {
    const params = new URLSearchParams();
    if (filters.startDate) params.set("startDate", filters.startDate);
    if (filters.endDate) params.set("endDate", filters.endDate);
    if (filters.creatorId) params.set("creatorId", filters.creatorId);
    if (filters.q) params.set("q", filters.q);
    params.set("limit", "200");

    const res = await fetch(`/api/admin/user-creation-log?${params.toString()}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || "Failed to load activity log");
    }
    const payload = await res.json();
    const data = Array.isArray(payload?.data) ? payload.data : [];
    const creatorsData = Array.isArray(payload?.creators) ? payload.creators : [];
    const count = payload?.meta?.count ?? data.length;
    const updatedAt = new Date().toISOString();
    const nextPayload = {
      entries: data,
      creators: creatorsData,
      meta: { count, updatedAt },
    };
    if (typeof window !== "undefined") {
      try {
        safeLocalStorageSet(cacheKey, JSON.stringify(nextPayload));
      } catch {
        // ignore cache errors
      }
    }
    return nextPayload;
  }, [filters, cacheKey]);

  const logQuery = useQuery({
    queryKey,
    queryFn: fetchLog,
    enabled: online && !hasInvalidRange,
    staleTime: 15_000,
    initialData: () => cachedPayload ?? undefined,
    placeholderData: (prev) => prev ?? undefined,
  });

  const queryError =
    logQuery.error instanceof Error ? logQuery.error.message : null;
  const data = logQuery.data ?? cachedPayload;
  const offlineNoCache = !online && !data;
  const error = hasInvalidRange
    ? "Start date cannot be after end date."
    : offlineNoCache
      ? "Offline: cached activity log not available."
      : data
        ? null
        : queryError;
  const entries: ActivityEntry[] =
    hasInvalidRange || offlineNoCache ? [] : (data?.entries ?? []);
  const creators: Creator[] =
    hasInvalidRange || offlineNoCache ? [] : (data?.creators ?? []);
  const resultCount =
    hasInvalidRange || offlineNoCache
      ? 0
      : data?.meta?.count ?? entries.length;
  const lastUpdated =
    hasInvalidRange || offlineNoCache || !data?.meta?.updatedAt
      ? null
      : new Date(data.meta.updatedAt);
  const loading = logQuery.isFetching && online;

  const applyFilter = (patch: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  };

  const clearFilters = () => {
    setSearchDraft("");
    setFilters({
      startDate: "",
      endDate: "",
      creatorId: "",
      q: "",
    });
  };

  const refresh = () => {
    if (!online || hasInvalidRange) return;
    logQuery.refetch();
  };

  return (
    <div className="space-y-4">
      {!online && (
        <div className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs font-semibold text-warning">
          Offline: showing cached activity log.
        </div>
      )}
      <fieldset
        disabled={!online}
        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm disabled:opacity-70"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Filters
            </p>
            <p className="text-sm text-muted-foreground">
              Super admins can view who created which accounts and when.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={clearFilters}
              className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted"
            >
              Clear
            </button>
            <button
              onClick={refresh}
              className="rounded-lg bg-primary-soft text-primary border border-primary/30 px-3 py-2 text-sm font-semibold shadow-sm hover:bg-primary/15 hover:border-primary/40"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-foreground">
              From (created date)
            </label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => applyFilter({ startDate: e.target.value })}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-foreground">
              To (created date)
            </label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => applyFilter({ endDate: e.target.value })}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-foreground">Creator</label>
            <select
              value={filters.creatorId}
              onChange={(e) => applyFilter({ creatorId: e.target.value })}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">All creators</option>
              {creators.map((creator) => (
                <option key={creator.id} value={creator.id}>
                  {creator.name || creator.email || "Unknown"}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-foreground">
              Search (name or email)
            </label>
            <input
              type="search"
              placeholder="Search created user or creator"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="rounded-full bg-muted px-3 py-1 font-semibold text-foreground">
            {loading ? "Loading..." : `${resultCount} entr${resultCount === 1 ? "y" : "ies"}`}
          </span>
          {lastUpdated ? (
            <span className="text-muted-foreground">
              Updated at {lastUpdated.toLocaleString()}
            </span>
          ) : null}
          {filters.creatorId ? (
            <span className="rounded-full bg-primary-soft px-3 py-1 font-semibold text-primary">
              Creator filtered
            </span>
          ) : null}
          {filters.startDate || filters.endDate ? (
            <span className="rounded-full bg-success-soft px-3 py-1 font-semibold text-success">
              Date range active
            </span>
          ) : null}
          {filters.q ? (
            <span className="rounded-full bg-primary-soft px-3 py-1 font-semibold text-primary">
              Search: {filters.q}
            </span>
          ) : null}
        </div>

        {hasInvalidRange ? (
          <div className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
            End date must be on or after the start date.
          </div>
        ) : null}
      </fieldset>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              User Creation Activity
            </h2>
            <p className="text-sm text-muted-foreground">
              When an account was created, who created it, and for whom.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            Sorted by newest first · Limited to 200 rows
          </div>
        </div>

        {error ? (
          <div className="px-4 py-6">
            <div className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </div>
          </div>
        ) : null}

        {!error && loading ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            Loading activity log...
          </div>
        ) : null}

        {!error && !loading && entries.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No activity found for the selected filters.
          </div>
        ) : null}

        {!error && entries.length > 0 ? (
          <div className="max-h-[600px] overflow-y-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-foreground">
                    Date &amp; Time
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-foreground">
                    Created By
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-foreground">
                    Created User
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-foreground">
                    Email
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {entries.map((entry) => (
                  <tr key={`${entry.createdUser.id}-${entry.createdAt}`}>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-foreground">
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">
                      <div className="flex flex-col">
                        <span className="font-semibold">
                          {entry.createdBy?.name || entry.createdBy?.email || "System / Unknown"}
                        </span>
                        {entry.createdBy?.email ? (
                          <span className="text-xs text-muted-foreground">{entry.createdBy.email}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">
                      <div className="flex flex-col">
                        <span className="font-semibold">
                          {entry.createdUser.name || "Unnamed user"}
                        </span>
                        {entry.createdUser.id ? (
                          <span className="text-[11px] text-muted-foreground">ID: {entry.createdUser.id}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">
                      {entry.createdUser.email || "N/A"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
