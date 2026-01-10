import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-session";
import { isSuperAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getRoleChainCounts } from "@/lib/user-hierarchy";
import SuperAdminDashboardClient from "./SuperAdminDashboardClient";

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

  const adminRows = admins.map((admin) => {
    const agentsCount = agentsByAdmin.get(admin.id) ?? 0;
    const ownersCount = ownersByAdmin.get(admin.id) ?? 0;
    const staffCount = staffByAdmin.get(admin.id) ?? 0;
    return {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      createdAt: admin.createdAt.toISOString(),
      agentsCount,
      ownersCount,
      staffCount,
      teamCount: agentsCount + ownersCount + staffCount,
    };
  });

  const ownerDetailRows = ownerRows.map((owner) => {
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

    return {
      id: owner.id,
      name: owner.name,
      email: owner.email,
      agentLabel,
      adminLabel,
      staffCount,
      createdAt: owner.createdAt.toISOString(),
    };
  });

  const initialData = {
    counts: {
      total,
      admin: counts.admin ?? 0,
      agent: counts.agent ?? 0,
      owner: counts.owner ?? 0,
      staff: counts.staff ?? 0,
    },
    adminRows,
    ownerRows: ownerDetailRows,
    warnings: {
      directAgentCount,
      directAgentOwnerCount,
      staffUnderDirectAgents,
      directOwnerCount,
      directStaffCount,
    },
    adminHierarchy: adminHierarchyPayload,
    directAgents: directAgentPayload,
    directOwners: directOwnersPayload,
  };

  return (
    <SuperAdminDashboardClient userId={user.id} initialData={initialData} />
  );
}

