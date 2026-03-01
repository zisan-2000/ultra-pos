"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { Role, Permission } from "@prisma/client";
import { updateRolePermissions } from "@/app/actions/rbac-admin";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { queueAdminAction } from "@/lib/sync/queue";
import { STAFF_BASELINE_PERMISSIONS } from "@/lib/staff-baseline-permissions";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";

type RoleWithPermissions = Role & {
  rolePermissions: { permissionId: string }[];
};

interface RolesPermissionsPanelProps {
  roles: RoleWithPermissions[];
  permissions: Permission[];
}

function scheduleStateUpdate(fn: () => void) {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(fn);
    return;
  }
  Promise.resolve().then(fn);
}

export type ModuleKey =
  | "dashboard"
  | "shops"
  | "products"
  | "purchases"
  | "suppliers"
  | "sales"
  | "queue"
  | "customers"
  | "expenses"
  | "cash"
  | "reports"
  | "users"
  | "roles"
  | "settings"
  | "offline"
  | "other";

export const moduleLabels: Record<ModuleKey, string> = {
  dashboard: "ড্যাশবোর্ড",
  shops: "দোকান",
  products: "পণ্য",
  purchases: "পণ্য ক্রয়",
  suppliers: "সরবরাহকারী",
  sales: "বিক্রি",
  queue: "টোকেন কিউ",
  customers: "কাস্টমার / বকেয়া",
  expenses: "খরচ",
  cash: "ক্যাশ",
  reports: "রিপোর্ট",
  users: "ব্যবহারকারী",
  roles: "রোল / পারমিশন",
  settings: "সেটিংস",
  offline: "অফলাইন / সিঙ্ক",
  other: "অন্যান্য",
};

export type PermissionMeta = {
  label: string;
  description?: string;
  module: ModuleKey;
  critical?: boolean;
};

export const permissionMeta: Record<string, PermissionMeta> = {
  view_dashboard_summary: {
    label: "ড্যাশবোর্ড দেখা",
    module: "dashboard",
  },
  view_shops: { label: "দোকান দেখা", module: "shops" },
  create_shop: { label: "দোকান তৈরি", module: "shops" },
  update_shop: { label: "দোকান সম্পাদনা", module: "shops" },
  manage_shop_invoice_feature: {
    label: "দোকান ইনভয়েস ফিচার ম্যানেজ",
    module: "shops",
  },
  manage_shop_queue_feature: {
    label: "দোকান টোকেন ফিচার ম্যানেজ",
    module: "shops",
  },
  manage_shop_barcode_entitlement: {
    label: "দোকান বারকোড entitlement ম্যানেজ",
    module: "shops",
    critical: true,
  },
  manage_shop_barcode_feature: {
    label: "দোকান বারকোড স্ক্যান ফিচার ম্যানেজ",
    module: "shops",
  },
  delete_shop: { label: "দোকান মুছে ফেলা", module: "shops", critical: true },
  switch_shop: { label: "শপ সুইচ", module: "shops" },
  view_products: { label: "পণ্য দেখা", module: "products" },
  create_product: { label: "পণ্য তৈরি", module: "products" },
  update_product: { label: "পণ্য সম্পাদনা", module: "products" },
  delete_product: { label: "পণ্য মুছে ফেলা", module: "products", critical: true },
  update_product_stock: { label: "স্টক আপডেট", module: "products" },
  update_product_price: { label: "মূল্য আপডেট", module: "products" },
  manage_product_status: { label: "পণ্যের স্ট্যাটাস টগল", module: "products" },
  import_products: { label: "পণ্য ইম্পোর্ট", module: "products" },
  view_purchases: { label: "ক্রয় দেখা", module: "purchases" },
  create_purchase: { label: "নতুন ক্রয় যোগ", module: "purchases" },
  view_suppliers: { label: "সরবরাহকারী দেখা", module: "suppliers" },
  create_supplier: { label: "সরবরাহকারী যোগ", module: "suppliers" },
  create_purchase_payment: { label: "ক্রয় পরিশোধ", module: "suppliers" },
  view_sales: { label: "বিক্রি দেখা", module: "sales" },
  view_sale_details: { label: "বিক্রি ডিটেইলস", module: "sales" },
  view_sales_invoice: { label: "বিক্রির ইনভয়েস দেখা", module: "sales" },
  view_sale_return: { label: "সেল রিটার্ন দেখা", module: "sales" },
  create_sale: { label: "নতুন বিক্রি", module: "sales" },
  create_sale_return: { label: "সেল রিটার্ন প্রসেস", module: "sales" },
  use_pos_barcode_scan: { label: "POS বারকোড/এসকেইউ স্ক্যান ব্যবহার", module: "sales" },
  issue_sales_invoice: { label: "বিক্রির ইনভয়েস ইস্যু", module: "sales" },
  view_queue_board: { label: "টোকেন বোর্ড দেখা", module: "queue" },
  create_queue_token: { label: "টোকেন তৈরি", module: "queue" },
  update_queue_token_status: { label: "টোকেন স্ট্যাটাস আপডেট", module: "queue" },
  print_queue_token: { label: "টোকেন প্রিন্ট", module: "queue" },
  update_sale: { label: "বিক্রি সম্পাদনা", module: "sales" },
  cancel_sale: { label: "বিক্রি বাতিল", module: "sales", critical: true },
  create_due_sale: { label: "ধার বিক্রি", module: "sales" },
  take_due_payment_from_sale: { label: "বিক্রি থেকে বকেয়া গ্রহণ", module: "sales" },
  view_customers: { label: "কাস্টমার দেখা", module: "customers" },
  create_customer: { label: "কাস্টমার তৈরি", module: "customers" },
  update_customer: { label: "কাস্টমার সম্পাদনা", module: "customers" },
  delete_customer: { label: "কাস্টমার মুছে ফেলা", module: "customers", critical: true },
  view_due_summary: { label: "বকেয়া সারাংশ", module: "customers" },
  view_customer_due: { label: "কাস্টমারের বকেয়া দেখা", module: "customers" },
  create_due_entry: { label: "বকেয়া এন্ট্রি", module: "customers" },
  take_due_payment: { label: "বকেয়া পরিশোধ গ্রহণ", module: "customers" },
  writeoff_due: { label: "বকেয়া রাইট-অফ", module: "customers", critical: true },
  view_expenses: { label: "খরচ দেখা", module: "expenses" },
  create_expense: { label: "খরচ যোগ", module: "expenses" },
  update_expense: { label: "খরচ সম্পাদনা", module: "expenses" },
  delete_expense: { label: "খরচ মুছে ফেলা", module: "expenses", critical: true },
  view_cashbook: { label: "ক্যাশবুক দেখা", module: "cash" },
  create_cash_entry: { label: "ক্যাশ এন্ট্রি", module: "cash" },
  update_cash_entry: { label: "ক্যাশ এন্ট্রি সম্পাদনা", module: "cash" },
  delete_cash_entry: { label: "ক্যাশ এন্ট্রি মুছে ফেলা", module: "cash", critical: true },
  adjust_cash_balance: { label: "ক্যাশ ব্যালেন্স অ্যাডজাস্ট", module: "cash", critical: true },
  view_reports: { label: "রিপোর্ট দেখা", module: "reports" },
  view_sales_report: { label: "বিক্রি রিপোর্ট", module: "reports" },
  view_expense_report: { label: "খরচ রিপোর্ট", module: "reports" },
  view_cashbook_report: { label: "ক্যাশবুক রিপোর্ট", module: "reports" },
  view_profit_report: { label: "লাভ-ক্ষতি রিপোর্ট", module: "reports" },
  view_payment_method_report: { label: "পেমেন্ট মেথড রিপোর্ট", module: "reports" },
  view_top_products_report: { label: "বেস্টসেলার রিপোর্ট", module: "reports" },
  view_low_stock_report: { label: "লো স্টক রিপোর্ট", module: "reports" },
  export_reports: { label: "রিপোর্ট এক্সপোর্ট", module: "reports" },
  view_users: { label: "ব্যবহারকারী দেখা", module: "users" },
  create_user: { label: "ব্যবহারকারী তৈরি", module: "users" },
  update_user: { label: "ব্যবহারকারী সম্পাদনা", module: "users" },
  delete_user: { label: "ব্যবহারকারী মুছে ফেলা", module: "users", critical: true },
  view_roles: { label: "রোল দেখা", module: "roles" },
  create_role: { label: "রোল তৈরি", module: "roles" },
  update_role: { label: "রোল আপডেট", module: "roles" },
  delete_role: { label: "রোল মুছে ফেলা", module: "roles", critical: true },
  assign_role_to_user: { label: "রোল অ্যাসাইন", module: "roles" },
  revoke_role_from_user: { label: "রোল রিভোক", module: "roles" },
  view_users_under_me: { label: "সাব-ইউজার দেখা", module: "users" },
  create_user_agent: { label: "এজেন্ট তৈরি", module: "users" },
  create_user_owner: { label: "ওনার তৈরি", module: "users" },
  create_user_staff: { label: "স্টাফ তৈরি", module: "users" },
  edit_users_under_me: { label: "সাব-ইউজার সম্পাদনা", module: "users" },
  delete_users_under_me: { label: "সাব-ইউজার মুছে ফেলা", module: "users", critical: true },
  access_rbac_admin: { label: "RBAC অ্যাডমিন অ্যাক্সেস", module: "roles", critical: true },
  view_settings: { label: "সেটিংস দেখা", module: "settings" },
  update_settings: { label: "সেটিংস আপডেট", module: "settings" },
  use_offline_pos: { label: "অফলাইন POS ব্যবহার", module: "offline" },
  sync_offline_data: { label: "সিঙ্ক অফলাইন ডেটা", module: "offline" },
};

export function RolesPermissionsPanel({
  roles,
  permissions,
}: RolesPermissionsPanelProps) {
  const online = useOnlineStatus();
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(
    roles[0]?.id ?? null,
  );
  const [saving, startSaving] = useTransition();
  const [query, setQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "on" | "off">("all");
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

  const isStaffRole = selectedRole?.name === "staff";

  const staffBaselineIds = useMemo(() => {
    if (!selectedRole || selectedRole.name !== "staff") {
      return new Set<string>();
    }
    const baselineSet = new Set(STAFF_BASELINE_PERMISSIONS);
    const ids = permissions
      .filter((permission) => baselineSet.has(permission.name))
      .map((permission) => permission.id);
    return new Set(ids);
  }, [selectedRole, permissions]);

  useEffect(() => {
    if (!selectedRole || selectedRole.name !== "staff") return;
    if (staffBaselineIds.size === 0) return;
    let cancelled = false;
    scheduleStateUpdate(() => {
      if (cancelled) return;
      setLocalAssignments((prev) => {
        const current = new Set(prev[selectedRole.id] ?? []);
        let changed = false;
        staffBaselineIds.forEach((id) => {
          if (!current.has(id)) {
            current.add(id);
            changed = true;
          }
        });
        return changed ? { ...prev, [selectedRole.id]: current } : prev;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [selectedRole, staffBaselineIds]);

  const groupedPermissions = useMemo(() => {
    const modulesMap = new Map<
      ModuleKey,
      {
        key: ModuleKey;
        label: string;
        items: Array<Permission & { meta: PermissionMeta }>;
      }
    >();

    const normalizedQuery = query.trim().toLowerCase();

    const matchesFilters = (p: Permission, meta: PermissionMeta) => {
      const checked = selectedPermissionIds.has(p.id);
      if (filterMode === "on" && !checked) return false;
      if (filterMode === "off" && checked) return false;

      if (!normalizedQuery) return true;
      return (
        p.name.toLowerCase().includes(normalizedQuery) ||
        (p.description?.toLowerCase().includes(normalizedQuery) ?? false) ||
        meta.label.toLowerCase().includes(normalizedQuery) ||
        moduleLabels[meta.module].toLowerCase().includes(normalizedQuery)
      );
    };

    permissions.forEach((p) => {
      const meta: PermissionMeta =
        permissionMeta[p.name] ?? {
          label: p.name,
          module: "other" as ModuleKey,
        };
      if (!matchesFilters(p, meta)) return;

      const key = meta.module;
      const existing = modulesMap.get(key) ?? {
        key,
        label: moduleLabels[key] ?? moduleLabels.other,
        items: [],
      };
      existing.items.push({ ...p, meta });
      modulesMap.set(key, existing);
    });

    return Array.from(modulesMap.values()).sort((a, b) =>
      a.label.localeCompare(b.label, "bn"),
    );
  }, [permissions, query, filterMode, selectedPermissionIds]);

  const togglePermission = (permissionId: string) => {
    if (!selectedRole) return;
    if (isStaffRole && staffBaselineIds.has(permissionId)) return;
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

  const bulkSet = (ids: string[], enabled: boolean) => {
    if (!selectedRole || ids.length === 0) return;
    setLocalAssignments((prev) => {
      const current = new Set(prev[selectedRole.id] ?? []);
      ids.forEach((id) => {
        if (!enabled && isStaffRole && staffBaselineIds.has(id)) return;
        if (enabled) current.add(id);
        else current.delete(id);
      });
      return { ...prev, [selectedRole.id]: current };
    });
  };

  const handleSave = () => {
    if (!selectedRole) return;
    const ids = isStaffRole
      ? Array.from(new Set([...selectedPermissionIds, ...staffBaselineIds]))
      : Array.from(selectedPermissionIds);
    startSaving(async () => {
      if (!online) {
        await queueAdminAction("rbac_update_role_permissions", {
          roleId: selectedRole.id,
          permissionIds: ids,
        });
        try {
          const raw = safeLocalStorageGet("admin:rbac");
          if (raw) {
            const parsed = JSON.parse(raw) as {
              roles?: RoleWithPermissions[];
              users?: any[];
              roleOptions?: any[];
              permissions?: any[];
            };
            if (Array.isArray(parsed.roles)) {
              parsed.roles = parsed.roles.map((role) =>
                role.id === selectedRole.id
                  ? {
                      ...role,
                      rolePermissions: ids.map((permissionId) => ({ permissionId })),
                    }
                  : role,
              );
              safeLocalStorageSet("admin:rbac", JSON.stringify(parsed));
            }
          }
        } catch {
          // ignore cache errors
        }
        alert("Offline: permission changes queued.");
        return;
      }
      await updateRolePermissions(selectedRole.id, ids);
    });
  };

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
            🛡️ Roles & Permissions
          </div>
          <h2 className="text-lg font-semibold text-foreground">রোলের পারমিশন</h2>
          <p className="text-[12px] text-muted-foreground">
            মডিউল অনুযায়ী পারমিশন সাজানো। রোল সিলেক্ট করুন, খুঁজে টিক/আনটিক করুন। সেভ করলে সঙ্গে সঙ্গে প্রয়োগ হবে।
          </p>
        </div>
        <span className="text-xs font-semibold text-muted-foreground bg-muted border border-border rounded-lg px-3 py-1.5">
          {roles.length} roles
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 text-xs sm:text-sm">
        {/* Roles list */}
        <div className="sm:col-span-2 border border-border rounded-xl overflow-hidden max-h-[480px] overflow-y-auto shadow-inner">
          <div className="bg-muted px-3 py-2 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Role
          </div>
          <div className="divide-y divide-border">
            {roles.map((r) => {
              const isActive = r.id === selectedRoleId;
              const enabledCount = localAssignments[r.id]?.size ?? 0;
              return (
                <button
                  type="button"
                  key={r.id}
                  onClick={() => setSelectedRoleId(r.id)}
                  className={`w-full text-left px-3 py-2.5 transition-colors flex items-start justify-between gap-3 ${
                    isActive
                      ? "bg-success-soft border-l-4 border-success/50"
                      : "hover:bg-muted"
                  }`}
                >
                  <div>
                    <div className="font-semibold text-foreground text-xs sm:text-sm">
                      {r.name}
                    </div>
                    {r.description ? (
                      <div className="text-[11px] text-muted-foreground">{r.description}</div>
                    ) : null}
                  </div>
                  <span className="text-[11px] font-semibold text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                    {enabledCount}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Permissions for selected role */}
        <div className="sm:col-span-3 border border-border rounded-xl overflow-hidden max-h-[480px] flex flex-col shadow-inner">
          {selectedRole ? (
            <>
              <div className="flex flex-wrap items-center gap-3 px-3 py-3 border-b bg-muted">
                <div className="text-[12px] font-semibold text-foreground flex-1">
                  Permissions for: <span className="font-mono">{selectedRole.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="পারমিশন সার্চ করুন"
                    className="w-44 md:w-56 lg:w-64 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
                    {(["all", "on", "off"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setFilterMode(mode)}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border ${
                          filterMode === mode
                            ? "bg-primary-soft text-primary border-primary/30"
                            : "text-muted-foreground border-transparent hover:bg-muted"
                        }`}
                      >
                        {mode === "all"
                          ? "সকল"
                          : mode === "on"
                          ? "শুধু চালু"
                          : "শুধু বন্ধ"}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="inline-flex items-center rounded-lg bg-primary-soft text-primary border border-primary/30 px-3.5 py-1.5 text-[12px] font-semibold shadow-sm hover:bg-primary/15 hover:border-primary/40 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>

              {isStaffRole ? (
                <div className="px-3 py-2 text-[11px] text-warning bg-warning-soft border-b border-warning/30">
                  স্টাফ রোলে কিছু বেসলাইন অনুমতি বাধ্যতামূলক — এগুলো বন্ধ করা যাবে না।
                </div>
              ) : null}

              <div className="divide-y divide-border overflow-y-auto">
                {groupedPermissions.length === 0 ? (
                  <div className="p-4 text-xs text-muted-foreground">
                    সার্চ / ফিল্টার মিলে কোনো পারমিশন পাওয়া যায়নি।
                  </div>
                ) : (
                  groupedPermissions.map((module) => {
                    const total = module.items.length;
                    const enabled = module.items.filter((p) =>
                      selectedPermissionIds.has(p.id),
                    ).length;
                    const ids = module.items.map((p) => p.id);
                    return (
                      <div key={module.key} className="px-3 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-semibold text-foreground">
                              {module.label}
                            </div>
                            <span className="text-[11px] text-muted-foreground">
                              {enabled}/{total}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px]">
                            <button
                              type="button"
                              onClick={() => bulkSet(ids, true)}
                              className="px-2 py-1 rounded-md border border-border text-foreground hover:bg-muted"
                            >
                              Select all
                            </button>
                            <button
                              type="button"
                              onClick={() => bulkSet(ids, false)}
                              className="px-2 py-1 rounded-md border border-border text-foreground hover:bg-muted"
                            >
                              Clear
                            </button>
                          </div>
                        </div>

                        <div className="mt-2 grid grid-cols-1 gap-1">
                          {module.items.map((p) => {
                            const checked = selectedPermissionIds.has(p.id);
                            const locked = isStaffRole && staffBaselineIds.has(p.id);
                            return (
                              <label
                                key={p.id}
                                className={`flex items-start gap-3 px-2 py-1.5 rounded-lg ${
                                  locked ? "opacity-80" : "hover:bg-muted cursor-pointer"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
                                  checked={checked}
                                  onChange={() => togglePermission(p.id)}
                                  disabled={locked}
                                />
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-foreground">
                                      {p.meta.label}
                                    </span>
                                    <span className="text-[11px] font-mono text-muted-foreground">
                                      {p.name}
                                    </span>
                                    {p.meta.critical ? (
                                      <span className="text-[10px] font-semibold text-warning bg-warning-soft border border-warning/30 rounded-full px-2 py-0.5">
                                        Critical
                                      </span>
                                    ) : null}
                                    {locked ? (
                                      <span className="text-[10px] font-semibold text-primary bg-primary-soft border border-primary/30 rounded-full px-2 py-0.5">
                                        বেসলাইন
                                      </span>
                                    ) : null}
                                  </div>
                                  {p.description || p.meta.description ? (
                                    <div className="text-[11px] text-muted-foreground">
                                      {p.description || p.meta.description}
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
            </>
          ) : (
            <div className="p-4 text-xs text-muted-foreground">Select a role to manage its permissions.</div>
          )}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        নোট: সুপার অ্যাডমিন সবসময় সব পারমিশন রাখবে—এখানে পরিবর্তন হলেও তার ওপর প্রভাব ফেলবে না।
      </p>
    </div>
  );
}
