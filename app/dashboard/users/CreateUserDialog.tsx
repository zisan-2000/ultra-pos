"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { createUserWithRole } from "@/app/actions/user-management";
import { getShopsByUser } from "@/app/actions/shops";
import {
  getPasswordPolicyError,
  PASSWORD_POLICY_HELPER_TEXT,
} from "@/lib/password-policy";
import {
  DEFAULT_STAFF_PERMISSION_PRESET,
  STAFF_PERMISSION_PRESETS,
  type StaffPermissionPresetKey,
} from "@/lib/staff-permission-presets";
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
  const [selectedRoleId, setSelectedRoleId] = useState(
    creatableRoles[0]?.id || ""
  );
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShopId, setSelectedShopId] = useState("");
  const [selectedStaffPreset, setSelectedStaffPreset] =
    useState<StaffPermissionPresetKey>(DEFAULT_STAFF_PERMISSION_PRESET);
  const [shopsLoading, setShopsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedRole = useMemo(
    () => creatableRoles.find((role) => role.id === selectedRoleId),
    [creatableRoles, selectedRoleId]
  );
  const needsShopAssignment =
    selectedRole?.name === "staff" || selectedRole?.name === "manager";
  const isStaffRole = selectedRole?.name === "staff";

  useEffect(() => {
    if (!isOpen || !needsShopAssignment) return;

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
        setError(err instanceof Error ? err.message : "শপ তালিকা লোড করা যায়নি");
      })
      .finally(() => {
        if (mounted) setShopsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isOpen, needsShopAssignment, online]);

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

    const passwordError = getPasswordPolicyError(trimmedPassword);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (needsShopAssignment && !selectedShopId) {
      setError("ম্যানেজার/স্টাফ ইউজারের জন্য শপ নির্বাচন করুন");
      return;
    }

    try {
      setLoading(true);
      if (!online) {
        setError("অফলাইন: নতুন ব্যবহারকারী তৈরি করা যাবে না");
        return;
      }
      await createUserWithRole(
        trimmedEmail,
        trimmedName,
        trimmedPassword,
        selectedRoleId,
        needsShopAssignment ? selectedShopId : undefined,
        isStaffRole ? selectedStaffPreset : undefined,
      );
      setName("");
      setEmail("");
      setPassword("");
      setSelectedRoleId(creatableRoles[0]?.id || "");
      setSelectedShopId("");
      setSelectedStaffPreset(DEFAULT_STAFF_PERMISSION_PRESET);
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
    <div className="fixed inset-0 z-50 bg-foreground/45 sm:flex sm:items-center sm:justify-center">
      <div className="flex h-full w-full items-end sm:h-auto sm:w-full sm:max-w-lg sm:items-center sm:justify-center sm:px-4">
        <div className="flex h-[92dvh] w-full flex-col rounded-t-3xl border border-border bg-card shadow-xl sm:h-auto sm:max-h-[88vh] sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-4 sm:px-6 sm:py-5">
          <h2 className="text-lg font-semibold text-foreground">
            নতুন ব্যবহারকারী তৈরি করুন
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-2xl leading-none"
            disabled={loading}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {isOfflineBlocked && (
            <div className="rounded-lg border border-warning/30 bg-warning-soft text-warning text-xs font-semibold px-3 py-2">
              অফলাইন: নতুন ব্যবহারকারী তৈরি করা যাবে না
            </div>
          )}
          {error && (
            <div className="bg-danger-soft border border-danger/30 rounded-lg p-3">
              <p className="text-danger text-sm">{error}</p>
            </div>
          )}

          <div className="space-y-4 rounded-2xl border border-border/70 bg-muted/30 p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                বেসিক তথ্য
              </p>
            </div>
            <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              নাম *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ব্যবহারকারীর নাম লিখুন"
              className="w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              disabled={loading}
            />
          </div>

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
          </div>

          <div className="space-y-4 rounded-2xl border border-border/70 bg-muted/30 p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                নিরাপত্তা
              </p>
            </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              পাসওয়ার্ড *
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="একটি শক্তিশালী পাসওয়ার্ড দিন"
                className="w-full px-3 py-2 pr-10 border border-border rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? "পাসওয়ার্ড লুকান" : "পাসওয়ার্ড দেখুন"}
                disabled={loading}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {PASSWORD_POLICY_HELPER_TEXT}
            </p>
          </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-border/70 bg-muted/30 p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                ভূমিকা ও অ্যাকসেস
              </p>
            </div>
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

          {needsShopAssignment && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                শপ নির্বাচন করুন *
              </label>
              <select
                value={selectedShopId}
                onChange={(e) => setSelectedShopId(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                disabled={loading || shopsLoading}
              >
                {shops.length === 0 ? (
                  <option value="">কোনো শপ পাওয়া যায়নি</option>
                ) : (
                  shops.map((shop) => (
                    <option key={shop.id} value={shop.id}>
                      {shop.name}
                    </option>
                  ))
                )}
              </select>
              {shopsLoading ? (
                <p className="text-xs text-muted-foreground mt-1">
                  শপ লোড হচ্ছে...
                </p>
              ) : null}
            </div>
          )}

          {isStaffRole && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                স্টাফ প্রিসেট *
              </label>
              <select
                value={selectedStaffPreset}
                onChange={(e) =>
                  setSelectedStaffPreset(e.target.value as StaffPermissionPresetKey)
                }
                className="w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                disabled={loading}
              >
                {STAFF_PERMISSION_PRESETS.map((preset) => (
                  <option key={preset.key} value={preset.key}>
                    {preset.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                {
                  STAFF_PERMISSION_PRESETS.find(
                    (preset) => preset.key === selectedStaffPreset,
                  )?.description
                }
              </p>
            </div>
          )}
          </div>

          </div>

          <div className="border-t border-border bg-card/95 px-4 py-4 backdrop-blur sm:px-6">
          <div className="flex gap-3">
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
          </div>
        </form>
      </div>
      </div>
    </div>
  );
}
