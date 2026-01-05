import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-session";
import { hasRole, isSuperAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getRoleChainCounts } from "@/lib/user-hierarchy";
import { MetricCard } from "@/components/metric-card";
import { buttonVariants } from "@/components/ui/button";
import AgentHierarchyDrilldownClient from "@/components/agent-hierarchy-drilldown-client";

const basePath = "/admin";

const formatCount = (value: number) =>
  new Intl.NumberFormat("en-US").format(value);
const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(value);

export default async function AdminDashboardPage() {
  const user = await requireUser();

  if (!isSuperAdmin(user) && !hasRole(user, "admin")) {
    redirect("/dashboard");
  }

  const { total, levels } = await getRoleChainCounts(user.id, [
    "agent",
    "owner",
    "staff",
  ]);

  const counts = Object.fromEntries(
    levels.map((level) => [level.role, level.count]),
  ) as Record<string, number>;

  const agents = await prisma.user.findMany({
    where: {
      createdBy: user.id,
      roles: { some: { name: "agent" } },
    },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const agentIds = agents.map((agent) => agent.id);
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));
  const ownerRows =
    agentIds.length > 0
      ? await prisma.user.findMany({
          where: {
            createdBy: { in: [...agentIds, user.id] },
            roles: { some: { name: "owner" } },
          },
          select: {
            id: true,
            name: true,
            email: true,
            createdAt: true,
            createdBy: true,
          },
          orderBy: { createdAt: "desc" },
        })
      : await prisma.user.findMany({
          where: {
            createdBy: user.id,
            roles: { some: { name: "owner" } },
          },
          select: {
            id: true,
            name: true,
            email: true,
            createdAt: true,
            createdBy: true,
          },
          orderBy: { createdAt: "desc" },
        });

  const ownerToAgent = new Map<string, string>();
  const ownersByAgent = new Map<string, number>();
  const ownerListByAgent = new Map<string, typeof ownerRows>();
  const directOwners: typeof ownerRows = [];
  let directOwnerCount = 0;

  for (const owner of ownerRows) {
    if (!owner.createdBy) continue;
    ownerToAgent.set(owner.id, owner.createdBy);
    if (owner.createdBy === user.id) {
      directOwners.push(owner);
      directOwnerCount += 1;
    } else {
      ownersByAgent.set(
        owner.createdBy,
        (ownersByAgent.get(owner.createdBy) ?? 0) + 1,
      );
      const list = ownerListByAgent.get(owner.createdBy) ?? [];
      list.push(owner);
      ownerListByAgent.set(owner.createdBy, list);
    }
  }

  const ownerIds = ownerRows.map((owner) => owner.id);
  const staffRows =
    ownerIds.length > 0
      ? await prisma.user.findMany({
          where: {
            createdBy: { in: ownerIds },
            roles: { some: { name: "staff" } },
          },
          select: {
            id: true,
            name: true,
            email: true,
            createdAt: true,
            createdBy: true,
          },
          orderBy: { createdAt: "desc" },
        })
      : [];

  const staffByOwner = new Map<string, number>();
  const staffListByOwner = new Map<string, typeof staffRows>();
  for (const staff of staffRows) {
    if (!staff.createdBy) continue;
    staffByOwner.set(
      staff.createdBy,
      (staffByOwner.get(staff.createdBy) ?? 0) + 1,
    );
    const list = staffListByOwner.get(staff.createdBy) ?? [];
    list.push(staff);
    staffListByOwner.set(staff.createdBy, list);
  }

  const staffByAgent = new Map<string, number>();
  let directStaffCount = 0;

  for (const staff of staffRows) {
    const ownerCreatorId = ownerToAgent.get(staff.createdBy ?? "");
    if (!ownerCreatorId) continue;
    if (ownerCreatorId === user.id) {
      directStaffCount += 1;
    } else {
      staffByAgent.set(
        ownerCreatorId,
        (staffByAgent.get(ownerCreatorId) ?? 0) + 1,
      );
    }
  }

  const toOwnerPayload = (owners: typeof ownerRows) =>
    owners.map((owner) => ({
      id: owner.id,
      name: owner.name,
      email: owner.email,
      createdAt: owner.createdAt.toISOString(),
      staff: (staffListByOwner.get(owner.id) ?? []).map((staff) => ({
        id: staff.id,
        name: staff.name,
        email: staff.email,
        createdAt: staff.createdAt.toISOString(),
      })),
    }));

  const agentHierarchy = agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    email: agent.email,
    createdAt: agent.createdAt.toISOString(),
    owners: toOwnerPayload(ownerListByAgent.get(agent.id) ?? []),
  }));

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Admin
            </p>
            <h1 className="text-2xl font-bold text-foreground mt-1">
              Team Overview
            </h1>
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
          value={formatCount(total)}
          accent="primary"
          helper="Unique users across all levels"
        />
        <MetricCard
          label="Agents"
          value={formatCount(counts.agent ?? 0)}
          helper="All agents in your hierarchy"
        />
        <MetricCard
          label="Owners"
          value={formatCount(counts.owner ?? 0)}
          helper="All owners in your hierarchy"
        />
        <MetricCard
          label="Staff"
          value={formatCount(counts.staff ?? 0)}
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
          <h2 className="text-lg font-semibold text-foreground">
            Visibility scope
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Counts include users created by you and your downstream teams.
          </p>
          <div className="mt-4 space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 px-3 py-2">
              <span>Agents in your hierarchy</span>
              <span className="font-semibold text-foreground">
                {formatCount(counts.agent ?? 0)}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 px-3 py-2">
              <span>Owners in your hierarchy</span>
              <span className="font-semibold text-foreground">
                {formatCount(counts.owner ?? 0)}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 px-3 py-2">
              <span>Staff in your hierarchy</span>
              <span className="font-semibold text-foreground">
                {formatCount(counts.staff ?? 0)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Agents and their teams
            </h2>
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

        {agents.length === 0 ? (
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
                {agents.map((agent) => {
                  const ownerCount = ownersByAgent.get(agent.id) ?? 0;
                  const staffCount = staffByAgent.get(agent.id) ?? 0;
                  const teamCount = ownerCount + staffCount;

                  return (
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
                        {formatCount(ownerCount)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {formatCount(staffCount)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {formatCount(teamCount)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(agent.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {(directOwnerCount > 0 || directStaffCount > 0) && (
          <div className="mt-4 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
            Direct owners (not linked to an agent): {formatCount(directOwnerCount)}
            {directStaffCount > 0
              ? ` | Staff under those owners: ${formatCount(directStaffCount)}`
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
            agents={agentHierarchy}
            directOwners={toOwnerPayload(directOwners)}
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

        {ownerRows.length === 0 ? (
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
                    Staff
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {ownerRows.map((owner) => {
                  const staffCount = staffByOwner.get(owner.id) ?? 0;
                  const creatorId = owner.createdBy ?? "";
                  const agent = agentById.get(creatorId);
                  const agentLabel = agent
                    ? agent.name || agent.email || "Agent"
                    : creatorId === user.id
                    ? "Direct (Admin)"
                    : "Unknown";

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
                      <td className="px-4 py-3 text-muted-foreground">
                        {agentLabel}
                      </td>
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {formatCount(staffCount)}
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

