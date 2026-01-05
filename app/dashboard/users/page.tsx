// app/dashboard/users/page.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getManageableUsers,
  getCreatableRoles,
} from "@/app/actions/user-management";
import { CreateUserDialog } from "./CreateUserDialog";
import { EditUserDialog } from "./EditUserDialog";
import { DeleteUserDialog } from "./DeleteUserDialog";

type User = {
  id: string;
  email: string | null;
  name: string | null;
  emailVerified: boolean;
  createdAt: Date | string;
  createdBy: string | null;
  roles: Array<{ id: string; name: string }>;
};

type Role = {
  id: string;
  name: string;
  description: string | null;
};

export default function UserManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [creatableRoles, setCreatableRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const loadData = async () => {
    try {
      setLoading(true);
      const [usersData, rolesData] = await Promise.all([
        getManageableUsers(),
        getCreatableRoles(),
      ]);
      setUsers(usersData);
      setCreatableRoles(rolesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const roleOptions = useMemo(() => {
    const roleSet = new Set<string>();
    users.forEach((user) => {
      user.roles.forEach((role) => roleSet.add(role.name));
    });
    return Array.from(roleSet).sort((a, b) => a.localeCompare(b));
  }, [users]);

  const todayCount = useMemo(() => {
    if (users.length === 0) {
      return 0;
    }
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    return users.filter((user) => {
      const createdAt = new Date(user.createdAt);
      if (Number.isNaN(createdAt.getTime())) {
        return false;
      }
      return createdAt >= start && createdAt < end;
    }).length;
  }, [users]);

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
    const to = toDate ? new Date(`${toDate}T23:59:59.999`) : null;

    return users.filter((user) => {
      const createdAt = new Date(user.createdAt);
      const createdAtTime = createdAt.getTime();
      if (Number.isNaN(createdAtTime) && (from || to)) {
        return false;
      }

      if (roleFilter !== "all") {
        const hasRole = user.roles.some((role) => role.name === roleFilter);
        if (!hasRole) {
          return false;
        }
      }

      if (from && createdAtTime < from.getTime()) {
        return false;
      }

      if (to && createdAtTime > to.getTime()) {
        return false;
      }

      if (!query) {
        return true;
      }

      const name = user.name?.toLowerCase() ?? "";
      const email = user.email?.toLowerCase() ?? "";
      const roleNames = user.roles.map((role) => role.name.toLowerCase());
      return (
        name.includes(query) ||
        email.includes(query) ||
        roleNames.some((roleName) => roleName.includes(query))
      );
    });
  }, [users, searchQuery, roleFilter, fromDate, toDate]);

  const hasFilters =
    searchQuery.trim() !== "" ||
    roleFilter !== "all" ||
    fromDate !== "" ||
    toDate !== "";

  const clearFilters = () => {
    setSearchQuery("");
    setRoleFilter("all");
    setFromDate("");
    setToDate("");
  };

  if (loading) {
    return (
      <div className="py-8 text-center">
        <p className="text-muted-foreground">লোড হচ্ছে...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8">
        <div className="bg-danger-soft border border-danger/30 rounded-lg p-4">
          <p className="text-danger font-semibold">ত্রুটি</p>
          <p className="text-danger text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground leading-tight">
              ব্যবহারকারী ব্যবস্থাপনা
            </h1>
            <p className="text-sm text-muted-foreground mt-1 leading-snug">
              আপনার অধীনে থাকা ব্যবহারকারীদের পরিচালনা করুন
            </p>
          </div>
        </div>
      </div>

      {/* Create User Section */}
      {creatableRoles.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                নতুন ব্যবহারকারী তৈরি করুন
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                আপনি নিম্নলিখিত ভূমিকার জন্য ব্যবহারকারী তৈরি করতে পারেন:
              </p>
            </div>
            <button
              onClick={() => setIsCreateDialogOpen(true)}
              className="px-4 py-2 bg-primary-soft text-primary border border-primary/30 rounded-lg font-medium hover:bg-primary/15 hover:border-primary/40 whitespace-nowrap"
            >
              + তৈরি করুন
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {creatableRoles.map((role) => (
              <span
                key={role.id}
                className="inline-flex items-center rounded-full bg-primary-soft px-3 py-1 text-sm font-medium text-primary"
              >
                {role.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Users List */}
      <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          ব্যবহারকারীদের তালিকা ({filteredUsers.length} / {users.length})
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Today created: {todayCount}
        </p>

        {users.length > 0 && (
          <div className="bg-muted/40 border border-border rounded-lg p-3 mb-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Search (name, email, role)
                </label>
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Type to search"
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Role filter
                </label>
                <select
                  value={roleFilter}
                  onChange={(event) => setRoleFilter(event.target.value)}
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="all">All roles</option>
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Created from
                </label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Created to
                </label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
            {hasFilters && (
              <div className="flex items-center justify-end mt-3">
                <button
                  onClick={clearFilters}
                  className="text-xs font-medium text-primary hover:text-primary-hover"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        )}

        {users.length === 0 ? (
          <p className="text-muted-foreground text-sm">কোনো ব্যবহারকারী নেই</p>
        ) : filteredUsers.length === 0 ? (
          <div className="border border-border rounded-lg p-4 text-sm text-muted-foreground">
            No users matched the current filters.
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden max-h-[600px] overflow-y-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">
                    নাম
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">
                    ইমেইল
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">
                    ভূমিকা
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">
                    তৈরির তারিখ
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">
                    কর্ম
                  </th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-border">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-muted">
                    <td className="px-4 py-3 text-sm font-medium text-foreground">
                      {user.name || "(নাম নেই)"}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {user.email || "(ইমেইল নেই)"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex flex-wrap gap-1">
                        {user.roles.length === 0 ? (
                          <span className="inline-flex items-center rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground">
                            কোনো ভূমিকা নেই
                          </span>
                        ) : (
                          user.roles.map((role) => (
                            <span
                              key={role.id}
                              className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                            >
                              {role.name}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {new Date(user.createdAt).toLocaleString("bn-BD", { dateStyle: "medium", timeStyle: "short" })}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => setEditingUser(user)}
                        className="text-primary hover:text-primary-hover font-medium text-xs"
                      >
                        সম্পাদনা
                      </button>
                      <span className="mx-2 text-muted-foreground">|</span>
                      <button
                        onClick={() => setDeletingUser(user)}
                        className="text-danger hover:text-danger/80 font-medium text-xs"
                      >
                        মুছুন
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create User Dialog */}
      <CreateUserDialog
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        creatableRoles={creatableRoles}
        onSuccess={loadData}
      />

      {/* Edit User Dialog */}
      <EditUserDialog
        isOpen={editingUser !== null}
        onClose={() => setEditingUser(null)}
        user={editingUser}
        onSuccess={loadData}
      />

      {/* Delete User Dialog */}
      <DeleteUserDialog
        isOpen={deletingUser !== null}
        onClose={() => setDeletingUser(null)}
        user={deletingUser}
        onSuccess={loadData}
      />
    </div>
  );
}
