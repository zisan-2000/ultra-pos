"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { updateStaffPermissions } from "@/app/actions/user-management";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { cn } from "@/lib/utils";
import { handlePermissionError } from "@/lib/permission-toast";
import {
  moduleLabels,
  permissionMeta,
  type ModuleKey,
  type PermissionMeta,
} from "@/app/dashboard/admin/rbac/RolesPermissionsPanel";

type PermissionOption = {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
};

type StaffUserSummary = {
  id: string;
  name: string | null;
  email: string | null;
  roles: { id: string; name: string }[];
  shopName: string | null;
};

type GroupedPermission = PermissionOption & { meta: PermissionMeta };

type AccessControlClientProps = {
  user: StaffUserSummary;
  permissions: PermissionOption[];
};

type AccessControlInnerProps = AccessControlClientProps & {
  initialEnabled: Set<string>;
};

const presetDefinitions = [
  {
    key: "pos-basic",
    label: "POS বেসিক",
    description: "বিক্রি + কাস্টমার + বকেয়া ম্যানেজ",
    permissionNames: [
      "view_dashboard_summary",
      "view_products",
      "view_purchases",
      "create_purchase",
      "view_suppliers",
      "create_supplier",
      "create_purchase_payment",
      "view_sales",
      "view_sale_details",
      "create_sale",
      "create_due_sale",
      "take_due_payment_from_sale",
      "view_customers",
      "create_customer",
      "view_due_summary",
      "view_customer_due",
      "take_due_payment",
      "use_offline_pos",
      "sync_offline_data",
    ],
  },
  {
    key: "pos-reports",
    label: "POS + রিপোর্ট",
    description: "বিক্রি + রিপোর্ট দেখার অনুমতি",
    permissionNames: [
      "view_dashboard_summary",
      "view_products",
      "view_purchases",
      "create_purchase",
      "view_suppliers",
      "create_supplier",
      "create_purchase_payment",
      "view_sales",
      "view_sale_details",
      "create_sale",
      "create_due_sale",
      "take_due_payment_from_sale",
      "view_customers",
      "create_customer",
      "view_due_summary",
      "view_customer_due",
      "take_due_payment",
      "view_reports",
      "view_sales_report",
      "view_expense_report",
      "view_cashbook_report",
      "view_profit_report",
      "view_payment_method_report",
      "view_top_products_report",
      "view_low_stock_report",
      "export_reports",
      "use_offline_pos",
      "sync_offline_data",
    ],
  },
];

function AccessControlInner({
  user,
  permissions,
  initialEnabled,
}: AccessControlInnerProps) {
  const online = useOnlineStatus();
  const readOnly = !online;
  const [saving, startSaving] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "error" | "success"; message: string } | null>(
    null,
  );

  const [enabledIds, setEnabledIds] = useState<Set<string>>(
    () => new Set(initialEnabled),
  );
  const [savedIds, setSavedIds] = useState<Set<string>>(
    () => new Set(initialEnabled),
  );

  const permissionIdByName = useMemo(() => {
    const map = new Map<string, string>();
    permissions.forEach((p) => {
      map.set(p.name, p.id);
    });
    return map;
  }, [permissions]);

  const groupedPermissions = useMemo(() => {
    const modulesMap = new Map<
      ModuleKey,
      { key: ModuleKey; label: string; items: GroupedPermission[] }
    >();

    permissions.forEach((permission) => {
      const meta =
        permissionMeta[permission.name] ?? ({
          label: permission.name,
          module: "other",
        } as PermissionMeta);

      const key = meta.module;
      const existing =
        modulesMap.get(key) ??
        ({
          key,
          label: moduleLabels[key] ?? moduleLabels.other,
          items: [],
        } as { key: ModuleKey; label: string; items: GroupedPermission[] });

      existing.items.push({ ...permission, meta });
      modulesMap.set(key, existing);
    });

    return Array.from(modulesMap.values())
      .map((group) => ({
        ...group,
        items: group.items.sort((a, b) =>
          a.meta.label.localeCompare(b.meta.label, "bn"),
        ),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "bn"));
  }, [permissions]);

  const totalPermissions = permissions.length;
  const enabledCount = enabledIds.size;
  const disabledCount = totalPermissions - enabledCount;
  const isDefault = disabledCount === 0;

  const changedCount = useMemo(() => {
    let count = 0;
    permissions.forEach((permission) => {
      const current = enabledIds.has(permission.id);
      const saved = savedIds.has(permission.id);
      if (current !== saved) count += 1;
    });
    return count;
  }, [permissions, enabledIds, savedIds]);

  const hasChanges = changedCount > 0;

  const updateEnabled = (updater: (next: Set<string>) => void) => {
    setFeedback(null);
    setEnabledIds((prev) => {
      const next = new Set(prev);
      updater(next);
      return next;
    });
  };

  const togglePermission = (id: string) => {
    updateEnabled((next) => {
      if (next.has(id)) next.delete(id);
      else next.add(id);
    });
  };

  const setAll = (enabled: boolean) => {
    setFeedback(null);
    if (enabled) {
      setEnabledIds(new Set(permissions.map((p) => p.id)));
    } else {
      setEnabledIds(new Set());
    }
  };

  const setGroup = (ids: string[], enabled: boolean) => {
    updateEnabled((next) => {
      ids.forEach((id) => {
        if (enabled) next.add(id);
        else next.delete(id);
      });
    });
  };

  const applyPreset = (permissionNames: string[]) => {
    const resolved = permissionNames
      .map((name) => permissionIdByName.get(name))
      .filter((id): id is string => Boolean(id));
    if (resolved.length === 0) {
      return;
    }
    setFeedback(null);
    setEnabledIds(new Set(resolved));
  };

  const handleReset = () => {
    setEnabledIds(new Set(savedIds));
    setFeedback(null);
  };

  const handleSave = () => {
    if (readOnly || saving) return;
    setFeedback(null);
    startSaving(async () => {
      try {
        await updateStaffPermissions(user.id, Array.from(enabledIds));
        setSavedIds(new Set(enabledIds));
        setFeedback({ type: "success", message: "স্টাফ অ্যাকসেস সংরক্ষণ হয়েছে।" });
      } catch (err) {
        handlePermissionError(err);
        setFeedback({
          type: "error",
          message: err instanceof Error ? err.message : "সংরক্ষণ ব্যর্থ হয়েছে।",
        });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link
              href="/dashboard/users"
              className="text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              ← ব্যবহারকারী তালিকায় ফিরুন
            </Link>
            <h1 className="text-2xl font-bold text-foreground mt-2">
              স্টাফ অ্যাকসেস কন্ট্রোল
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              স্টাফের কাজ অনুযায়ী অনুমতি সেট করুন। ডিফল্টে সব অনুমতি চালু থাকে।
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span
              className={cn(
                "rounded-full px-3 py-1 font-semibold",
                online
                  ? "bg-success-soft text-success"
                  : "bg-danger-soft text-danger",
              )}
            >
              {online ? "অনলাইন" : "অফলাইন"}
            </span>
            <span className="rounded-full bg-muted px-3 py-1 font-semibold text-muted-foreground">
              মোট অনুমতি: {totalPermissions}
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-muted-foreground">
            নাম: {user.name ?? "নাম নেই"}
          </span>
          <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-muted-foreground">
            ইমেইল: {user.email ?? "ইমেইল নেই"}
          </span>
          <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-muted-foreground">
            দোকান: {user.shopName ?? "অজানা"}
          </span>
        </div>
      </div>

      {readOnly && (
        <div className="rounded-lg border border-warning/30 bg-warning-soft text-warning text-xs font-semibold px-3 py-2">
          অফলাইন মোডে অ্যাকসেস পরিবর্তন করা যাবে না। অনলাইনে এসে আবার চেষ্টা করুন।
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              ডিফল্ট বনাম কাস্টম
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              ডিফল্ট = স্টাফ রোলের সব অনুমতি চালু। কাস্টম করলে নির্দিষ্ট কিছু বন্ধ করতে পারবেন।
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setAll(true)}
              disabled={readOnly}
              className={cn(
                "rounded-lg border px-3 py-1.5 font-semibold",
                isDefault
                  ? "border-success/40 bg-success-soft text-success"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-muted",
                readOnly && "opacity-60 cursor-not-allowed",
              )}
            >
              ডিফল্ট (সব চালু)
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={readOnly || !hasChanges}
              className={cn(
                "rounded-lg border border-border px-3 py-1.5 font-semibold text-muted-foreground hover:text-foreground hover:bg-muted",
                (readOnly || !hasChanges) && "opacity-60 cursor-not-allowed",
              )}
            >
              আগের অবস্থায় ফিরুন
            </button>
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-2">
            দ্রুত প্রিসেট
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {presetDefinitions.map((preset) => (
              <button
                key={preset.key}
                type="button"
                disabled={readOnly}
                onClick={() => applyPreset(preset.permissionNames)}
                className={cn(
                  "rounded-xl border border-border bg-card p-3 text-left shadow-sm hover:bg-muted",
                  readOnly && "opacity-60 cursor-not-allowed",
                )}
              >
                <div className="text-sm font-semibold text-foreground">
                  {preset.label}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {preset.description}
                </div>
              </button>
            ))}
            <button
              type="button"
              disabled={readOnly}
              onClick={() => setAll(true)}
              className={cn(
                "rounded-xl border border-border bg-card p-3 text-left shadow-sm hover:bg-muted",
                readOnly && "opacity-60 cursor-not-allowed",
              )}
            >
              <div className="text-sm font-semibold text-foreground">
                ফুল স্টাফ অ্যাকসেস
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                স্টাফ রোলের সব অনুমতি চালু করুন
              </div>
            </button>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border bg-muted/40">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              মডিউলভিত্তিক অনুমতি
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              চালু: {enabledCount} / {totalPermissions} · বন্ধ: {disabledCount}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span
              className={cn(
                "rounded-full px-3 py-1 font-semibold",
                hasChanges
                  ? "bg-warning-soft text-warning"
                  : "bg-muted text-muted-foreground",
              )}
            >
              পরিবর্তন: {changedCount}
            </span>
            <button
              type="button"
              onClick={handleSave}
              disabled={readOnly || !hasChanges}
              className={cn(
                "rounded-lg bg-primary-soft text-primary border border-primary/30 px-4 py-1.5 font-semibold shadow-sm hover:bg-primary/15 hover:border-primary/40",
                (readOnly || !hasChanges) && "opacity-60 cursor-not-allowed",
              )}
            >
              {saving ? "সংরক্ষণ হচ্ছে..." : "সংরক্ষণ করুন"}
            </button>
          </div>
        </div>

        {feedback ? (
          <div
            className={cn(
              "px-5 py-3 text-xs font-semibold border-b",
              feedback.type === "success"
                ? "bg-success-soft text-success border-success/20"
                : "bg-danger-soft text-danger border-danger/20",
            )}
          >
            {feedback.message}
          </div>
        ) : null}

        <div className="divide-y divide-border">
          {groupedPermissions.length === 0 ? (
            <div className="p-5 text-sm text-muted-foreground">
              এই স্টাফের জন্য কোনো অনুমতি পাওয়া যায়নি।
            </div>
          ) : (
            groupedPermissions.map((module) => {
              const ids = module.items.map((item) => item.id);
              const enabledInGroup = module.items.filter((item) =>
                enabledIds.has(item.id),
              ).length;
              const allEnabled = enabledInGroup === module.items.length;
              const noneEnabled = enabledInGroup === 0;

              return (
                <div key={module.key} className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">
                        {module.label}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        চালু: {enabledInGroup}/{module.items.length}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setGroup(ids, true)}
                        disabled={readOnly || allEnabled}
                        className={cn(
                          "rounded-md border border-border px-2.5 py-1 font-semibold text-muted-foreground hover:text-foreground hover:bg-muted",
                          (readOnly || allEnabled) && "opacity-60 cursor-not-allowed",
                        )}
                      >
                        সব চালু
                      </button>
                      <button
                        type="button"
                        onClick={() => setGroup(ids, false)}
                        disabled={readOnly || noneEnabled}
                        className={cn(
                          "rounded-md border border-border px-2.5 py-1 font-semibold text-muted-foreground hover:text-foreground hover:bg-muted",
                          (readOnly || noneEnabled) && "opacity-60 cursor-not-allowed",
                        )}
                      >
                        সব বন্ধ
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2">
                    {module.items.map((permission) => {
                      const checked = enabledIds.has(permission.id);
                      return (
                        <label
                          key={permission.id}
                          className={cn(
                            "flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2 text-xs sm:text-sm shadow-sm",
                            !readOnly && "cursor-pointer hover:bg-muted",
                            readOnly && "opacity-80",
                          )}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
                            checked={checked}
                            onChange={() => togglePermission(permission.id)}
                            disabled={readOnly}
                          />
                          <div className="flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-foreground">
                                {permission.meta.label}
                              </span>
                              {permission.meta.critical ? (
                                <span className="text-[10px] font-semibold text-warning bg-warning-soft border border-warning/30 rounded-full px-2 py-0.5">
                                  Critical
                                </span>
                              ) : null}
                              <span className="text-[11px] font-mono text-muted-foreground">
                                {permission.name}
                              </span>
                            </div>
                            {permission.description ?? permission.meta.description ? (
                              <div className="text-[11px] text-muted-foreground mt-1">
                                {permission.description ?? permission.meta.description}
                              </div>
                            ) : null}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default function AccessControlClient({
  user,
  permissions,
}: AccessControlClientProps) {
  const initialEnabled = useMemo(
    () => new Set(permissions.filter((p) => p.enabled).map((p) => p.id)),
    [permissions],
  );
  const initialEnabledKey = useMemo(
    () => Array.from(initialEnabled).sort().join("|"),
    [initialEnabled],
  );

  return (
    <AccessControlInner
      key={initialEnabledKey}
      user={user}
      permissions={permissions}
      initialEnabled={initialEnabled}
    />
  );
}
