import { prisma } from "@/lib/prisma";

export type RoleLevelCount = {
  role: string;
  count: number;
};

export type RoleChainCounts = {
  total: number;
  levels: RoleLevelCount[];
};

export async function getRoleChainCounts(
  rootUserId: string,
  roleChain: string[],
): Promise<RoleChainCounts> {
  const counts = new Map<string, number>();
  roleChain.forEach((role) => counts.set(role, 0));

  const visited = new Set<string>([rootUserId]);
  const counted = new Set<string>();
  let frontier = [rootUserId];

  while (frontier.length > 0) {
    const rows = await prisma.user.findMany({
      where: { createdBy: { in: frontier } },
      select: { id: true, roles: { select: { name: true } } },
    });

    frontier = [];

    for (const row of rows) {
      if (visited.has(row.id)) continue;
      visited.add(row.id);

      let hasTrackedRole = false;
      for (const role of row.roles) {
        if (!counts.has(role.name)) continue;
        hasTrackedRole = true;
        counts.set(role.name, (counts.get(role.name) ?? 0) + 1);
      }

      if (hasTrackedRole) {
        counted.add(row.id);
      }

      frontier.push(row.id);
    }
  }

  const levels = roleChain.map((role) => ({
    role,
    count: counts.get(role) ?? 0,
  }));

  const total = counted.size;

  return { total, levels };
}
