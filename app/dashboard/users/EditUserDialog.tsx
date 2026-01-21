"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { updateUser } from "@/app/actions/user-management";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { queueAdminAction } from "@/lib/sync/queue";
import { db } from "@/lib/dexie/db";
import { handlePermissionError } from "@/lib/permission-toast";

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

type EditUserDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onSuccess: () => void;
  onOptimisticUpdate?: (user: User) => void;
};

export function EditUserDialog({
  isOpen,
  onClose,
  user,
  onSuccess,
  onOptimisticUpdate,
}: EditUserDialogProps) {
  const online = useOnlineStatus();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updatePendingCreate = async (
    clientId: string,
    data: Record<string, any>
  ) => {
    try {
      const items = await db.queue.where("type").equals("admin").toArray();
      const matches = items.filter(
        (item) =>
          item.payload?.action === "user_create" &&
          item.payload?.data?.clientId === clientId
      );
      await Promise.all(
        matches.map((item) =>
          item.id
            ? db.queue.update(item.id, {
                payload: {
                  ...item.payload,
                  data: { ...item.payload.data, ...data },
                },
              })
            : Promise.resolve()
        )
      );
    } catch (err) {
      handlePermissionError(err);
      console.error("Update pending user create failed", err);
    }
  };

  useEffect(() => {
    if (isOpen && user) {
      setName(user.name ?? "");
      setEmail(user.email ?? "");
      setError(null);
      setPassword("");
      setConfirmPassword("");
      setShowPassword(false);
      setShowConfirmPassword(false);
    }
  }, [isOpen, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!user) return;

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName || !trimmedEmail) {
      setError("সব ফিল্ড পূরণ করুন");
      return;
    }

    if (!online && (password.trim() || confirmPassword.trim())) {
      setError("অফলাইনে পাসওয়ার্ড পরিবর্তন করা যাবে না");
      return;
    }

    if (password || confirmPassword) {
      if (password !== confirmPassword) {
        setError("পাসওয়ার্ড ও কনফার্ম পাসওয়ার্ড মিলছে না");
        return;
      }

      if (password.length < 8) {
        setError("পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে");
        return;
      }
    }

    try {
      setLoading(true);
      if (!online) {
        const trimmedPassword = password.trim();
        const passwordValue = trimmedPassword ? trimmedPassword : undefined;
        const payload = {
          userId: user.id,
          name: trimmedName,
          email: trimmedEmail,
          ...(passwordValue ? { password: passwordValue } : {}),
        };

        if (user.id.startsWith("offline-")) {
          await updatePendingCreate(user.id, {
            email: trimmedEmail,
            name: trimmedName,
            ...(passwordValue ? { password: passwordValue } : {}),
          });
        } else {
          await queueAdminAction("user_update", payload);
        }

        onOptimisticUpdate?.({
          ...user,
          name: trimmedName,
          email: trimmedEmail,
          pending: true,
        });
        alert("অফলাইন: আপডেট কিউ হয়েছে, অনলাইনে গেলে সিঙ্ক হবে।");
        onClose();
        return;
      }
      await updateUser(user.id, {
        name: trimmedName,
        email: trimmedEmail,
        password: password || undefined,
      });
      onSuccess();
      onClose();
    } catch (err) {
      handlePermissionError(err);
      setError(err instanceof Error ? err.message : "ব্যবহারকারী আপডেট করতে ব্যর্থ");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !user) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40">
      <div className="w-full max-w-md rounded-lg border border-border bg-card shadow-xl mx-4">
        <div className="flex items-center justify-between border-b border-border p-6">
          <h2 className="text-lg font-semibold text-foreground">
            ব্যবহারকারী সম্পাদনা
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-2xl leading-none"
            disabled={loading}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-lg border border-danger/30 bg-danger-soft p-3">
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              নাম *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ব্যবহারকারীর নাম লিখুন"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">
                নতুন পাসওয়ার্ড
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="ফাঁকা রাখলে পরিবর্তন হবে না"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 pr-10 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  disabled={loading || !online}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "পাসওয়ার্ড লুকান" : "পাসওয়ার্ড দেখুন"}
                  disabled={loading || !online}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                কমপক্ষে ৮ অক্ষর; একটি বড় হাতের অক্ষর ও একটি সংখ্যা দিলে ভালো।
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">
                কনফার্ম পাসওয়ার্ড
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="আবার পাসওয়ার্ড লিখুন"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 pr-10 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  disabled={loading || !online}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={
                    showConfirmPassword
                      ? "কনফার্ম পাসওয়ার্ড লুকান"
                      : "কনফার্ম পাসওয়ার্ড দেখুন"
                  }
                  disabled={loading || !online}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              ইমেইল *
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              disabled={loading}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              ভূমিকা
            </label>
            <div className="flex flex-wrap gap-1">
              {user.roles.length === 0 ? (
                <span className="inline-flex items-center rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground">
                  কোনো ভূমিকা নেই
                </span>
              ) : (
                user.roles.map((role) => (
                  <span
                    key={role.id}
                    className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-foreground"
                  >
                    {role.name}
                  </span>
                ))
              )}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              ভূমিকা পরিবর্তন করতে RBAC admin panel ব্যবহার করুন।
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-border px-4 py-2 font-medium text-foreground hover:bg-muted disabled:opacity-50"
              disabled={loading}
            >
              বাতিল
            </button>
            <button
              type="submit"
              className="flex-1 rounded-lg border border-primary/30 bg-primary-soft px-4 py-2 font-medium text-primary hover:bg-primary/15 hover:border-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={loading}
            >
              {loading ? "সংরক্ষণ হচ্ছে..." : "সংরক্ষণ করুন"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
