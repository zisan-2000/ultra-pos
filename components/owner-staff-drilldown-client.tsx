"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

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

type OwnerWithFilteredStaff = OwnerEntry & {
  filteredStaff: StaffEntry[];
};

type DrilldownFilters = {
  query: string;
  fromDate: string;
  toDate: string;
};

type OwnerStaffDrilldownProps = {
  owners: OwnerEntry[];
  emptyMessage?: string;
  filters?: DrilldownFilters;
  showFilters?: boolean;
};

const formatCount = (value: number) => new Intl.NumberFormat("en-US").format(value);
const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
};

const toStartOfDay = (value: string) => new Date(`${value}T00:00:00`);
const toEndOfDay = (value: string) => new Date(`${value}T23:59:59.999`);

export default function OwnerStaffDrilldownClient({
  owners,
  emptyMessage = "No owners found.",
  filters,
  showFilters,
}: OwnerStaffDrilldownProps) {
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [openOwners, setOpenOwners] = useState<Record<string, boolean>>({});

  const isControlled = Boolean(filters);
  const activeQuery = isControlled ? filters?.query ?? "" : query;
  const activeFromDate = isControlled ? filters?.fromDate ?? "" : fromDate;
  const activeToDate = isControlled ? filters?.toDate ?? "" : toDate;
  const shouldShowFilters = showFilters ?? !isControlled;

  const hasFilters =
    activeQuery.trim().length > 0 ||
    Boolean(activeFromDate) ||
    Boolean(activeToDate);

  const filteredOwners = useMemo(() => {
    if (owners.length === 0) return [];
    const normalizedQuery = activeQuery.trim().toLowerCase();
    const hasQuery = normalizedQuery.length > 0;
    const from = activeFromDate ? toStartOfDay(activeFromDate) : null;
    const to = activeToDate ? toEndOfDay(activeToDate) : null;

    const matchesDate = (value: string) => {
      if (!from && !to) return true;
      const createdTime = new Date(value).getTime();
      if (Number.isNaN(createdTime)) return false;
      if (from && createdTime < from.getTime()) return false;
      if (to && createdTime > to.getTime()) return false;
      return true;
    };

    return owners.reduce<OwnerWithFilteredStaff[]>((acc, owner) => {
      const ownerText = `${owner.name ?? ""} ${owner.email ?? ""}`
        .trim()
        .toLowerCase();
      const ownerMatches =
        matchesDate(owner.createdAt) &&
        (!hasQuery || ownerText.includes(normalizedQuery));

      const filteredStaff = owner.staff.filter((staff) => {
        if (!matchesDate(staff.createdAt)) return false;
        if (!hasQuery) return true;
        if (ownerMatches) return true;

        const staffText = `${staff.name ?? ""} ${staff.email ?? ""}`
          .trim()
          .toLowerCase();
        return staffText.includes(normalizedQuery);
      });

      const includeOwner =
        !hasFilters || ownerMatches || filteredStaff.length > 0;
      if (!includeOwner) return acc;

      acc.push({
        ...owner,
        filteredStaff: hasFilters ? filteredStaff : owner.staff,
      });
      return acc;
    }, []);
  }, [owners, activeQuery, activeFromDate, activeToDate, hasFilters]);

  const totalStaff = useMemo(
    () =>
      filteredOwners.reduce(
        (sum, owner) => sum + owner.filteredStaff.length,
        0,
      ),
    [filteredOwners],
  );

  const toggleOwner = (ownerId: string) => {
    setOpenOwners((prev) => ({ ...prev, [ownerId]: !prev[ownerId] }));
  };

  const clearFilters = () => {
    if (isControlled) return;
    setQuery("");
    setFromDate("");
    setToDate("");
  };

  useEffect(() => {
    setOpenOwners({});
  }, [activeQuery, activeFromDate, activeToDate]);

  if (owners.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-4 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {shouldShowFilters ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-xs font-semibold text-muted-foreground">
            Search
            <input
              type="search"
              className="mt-1 h-9 w-56 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              placeholder="Search owner or staff"
              value={activeQuery}
              onChange={(event) => {
                if (isControlled) return;
                setQuery(event.target.value);
              }}
            />
          </label>
          <label className="flex flex-col text-xs font-semibold text-muted-foreground">
            From
            <input
              type="date"
              className="mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              value={activeFromDate}
              onChange={(event) => {
                if (isControlled) return;
                setFromDate(event.target.value);
              }}
            />
          </label>
          <label className="flex flex-col text-xs font-semibold text-muted-foreground">
            To
            <input
              type="date"
              className="mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              value={activeToDate}
              onChange={(event) => {
                if (isControlled) return;
                setToDate(event.target.value);
              }}
            />
          </label>
          {!isControlled && hasFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="h-9 rounded-md border border-border bg-muted px-3 text-xs font-semibold text-muted-foreground hover:bg-muted/70"
            >
              Clear
            </button>
          ) : null}
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Showing {formatCount(totalStaff)} staff across{" "}
        {formatCount(filteredOwners.length)} owners
      </p>

      {filteredOwners.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-4 text-center text-sm text-muted-foreground">
          No owners matched the current filters.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Owner
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Staff
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {filteredOwners.map((owner) => {
                const isOpen = openOwners[owner.id] ?? false;
                const staffCount = owner.filteredStaff.length;
                const staffRowId = `staff-${owner.id}`;

                return (
                  <Fragment key={owner.id}>
                    <tr className="hover:bg-muted/50">
                      <td className="px-3 py-2 text-foreground">
                        <div className="flex flex-col">
                          <span className="font-semibold">
                            {owner.name || "Unnamed owner"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {owner.email || "No email"}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-controls={staffRowId}
                          onClick={() => toggleOwner(owner.id)}
                          className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary-hover"
                        >
                          {formatCount(staffCount)}
                          <span className="text-[11px] font-semibold text-muted-foreground">
                            {isOpen ? "Hide" : "View"}
                          </span>
                        </button>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatDate(owner.createdAt)}
                      </td>
                    </tr>
                    <tr
                      id={staffRowId}
                      className={isOpen ? "bg-muted/20" : "hidden"}
                    >
                      <td colSpan={3} className="px-3 pb-3">
                        {owner.filteredStaff.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
                            No staff under this owner for the current filters.
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-border text-sm">
                              <thead className="bg-muted">
                                <tr>
                                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Staff
                                  </th>
                                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Created
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border bg-card">
                                {owner.filteredStaff.map((staff) => (
                                  <tr key={staff.id} className="hover:bg-muted/50">
                                    <td className="px-3 py-2 text-foreground">
                                      <div className="flex flex-col">
                                        <span className="font-semibold">
                                          {staff.name || "Unnamed staff"}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                          {staff.email || "No email"}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="px-3 py-2 text-muted-foreground">
                                      {formatDate(staff.createdAt)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
