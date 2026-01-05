import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-session";
import { isSuperAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getRoleChainCounts } from "@/lib/user-hierarchy";
import { MetricCard } from "@/components/metric-card";
import { buttonVariants } from "@/components/ui/button";
import AdminHierarchyDrilldownClient from "@/components/admin-hierarchy-drilldown-client";
import AgentHierarchyDrilldownClient from "@/components/agent-hierarchy-drilldown-client";

const basePath = "/super-admin";

const formatCount = (value: number) =>
  new Intl.NumberFormat("en-US").format(value);
const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(value);

export default async function SuperAdminDashboardPage() {
  const user = await requireUser();

  if (!isSuperAdmin(user)) {
    redirect("/dashboard");
  }

  const { total, levels } = await getRoleChainCounts(user.id, [
    "admin",
    "agent",
    "owner",
    "staff",
  ]);

  const counts = Object.fromEntries(
    levels.map((level) => [level.role, level.count]),
  ) as Record<string, number>;

  const admins = await prisma.user.findMany({
    where: {
      createdBy: user.id,
      roles: { some: { name: "admin" } },
    },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const adminIds = admins.map((admin) => admin.id);
  const adminById = new Map(admins.map((admin) => [admin.id, admin]));

  const agents =
    adminIds.length > 0
      ? await prisma.user.findMany({
          where: {
            createdBy: { in: [...adminIds, user.id] },
            roles: { some: { name: "agent" } },
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
            roles: { some: { name: "agent" } },
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

  const agentIds = agents.map((agent) => agent.id);
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));

  const agentsByAdmin = new Map<string, number>();
  const agentsListByAdmin = new Map<string, typeof agents>();
  const directAgents: typeof agents = [];
  let directAgentCount = 0;
  const directAgentIds = new Set<string>();
  const agentToAdmin = new Map<string, string>();

  for (const agent of agents) {
    if (!agent.createdBy) continue;
    if (agent.createdBy === user.id) {
      directAgentCount += 1;
      directAgentIds.add(agent.id);
      directAgents.push(agent);
      continue;
    }
    const list = agentsListByAdmin.get(agent.createdBy) ?? [];
    list.push(agent);
    agentsListByAdmin.set(agent.createdBy, list);
    agentsByAdmin.set(
      agent.createdBy,
      (agentsByAdmin.get(agent.createdBy) ?? 0) + 1,
    );
    agentToAdmin.set(agent.id, agent.createdBy);
  }

  const ownerCreatorIds = [...agentIds, ...adminIds, user.id];
  const ownerRows =
    ownerCreatorIds.length > 0
      ? await prisma.user.findMany({
          where: {
            createdBy: { in: ownerCreatorIds },
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
      : [];

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

  const ownerToAdmin = new Map<string, string>();
  const ownerToAgent = new Map<string, string>();
  const directOwnerIds = new Set<string>();
  const ownersByAdmin = new Map<string, number>();
  const ownersUnderDirectAgents = new Set<string>();
  const ownersByAgent = new Map<string, typeof ownerRows>();
  const ownersByAdminDirect = new Map<string, typeof ownerRows>();
  const directOwners: typeof ownerRows = [];

  for (const owner of ownerRows) {
    if (!owner.createdBy) continue;
    if (owner.createdBy === user.id) {
      directOwnerIds.add(owner.id);
      directOwners.push(owner);
      continue;
    }

    if (agentById.has(owner.createdBy)) {
      ownerToAgent.set(owner.id, owner.createdBy);
      const agentOwners = ownersByAgent.get(owner.createdBy) ?? [];
      agentOwners.push(owner);
      ownersByAgent.set(owner.createdBy, agentOwners);
      if (directAgentIds.has(owner.createdBy)) {
        ownersUnderDirectAgents.add(owner.id);
        continue;
      }
      const adminId = agentToAdmin.get(owner.createdBy);
      if (adminId) {
        ownerToAdmin.set(owner.id, adminId);
        ownersByAdmin.set(adminId, (ownersByAdmin.get(adminId) ?? 0) + 1);
      }
      continue;
    }

    if (adminIds.includes(owner.createdBy)) {
      ownerToAdmin.set(owner.id, owner.createdBy);
      const adminOwners = ownersByAdminDirect.get(owner.createdBy) ?? [];
      adminOwners.push(owner);
      ownersByAdminDirect.set(owner.createdBy, adminOwners);
      ownersByAdmin.set(
        owner.createdBy,
        (ownersByAdmin.get(owner.createdBy) ?? 0) + 1,
      );
      continue;
    }
  }

  const staffByOwner = new Map<string, number>();
  const staffListByOwner = new Map<string, typeof staffRows>();
  let staffUnderDirectAgents = 0;
  for (const staff of staffRows) {
    if (!staff.createdBy) continue;
    staffByOwner.set(
      staff.createdBy,
      (staffByOwner.get(staff.createdBy) ?? 0) + 1,
    );
    const list = staffListByOwner.get(staff.createdBy) ?? [];
    list.push(staff);
    staffListByOwner.set(staff.createdBy, list);
    if (ownersUnderDirectAgents.has(staff.createdBy)) {
      staffUnderDirectAgents += 1;
    }
  }

  const staffByAdmin = new Map<string, number>();
  let directStaffCount = 0;

  for (const staff of staffRows) {
    const ownerId = staff.createdBy ?? "";
    if (directOwnerIds.has(ownerId)) {
      directStaffCount += 1;
      continue;
    }

    const adminId = ownerToAdmin.get(ownerId);
    if (!adminId) continue;
    staffByAdmin.set(adminId, (staffByAdmin.get(adminId) ?? 0) + 1);
  }

  const directOwnerCount = directOwnerIds.size;
  const directAgentOwnerCount = ownersUnderDirectAgents.size;

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

  const toAgentPayload = (agentList: typeof agents) =>
    agentList.map((agent) => ({
      id: agent.id,
      name: agent.name,
      email: agent.email,
      createdAt: agent.createdAt.toISOString(),
      owners: toOwnerPayload(ownersByAgent.get(agent.id) ?? []),
    }));

  const adminHierarchyPayload = admins.map((admin) => ({
    id: admin.id,
    name: admin.name,
    email: admin.email,
    createdAt: admin.createdAt.toISOString(),
    agents: toAgentPayload(agentsListByAdmin.get(admin.id) ?? []),
    directOwners: toOwnerPayload(ownersByAdminDirect.get(admin.id) ?? []),
  }));

  const directAgentPayload = toAgentPayload(directAgents);
  const directOwnersPayload = toOwnerPayload(directOwners);

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Super Admin
            </p>
            <h1 className="text-2xl font-bold text-foreground mt-1">
              User Hierarchy Overview
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track every layer of accounts created under your supervision.
            </p>
          </div>
          <div className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
            Hierarchy: Super Admin -&gt; Admin -&gt; Agent -&gt; Owner -&gt; Staff
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Total users under you"
          value={formatCount(total)}
          accent="primary"
          helper="Unique users across all levels"
        />
        <MetricCard
          label="Admins"
          value={formatCount(counts.admin ?? 0)}
          helper="All admins in your hierarchy"
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
            Manage access and review activity without leaving the dashboard.
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
            <Link
              href={`${basePath}/admin/rbac`}
              className={buttonVariants({
                variant: "outline",
                className: "justify-start",
              })}
            >
              RBAC settings
            </Link>
            <Link
              href="/super-admin/system-settings"
              className={buttonVariants({
                variant: "outline",
                className: "justify-start",
              })}
            >
              System settings
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
              <span>Admins in your hierarchy</span>
              <span className="font-semibold text-foreground">
                {formatCount(counts.admin ?? 0)}
              </span>
            </div>
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
              Admins and their teams
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Only admins created by you are visible here.
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

        {admins.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            No admins found under your account.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Admin
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Agents
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
                {admins.map((admin) => {
                  const agentsCount = agentsByAdmin.get(admin.id) ?? 0;
                  const ownersCount = ownersByAdmin.get(admin.id) ?? 0;
                  const staffCount = staffByAdmin.get(admin.id) ?? 0;
                  const teamCount = agentsCount + ownersCount + staffCount;

                  return (
                    <tr key={admin.id} className="hover:bg-muted/50">
                      <td className="px-4 py-3 text-foreground">
                        <div className="flex flex-col">
                          <span className="font-semibold">
                            {admin.name || "Unnamed admin"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {admin.email || "No email"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {formatCount(agentsCount)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {formatCount(ownersCount)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {formatCount(staffCount)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {formatCount(teamCount)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(admin.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {(directAgentCount > 0 ||
          directAgentOwnerCount > 0 ||
          staffUnderDirectAgents > 0 ||
          directOwnerCount > 0 ||
          directStaffCount > 0) && (
          <div className="mt-4 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
            Direct agents (not linked to an admin):{" "}
            {formatCount(directAgentCount)}
            {directAgentOwnerCount > 0
              ? ` | Owners under direct agents: ${formatCount(directAgentOwnerCount)}`
              : ""}
            {staffUnderDirectAgents > 0
              ? ` | Staff under those owners: ${formatCount(staffUnderDirectAgents)}`
              : ""}
            {directOwnerCount > 0
              ? ` | Direct owners: ${formatCount(directOwnerCount)}`
              : ""}
            {directStaffCount > 0
              ? ` | Staff under direct owners: ${formatCount(directStaffCount)}`
              : ""}
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Admin hierarchy drilldown
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Expand an admin to see agents, owners, and staff under them.
            </p>
          </div>
        </div>
        <div className="mt-4">
          <AdminHierarchyDrilldownClient
            admins={adminHierarchyPayload}
            emptyMessage="No admins found under your account."
          />
        </div>
      </div>

      {(directAgentPayload.length > 0 || directOwnersPayload.length > 0) && (
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Direct users (no admin)
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Agents or owners created directly by you outside an admin team.
              </p>
            </div>
          </div>

          <div className="mt-4">
            <AgentHierarchyDrilldownClient
              agents={directAgentPayload}
              directOwners={directOwnersPayload}
              emptyMessage="No direct users found."
            />
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Owners and staff details
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Owners created by your admins or agents, with staff counts.
            </p>
          </div>
        </div>

        {ownerRows.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            No owners found under your hierarchy.
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
                    Admin
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
                  const agentId = ownerToAgent.get(owner.id);
                  const adminId = ownerToAdmin.get(owner.id);
                  const agent = agentId ? agentById.get(agentId) : null;
                  const admin = adminId ? adminById.get(adminId) : null;

                  const agentLabel = agent
                    ? agent.name || agent.email || "Agent"
                    : owner.createdBy === user.id
                    ? "Direct (Super Admin)"
                    : adminIds.includes(owner.createdBy ?? "")
                    ? "Direct (Admin)"
                    : "Unknown";

                  const adminLabel = admin
                    ? admin.name || admin.email || "Admin"
                    : agent?.createdBy === user.id
                    ? "Direct (Super Admin)"
                    : owner.createdBy === user.id
                    ? "Direct (Super Admin)"
                    : adminIds.includes(owner.createdBy ?? "")
                    ? adminById.get(owner.createdBy ?? "")?.name ||
                      adminById.get(owner.createdBy ?? "")?.email ||
                      "Admin"
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
                      <td className="px-4 py-3 text-muted-foreground">
                        {adminLabel}
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

