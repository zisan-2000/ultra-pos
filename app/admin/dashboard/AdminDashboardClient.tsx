// app/admin/dashboard/AdminDashboardClient.tsx

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AgentHierarchyDrilldownClient from "@/components/agent-hierarchy-drilldown-client";
import { buttonVariants } from "@/components/ui/button";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";

type StaffEntry = {
  id: string;
  name: string | null;
  email: string | null;
  createdAt: string;
  shopName: string | null;
};

type OwnerEntry = {
  id: string;
  name: string | null;
  email: string | null;
  createdAt: string;
  shopCount: number;
  staff: StaffEntry[];
};

type BillingCounts = {
  total: number;
  paid: number;
  due: number;
  pastDue: number;
  trialing: number;
  canceled: number;
  untracked: number;
};

type AgentEntry = {
  id: string;
  name: string | null;
  email: string | null;
  createdAt: string;
  owners: OwnerEntry[];
};

type MetricCounts = {
  total: number;
  agent: number;
  owner: number;
  staff: number;
};

type AgentRow = {
  id: string;
  name: string | null;
  email: string | null;
  createdAt: string;
  ownerCount: number;
  staffCount: number;
  teamCount: number;
};

type OwnerRow = {
  id: string;
  name: string | null;
  email: string | null;
  agentLabel: string;
  staffCount: number;
  shopCount: number;
  billing: BillingCounts;
  createdAt: string;
};

type AdminDashboardData = {
  counts: MetricCounts;
  agentRows: AgentRow[];
  ownerRows: OwnerRow[];
  directOwnerCount: number;
  directStaffCount: number;
  agentHierarchy: AgentEntry[];
  directOwners: OwnerEntry[];
};

type Props = {
  userId: string;
  initialData: AdminDashboardData;
};

type Accent = "primary" | "success" | "warning" | "danger";

const basePath = "/admin";

const formatCount = (value: number) => new Intl.NumberFormat("en-US").format(value);
const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
};

const emptyBilling: BillingCounts = {
  total: 0,
  paid: 0,
  due: 0,
  pastDue: 0,
  trialing: 0,
  canceled: 0,
  untracked: 0,
};

function MetricCard({
  label,
  value,
  helper,
  accent,
}: {
  label: string;
  value: number | string;
  helper?: string;
  accent?: Accent;
}) {
  const accentStyles: Record<Accent, string> = {
    primary: "text-primary",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all pressable">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-2 text-2xl font-bold text-foreground ${
          accent ? accentStyles[accent] : ""
        }`}
      >
        {value}
      </p>
      {helper ? <p className="mt-1 text-xs text-muted-foreground">{helper}</p> : null}
    </div>
  );
}

export default function AdminDashboardClient({ userId, initialData }: Props) {
  const online = useOnlineStatus();
  const [data, setData] = useState<AdminDashboardData>(initialData);
  const [cacheMissing, setCacheMissing] = useState(false);

  const cacheKey = useMemo(() => `admin:dashboard:${userId}`, [userId]);

  useEffect(() => {
    if (online) {
      setData(initialData);
      setCacheMissing(false);
      try {
        safeLocalStorageSet(cacheKey, JSON.stringify(initialData));
      } catch {
        // ignore cache errors
      }
      return;
    }

    try {
      const raw = safeLocalStorageGet(cacheKey);
      if (!raw) {
        setCacheMissing(true);
        return;
      }
      const parsed = JSON.parse(raw) as AdminDashboardData;
      setData(parsed);
      setCacheMissing(false);
    } catch {
      setCacheMissing(true);
    }
  }, [online, initialData, cacheKey]);

  const warningVisible = data.directOwnerCount > 0 || data.directStaffCount > 0;

  return (
    <div className="space-y-6">
      {!online && (
        <div className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs font-semibold text-warning">
          Offline: showing cached admin dashboard data.
        </div>
      )}
      {!online && cacheMissing && (
        <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          Offline: cached admin dashboard data not available.
        </div>
      )}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Admin
            </p>
            <h1 className="text-2xl font-bold text-foreground mt-1">Team Overview</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track agents, owners, and staff created under your account.
            </p>
          </div>
          <div className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
            Hierarchy: Admin -&gt; Agent -&gt; Owner -&gt; Staff
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total users under you"
          value={formatCount(data.counts.total)}
          accent="primary"
          helper="Unique users across all levels"
        />
        <MetricCard
          label="Agents"
          value={formatCount(data.counts.agent)}
          helper="All agents in your hierarchy"
        />
        <MetricCard
          label="Owners"
          value={formatCount(data.counts.owner)}
          helper="All owners in your hierarchy"
        />
        <MetricCard
          label="Staff"
          value={formatCount(data.counts.staff)}
          helper="All staff in your hierarchy"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Quick actions</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your team and review account activity quickly.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Link
              href={`${basePath}/users`}
              className={buttonVariants({
                variant: "default",
                className: "justify-start",
              })}
            >
              Manage users
            </Link>
            <Link
              href={`${basePath}/admin/user-creation-log`}
              className={buttonVariants({
                variant: "outline",
                className: "justify-start",
              })}
            >
              User creation log
            </Link>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">Visibility scope</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Counts include users created by you and your downstream teams.
          </p>
          <div className="mt-4 space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 px-3 py-2">
              <span>Agents in your hierarchy</span>
              <span className="font-semibold text-foreground">
                {formatCount(data.counts.agent)}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 px-3 py-2">
              <span>Owners in your hierarchy</span>
              <span className="font-semibold text-foreground">
                {formatCount(data.counts.owner)}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 px-3 py-2">
              <span>Staff in your hierarchy</span>
              <span className="font-semibold text-foreground">
                {formatCount(data.counts.staff)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Agents and their teams</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Only agents created by you are visible here.
            </p>
          </div>
          <Link
            href={`${basePath}/users`}
            className={buttonVariants({
              variant: "outline",
              className: "justify-start",
            })}
          >
            Manage users
          </Link>
        </div>

        {data.agentRows.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            No agents found under your account.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Agent
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Owners
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Staff
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Total team
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {data.agentRows.map((agent) => (
                  <tr key={agent.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 text-foreground">
                      <div className="flex flex-col">
                        <span className="font-semibold">
                          {agent.name || "Unnamed agent"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {agent.email || "No email"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-foreground">
                      {formatCount(agent.ownerCount)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-foreground">
                      {formatCount(agent.staffCount)}
                    </td>
                    <td className="px-4 py-3 font-semibold text-foreground">
                      {formatCount(agent.teamCount)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(agent.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {warningVisible && (
          <div className="mt-4 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
            Direct owners (not linked to an agent): {formatCount(data.directOwnerCount)}
            {data.directStaffCount > 0
              ? ` | Staff under those owners: ${formatCount(data.directStaffCount)}`
              : ""}
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Agent hierarchy drilldown
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Expand an agent to see owners and staff under them.
            </p>
          </div>
        </div>

        <div className="mt-4">
          <AgentHierarchyDrilldownClient
            agents={data.agentHierarchy}
            directOwners={data.directOwners}
            emptyMessage="No agents found under your account."
          />
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Owners and staff details
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Owners created by your agents (or you) and their staff counts.
            </p>
          </div>
        </div>

        {data.ownerRows.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            No owners found under your agents.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Owner
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Agent
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Shops
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Billing
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Staff
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {data.ownerRows.map((owner) => {
                  const billing = owner.billing ?? emptyBilling;
                  return (
                  <tr key={owner.id} className="hover:bg-muted/50">
                    <td className="px-4 py-3 text-foreground">
                      <div className="flex flex-col">
                        <span className="font-semibold">
                          {owner.name || "Unnamed owner"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {owner.email || "No email"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{owner.agentLabel}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">
                      {formatCount(owner.shopCount ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <div className="flex flex-col gap-1">
                        <span className="font-semibold text-foreground">
                          Paid {formatCount(billing.paid)}/
                          {formatCount(billing.total)}
                        </span>
                        <span>Due: {formatCount(billing.due)}</span>
                        {billing.pastDue > 0 ? (
                          <span className="text-danger">
                            Past due: {formatCount(billing.pastDue)}
                          </span>
                        ) : null}
                        {billing.trialing > 0 ? (
                          <span>Trial: {formatCount(billing.trialing)}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-foreground">
                      {formatCount(owner.staffCount)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(owner.createdAt)}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
