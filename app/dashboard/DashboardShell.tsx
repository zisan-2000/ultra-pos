// app/dashboard/DashboardShell.tsx

"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import LogoutButton from "@/components/LogoutButton";
import { ThemeToggle } from "@/components/theme-toggle";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { useCurrentShop } from "@/hooks/use-current-shop";
import {
  BarChart3,
  ChevronDown,
  HandCoins,
  LayoutDashboard,
  LogOut,
  Menu,
  NotebookText,
  Package,
  Plus,
  Receipt,
  Settings,
  ShoppingCart,
  Store,
  User,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
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

const navItems: { href: string; label: string; Icon: LucideIcon }[] = [
  { href: "/dashboard", label: "ড্যাশবোর্ড", Icon: LayoutDashboard },
  { href: "/dashboard/shops", label: "দোকান", Icon: Store },
  { href: "/dashboard/products", label: "পণ্য", Icon: Package },
  { href: "/dashboard/sales", label: "বিক্রি", Icon: ShoppingCart },
  { href: "/dashboard/expenses", label: "খরচ", Icon: Receipt },
  { href: "/dashboard/due", label: "ধার / পাওনা", Icon: HandCoins },
  { href: "/dashboard/cash", label: "নগদ খাতা", Icon: NotebookText },
  { href: "/dashboard/reports", label: "রিপোর্ট", Icon: BarChart3 },
  { href: "/dashboard/profile", label: "আমার প্রোফাইল", Icon: User },
  { href: "/dashboard/users", label: "ব্যবহারকারী ব্যবস্থাপনা", Icon: Users },
];

// ✅ mobile bottom nav: 6 -> 5 (profile removed)
const bottomNav: { href: string; label: string; Icon: LucideIcon }[] = [
  { href: "/dashboard", label: "ড্যাশ", Icon: LayoutDashboard },
  { href: "/dashboard/sales", label: "বিক্রি", Icon: ShoppingCart },
  { href: "/dashboard/products", label: "পণ্য", Icon: Package },
  { href: "/dashboard/expenses", label: "খরচ", Icon: Receipt },
  { href: "/dashboard/reports", label: "রিপোর্ট", Icon: BarChart3 },
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [rbacUser] = useState<RbacUser>(initialUser);
  const [rbacLoaded] = useState(true);
  const [shopNameOpen, setShopNameOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  const safeShopId = useMemo(() => {
    if (!shops || shops.length === 0) return null;
    if (shopId && shops.some((s) => s.id === shopId)) return shopId;
    return shops[0]?.id || null;
  }, [shops, shopId]);

  const currentShopName = useMemo(() => {
    if (!safeShopId) return "দোকান নির্বাচন করুন";
    return shops.find((s) => s.id === safeShopId)?.name || "দোকান নির্বাচন করুন";
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

  useEffect(() => {
    setUserMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) setUserMenuOpen(false);
  }, [drawerOpen]);

  useEffect(() => {
    if (!userMenuOpen) return;

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (!userMenuRef.current) return;
      if (!userMenuRef.current.contains(target)) setUserMenuOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUserMenuOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown, { passive: true });
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [userMenuOpen]);

  useEffect(() => {
    if (!mounted) return;
    try {
      const raw = window.localStorage.getItem("dashboard.sidebarCollapsed");
      if (raw === "1") setSidebarCollapsed(true);
      if (raw === "0") setSidebarCollapsed(false);
    } catch {
      // ignore
    }
  }, [mounted]);

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(
          "dashboard.sidebarCollapsed",
          next ? "1" : "0"
        );
      } catch {
        // ignore
      }
      return next;
    });
  };

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

  const profileHref = useMemo(
    () => applyBasePath("/dashboard/profile", roleBasePath),
    [roleBasePath]
  );

  const userDisplayName = rbacUser?.name?.trim() || "User";
  const userEmail = rbacUser?.email?.trim() || "";
  const userInitials = useMemo(() => {
    const source = (rbacUser?.name || rbacUser?.email || "").trim();
    if (!source) return "U";
    const parts = source.replace(/\s+/g, " ").split(" ").filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }, [rbacUser?.name, rbacUser?.email]);

  const primaryRoleLabel = useMemo(() => {
    const role = (rbacUser?.roles || [])[0] || "";
    if (!role) return "";
    return role
      .replace(/_/g, " ")
      .split(" ")
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
      .join(" ");
  }, [rbacUser?.roles]);

  const showFabLabel = canonicalPathname === "/dashboard";

  const baseFabConfig =
    fabByRoute[
      bottomNav.find((item) => canonicalPathname.startsWith(item.href))?.href ||
        canonicalPathname
    ] || null;
  const fabConfig = canonicalPathname.startsWith("/dashboard/sales/new")
    ? null
    : baseFabConfig;

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
    <div className="h-screen overflow-x-hidden bg-background">
      {/* Overlay for drawer on mobile */}
      {drawerOpen && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 bg-foreground/30 z-30 lg:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <div className="flex h-full">
        {/* Sidebar / Drawer */}
        <aside
          className={`fixed z-40 inset-y-0 left-0 bg-sidebar backdrop-blur border-r border-sidebar-border transform transition-[transform,width] duration-200 ease-out lg:sticky lg:top-0 lg:translate-x-0 lg:h-dvh lg:shadow-none ${
            drawerOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
          } ${sidebarCollapsed ? "lg:w-20 w-72" : "w-72"}`}
        >
          <div className="flex h-full flex-col">
            <div
              className={`flex items-start justify-between gap-3 border-b border-sidebar-border px-4 py-4 ${
                sidebarCollapsed ? "lg:px-3" : ""
              }`}
            >
              <div className={sidebarCollapsed ? "lg:hidden" : ""}>
                <h1 className="text-lg font-semibold tracking-tight text-sidebar-foreground">
                  মাইক্রো
                </h1>
                <p className="text-xs text-sidebar-accent-foreground mt-1">
                  POS সিস্টেম
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    online
                      ? "bg-success-soft text-success"
                      : "bg-muted text-muted-foreground"
                  } ${sidebarCollapsed ? "lg:hidden" : ""}`}
                >
                  {online ? "অনলাইন" : "অফলাইন"}
                </span>

                <button
                  type="button"
                  className="hidden lg:inline-flex items-center justify-center rounded-lg border border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground shadow-sm hover:bg-sidebar-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar h-9 w-9"
                  aria-label={
                    sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
                  }
                  aria-pressed={sidebarCollapsed}
                  onClick={toggleSidebarCollapsed}
                >
                  {sidebarCollapsed ? (
                    <Menu className="h-4 w-4" />
                  ) : (
                    <X className="h-4 w-4" />
                  )}
                </button>

                <button
                  type="button"
                  className="lg:hidden inline-flex items-center justify-center rounded-lg border border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground shadow-sm hover:bg-sidebar-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar h-9 w-9"
                  aria-label="Close navigation"
                  onClick={() => setDrawerOpen(false)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <nav className="flex-1 min-h-0 px-2 py-3 overflow-y-auto">
              <div
                className={`px-2 pb-2 text-[11px] font-semibold text-sidebar-accent-foreground uppercase tracking-wider ${
                  sidebarCollapsed ? "lg:hidden" : ""
                }`}
              >
                প্রধান মেনু
              </div>

              <div className="flex flex-col gap-1">
                {navItems
                  .filter((item) =>
                    hasPermission(routePermissionMap[item.href])
                  )
                  .map((item) => {
                    const targetHref =
                      item.href === "/dashboard"
                        ? effectiveDashboardHref
                        : applyBasePath(item.href, roleBasePath);
                    const active = isActive(targetHref);
                    const Icon = item.Icon;

                    return (
                      <Link
                        key={item.href}
                        href={targetHref}
                        onClick={() => setDrawerOpen(false)}
                        className={`group relative flex items-center gap-3 rounded-xl border-l-4 border-transparent px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar ${
                          active
                            ? "bg-sidebar-primary text-sidebar-primary-foreground border-sidebar-ring"
                            : "text-sidebar-foreground hover:bg-sidebar-accent"
                        } ${sidebarCollapsed ? "lg:justify-center" : ""}`}
                      >
                        <span
                          className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${
                            active
                              ? "bg-sidebar-primary/20"
                              : "bg-sidebar-accent group-hover:bg-sidebar-accent/80"
                          }`}
                        >
                          <Icon
                            className={`h-4 w-4 ${
                              active
                                ? "text-sidebar-primary-foreground"
                                : "text-sidebar-accent-foreground"
                            }`}
                          />
                        </span>

                        <span
                          className={
                            sidebarCollapsed ? "lg:hidden truncate" : "truncate"
                          }
                        >
                          {item.label}
                        </span>
                      </Link>
                    );
                  })}
              </div>

              {(canAccessRbacAdmin || canViewUserCreationLog) && (
                <div className="mt-5">
                  <div
                    className={`px-2 pb-2 text-[11px] font-semibold text-sidebar-accent-foreground uppercase tracking-wider ${
                      sidebarCollapsed ? "lg:hidden" : ""
                    }`}
                  >
                    অ্যাডমিন
                  </div>

                  <div className="flex flex-col gap-1">
                    {canViewUserCreationLog && (
                      <Link
                        href={userCreationLogHref}
                        onClick={() => setDrawerOpen(false)}
                        className={`group relative flex items-center gap-3 rounded-xl border-l-4 border-transparent px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar ${
                          isActive(userCreationLogHref)
                            ? "bg-sidebar-primary text-sidebar-primary-foreground border-sidebar-ring"
                            : "text-sidebar-foreground hover:bg-sidebar-accent"
                        } ${sidebarCollapsed ? "lg:justify-center" : ""}`}
                      >
                        <span
                          className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${
                            isActive(userCreationLogHref)
                              ? "bg-sidebar-primary/20"
                              : "bg-sidebar-accent group-hover:bg-sidebar-accent/80"
                          }`}
                        >
                          <Users
                            className={`h-4 w-4 ${
                              isActive(userCreationLogHref)
                                ? "text-sidebar-primary-foreground"
                                : "text-sidebar-accent-foreground"
                            }`}
                          />
                        </span>

                        <span
                          className={
                            sidebarCollapsed ? "lg:hidden truncate" : "truncate"
                          }
                        >
                          ব্যবহারকারী তৈরি লগ
                        </span>
                      </Link>
                    )}

                    {canAccessRbacAdmin && (
                      <Link
                        href={applyBasePath(
                          "/dashboard/admin/rbac",
                          roleBasePath
                        )}
                        onClick={() => setDrawerOpen(false)}
                        className={`group relative flex items-center gap-3 rounded-xl border-l-4 border-transparent px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar ${
                          isActive(
                            applyBasePath("/dashboard/admin/rbac", roleBasePath)
                          )
                            ? "bg-sidebar-primary text-sidebar-primary-foreground border-sidebar-ring"
                            : "text-sidebar-foreground hover:bg-sidebar-accent"
                        } ${sidebarCollapsed ? "lg:justify-center" : ""}`}
                      >
                        <span
                          className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${
                            isActive(
                              applyBasePath(
                                "/dashboard/admin/rbac",
                                roleBasePath
                              )
                            )
                              ? "bg-sidebar-primary/20"
                              : "bg-sidebar-accent group-hover:bg-sidebar-accent/80"
                          }`}
                        >
                          <Settings
                            className={`h-4 w-4 ${
                              isActive(
                                applyBasePath(
                                  "/dashboard/admin/rbac",
                                  roleBasePath
                                )
                              )
                                ? "text-sidebar-primary-foreground"
                                : "text-sidebar-accent-foreground"
                            }`}
                          />
                        </span>

                        <span
                          className={
                            sidebarCollapsed ? "lg:hidden truncate" : "truncate"
                          }
                        >
                          RBAC ব্যবস্থাপনা
                        </span>
                      </Link>
                    )}
                  </div>
                </div>
              )}

              {isSuperAdmin && (
                <div className="mt-5">
                  <div
                    className={`px-2 pb-2 text-[11px] font-semibold text-sidebar-accent-foreground uppercase tracking-wider ${
                      sidebarCollapsed ? "lg:hidden" : ""
                    }`}
                  >
                    Settings
                  </div>

                  <div className="flex flex-col gap-1">
                    <Link
                      href={applyBasePath(
                        "/dashboard/admin/business-types",
                        roleBasePath
                      )}
                      onClick={() => setDrawerOpen(false)}
                      className={`group relative flex items-center gap-3 rounded-xl border-l-4 border-transparent px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar ${
                        isActive(
                          applyBasePath(
                            "/dashboard/admin/business-types",
                            roleBasePath
                          )
                        )
                          ? "bg-sidebar-primary text-sidebar-primary-foreground border-sidebar-ring"
                          : "text-sidebar-foreground hover:bg-sidebar-accent"
                      } ${sidebarCollapsed ? "lg:justify-center" : ""}`}
                    >
                      <span
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${
                          isActive(
                            applyBasePath(
                              "/dashboard/admin/business-types",
                              roleBasePath
                            )
                          )
                            ? "bg-sidebar-primary/20"
                            : "bg-sidebar-accent group-hover:bg-sidebar-accent/80"
                        }`}
                      >
                        <Settings
                          className={`h-4 w-4 ${
                            isActive(
                              applyBasePath(
                                "/dashboard/admin/business-types",
                                roleBasePath
                              )
                            )
                              ? "text-sidebar-primary-foreground"
                              : "text-sidebar-accent-foreground"
                          }`}
                        />
                      </span>

                      <span
                        className={
                          sidebarCollapsed ? "lg:hidden truncate" : "truncate"
                        }
                      >
                        Business Types
                      </span>
                    </Link>

                    <Link
                      href={systemSettingsHref}
                      onClick={() => setDrawerOpen(false)}
                    className={`group relative flex items-center gap-3 rounded-xl border-l-4 border-transparent px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar ${
                      pathname === systemSettingsHref
                        ? "bg-sidebar-primary text-sidebar-primary-foreground border-sidebar-ring"
                        : "text-sidebar-foreground hover:bg-sidebar-accent"
                    } ${sidebarCollapsed ? "lg:justify-center" : ""}`}
                    >
                      <span
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${
                          pathname === systemSettingsHref
                            ? "bg-sidebar-primary/20"
                            : "bg-sidebar-accent group-hover:bg-sidebar-accent/80"
                        }`}
                      >
                        <Settings
                          className={`h-4 w-4 ${
                            pathname === systemSettingsHref
                              ? "text-sidebar-primary-foreground"
                              : "text-sidebar-accent-foreground"
                          }`}
                        />
                      </span>

                      <span
                        className={
                          sidebarCollapsed ? "lg:hidden truncate" : "truncate"
                        }
                      >
                        System Settings
                      </span>
                    </Link>
                  </div>
                </div>
              )}
            </nav>

            <div
              className={`border-t border-sidebar-border px-4 py-4 ${
                sidebarCollapsed ? "lg:px-3" : ""
              }`}
            >
              <div ref={userMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((p) => !p)}
                  className={`w-full flex items-center gap-3 rounded-xl border border-sidebar-border bg-sidebar-accent px-3 py-2 text-left shadow-sm hover:bg-sidebar-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar ${
                    sidebarCollapsed ? "lg:justify-center" : ""
                  }`}
                  aria-label="Open user menu"
                  aria-expanded={userMenuOpen}
                >
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground text-sm font-semibold">
                    {userInitials}
                  </span>

                  <span
                    className={sidebarCollapsed ? "hidden" : "min-w-0 flex-1"}
                  >
                    <span className="block truncate text-sm font-semibold text-sidebar-foreground">
                      {userDisplayName}
                    </span>
                    {userEmail ? (
                      <span className="block truncate text-xs text-sidebar-accent-foreground">
                        {userEmail}
                      </span>
                    ) : null}
                  </span>

                  <span
                    className={
                      sidebarCollapsed ? "hidden" : "flex items-center gap-2"
                    }
                  >
                    {primaryRoleLabel ? (
                      <span className="inline-flex items-center rounded-full border border-sidebar-border bg-sidebar-accent px-2 py-0.5 text-[11px] font-semibold text-sidebar-accent-foreground">
                        {primaryRoleLabel}
                      </span>
                    ) : null}
                    <ChevronDown
                      className={`h-4 w-4 text-sidebar-accent-foreground transition-transform ${
                        userMenuOpen ? "rotate-180" : "rotate-0"
                      }`}
                    />
                  </span>
                </button>

                {userMenuOpen && (
                  <div
                    className={`absolute bottom-[56px] z-50 rounded-xl border border-border bg-card shadow-[0_16px_40px_rgba(15,23,42,0.18)] overflow-hidden ${
                      sidebarCollapsed ? "left-0 w-64" : "left-0 right-0"
                    }`}
                  >
                    <div className="p-2">
                      <Link
                        href={profileHref}
                        onClick={() => {
                          setUserMenuOpen(false);
                          setDrawerOpen(false);
                        }}
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      >
                        <User className="h-4 w-4" />
                        <span>Profile</span>
                      </Link>

                      <div className="mt-2">
                        <div className="flex items-center gap-2 px-3 pb-2 text-xs font-semibold text-muted-foreground">
                          <LogOut className="h-4 w-4" />
                          <span>Logout</span>
                        </div>
                        <LogoutButton variant="menu" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col h-full lg:pl-0 overflow-hidden">
          <header className="sticky top-0 z-20 bg-card/80 backdrop-blur border-b border-border">
            <div className="flex items-start gap-3 px-4 sm:px-6 lg:px-8 py-3">
              {/* Drawer toggle */}
              <button
                className="lg:hidden inline-flex items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background shrink-0 mt-1 h-10 w-10"
                onClick={() => setDrawerOpen((p) => !p)}
                aria-label="Toggle navigation"
              >
                <Menu className="h-5 w-5" />
              </button>

              {/* Left content */}
              <div className="flex-1 min-w-0">
                {/* <p className="text-[11px] text-muted-foreground mb-1">বর্তমান দোকান</p> */}

                {/* Shop name (click to view full name) */}
                <button
                  onClick={() => setShopNameOpen(true)}
                  className="text-left w-full"
                >
                  <h2 className="text-base font-bold text-foreground leading-snug line-clamp-2 hover:underline">
                    {currentShopName}
                  </h2>
                </button>
              </div>

              {/* Shop selector + Status */}
              <div className="flex flex-col items-end gap-2 shrink-0">
                <div className="flex items-center gap-2">
                  {shops?.length > 0 ? (
                    <Select
                      value={safeShopId ?? undefined}
                      onValueChange={(value) => handleShopChange(value)}
                    >
                      <SelectTrigger className="w-[180px] sm:w-[200px] border border-border bg-card text-left text-foreground shadow-sm focus:ring-2 focus:ring-primary/30">
                        <SelectValue placeholder="দোকান নির্বাচন করুন" />
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
                      className="text-sm font-semibold text-primary hover:text-primary-hover"
                    >নতুন দোকান যোগ করুন</Link>
                  )}
                  <ThemeToggle />
                </div>

                {/* Online / Offline status under select */}
                <div className="flex items-center gap-1 text-xs font-semibold mt-2">
                  <span
                    className={`inline-flex h-2 w-2 rounded-full ${
                      online ? "bg-success" : "bg-muted-foreground"
                    }`}
                  />
                  <span
                    className={
                      online ? "text-success" : "text-muted-foreground"
                    }
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

                <p className="text-base font-semibold text-foreground leading-relaxed break-words">
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
          className={`relative grid ${bottomGridClass} rounded-t-2xl bg-card/90 backdrop-blur-sm border border-border shadow-[0_-4px_18px_rgba(15,23,42,0.12)] px-3 pt-4 pb-3`}
        >
          {mobileNavItems.map((item) => {
            const targetHref =
              item.href === "/dashboard"
                ? effectiveDashboardHref
                : applyBasePath(item.href, roleBasePath);
            const Icon = item.Icon;

            return (
              <Link
                key={item.href}
                href={targetHref}
                className={`flex flex-col items-center justify-center py-2 text-[11px] font-semibold gap-1 rounded-xl transition-colors ${
                  isActive(targetHref)
                    ? "text-primary bg-primary-soft"
                    : "text-muted-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="leading-none">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ✅ Floating primary action: now self-explanatory (problem #3) */}

      {/* Smart Floating Action Button */}
      {fabConfig && safeShopId && !drawerOpen ? (
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
      bg-[#0D9488] text-[#ECFEFF] hover:bg-[#0B877B]
      shadow-[0_10px_24px_rgba(13,148,136,0.35)]
      active:scale-[0.97]
      transition-all duration-200
      ${showFabLabel ? "px-5 py-3 gap-2" : "h-14 w-14"}
    `}
        >
          {/* Icon */}
          <span
            className={`flex items-center justify-center rounded-full bg-[#ECFEFF]/20 ${
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



