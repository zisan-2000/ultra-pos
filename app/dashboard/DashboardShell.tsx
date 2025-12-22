// app/dashboard/DashboardShell.tsx

"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import LogoutButton from "@/components/LogoutButton";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { useCurrentShop } from "@/hooks/use-current-shop";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Shop = { id: string; name: string };

type RbacUser = {
  id: string;
  email: string | null;
  name: string | null;
  roles: string[];
  permissions: string[];
} | null;

const navItems = [
  { href: "/dashboard", label: "ড্যাশবোর্ড" },
  { href: "/dashboard/shops", label: "দোকান" },
  { href: "/dashboard/products", label: "পণ্য" },
  { href: "/dashboard/sales", label: "বিক্রি" },
  { href: "/dashboard/expenses", label: "খরচ" },
  { href: "/dashboard/due", label: "ধার / পাওনা" },
  { href: "/dashboard/cash", label: "নগদ খাতা" },
  { href: "/dashboard/reports", label: "রিপোর্ট" },
  { href: "/dashboard/profile", label: "আমার প্রোফাইল" },
  { href: "/dashboard/users", label: "ব্যবহারকারী ব্যবস্থাপনা" },
];

// ✅ mobile bottom nav: 6 -> 5 (profile removed)
const bottomNav = [
  { href: "/dashboard", label: "ড্যাশ", icon: "🏠" },
  { href: "/dashboard/sales", label: "বিক্রি", icon: "🛒" },
  { href: "/dashboard/products", label: "পণ্য", icon: "🗃️" },
  { href: "/dashboard/expenses", label: "খরচ", icon: "💸" },
  { href: "/dashboard/reports", label: "রিপোর্ট", icon: "📊" },
];

const fabByRoute: Record<string, { href: string; label: string } | null> = {
  "/dashboard": { href: "/dashboard/sales/new", label: "নতুন বিক্রি যোগ করুন" },
  "/dashboard/sales": {
    href: "/dashboard/sales/new",
    label: "নতুন বিক্রি যোগ করুন",
  },
  "/dashboard/products": {
    href: "/dashboard/products/new",
    label: "নতুন পণ্য যোগ করুন",
  },
  "/dashboard/expenses": {
    href: "/dashboard/expenses/new",
    label: "নতুন খরচ যোগ করুন",
  },
  "/dashboard/cash": {
    href: "/dashboard/cash/new",
    label: "নতুন এন্ট্রি যোগ করুন",
  },
};

const toRoleBasePath = (role: string | null | undefined) => {
  if (!role) return "/dashboard";
  return `/${role.replace(/_/g, "-")}`;
};

const resolveBasePath = (roles: string[] | null | undefined) => {
  if (!roles || roles.length === 0) return "/dashboard";
  if (roles.includes("super_admin")) return "/super-admin";
  return toRoleBasePath(roles[0]);
};

const applyBasePath = (href: string, basePath: string) => {
  if (!href.startsWith("/dashboard")) return href;
  if (basePath === "/dashboard") return href;
  if (href === "/dashboard") return `${basePath}/dashboard`;
  return `${basePath}${href.slice("/dashboard".length)}`;
};

const canonicalizePathname = (pathname: string, basePath: string) => {
  if (basePath === "/dashboard") return pathname;
  if (pathname === `${basePath}/dashboard`) return "/dashboard";
  if (pathname.startsWith(`${basePath}/`)) {
    return "/dashboard" + pathname.slice(basePath.length);
  }
  return pathname;
};

export function DashboardShell({
  shops,
  initialUser,
  children,
}: {
  shops: Shop[];
  initialUser: RbacUser;
  children: ReactNode;
}) {
  const online = useOnlineStatus();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { shopId, setShop } = useCurrentShop();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [rbacUser] = useState<RbacUser>(initialUser);
  const [rbacLoaded] = useState(true);
  const [shopNameOpen, setShopNameOpen] = useState(false);

  const safeShopId = useMemo(() => {
    if (!shops || shops.length === 0) return null;
    if (shopId && shops.some((s) => s.id === shopId)) return shopId;
    return shops[0]?.id || null;
  }, [shops, shopId]);

  const currentShopName = useMemo(() => {
    if (!safeShopId) return "দোকান নির্বাচন করুন";
    return (
      shops.find((s) => s.id === safeShopId)?.name || "দোকান নির্বাচন করুন"
    );
  }, [safeShopId, shops]);

  // Sync URL ?shopId with global shop store & cookie
  useEffect(() => {
    if (!shops || shops.length === 0) return;

    const urlShopId = searchParams?.get("shopId");
    if (!urlShopId) return;

    const existsInList = shops.some((s) => s.id === urlShopId);
    if (!existsInList) return;

    if (urlShopId !== shopId) {
      setShop(urlShopId);
      document.cookie = `activeShopId=${urlShopId}; path=/; max-age=${
        60 * 60 * 24 * 30
      }`;
    }
  }, [searchParams, shops, shopId, setShop]);

  useEffect(() => {
    if (safeShopId && safeShopId !== shopId) {
      setShop(safeShopId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeShopId]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isSuperAdmin = rbacUser?.roles?.includes("super_admin") ?? false;
  const isAdmin = rbacUser?.roles?.includes("admin") ?? false;
  const canViewUserCreationLog = isSuperAdmin || isAdmin;

  const roleBasePath = useMemo(
    () => resolveBasePath(rbacUser?.roles ?? []),
    [rbacUser]
  );

  const hasPermission = (permission: string | null | undefined) => {
    if (!permission) return true;
    if (!rbacLoaded) return false;
    if (isSuperAdmin) return true;
    const perms = rbacUser?.permissions ?? [];
    return perms.includes(permission);
  };

  const effectiveDashboardHref = useMemo(
    () => applyBasePath("/dashboard", roleBasePath),
    [roleBasePath]
  );

  const canAccessRbacAdmin = hasPermission("access_rbac_admin");
  const userCreationLogHref = useMemo(
    () => applyBasePath("/dashboard/admin/user-creation-log", roleBasePath),
    [roleBasePath]
  );
  const systemSettingsHref = "/super-admin/system-settings";

  const routePermissionMap: Record<string, string> = {
    "/dashboard": "view_dashboard_summary",
    "/dashboard/shops": "view_shops",
    "/dashboard/products": "view_products",
    "/dashboard/sales": "view_sales",
    "/dashboard/expenses": "view_expenses",
    "/dashboard/due": "view_due_summary",
    "/dashboard/cash": "view_cashbook",
    "/dashboard/reports": "view_reports",
    "/dashboard/profile": "view_settings",
    "/dashboard/users": "view_users_under_me",
  };

  const isActive = (href: string) => {
    if (!mounted) return false;
    const target = applyBasePath(href, roleBasePath);
    if (href === "/dashboard") return pathname === target;
    return pathname.startsWith(target);
  };

  const handleShopChange = (id: string) => {
    setShop(id);
    document.cookie = `activeShopId=${id}; path=/; max-age=${
      60 * 60 * 24 * 30
    }`;

    const params = new URLSearchParams(searchParams?.toString() || "");
    params.set("shopId", id);
    const next = `${pathname}?${params.toString()}`;
    router.replace(next);
    router.refresh();
  };

  const canonicalPathname = canonicalizePathname(pathname, roleBasePath);

  const showFabLabel = canonicalPathname === "/dashboard";

  const fabConfig =
    fabByRoute[
      bottomNav.find((item) => canonicalPathname.startsWith(item.href))?.href ||
        canonicalPathname
    ] || null;

  const mobileNavItems = bottomNav.filter((item) =>
    hasPermission(routePermissionMap[item.href])
  );

  const bottomGridClass =
    mobileNavItems.length >= 6
      ? "grid-cols-6"
      : mobileNavItems.length === 5
      ? "grid-cols-5"
      : mobileNavItems.length === 4
      ? "grid-cols-4"
      : mobileNavItems.length === 3
      ? "grid-cols-3"
      : mobileNavItems.length === 2
      ? "grid-cols-2"
      : "grid-cols-1";

  return (
    <div className="h-screen overflow-x-hidden bg-gray-50">
      {/* Overlay for drawer on mobile */}
      {drawerOpen && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <div className="flex h-full">
        {/* Sidebar / Drawer */}
        <aside
          className={`fixed z-40 inset-y-0 left-0 w-72 bg-white border-r border-gray-200 p-6 transform transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${
            drawerOpen ? "translate-x-0 shadow-xl" : "-translate-x-full"
          }`}
        >
          <div className="mb-8 flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                আল্ট্রা মাইক্রো
              </h1>
              <p className="text-sm text-gray-500 mt-1">POS সিস্টেম</p>
            </div>

            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                online
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {online ? "অনলাইন" : "অফলাইন"}
            </span>
          </div>

          <div className="space-y-3">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              প্রধান মেনু
            </div>
            <div className="flex flex-col gap-1">
              {navItems
                .filter((item) => hasPermission(routePermissionMap[item.href]))
                .map((item) => {
                  const targetHref =
                    item.href === "/dashboard"
                      ? effectiveDashboardHref
                      : applyBasePath(item.href, roleBasePath);

                  return (
                    <Link
                      key={item.href}
                      href={targetHref}
                      onClick={(e) => {
                        e.preventDefault();
                        setDrawerOpen(false);
                        router.push(targetHref);
                      }}
                      className={`flex items-center justify-between gap-2 rounded-lg px-4 py-3 text-base font-medium transition-colors cursor-pointer ${
                        isActive(targetHref)
                          ? "bg-green-50 text-green-700 border border-green-100"
                          : "text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      <span>{item.label}</span>
                      {isActive(targetHref) ? (
                        <span className="text-xs text-green-600">চলমান</span>
                      ) : null}
                    </Link>
                  );
                })}
            </div>
          </div>

          {(canAccessRbacAdmin || canViewUserCreationLog) && (
            <div className="mt-6 space-y-2">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                অ্যাডমিন
              </div>
              {canViewUserCreationLog && (
                <Link
                  href={userCreationLogHref}
                  onClick={(e) => {
                    e.preventDefault();
                    setDrawerOpen(false);
                    router.push(userCreationLogHref);
                  }}
                  className={`flex items-center justify-between gap-2 rounded-lg px-4 py-3 text-base font-medium transition-colors cursor-pointer ${
                    isActive(userCreationLogHref)
                      ? "bg-green-50 text-green-700 border border-green-100"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <span>ব্যবহারকারী তৈরি লগ</span>
                  {isActive(userCreationLogHref) ? (
                    <span className="text-xs text-green-600">চলমান</span>
                  ) : null}
                </Link>
              )}

              {canAccessRbacAdmin && (
                <Link
                  href={applyBasePath("/dashboard/admin/rbac", roleBasePath)}
                  onClick={(e) => {
                    e.preventDefault();
                    setDrawerOpen(false);
                    router.push(
                      applyBasePath("/dashboard/admin/rbac", roleBasePath)
                    );
                  }}
                  className={`flex items-center justify-between gap-2 rounded-lg px-4 py-3 text-base font-medium transition-colors cursor-pointer ${
                    isActive(
                      applyBasePath("/dashboard/admin/rbac", roleBasePath)
                    )
                      ? "bg-green-50 text-green-700 border border-green-100"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <span>RBAC ব্যবস্থাপনা</span>
                  {isActive(
                    applyBasePath("/dashboard/admin/rbac", roleBasePath)
                  ) ? (
                    <span className="text-xs text-green-600">চলমান</span>
                  ) : null}
                </Link>
              )}
            </div>
          )}

          {isSuperAdmin && (
            <div className="mt-4 space-y-2">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Settings
              </div>
              <Link
                href={applyBasePath(
                  "/dashboard/admin/business-types",
                  roleBasePath
                )}
                onClick={(e) => {
                  e.preventDefault();
                  setDrawerOpen(false);
                  router.push(
                    applyBasePath(
                      "/dashboard/admin/business-types",
                      roleBasePath
                    )
                  );
                }}
                className={`flex items-center justify-between gap-2 rounded-lg px-4 py-3 text-base font-medium transition-colors cursor-pointer ${
                  isActive(
                    applyBasePath(
                      "/dashboard/admin/business-types",
                      roleBasePath
                    )
                  )
                    ? "bg-green-50 text-green-700 border border-green-100"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <span>Business Types</span>
                {isActive(
                  applyBasePath("/dashboard/admin/business-types", roleBasePath)
                ) ? (
                  <span className="text-xs text-green-600">সক্রিয়</span>
                ) : null}
              </Link>

              <Link
                href={systemSettingsHref}
                onClick={(e) => {
                  e.preventDefault();
                  setDrawerOpen(false);
                  router.push(systemSettingsHref);
                }}
                className={`flex items-center justify-between gap-2 rounded-lg px-4 py-3 text-base font-medium transition-colors cursor-pointer ${
                  pathname === systemSettingsHref
                    ? "bg-green-50 text-green-700 border border-green-100"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <span>System Settings</span>
                {pathname === systemSettingsHref ? (
                  <span className="text-xs text-green-600">সক্রিয়</span>
                ) : null}
              </Link>
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-gray-200">
            <LogoutButton />
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col h-full lg:pl-0 overflow-hidden">
          <header className="sticky top-0 z-20 bg-linear-to-r from-slate-50 to-slate-100 border-b border-slate-200 shadow-sm">
            <div className="flex items-start gap-3 px-4 sm:px-6 lg:px-8 py-3">
              {/* Drawer toggle */}
              <button
                className="lg:hidden rounded-lg border border-slate-200 px-3 py-2 text-gray-700 bg-white shadow-sm shrink-0 mt-1"
                onClick={() => setDrawerOpen((p) => !p)}
                aria-label="Toggle navigation"
              >
                ☰
              </button>

              {/* Left content */}
              <div className="flex-1 min-w-0">
                {/* <p className="text-[11px] text-gray-500 mb-1">বর্তমান দোকান</p> */}

                {/* Shop name (click to view full name) */}
                <button
                  onClick={() => setShopNameOpen(true)}
                  className="text-left w-full"
                >
                  <h2 className="text-base font-bold text-gray-900 leading-snug line-clamp-2 hover:underline">
                    {currentShopName}
                  </h2>
                </button>
              </div>

              {/* Shop selector + Status */}
              <div className="flex flex-col items-end gap-1 shrink-0">
                {shops?.length > 0 ? (
                  <Select
                    value={safeShopId ?? undefined}
                    onValueChange={(value) => handleShopChange(value)}
                  >
                    <SelectTrigger className="w-[200px] border border-slate-200 bg-white text-left shadow-sm focus:ring-2 focus:ring-green-500">
                      <SelectValue placeholder="দোকান নির্বাচন" />
                    </SelectTrigger>
                    <SelectContent align="end" className="w-[220px]">
                      {shops.map((shop) => (
                        <SelectItem key={shop.id} value={shop.id}>
                          {shop.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Link
                    href={applyBasePath("/dashboard/shops/new", roleBasePath)}
                    className="text-sm font-semibold text-blue-600"
                  >
                    দোকান তৈরি করুন
                  </Link>
                )}

                {/* Online / Offline status under select */}
                <div className="flex items-center gap-1 text-xs font-semibold mt-2">
                  <span
                    className={`inline-flex h-2 w-2 rounded-full ${
                      online ? "bg-emerald-500" : "bg-red-500"
                    }`}
                  />
                  <span
                    className={online ? "text-emerald-700" : "text-red-700"}
                  >
                    {online ? "অনলাইন" : "অফলাইন"}
                  </span>
                </div>
              </div>
            </div>

            {/* Full shop name dialog */}
            <Dialog open={shopNameOpen} onOpenChange={setShopNameOpen}>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>বর্তমান দোকান</DialogTitle>
                </DialogHeader>

                <p className="text-base font-semibold text-gray-900 leading-relaxed break-words">
                  {currentShopName}
                </p>
              </DialogContent>
            </Dialog>
          </header>

          <main className="flex-1 pb-28 lg:pb-10 overflow-y-auto">
            <div className="px-4 sm:px-6 lg:px-8 py-6">{children}</div>
          </main>
        </div>
      </div>

      {/* Bottom nav for mobile */}
      <nav className="fixed bottom-0 inset-x-0 z-30 lg:hidden px-3 pb-3">
        <div
          className={`relative grid ${bottomGridClass} rounded-t-2xl bg-white/90 backdrop-blur-sm border border-slate-200 shadow-[0_-4px_18px_rgba(15,23,42,0.12)] px-3 pt-4 pb-3`}
        >
          {mobileNavItems.map((item) => {
            const targetHref =
              item.href === "/dashboard"
                ? effectiveDashboardHref
                : applyBasePath(item.href, roleBasePath);

            return (
              <Link
                key={item.href}
                href={targetHref}
                className={`flex flex-col items-center justify-center py-2 text-[11px] font-semibold gap-1 ${
                  isActive(targetHref) ? "text-blue-700" : "text-gray-500"
                }`}
              >
                <span className="text-base leading-none">{item.icon}</span>
                <span className="leading-none">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ✅ Floating primary action: now self-explanatory (problem #3) */}

      {/* Smart Floating Action Button */}
      {fabConfig && safeShopId ? (
        <Link
          href={`${applyBasePath(
            fabConfig.href,
            roleBasePath
          )}?shopId=${safeShopId}`}
          aria-label={fabConfig.label}
          title={fabConfig.label}
          className={`
      fixed bottom-[104px]
 left-1/2 -translate-x-1/2 z-40 lg:hidden
      flex items-center justify-center
      rounded-full
      bg-indigo-500 hover:bg-indigo-600
      text-white
      shadow-[0_10px_24px_rgba(15,23,42,0.18)]
      active:scale-[0.97]
      transition-all duration-200
      ${showFabLabel ? "px-5 py-3 gap-2" : "h-14 w-14"}
    `}
        >
          {/* Icon */}
          <span
            className={`flex items-center justify-center rounded-full bg-white/20 ${
              showFabLabel ? "h-8 w-8" : "h-10 w-10 bg-transparent"
            }`}
          >
            <Plus className="h-5 w-5 stroke-[2.5]" />
          </span>

          {/* Label (Dashboard only) */}
          {showFabLabel && (
            <span className="text-sm font-semibold whitespace-nowrap">
              {fabConfig.label}
            </span>
          )}
        </Link>
      ) : null}
    </div>
  );
}
