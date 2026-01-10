"use client";

import { useState } from "react";
import { deleteUser } from "@/app/actions/user-management";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { queueAdminAction, queueRemove } from "@/lib/sync/queue";
import { db } from "@/lib/dexie/db";

type User = {
  id: string;
  email: string | null;
  name: string | null;
  emailVerified: boolean;
  createdAt: Date | string;
  createdBy: string | null;
  roles: Array<{ id: string; name: string }>;
  pending?: boolean;
};

type DeleteUserDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onSuccess: () => void;
  onOptimisticDelete?: (userId: string) => void;
};

export function DeleteUserDialog({
  isOpen,
  onClose,
  user,
  onSuccess,
  onOptimisticDelete,
}: DeleteUserDialogProps) {
  const online = useOnlineStatus();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);
      if (!online) {
        if (user.id.startsWith("offline-")) {
          try {
            const items = await db.queue.where("type").equals("admin").toArray();
            const matches = items.filter(
              (item) =>
                item.payload?.action === "user_create" &&
                item.payload?.data?.clientId === user.id
            );
            await Promise.all(
              matches.map((item) =>
                item.id ? queueRemove(item.id) : Promise.resolve()
              )
            );
          } catch (err) {
            console.error("Remove queued user create failed", err);
          }
          onOptimisticDelete?.(user.id);
          alert("অফলাইন: কিউ থেকে ইউজারটি সরানো হয়েছে।");
          onClose();
          return;
        }

        await queueAdminAction("user_delete", { userId: user.id });
        onOptimisticDelete?.(user.id);
        alert("অফলাইন: ইউজার ডিলিট কিউ হয়েছে, অনলাইনে গেলে সিঙ্ক হবে।");
        onClose();
        return;
      }
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
    <div className="fixed inset-0 bg-foreground/40 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">ব্যবহারকারী মুছুন</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-2xl leading-none"
            disabled={loading}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-danger-soft border border-danger/30 rounded-lg p-3">
              <p className="text-danger text-sm">{error}</p>
            </div>
          )}

          <div className="bg-warning-soft border border-warning/30 rounded-lg p-4">
            <p className="text-warning font-semibold text-sm mb-2">
              ⚠️ এই কর্মটি পূর্বাবাস করা যায় না
            </p>
            <p className="text-warning text-sm">
              আপনি নিশ্চিত যে আপনি <strong>{user.name || user.email}</strong> কে মুছতে চান?
            </p>
          </div>

          <div className="bg-muted rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">নাম:</span>
              <span className="font-medium text-foreground">{user.name || "(নাম নেই)"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">ইমেইল:</span>
              <span className="font-medium text-foreground">{user.email || "(ইমেইল নেই)"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">ভূমিকা:</span>
              <span className="font-medium text-foreground">
                {user.roles.map((r) => r.name).join(", ") || "কোনো ভূমিকা নেই"}
              </span>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-border rounded-lg text-foreground font-medium hover:bg-muted disabled:opacity-50"
              disabled={loading}
            >
              বাতিল
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="flex-1 px-4 py-2 bg-danger text-primary-foreground rounded-lg font-medium hover:bg-danger/90 disabled:opacity-50 disabled:cursor-not-allowed"
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
