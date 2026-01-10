import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-session";
import { hasRole, isSuperAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getRoleChainCounts } from "@/lib/user-hierarchy";
import AgentDashboardClient from "./AgentDashboardClient";

export default async function AgentDashboardPage() {
  const user = await requireUser();

  if (!isSuperAdmin(user) && !hasRole(user, "agent")) {
    redirect("/dashboard");
  }

  const { total, levels } = await getRoleChainCounts(user.id, [
    "owner",
    "staff",
  ]);

  const counts = Object.fromEntries(
    levels.map((level) => [level.role, level.count]),
  ) as Record<string, number>;

  const owners = await prisma.user.findMany({
    where: {
      createdBy: user.id,
      roles: { some: { name: "owner" } },
    },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const ownerIds = owners.map((owner) => owner.id);
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

  const staffCountByOwner = new Map<string, number>();
  const staffListByOwner = new Map<string, typeof staffRows>();
  for (const staff of staffRows) {
    if (!staff.createdBy) continue;
    staffCountByOwner.set(
      staff.createdBy,
      (staffCountByOwner.get(staff.createdBy) ?? 0) + 1,
    );
    const list = staffListByOwner.get(staff.createdBy) ?? [];
    list.push(staff);
    staffListByOwner.set(staff.createdBy, list);
  }

  const ownerRows = owners.map((owner) => ({
    id: owner.id,
    name: owner.name,
    email: owner.email,
    createdAt: owner.createdAt.toISOString(),
    staffCount: staffCountByOwner.get(owner.id) ?? 0,
  }));

  const ownerStaff = owners.map((owner) => ({
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

  return (
    <AgentDashboardClient
      userId={user.id}
      initialData={{
        counts: {
          total,
          owner: counts.owner ?? 0,
          staff: counts.staff ?? 0,
        },
        owners: ownerRows,
        ownerStaff,
      }}
    />
  );
}

