"use client";

import { useState } from "react";
import { deleteUser } from "@/app/actions/user-management";

type User = {
  id: string;
  email: string | null;
  name: string | null;
  emailVerified: boolean;
  createdAt: Date;
  createdBy: string | null;
  roles: Array<{ id: string; name: string }>;
};

type DeleteUserDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onSuccess: () => void;
};

export function DeleteUserDialog({
  isOpen,
  onClose,
  user,
  onSuccess,
}: DeleteUserDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);
      await deleteUser(user.id);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ব্যবহারকারী মুছতে ব্যর্থ");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !user) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">ব্যবহারকারী মুছুন</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            disabled={loading}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-yellow-800 font-semibold text-sm mb-2">
              ⚠️ এই কর্মটি পূর্বাবাস করা যায় না
            </p>
            <p className="text-yellow-700 text-sm">
              আপনি নিশ্চিত যে আপনি <strong>{user.name || user.email}</strong> কে মুছতে চান?
            </p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">নাম:</span>
              <span className="font-medium text-gray-900">{user.name || "(নাম নেই)"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">ইমেইল:</span>
              <span className="font-medium text-gray-900">{user.email || "(ইমেইল নেই)"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">ভূমিকা:</span>
              <span className="font-medium text-gray-900">
                {user.roles.map((r) => r.name).join(", ") || "কোনো ভূমিকা নেই"}
              </span>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50"
              disabled={loading}
            >
              বাতিল
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? "মুছছি..." : "মুছুন"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
