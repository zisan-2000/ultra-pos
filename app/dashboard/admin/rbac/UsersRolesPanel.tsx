"use client";

import { useState, useTransition } from "react";
import type { Role } from "@prisma/client";
import { assignRoleToUser, revokeRoleFromUser } from "@/app/actions/rbac-admin";

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
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Users &amp; Roles</h2>
          <p className="text-[11px] text-gray-500 mt-0.5">
            View users and manage which roles are assigned to each user.
          </p>
        </div>
        <span className="text-xs text-gray-500">{users.length} users</span>
      </div>

      <div className="border rounded-lg overflow-hidden max-h-[360px] overflow-y-auto text-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                User
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Roles
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-3 py-2 align-top">
                  <div className="font-medium text-gray-900 text-xs sm:text-sm">
                    {u.name || "(No name)"}
                  </div>
                  <div className="text-[11px] text-gray-500 break-all">
                    {u.email || "(No email)"}
                  </div>
                </td>
                <td className="px-3 py-2 align-top text-xs sm:text-sm">
                  <div className="flex flex-wrap gap-1">
                    {u.roles.length === 0 ? (
                      <span className="inline-flex items-center rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-[11px] text-gray-400">
                        No roles
                      </span>
                    ) : (
                      u.roles.map((r) => (
                        <span
                          key={r.id}
                          className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700"
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
                    className="inline-flex items-center rounded-md border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                  >
                    Manage
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Simple dialog */}
      {selectedUser && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white shadow-lg border border-gray-200 p-4 sm:p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  Manage roles for
                </h3>
                <p className="text-xs text-gray-600 break-all">
                  {selectedUser.email || selectedUser.name || selectedUser.id}
                </p>
              </div>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
                onClick={closeDialog}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="max-h-64 overflow-y-auto border rounded-md divide-y divide-gray-100">
              {roles.map((role) => {
                const assigned = localAssignments[selectedUser.id]?.has(role.id);
                return (
                  <label
                    key={role.id}
                    className="flex items-start gap-2 px-3 py-2 text-xs sm:text-sm cursor-pointer hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      checked={assigned ?? false}
                      onChange={() => toggleRole(role.id)}
                    />
                    <div>
                      <div className="font-medium text-gray-900 text-xs sm:text-sm">
                        {role.name}
                      </div>
                      {role.description ? (
                        <div className="text-[10px] text-gray-500">
                          {role.description}
                        </div>
                      ) : null}
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="mt-4 flex justify-end gap-2 text-xs">
              <button
                type="button"
                className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                onClick={closeDialog}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {saving && workingUserId === selectedUser.id
                  ? "Saving..."
                  : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
