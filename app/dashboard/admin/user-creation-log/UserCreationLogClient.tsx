"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

export function UserCreationLogClient() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [filters, setFilters] = useState<Filters>({
    startDate: "",
    endDate: "",
    creatorId: "",
    q: "",
  });
  const [searchDraft, setSearchDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [resultCount, setResultCount] = useState(0);

  const abortRef = useRef<AbortController | null>(null);

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

  useEffect(() => {
    if (hasInvalidRange) {
      setError("Start date cannot be after end date.");
      setEntries([]);
      setResultCount(0);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const params = new URLSearchParams();
    if (filters.startDate) params.set("startDate", filters.startDate);
    if (filters.endDate) params.set("endDate", filters.endDate);
    if (filters.creatorId) params.set("creatorId", filters.creatorId);
    if (filters.q) params.set("q", filters.q);
    params.set("limit", "200");

    setLoading(true);
    setError(null);

    fetch(`/api/admin/user-creation-log?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || "Failed to load activity log");
        }
        return res.json();
      })
      .then((payload) => {
        setEntries(Array.isArray(payload?.data) ? payload.data : []);
        setCreators(Array.isArray(payload?.creators) ? payload.creators : []);
        setResultCount(payload?.meta?.count ?? payload?.data?.length ?? 0);
        setLastUpdated(new Date());
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setError(err.message || "Failed to load activity log");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [filters, hasInvalidRange]);

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
    setFilters((prev) => ({ ...prev }));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Filters
            </p>
            <p className="text-sm text-gray-600">
              Super admins can view who created which accounts and when.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={clearFilters}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-slate-50"
            >
              Clear
            </button>
            <button
              onClick={refresh}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              From (created date)
            </label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => applyFilter({ startDate: e.target.value })}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              To (created date)
            </label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => applyFilter({ endDate: e.target.value })}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Creator</label>
            <select
              value={filters.creatorId}
              onChange={(e) => applyFilter({ creatorId: e.target.value })}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            <label className="text-sm font-medium text-gray-700">
              Search (name or email)
            </label>
            <input
              type="search"
              placeholder="Search created user or creator"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
          <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-gray-800">
            {loading ? "Loading..." : `${resultCount} entr${resultCount === 1 ? "y" : "ies"}`}
          </span>
          {lastUpdated ? (
            <span className="text-gray-500">
              Updated at {lastUpdated.toLocaleString()}
            </span>
          ) : null}
          {filters.creatorId ? (
            <span className="rounded-full bg-blue-50 px-3 py-1 font-semibold text-blue-700">
              Creator filtered
            </span>
          ) : null}
          {filters.startDate || filters.endDate ? (
            <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">
              Date range active
            </span>
          ) : null}
          {filters.q ? (
            <span className="rounded-full bg-purple-50 px-3 py-1 font-semibold text-purple-700">
              Search: {filters.q}
            </span>
          ) : null}
        </div>

        {hasInvalidRange ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            End date must be on or after the start date.
          </div>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              User Creation Activity
            </h2>
            <p className="text-sm text-gray-600">
              When an account was created, who created it, and for whom.
            </p>
          </div>
          <div className="text-xs text-gray-500">
            Sorted by newest first · Limited to 200 rows
          </div>
        </div>

        {error ? (
          <div className="px-4 py-6">
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          </div>
        ) : null}

        {!error && loading ? (
          <div className="px-4 py-8 text-center text-sm text-gray-600">
            Loading activity log...
          </div>
        ) : null}

        {!error && !loading && entries.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-600">
            No activity found for the selected filters.
          </div>
        ) : null}

        {!error && entries.length > 0 ? (
          <div className="max-h-[600px] overflow-y-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-700">
                    Date &amp; Time
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-700">
                    Created By
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-700">
                    Created User
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-700">
                    Email
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {entries.map((entry) => (
                  <tr key={`${entry.createdUser.id}-${entry.createdAt}`}>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-800">
                      <div className="flex flex-col">
                        <span className="font-semibold">
                          {entry.createdBy?.name || entry.createdBy?.email || "System / Unknown"}
                        </span>
                        {entry.createdBy?.email ? (
                          <span className="text-xs text-gray-500">{entry.createdBy.email}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-800">
                      <div className="flex flex-col">
                        <span className="font-semibold">
                          {entry.createdUser.name || "Unnamed user"}
                        </span>
                        {entry.createdUser.id ? (
                          <span className="text-[11px] text-gray-500">ID: {entry.createdUser.id}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
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
