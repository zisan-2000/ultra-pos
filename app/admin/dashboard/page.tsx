import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-session";
import { hasRole, isSuperAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import {
  buildOwnerBillingSummaries,
  createEmptyBillingCounts,
} from "@/lib/billing";
import { getRoleChainCounts } from "@/lib/user-hierarchy";
import AdminDashboardClient from "./AdminDashboardClient";

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
  const shops =
    ownerIds.length > 0
      ? await prisma.shop.findMany({
          where: { ownerId: { in: ownerIds } },
          select: { id: true, ownerId: true },
        })
      : [];

  const shopIds = shops.map((shop) => shop.id);
  const subscriptions =
    shopIds.length > 0
      ? await prisma.shopSubscription.findMany({
          where: { shopId: { in: shopIds } },
          select: {
            shopId: true,
            status: true,
            currentPeriodEnd: true,
            trialEndsAt: true,
            graceEndsAt: true,
          },
        })
      : [];

  const invoices =
    shopIds.length > 0
      ? await prisma.invoice.findMany({
          where: { shopId: { in: shopIds } },
          select: {
            shopId: true,
            status: true,
            dueDate: true,
            periodEnd: true,
            paidAt: true,
          },
          orderBy: { periodEnd: "desc" },
        })
      : [];

  const subscriptionByShopId = new Map(
    subscriptions.map((subscription) => [subscription.shopId, subscription]),
  );
  const invoiceByShopId = new Map<string, (typeof invoices)[number]>();
  for (const invoice of invoices) {
    if (!invoiceByShopId.has(invoice.shopId)) {
      invoiceByShopId.set(invoice.shopId, invoice);
    }
  }
  const billingByOwner = buildOwnerBillingSummaries(
    shops,
    subscriptionByShopId,
    invoiceByShopId,
  );

  const shopCountByOwner = new Map<string, number>();
  for (const shop of shops) {
    shopCountByOwner.set(
      shop.ownerId,
      (shopCountByOwner.get(shop.ownerId) ?? 0) + 1,
    );
  }

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
            staffShop: { select: { id: true, name: true, ownerId: true } },
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
      shopCount: shopCountByOwner.get(owner.id) ?? 0,
      staff: (staffListByOwner.get(owner.id) ?? []).map((staff) => ({
        id: staff.id,
        name: staff.name,
        email: staff.email,
        createdAt: staff.createdAt.toISOString(),
        shopName: staff.staffShop?.name ?? null,
      })),
    }));

  const agentHierarchy = agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    email: agent.email,
    createdAt: agent.createdAt.toISOString(),
    owners: toOwnerPayload(ownerListByAgent.get(agent.id) ?? []),
  }));

  const agentRows = agents.map((agent) => {
    const ownerCount = ownersByAgent.get(agent.id) ?? 0;
    const staffCount = staffByAgent.get(agent.id) ?? 0;
    return {
      id: agent.id,
      name: agent.name,
      email: agent.email,
      createdAt: agent.createdAt.toISOString(),
      ownerCount,
      staffCount,
      teamCount: ownerCount + staffCount,
    };
  });

  const ownerDetailRows = ownerRows.map((owner) => {
    const staffCount = staffByOwner.get(owner.id) ?? 0;
    const creatorId = owner.createdBy ?? "";
    const agent = agentById.get(creatorId);
    const agentLabel = agent
      ? agent.name || agent.email || "Agent"
      : creatorId === user.id
      ? "Direct (Admin)"
      : "Unknown";

    return {
      id: owner.id,
      name: owner.name,
      email: owner.email,
      agentLabel,
      staffCount,
      shopCount: shopCountByOwner.get(owner.id) ?? 0,
      billing: billingByOwner.get(owner.id) ?? createEmptyBillingCounts(),
      createdAt: owner.createdAt.toISOString(),
    };
  });

  const initialData = {
    counts: {
      total,
      agent: counts.agent ?? 0,
      owner: counts.owner ?? 0,
      staff: counts.staff ?? 0,
    },
    agentRows,
    ownerRows: ownerDetailRows,
    directOwnerCount,
    directStaffCount,
    agentHierarchy,
    directOwners: toOwnerPayload(directOwners),
  };

  return <AdminDashboardClient userId={user.id} initialData={initialData} />;
}

