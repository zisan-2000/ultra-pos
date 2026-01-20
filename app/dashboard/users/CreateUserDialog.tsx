"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { createUserWithRole } from "@/app/actions/user-management";
import { getShopsByUser } from "@/app/actions/shops";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { handlePermissionError } from "@/lib/permission-toast";

type Role = {
  id: string;
  name: string;
  description: string | null;
};

type Shop = {
  id: string;
  name: string;
};

type CreateUserDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  creatableRoles: Role[];
  onSuccess: () => void;
};

export function CreateUserDialog({
  isOpen,
  onClose,
  creatableRoles,
  onSuccess,
}: CreateUserDialogProps) {
  const online = useOnlineStatus();
  const isOfflineBlocked = !online;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState(creatableRoles[0]?.id || "");
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShopId, setSelectedShopId] = useState("");
  const [shopsLoading, setShopsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedRole = useMemo(
    () => creatableRoles.find((role) => role.id === selectedRoleId),
    [creatableRoles, selectedRoleId]
  );
  const isStaffRole = selectedRole?.name === "staff";

  useEffect(() => {
    if (!isOpen || !isStaffRole) return;

    let mounted = true;
    setError(null);

    if (!online) {
      setShops([]);
      setSelectedShopId("");
      setShopsLoading(false);
      return;
    }

    setShopsLoading(true);
    getShopsByUser()
      .then((rows) => {
        if (!mounted) return;
        setShops(rows);
        setSelectedShopId((prev) => prev || rows[0]?.id || "");
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Shop list load failed");
      })
      .finally(() => {
        if (mounted) setShopsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isOpen, isStaffRole, online]);

  useEffect(() => {
    if (isOpen) {
      setShowPassword(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (!trimmedName || !trimmedEmail || !trimmedPassword || !selectedRoleId) {
      setError("সব ফিল্ড পূরণ করুন");
      return;
    }

    if (isStaffRole && !selectedShopId) {
      setError("Staff user এর জন্য shop নির্বাচন করতে হবে");
      return;
    }

    try {
      setLoading(true);
      if (!online) {
        setError("অফলাইন: নতুন ইউজার তৈরি করতে ইন্টারনেট দরকার");
        return;
      }
      await createUserWithRole(
        trimmedEmail,
        trimmedName,
        trimmedPassword,
        selectedRoleId,
        isStaffRole ? selectedShopId : undefined
      );
      setName("");
      setEmail("");
      setPassword("");
      setSelectedRoleId(creatableRoles[0]?.id || "");
      setSelectedShopId("");
      onSuccess();
      onClose();
    } catch (err) {
      handlePermissionError(err);
      setError(err instanceof Error ? err.message : "ব্যবহারকারী তৈরি করতে ব্যর্থ");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-foreground/40 flex items-center justify-center z-50">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">নতুন ব্যবহারকারী তৈরি করুন</h2>
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
          {isOfflineBlocked && (
            <div className="rounded-lg border border-warning/30 bg-warning-soft text-warning text-xs font-semibold px-3 py-2">
              অফলাইন: নতুন ইউজার তৈরি করতে ইন্টারনেট দরকার।
            </div>
          )}
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

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              পাসওয়ার্ড *
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="?????? ??????????"
                className="w-full px-3 py-2 pr-10 border border-border rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
                disabled={loading}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              কমপক্ষে 8 অক্ষর, একটি বড় অক্ষর এবং একটি সংখ্যা প্রয়োজন
            </p>
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              ভূমিকা *
            </label>
            <select
              value={selectedRoleId}
              onChange={(e) => setSelectedRoleId(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              disabled={loading}
            >
              {creatableRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>

          {isStaffRole && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Shop নির্বাচন করুন *
              </label>
              <select
                value={selectedShopId}
                onChange={(e) => setSelectedShopId(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                disabled={loading || shopsLoading}
              >
                {shops.length === 0 ? (
                  <option value="">কোনো Shop পাওয়া যায়নি</option>
                ) : (
                  shops.map((shop) => (
                    <option key={shop.id} value={shop.id}>
                      {shop.name}
                    </option>
                  ))
                )}
              </select>
              {shopsLoading ? (
                <p className="text-xs text-muted-foreground mt-1">Shop লোড হচ্ছে...</p>
              ) : null}
            </div>
          )}

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
              disabled={loading || isOfflineBlocked}
            >
              {loading ? "তৈরি হচ্ছে..." : "তৈরি করুন"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
