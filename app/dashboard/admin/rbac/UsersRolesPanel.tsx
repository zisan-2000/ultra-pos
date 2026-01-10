"use client";

import { useState, useTransition } from "react";
import type { Role } from "@prisma/client";
import { assignRoleToUser, revokeRoleFromUser } from "@/app/actions/rbac-admin";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { queueAdminAction } from "@/lib/sync/queue";

interface UserRow {
  id: string;
  email: string | null;
  name: string | null;
  roles: { id: string; name: string }[];
}

interface UsersRolesPanelProps {
  users: UserRow[];
  roles: Role[];
}

export function UsersRolesPanel({ users, roles }: UsersRolesPanelProps) {
  const online = useOnlineStatus();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [workingUserId, setWorkingUserId] = useState<string | null>(null);
  const [localAssignments, setLocalAssignments] = useState<
    Record<string, Set<string>>
  >(() => {
    const initial: Record<string, Set<string>> = {};
    for (const u of users) {
      initial[u.id] = new Set(u.roles.map((r) => r.id));
    }
    return initial;
  });
  const [saving, startSaving] = useTransition();

  const openForUser = (userId: string) => {
    setSelectedUserId(userId);
  };

  const closeDialog = () => {
    setSelectedUserId(null);
  };

  const toggleRole = (roleId: string) => {
    if (!selectedUserId) return;
    setLocalAssignments((prev) => {
      const current = new Set(prev[selectedUserId] ?? []);
      if (current.has(roleId)) {
        current.delete(roleId);
      } else {
        current.add(roleId);
      }
      return { ...prev, [selectedUserId]: current };
    });
  };

  const handleSave = () => {
    if (!selectedUserId) return;
    const current = localAssignments[selectedUserId] ?? new Set<string>();
    const original = new Set(
      users.find((u) => u.id === selectedUserId)?.roles.map((r) => r.id) ?? [],
    );

    const toAssign = Array.from(current).filter((id) => !original.has(id));
    const toRevoke = Array.from(original).filter((id) => !current.has(id));

    if (!toAssign.length && !toRevoke.length) {
      closeDialog();
      return;
    }

    startSaving(async () => {
      setWorkingUserId(selectedUserId);
      try {
        if (!online) {
          await Promise.all([
            ...toAssign.map((roleId) =>
              queueAdminAction("rbac_assign_role", {
                userId: selectedUserId,
                roleId,
              }),
            ),
            ...toRevoke.map((roleId) =>
              queueAdminAction("rbac_revoke_role", {
                userId: selectedUserId,
                roleId,
              }),
            ),
          ]);
          try {
            const raw = localStorage.getItem("admin:rbac");
            if (raw) {
              const parsed = JSON.parse(raw) as {
                users?: UserRow[];
                roleOptions?: Role[];
                roles?: Role[];
                permissions?: any[];
              };
              if (Array.isArray(parsed.users)) {
                const roleMap = new Map(roles.map((role) => [role.id, role.name]));
                parsed.users = parsed.users.map((user) => {
                  if (user.id !== selectedUserId) return user;
                  const nextRoles = Array.from(current).map((id) => ({
                    id,
                    name: roleMap.get(id) || "Unknown",
                  }));
                  return { ...user, roles: nextRoles };
                });
                localStorage.setItem("admin:rbac", JSON.stringify(parsed));
              }
            }
          } catch {
            // ignore cache errors
          }
          alert("Offline: role changes queued.");
          return;
        }

        await Promise.all([
          ...toAssign.map((roleId) => assignRoleToUser(selectedUserId, roleId)),
          ...toRevoke.map((roleId) => revokeRoleFromUser(selectedUserId, roleId)),
        ]);
      } finally {
        setWorkingUserId(null);
        closeDialog();
      }
    });
  };

  const selectedUser =
    selectedUserId && users.find((u) => u.id === selectedUserId);

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
            👥 Users & Roles
          </div>
          <h2 className="text-lg font-semibold text-foreground">টিম অ্যাক্সেস</h2>
          <p className="text-[12px] text-muted-foreground">
            কার কাছে কোন রোল আছে তা রিভিউ করুন ও প্রয়োজনমতো আপডেট করুন।
          </p>
        </div>
        <span className="text-xs font-semibold text-muted-foreground bg-muted border border-border rounded-lg px-3 py-1.5">
          {users.length} users
        </span>
      </div>

      <div className="border border-border rounded-xl overflow-hidden max-h-[420px] overflow-y-auto text-sm shadow-inner">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted">
            <tr>
              <th className="px-3 py-2 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                User
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                Roles
              </th>
              <th className="px-3 py-2 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-card divide-y divide-border">
            {users.map((u, idx) => {
              const roleIds =
                localAssignments[u.id] ?? new Set(u.roles.map((r) => r.id));
              const displayRoles = roles.filter((r) => roleIds.has(r.id));

              return (
                <tr
                  key={u.id}
                  className={idx % 2 === 0 ? "bg-card" : "bg-muted/40"}
                >
                <td className="px-3 py-2 align-top">
                  <div className="font-semibold text-foreground text-xs sm:text-sm">
                    {u.name || "(No name)"}
                  </div>
                  <div className="text-[11px] text-muted-foreground break-all">
                    {u.email || "(No email)"}
                  </div>
                </td>
                <td className="px-3 py-2 align-top text-xs sm:text-sm">
                  <div className="flex flex-wrap gap-1">
                    {displayRoles.length === 0 ? (
                      <span className="inline-flex items-center rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                        No roles
                      </span>
                    ) : (
                      displayRoles.map((r) => (
                        <span
                          key={r.id}
                          className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground border border-border"
                        >
                          {r.name}
                        </span>
                      ))
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 align-top text-right text-xs sm:text-sm">
                  <button
                    type="button"
                    onClick={() => openForUser(u.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-[11px] font-semibold text-foreground shadow-sm hover:bg-muted"
                  >
                    ✏️ Manage
                  </button>
                </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedUser && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-foreground/40 backdrop-blur-[2px] px-4">
          <div className="w-full max-w-lg rounded-2xl bg-card shadow-2xl border border-border p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                  👤 User
                </div>
                <h3 className="text-base font-semibold text-foreground">রোল ব্যবস্থাপনা</h3>
                <p className="text-xs text-muted-foreground break-all">
                  {selectedUser.name || selectedUser.email || selectedUser.id}
                </p>
              </div>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground text-lg leading-none"
                onClick={closeDialog}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto border border-border rounded-xl divide-y divide-border">
              {roles.map((role) => {
                const assigned = localAssignments[selectedUser.id]?.has(role.id);
                return (
                  <label
                    key={role.id}
                    className="flex items-start gap-3 px-3 py-2.5 text-xs sm:text-sm cursor-pointer hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
                      checked={assigned ?? false}
                      onChange={() => toggleRole(role.id)}
                    />
                    <div>
                      <div className="font-semibold text-foreground text-xs sm:text-sm">
                        {role.name}
                      </div>
                      {role.description ? (
                        <div className="text-[11px] text-muted-foreground">
                          {role.description}
                        </div>
                      ) : null}
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 text-xs">
              <button
                type="button"
                className="inline-flex items-center rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
                onClick={closeDialog}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center rounded-lg bg-primary-soft text-primary border border-primary/30 px-3.5 py-2 text-xs font-semibold shadow-sm hover:bg-primary/15 hover:border-primary/40 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {saving && workingUserId === selectedUser.id ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
