"use client";

import { useMemo, useState, useTransition } from "react";
import type { Role, Permission } from "@prisma/client";
import { updateRolePermissions } from "@/app/actions/rbac-admin";

type RoleWithPermissions = Role & {
  rolePermissions: { permissionId: string }[];
};

interface RolesPermissionsPanelProps {
  roles: RoleWithPermissions[];
  permissions: Permission[];
}

export function RolesPermissionsPanel({
  roles,
  permissions,
}: RolesPermissionsPanelProps) {
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(
    roles[0]?.id ?? null,
  );
  const [saving, startSaving] = useTransition();
  const [localAssignments, setLocalAssignments] = useState<
    Record<string, Set<string>>
  >(() => {
    const initial: Record<string, Set<string>> = {};
    for (const role of roles) {
      initial[role.id] = new Set(role.rolePermissions.map((rp) => rp.permissionId));
    }
    return initial;
  });

  const selectedRole = useMemo(
    () => roles.find((r) => r.id === selectedRoleId) ?? null,
    [roles, selectedRoleId],
  );

  const selectedPermissionIds = useMemo(() => {
    if (!selectedRole) return new Set<string>();
    return localAssignments[selectedRole.id] ?? new Set<string>();
  }, [selectedRole, localAssignments]);

  const togglePermission = (permissionId: string) => {
    if (!selectedRole) return;
    setLocalAssignments((prev) => {
      const current = new Set(prev[selectedRole.id] ?? []);
      if (current.has(permissionId)) {
        current.delete(permissionId);
      } else {
        current.add(permissionId);
      }
      return { ...prev, [selectedRole.id]: current };
    });
  };

  const handleSave = () => {
    if (!selectedRole) return;
    const ids = Array.from(selectedPermissionIds);
    startSaving(async () => {
      await updateRolePermissions(selectedRole.id, ids);
    });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-gray-900">Roles &amp; Permissions</h2>
        <span className="text-xs text-gray-500">{roles.length} roles</span>
      </div>
      <div className="grid grid-cols-5 gap-3 text-xs sm:text-sm">
        {/* Roles list */}
        <div className="col-span-2 border rounded-lg overflow-hidden max-h-[320px] overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  Role
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {roles.map((r) => {
                const isActive = r.id === selectedRoleId;
                return (
                  <tr key={r.id}>
                    <td
                      className={`px-3 py-2 cursor-pointer ${
                        isActive ? "bg-green-50" : "hover:bg-gray-50"
                      }`}
                      onClick={() => setSelectedRoleId(r.id)}
                    >
                      <div className="font-medium text-gray-900 text-xs sm:text-sm">
                        {r.name}
                      </div>
                      {r.description ? (
                        <div className="text-[11px] text-gray-500">
                          {r.description}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Permissions for selected role */}
        <div className="col-span-3 border rounded-lg overflow-hidden max-h-[320px] overflow-y-auto">
          {selectedRole ? (
            <>
              <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50">
                <div className="text-xs font-semibold text-gray-700">
                  Permissions for role: <span className="font-mono">{selectedRole.name}</span>
                </div>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
              <div className="divide-y divide-gray-200">
                {permissions.map((p) => {
                  const checked = selectedPermissionIds.has(p.id);
                  return (
                    <label
                      key={p.id}
                      className="flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 text-xs sm:text-sm"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        checked={checked}
                        onChange={() => togglePermission(p.id)}
                      />
                      <div>
                        <div className="font-mono text-[11px] sm:text-xs text-gray-900">
                          {p.name}
                        </div>
                        {p.description ? (
                          <div className="text-[10px] text-gray-500">
                            {p.description}
                          </div>
                        ) : null}
                      </div>
                    </label>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="p-4 text-xs text-gray-500">
              Select a role to manage its permissions.
            </div>
          )}
        </div>
      </div>
      <p className="mt-3 text-[11px] text-gray-500">
        Changes are applied immediately for the selected role. Super admin always retains all permissions regardless of these settings.
      </p>
    </div>
  );
}
