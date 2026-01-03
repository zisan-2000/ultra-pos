"use client";

import { useMemo, useState } from "react";
import type { Permission, Role } from "@prisma/client";
import { UsersRolesPanel } from "./UsersRolesPanel";
import { RolesPermissionsPanel } from "./RolesPermissionsPanel";

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
  const [activeTab, setActiveTab] = useState<"users" | "permissions">("users");

  const stats = useMemo(
    () => ({
      users: users.length,
      roles: roles.length,
    }),
    [users.length, roles.length],
  );

  return (
    <main className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
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
          <UsersRolesPanel users={users as any} roles={roleOptions as any} />
        ) : (
          <RolesPermissionsPanel roles={roles as any} permissions={permissions as any} />
        )}
      </section>
    </main>
  );
}
