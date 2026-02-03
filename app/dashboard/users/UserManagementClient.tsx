// app/dashboard/users/UserManagementClient.tsx

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  getManageableUsers,
  getCreatableRoles,
} from "@/app/actions/user-management";
import { CreateUserDialog } from "./CreateUserDialog";
import { EditUserDialog } from "./EditUserDialog";
import { DeleteUserDialog } from "./DeleteUserDialog";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { useSyncStatus } from "@/lib/sync/sync-status";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { db } from "@/lib/dexie/db";
import { handlePermissionError } from "@/lib/permission-toast";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";

type User = {
  id: string;
  email: string | null;
  name: string | null;
  emailVerified: boolean;
  createdAt: Date | string;
  createdBy: string | null;
  staffShopId?: string | null;
  staffShop?: { id: string; name: string } | null;
  shops?: Array<{ id: string; name: string }>;
  roles: Array<{ id: string; name: string }>;
  pending?: boolean;
};

type Role = {
  id: string;
  name: string;
  description: string | null;
};

type UserManagementClientProps = {
  canManageStaffPermissions: boolean;
};

export default function UserManagementPage({
  canManageStaffPermissions,
}: UserManagementClientProps) {
  const online = useOnlineStatus();
  const { pendingCount, syncing, lastSyncAt } = useSyncStatus();
  const [users, setUsers] = useState<User[]>([]);
  const [creatableRoles, setCreatableRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [viewingUser, setViewingUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const usersCacheKey = "cachedUsers:manageable";
  const rolesCacheKey = "cachedUsers:roles";
  const applyUsersUpdate = useCallback(
    (updater: (prev: User[]) => User[]) => {
      setUsers((prev) => {
        const next = updater(prev);
        try {
          safeLocalStorageSet(usersCacheKey, JSON.stringify(next));
        } catch (err) {
          handlePermissionError(err);
          console.warn("User cache write failed", err);
        }
        return next;
      });
    },
    [usersCacheKey]
  );

  const loadFromCache = useCallback(() => {
    let loaded = false;
    try {
      const rawUsers = safeLocalStorageGet(usersCacheKey);
      if (rawUsers) {
        const parsed = JSON.parse(rawUsers) as User[];
        if (Array.isArray(parsed)) {
          setUsers(parsed);
          loaded = true;
        }
      }
    } catch (err) {
      handlePermissionError(err);
      console.warn("User cache read failed", err);
    }

    try {
      const rawRoles = safeLocalStorageGet(rolesCacheKey);
      if (rawRoles) {
        const parsed = JSON.parse(rawRoles) as Role[];
        if (Array.isArray(parsed)) {
          setCreatableRoles(parsed);
          loaded = true;
        }
      }
    } catch (err) {
      handlePermissionError(err);
      console.warn("Role cache read failed", err);
    }

    return loaded;
  }, [usersCacheKey, rolesCacheKey]);

  const loadData = useCallback(async () => {
    setError(null);
    if (!online) {
      setLoading(false);
      const loaded = loadFromCache();
      if (!loaded) {
        setError("Offline: cached user data not available.");
      }
      return;
    }

    try {
      setLoading(true);
      const [usersData, rolesData] = await Promise.all([
        getManageableUsers(),
        getCreatableRoles(),
      ]);
      setUsers(usersData);
      setCreatableRoles(rolesData);
      try {
        safeLocalStorageSet(usersCacheKey, JSON.stringify(usersData));
        safeLocalStorageSet(rolesCacheKey, JSON.stringify(rolesData));
      } catch (err) {
        handlePermissionError(err);
        console.warn("User cache write failed", err);
      }
    } catch (err) {
      handlePermissionError(err);
      const loaded = loadFromCache();
      if (!loaded) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      }
    } finally {
      setLoading(false);
    }
  }, [online, loadFromCache, usersCacheKey, rolesCacheKey]);


  const handleOptimisticUpdate = useCallback(
    (nextUser: User) => {
      applyUsersUpdate((prev) =>
        prev.map((user) =>
          user.id === nextUser.id ? { ...user, ...nextUser } : user
        )
      );
    },
    [applyUsersUpdate]
  );

  const handleOptimisticDelete = useCallback(
    (userId: string) => {
      applyUsersUpdate((prev) => prev.filter((user) => user.id !== userId));
    },
    [applyUsersUpdate]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    let active = true;
    const purgeOfflineCreates = async () => {
      try {
        const items = await db.queue.where("type").equals("admin").toArray();
        const matches = items.filter(
          (item) => item.payload?.action === "user_create"
        );
        const ids = matches
          .map((item) => item.id)
          .filter((id): id is number => typeof id === "number");
        if (ids.length) {
          await db.queue.bulkDelete(ids);
        }
        if (active && matches.length) {
          applyUsersUpdate((prev) =>
            prev.filter((user) => !user.id.startsWith("offline-"))
          );
        }
      } catch (err) {
        handlePermissionError(err);
        console.warn("Purge offline user creates failed", err);
      }
    };
    purgeOfflineCreates();
    return () => {
      active = false;
    };
  }, [applyUsersUpdate]);

  useEffect(() => {
    if (!online || !lastSyncAt || syncing || pendingCount > 0) return;
    loadData();
  }, [online, lastSyncAt, syncing, pendingCount, loadData]);

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

  const formatDateTime = (value: Date | string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "তারিখ নেই";
    }
    return date.toLocaleString("bn-BD", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  const viewingUserIsOwner =
    viewingUser?.roles.some((role) => role.name === "owner") ?? false;
  const viewingUserIsStaff =
    viewingUser?.roles.some((role) => role.name === "staff") ?? false;
  const viewingOwnerShops = viewingUser?.shops ?? [];
  const viewingStaffShopName = viewingUser?.staffShop?.name ?? null;

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

  const handleCreateClick = () => {
    setIsCreateDialogOpen(true);
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
      {!online && (
        <div className="rounded-lg border border-warning/30 bg-warning-soft text-warning text-xs font-semibold px-3 py-2">
          অফলাইন: নতুন ইউজার তৈরি করা যাবে না। এডিট/ডিলিট অনলাইনে গেলে সিংক হবে।
        </div>
      )}
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
              onClick={handleCreateClick}
              disabled={!online}
              className="px-4 py-2 bg-primary-soft text-primary border border-primary/30 rounded-lg font-medium hover:bg-primary/15 hover:border-primary/40 whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
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
          <div className="space-y-4">
            <div className="md:hidden space-y-3">
              {filteredUsers.map((user) => (
                <div
                  key={user.id}
                  className="rounded-xl border border-border bg-card p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-foreground">
                        {user.name || "(নাম নেই)"}
                      </h3>
                      <p className="text-xs text-muted-foreground break-all">
                        {user.email || "(ইমেইল নেই)"}
                      </p>
                    </div>
                    <button
                      onClick={() => setViewingUser(user)}
                      className="rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted"
                    >
                      বিস্তারিত
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
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
                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-[11px] text-muted-foreground">
                        তৈরির তারিখ
                      </p>
                      <p className="text-sm text-foreground">
                        {formatDateTime(user.createdAt)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">
                        ইমেইল যাচাই
                      </p>
                      <p className="text-sm text-foreground">
                        {user.emailVerified ? "যাচাই হয়েছে" : "যাচাই হয়নি"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        setEditingUser(user);
                      }}
                      className="rounded-md border border-primary/30 bg-primary-soft px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/15"
                    >
                      সম্পাদনা
                    </button>
                    {canManageStaffPermissions &&
                    user.roles.some((role) => role.name === "staff") ? (
                      <Link
                        href={`/dashboard/users/${user.id}/access`}
                        prefetch={false}
                        className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary/40 hover:text-primary"
                      >
                        অ্যাকসেস
                      </Link>
                    ) : null}
                    <button
                      onClick={() => {
                        setDeletingUser(user);
                      }}
                      className="rounded-md border border-danger/30 bg-danger-soft px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger/10"
                    >
                      মুছুন
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block border border-border rounded-lg overflow-hidden">
              <div className="max-h-[600px] overflow-auto">
                <table className="min-w-[920px] w-full divide-y divide-border">
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
                          {formatDateTime(user.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <button
                              onClick={() => setViewingUser(user)}
                              className="text-foreground hover:text-primary font-medium"
                            >
                              বিস্তারিত
                            </button>
                            <span className="text-muted-foreground">|</span>
                            <button
                              onClick={() => {
                                setEditingUser(user);
                              }}
                              className="text-primary hover:text-primary-hover font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              সম্পাদনা
                            </button>
                            {canManageStaffPermissions &&
                            user.roles.some((role) => role.name === "staff") ? (
                              <>
                                <span className="text-muted-foreground">|</span>
                                <Link
                                  href={`/dashboard/users/${user.id}/access`}
                                  prefetch={false}
                                  className="text-foreground hover:text-primary font-medium"
                                >
                                  অ্যাকসেস
                                </Link>
                              </>
                            ) : null}
                            <span className="text-muted-foreground">|</span>
                            <button
                              onClick={() => {
                                setDeletingUser(user);
                              }}
                              className="text-danger hover:text-danger/80 font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              মুছুন
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
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
        onOptimisticUpdate={handleOptimisticUpdate}
      />

      {/* Delete User Dialog */}
      <DeleteUserDialog
        isOpen={deletingUser !== null}
        onClose={() => setDeletingUser(null)}
        user={deletingUser}
        onSuccess={loadData}
        onOptimisticDelete={handleOptimisticDelete}
      />

      {/* User Details Dialog */}
      <Dialog
        open={viewingUser !== null}
        onOpenChange={(open) => {
          if (!open) {
            setViewingUser(null);
          }
        }}
      >
        <DialogContent className="w-[95vw] max-w-md sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader className="text-left">
            <DialogTitle>ব্যবহারকারী বিস্তারিত</DialogTitle>
            <DialogDescription>
              নির্বাচিত ব্যবহারকারীর গুরুত্বপূর্ণ তথ্য
            </DialogDescription>
          </DialogHeader>
          {viewingUser ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">নাম</p>
                <p className="text-base font-semibold text-foreground mt-1">
                  {viewingUser.name || "(নাম নেই)"}
                </p>
                <p className="text-xs text-muted-foreground mt-3">ইমেইল</p>
                <p className="text-sm text-foreground break-all mt-1">
                  {viewingUser.email || "(ইমেইল নেই)"}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">ভূমিকা</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {viewingUser.roles.length === 0 ? (
                      <span className="inline-flex items-center rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground">
                        কোনো ভূমিকা নেই
                      </span>
                    ) : (
                      viewingUser.roles.map((role) => (
                        <span
                          key={role.id}
                          className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                        >
                          {role.name}
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">ইমেইল যাচাই</p>
                  <p className="mt-2 text-sm font-medium text-foreground">
                    {viewingUser.emailVerified ? "যাচাই হয়েছে" : "যাচাই হয়নি"}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">তৈরির তারিখ</p>
                  <p className="mt-2 text-sm text-foreground">
                    {formatDateTime(viewingUser.createdAt)}
                  </p>
                </div>
                {viewingUser.createdBy ? (
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">তৈরি করেছেন</p>
                    <p className="mt-2 text-sm text-foreground break-all">
                      {viewingUser.createdBy}
                    </p>
                  </div>
                ) : null}
                {viewingUserIsStaff ? (
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">
                      নিয়োজিত দোকান
                    </p>
                    <p className="mt-2 text-sm text-foreground">
                      {viewingStaffShopName ?? "অজানা"}
                    </p>
                  </div>
                ) : null}
                {viewingUserIsOwner ? (
                  <div className="rounded-lg border border-border p-3 sm:col-span-2">
                    <p className="text-xs text-muted-foreground">
                      ওনার অধীন দোকান
                    </p>
                    {viewingOwnerShops.length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {viewingOwnerShops.map((shop) => (
                          <span
                            key={shop.id}
                            className="inline-flex items-center rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-xs text-muted-foreground"
                          >
                            {shop.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">
                        কোনো দোকান নেই
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
