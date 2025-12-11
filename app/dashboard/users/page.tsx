// app/dashboard/users/page.tsx

"use client";

import { useEffect, useState } from "react";
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
  createdAt: Date;
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

  if (loading) {
    return (
      <div className="py-8 text-center">
        <p className="text-gray-600">লোড হচ্ছে...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700 font-semibold">ত্রুটি</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 leading-tight">
              ব্যবহারকারী ব্যবস্থাপনা
            </h1>
            <p className="text-sm text-gray-500 mt-1 leading-snug">
              আপনার অধীনে থাকা ব্যবহারকারীদের পরিচালনা করুন
            </p>
          </div>
        </div>
      </div>

      {/* Create User Section */}
      {creatableRoles.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                নতুন ব্যবহারকারী তৈরি করুন
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                আপনি নিম্নলিখিত ভূমিকার জন্য ব্যবহারকারী তৈরি করতে পারেন:
              </p>
            </div>
            <button
              onClick={() => setIsCreateDialogOpen(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 whitespace-nowrap"
            >
              + তৈরি করুন
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {creatableRoles.map((role) => (
              <span
                key={role.id}
                className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700"
              >
                {role.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Users List */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          ব্যবহারকারীদের তালিকা ({users.length})
        </h2>

        {users.length === 0 ? (
          <p className="text-gray-600 text-sm">কোনো ব্যবহারকারী নেই</p>
        ) : (
          <div className="border rounded-lg overflow-hidden max-h-[600px] overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    নাম
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    ইমেইল
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    ভূমিকা
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    তৈরির তারিখ
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    কর্ম
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {user.name || "(নাম নেই)"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {user.email || "(ইমেইল নেই)"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex flex-wrap gap-1">
                        {user.roles.length === 0 ? (
                          <span className="inline-flex items-center rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-xs text-gray-400">
                            কোনো ভূমিকা নেই
                          </span>
                        ) : (
                          user.roles.map((role) => (
                            <span
                              key={role.id}
                              className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
                            >
                              {role.name}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(user.createdAt).toLocaleDateString("bn-BD")}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => setEditingUser(user)}
                        className="text-blue-600 hover:text-blue-800 font-medium text-xs"
                      >
                        সম্পাদনা
                      </button>
                      <span className="mx-2 text-gray-300">|</span>
                      <button
                        onClick={() => setDeletingUser(user)}
                        className="text-red-600 hover:text-red-800 font-medium text-xs"
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
