import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-session";
import { hasRole, isSuperAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getRoleChainCounts } from "@/lib/user-hierarchy";
import { MetricCard } from "@/components/metric-card";
import { buttonVariants } from "@/components/ui/button";
import OwnerStaffDrilldownClient from "@/components/owner-staff-drilldown-client";

const basePath = "/agent";

const formatCount = (value: number) =>
  new Intl.NumberFormat("en-US").format(value);
const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(value);

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

  const toOwnerStaffPayload = (ownerList: typeof owners) =>
    ownerList.map((owner) => ({
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
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Agent
            </p>
            <h1 className="text-2xl font-bold text-foreground mt-1">
              Owner & Staff Overview
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Monitor shop owners and staff accounts created by you.
            </p>
          </div>
          <div className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
            Hierarchy: Agent -&gt; Owner -&gt; Staff
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label="Total users under you"
          value={formatCount(total)}
          accent="primary"
          helper="Unique users across all levels"
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
            Create or manage owners and staff accounts quickly.
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
              href={`${basePath}/profile`}
              className={buttonVariants({
                variant: "outline",
                className: "justify-start",
              })}
            >
              Account settings
            </Link>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground">
            Visibility scope
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Counts include owners and staff created by you and your team.
          </p>
          <div className="mt-4 space-y-2 text-sm text-muted-foreground">
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
              Owner hierarchy drilldown
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Expand an owner to see staff created under them.
            </p>
          </div>
        </div>

        <div className="mt-4">
          <OwnerStaffDrilldownClient
            owners={toOwnerStaffPayload(owners)}
            emptyMessage="No owners found under your account."
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
              Only owners created by you are listed here.
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

        {owners.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            No owners found under your account.
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
                    Staff
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {owners.map((owner) => {
                  const staffCount = staffCountByOwner.get(owner.id) ?? 0;
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

