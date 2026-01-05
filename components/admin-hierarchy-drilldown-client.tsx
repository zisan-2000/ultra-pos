"use client";

import { useMemo, useState } from "react";
import OwnerStaffDrilldownClient from "@/components/owner-staff-drilldown-client";

type StaffEntry = {
  id: string;
  name: string | null;
  email: string | null;
  createdAt: string;
};

type OwnerEntry = {
  id: string;
  name: string | null;
  email: string | null;
  createdAt: string;
  staff: StaffEntry[];
};

type AgentEntry = {
  id: string;
  name: string | null;
  email: string | null;
  createdAt: string;
  owners: OwnerEntry[];
};

type AdminEntry = {
  id: string;
  name: string | null;
  email: string | null;
  createdAt: string;
  agents: AgentEntry[];
  directOwners: OwnerEntry[];
};

type FilterState = {
  query: string;
  fromDate: string;
  toDate: string;
};

type OwnerStats = {
  ownerCount: number;
  staffCount: number;
};

type FilteredAgent = AgentEntry & OwnerStats;
type FilteredAdmin = AdminEntry &
  OwnerStats & {
    agents: FilteredAgent[];
    directOwnerStats: OwnerStats;
  };

type AdminHierarchyDrilldownProps = {
  admins: AdminEntry[];
  emptyMessage?: string;
};

const formatCount = (value: number) => new Intl.NumberFormat("en-US").format(value);
const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
};

const toStartOfDay = (value: string) => new Date(`${value}T00:00:00`);
const toEndOfDay = (value: string) => new Date(`${value}T23:59:59.999`);

export default function AdminHierarchyDrilldownClient({
  admins,
  emptyMessage = "No admins found.",
}: AdminHierarchyDrilldownProps) {
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const filters: FilterState = { query, fromDate, toDate };

  const filterHelpers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const hasQuery = normalizedQuery.length > 0;
    const from = fromDate ? toStartOfDay(fromDate) : null;
    const to = toDate ? toEndOfDay(toDate) : null;

    const matchesText = (name: string | null, email: string | null) => {
      if (!hasQuery) return true;
      const haystack = `${name ?? ""} ${email ?? ""}`.trim().toLowerCase();
      return haystack.includes(normalizedQuery);
    };

    const matchesDate = (value: string) => {
      if (!from && !to) return true;
      const createdTime = new Date(value).getTime();
      if (Number.isNaN(createdTime)) return false;
      if (from && createdTime < from.getTime()) return false;
      if (to && createdTime > to.getTime()) return false;
      return true;
    };

    return { matchesText, matchesDate, hasQuery };
  }, [query, fromDate, toDate]);

  const getOwnerStats = (owners: OwnerEntry[]): OwnerStats => {
    let ownerCount = 0;
    let staffCount = 0;

    for (const owner of owners) {
      const ownerMatches =
        filterHelpers.matchesText(owner.name, owner.email) &&
        filterHelpers.matchesDate(owner.createdAt);
      let ownerHasStaffMatch = false;

      for (const staff of owner.staff) {
        const staffMatches =
          filterHelpers.matchesDate(staff.createdAt) &&
          (!filterHelpers.hasQuery ||
            ownerMatches ||
            filterHelpers.matchesText(staff.name, staff.email));
        if (staffMatches) {
          staffCount += 1;
          ownerHasStaffMatch = true;
        }
      }

      if (ownerMatches || ownerHasStaffMatch) {
        ownerCount += 1;
      }
    }

    return { ownerCount, staffCount };
  };

  const filteredAdmins = useMemo<FilteredAdmin[]>(() => {
    if (admins.length === 0) return [];

    return admins.reduce<FilteredAdmin[]>((acc, admin) => {
      const filteredAgents = admin.agents.reduce<FilteredAgent[]>(
        (agentAcc, agent) => {
          const stats = getOwnerStats(agent.owners);
          const agentMatches =
            filterHelpers.matchesText(agent.name, agent.email) &&
            filterHelpers.matchesDate(agent.createdAt);
          if (!agentMatches && stats.ownerCount === 0 && stats.staffCount === 0) {
            return agentAcc;
          }
          agentAcc.push({ ...agent, ...stats });
          return agentAcc;
        },
        [],
      );

      const directOwnerStats = getOwnerStats(admin.directOwners);
      const adminMatches =
        filterHelpers.matchesText(admin.name, admin.email) &&
        filterHelpers.matchesDate(admin.createdAt);

      if (
        !adminMatches &&
        filteredAgents.length === 0 &&
        directOwnerStats.ownerCount === 0 &&
        directOwnerStats.staffCount === 0
      ) {
        return acc;
      }

      const agentOwnerCount = filteredAgents.reduce(
        (sum, agent) => sum + agent.ownerCount,
        0,
      );
      const agentStaffCount = filteredAgents.reduce(
        (sum, agent) => sum + agent.staffCount,
        0,
      );

      acc.push({
        ...admin,
        agents: filteredAgents,
        directOwnerStats,
        ownerCount: agentOwnerCount + directOwnerStats.ownerCount,
        staffCount: agentStaffCount + directOwnerStats.staffCount,
      });
      return acc;
    }, []);
  }, [admins, filterHelpers, getOwnerStats]);

  const totalAgents = filteredAdmins.reduce(
    (sum, admin) => sum + admin.agents.length,
    0,
  );
  const totalOwners = filteredAdmins.reduce(
    (sum, admin) => sum + admin.ownerCount,
    0,
  );
  const totalStaff = filteredAdmins.reduce(
    (sum, admin) => sum + admin.staffCount,
    0,
  );

  const hasAnyResults =
    filteredAdmins.length > 0 || totalOwners > 0 || totalStaff > 0;
  const hasSourceData = admins.length > 0;

  const hasFilters =
    query.trim().length > 0 || Boolean(fromDate) || Boolean(toDate);

  const clearFilters = () => {
    setQuery("");
    setFromDate("");
    setToDate("");
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-xs font-semibold text-muted-foreground">
          Search
          <input
            type="search"
            className="mt-1 h-9 w-60 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
            placeholder="Search admin, agent, owner, staff"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="flex flex-col text-xs font-semibold text-muted-foreground">
          From
          <input
            type="date"
            className="mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
          />
        </label>
        <label className="flex flex-col text-xs font-semibold text-muted-foreground">
          To
          <input
            type="date"
            className="mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
          />
        </label>
        {hasFilters ? (
          <button
            type="button"
            onClick={clearFilters}
            className="h-9 rounded-md border border-border bg-muted px-3 text-xs font-semibold text-muted-foreground hover:bg-muted/70"
          >
            Clear
          </button>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {formatCount(filteredAdmins.length)} admins,{" "}
        {formatCount(totalAgents)} agents, {formatCount(totalOwners)} owners,{" "}
        {formatCount(totalStaff)} staff
      </p>

      {!hasAnyResults ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-4 text-center text-sm text-muted-foreground">
          {hasSourceData
            ? "No users matched the current filters."
            : emptyMessage}
        </div>
      ) : null}

      {filteredAdmins.length > 0 ? (
        <div className="space-y-3">
          {filteredAdmins.map((admin) => (
            <details
              key={admin.id}
              className="rounded-lg border border-border bg-muted/20"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="flex flex-col">
                  <span className="font-semibold text-foreground">
                    {admin.name || "Unnamed admin"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {admin.email || "No email"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Created: {formatDate(admin.createdAt)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full border border-border bg-card px-2 py-1">
                    Agents: {formatCount(admin.agents.length)}
                  </span>
                  <span className="rounded-full border border-border bg-card px-2 py-1">
                    Owners: {formatCount(admin.ownerCount)}
                  </span>
                  <span className="rounded-full border border-border bg-card px-2 py-1">
                    Staff: {formatCount(admin.staffCount)}
                  </span>
                </div>
              </summary>

              <div className="border-t border-border bg-card px-4 py-4 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Agents
                  </h3>
                  {admin.agents.length === 0 ? (
                    <div className="mt-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
                      No agents matched the current filters.
                    </div>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {admin.agents.map((agent) => (
                        <details
                          key={agent.id}
                          className="rounded-lg border border-border bg-muted/30"
                        >
                          <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm">
                            <div className="flex flex-col">
                              <span className="font-semibold text-foreground">
                                {agent.name || "Unnamed agent"}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {agent.email || "No email"}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                Created: {formatDate(agent.createdAt)}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span className="rounded-full border border-border bg-card px-2 py-1">
                                Owners: {formatCount(agent.ownerCount)}
                              </span>
                              <span className="rounded-full border border-border bg-card px-2 py-1">
                                Staff: {formatCount(agent.staffCount)}
                              </span>
                            </div>
                          </summary>
                          <div className="border-t border-border bg-card px-3 py-3">
                            <OwnerStaffDrilldownClient
                              owners={agent.owners}
                              emptyMessage="No owners under this agent."
                              filters={filters}
                              showFilters={false}
                            />
                          </div>
                        </details>
                      ))}
                    </div>
                  )}
                </div>

                {admin.directOwners.length > 0 ? (
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      Direct owners (no agent)
                    </h3>
                    <div className="mt-2">
                      <OwnerStaffDrilldownClient
                        owners={admin.directOwners}
                        emptyMessage="No owners matched the current filters."
                        filters={filters}
                        showFilters={false}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </details>
          ))}
        </div>
      ) : null}
    </div>
  );
}
