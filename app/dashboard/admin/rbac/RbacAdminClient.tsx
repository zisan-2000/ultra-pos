"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Permission, Role } from "@prisma/client";
import { UsersRolesPanel } from "./UsersRolesPanel";
import { RolesPermissionsPanel } from "./RolesPermissionsPanel";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { useSyncStatus } from "@/lib/sync/sync-status";

type RoleWithPermissions = Role & { rolePermissions: { permissionId: string }[] };
type UserRow = {
  id: string;
  email: string | null;
  name: string | null;
  roles: { id: string; name: string }[];
};

type Props = {
  users: UserRow[];
  roleOptions: Role[];
  roles: RoleWithPermissions[];
  permissions: Permission[];
};

const tabs = [
  { id: "users", label: "টিম অ্যাক্সেস" },
  { id: "permissions", label: "রোলের পারমিশন" },
] as const;

export default function RbacAdminClient({ users, roleOptions, roles, permissions }: Props) {
  const online = useOnlineStatus();
  const router = useRouter();
  const { pendingCount, syncing, lastSyncAt } = useSyncStatus();
  const [activeTab, setActiveTab] = useState<"users" | "permissions">("users");
  const [cachedUsers, setCachedUsers] = useState(users);
  const [cachedRoleOptions, setCachedRoleOptions] = useState(roleOptions);
  const [cachedRoles, setCachedRoles] = useState(roles);
  const [cachedPermissions, setCachedPermissions] = useState(permissions);
  const refreshInFlightRef = useRef(false);
  const serverSnapshotRef = useRef({
    users,
    roleOptions,
    roles,
    permissions,
  });

  useEffect(() => {
    const cacheKey = "admin:rbac";
    if (online) {
      setCachedUsers(users);
      setCachedRoleOptions(roleOptions);
      setCachedRoles(roles);
      setCachedPermissions(permissions);
      try {
        localStorage.setItem(
          cacheKey,
          JSON.stringify({ users, roleOptions, roles, permissions })
        );
      } catch {
        // ignore cache errors
      }
      return;
    }

    try {
      const raw = localStorage.getItem(cacheKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Props>;
      if (Array.isArray(parsed.users)) setCachedUsers(parsed.users as UserRow[]);
      if (Array.isArray(parsed.roleOptions))
        setCachedRoleOptions(parsed.roleOptions as Role[]);
      if (Array.isArray(parsed.roles)) setCachedRoles(parsed.roles as RoleWithPermissions[]);
      if (Array.isArray(parsed.permissions))
        setCachedPermissions(parsed.permissions as Permission[]);
    } catch {
      // ignore cache errors
    }
  }, [online, users, roleOptions, roles, permissions]);

  useEffect(() => {
    if (
      serverSnapshotRef.current.users !== users ||
      serverSnapshotRef.current.roleOptions !== roleOptions ||
      serverSnapshotRef.current.roles !== roles ||
      serverSnapshotRef.current.permissions !== permissions
    ) {
      serverSnapshotRef.current = { users, roleOptions, roles, permissions };
      refreshInFlightRef.current = false;
    }
  }, [users, roleOptions, roles, permissions]);

  useEffect(() => {
    if (!online || !lastSyncAt || syncing || pendingCount > 0) return;
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    router.refresh();
  }, [online, lastSyncAt, syncing, pendingCount, router]);

  const stats = useMemo(
    () => ({
      users: cachedUsers.length,
      roles: cachedRoles.length,
    }),
    [cachedUsers.length, cachedRoles.length],
  );

  return (
    <main className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
      {!online && (
        <div className="border border-warning/30 bg-warning-soft text-warning rounded-lg p-3 text-xs font-semibold">
          অফলাইন: আগের RBAC ডাটা দেখানো হচ্ছে।
        </div>
      )}
      <header className="bg-card/80 border border-border rounded-2xl shadow-sm p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-muted text-foreground text-xs font-semibold">
              🔒 Role-Based Access Control
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">RBAC Control Center</h1>
            <p className="text-sm text-muted-foreground">
              কম ভিউতে কাজ করার জন্য ট্যাবে ভাগ করা হয়েছে। টিম অ্যাক্সেস ও পারমিশন আলাদা ট্যাবে দেখুন।
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <div className="px-3 py-2 rounded-xl border border-border bg-muted shadow-sm">
              <div className="text-[11px] text-muted-foreground uppercase tracking-wide">মোট ব্যবহারকারী</div>
              <div className="text-lg font-semibold text-foreground">{stats.users}</div>
            </div>
            <div className="px-3 py-2 rounded-xl border border-border bg-muted shadow-sm">
              <div className="text-[11px] text-muted-foreground uppercase tracking-wide">মোট রোল</div>
              <div className="text-lg font-semibold text-foreground">{stats.roles}</div>
            </div>
          </div>
        </div>

        <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-muted p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors border ${
                activeTab === tab.id
                  ? "bg-primary-soft text-primary border-primary/30 shadow-sm"
                  : "text-muted-foreground border-transparent hover:bg-card"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <section className="grid grid-cols-1 gap-6">
        {activeTab === "users" ? (
          <UsersRolesPanel users={cachedUsers as any} roles={cachedRoleOptions as any} />
        ) : (
          <RolesPermissionsPanel roles={cachedRoles as any} permissions={cachedPermissions as any} />
        )}
      </section>
    </main>
  );
}
