"use client";

import { useEffect, useState } from "react";
import { updateUser } from "@/app/actions/user-management";

type User = {
  id: string;
  email: string | null;
  name: string | null;
  emailVerified: boolean;
  createdAt: Date;
  createdBy: string | null;
  roles: Array<{ id: string; name: string }>;
};

type EditUserDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onSuccess: () => void;
};

export function EditUserDialog({
  isOpen,
  onClose,
  user,
  onSuccess,
}: EditUserDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync local form state whenever dialog opens or target user changes
  useEffect(() => {
    if (isOpen && user) {
      setName(user.name ?? "");
      setEmail(user.email ?? "");
      setError(null);
      setPassword("");
      setConfirmPassword("");
    }
  }, [isOpen, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!user) return;

    if (!name.trim() || !email.trim()) {
      setError("সব ফিল্ড পূরণ করুন");
      return;
    }

    // If password fields filled, validate
    if (password || confirmPassword) {
      if (password !== confirmPassword) {
        setError("Password এবং Confirm Password মিলছে না");
        return;
      }

      if (password.length < 8) {
        setError("Password কমপক্ষে ৮ অক্ষরের হতে হবে");
        return;
      }
    }

    try {
      setLoading(true);
      await updateUser(user.id, {
        name,
        email,
        password: password || undefined,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ব্যবহারকারী আপডেট করতে ব্যর্থ");
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
          <h2 className="text-lg font-semibold text-foreground">ব্যবহারকারী সম্পাদনা করুন</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-2xl leading-none"
            disabled={loading}
          >
            ×
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-danger-soft border border-danger/30 rounded-lg p-3">
              <p className="text-danger text-sm">{error}</p>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              নাম *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ব্যবহারকারীর নাম"
              className="w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              disabled={loading}
            />
          </div>

          {/* Password */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                নতুন পাসওয়ার্ড
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="ফাঁকা রাখলে পাসওয়ার্ড পরিবর্তন হবে না"
                className="w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground mt-1">
                কমপক্ষে ৮ অক্ষর, একটি বড় অক্ষর এবং একটি সংখ্যা ব্যবহার করা উত্তম
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                কনফার্ম পাসওয়ার্ড
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="আবার পাসওয়ার্ড লিখুন"
                className="w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                disabled={loading}
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              ইমেইল *
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              disabled={loading}
            />
          </div>

          {/* Role Info */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
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
            <p className="text-xs text-muted-foreground mt-2">
              ভূমিকা পরিবর্তন করতে RBAC admin panel ব্যবহার করুন
            </p>
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
              type="submit"
              className="flex-1 px-4 py-2 bg-primary-soft text-primary border border-primary/30 rounded-lg font-medium hover:bg-primary/15 hover:border-primary/40 disabled:opacity-50 disabled:cursor-not-allowed"
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
