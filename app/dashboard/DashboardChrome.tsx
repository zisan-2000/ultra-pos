// app/dashboard/DashboardChrome.tsx

"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import LogoutButton from "@/components/LogoutButton";
import { ThemeToggle } from "@/components/theme-toggle";
import OwnerSummaryVoice from "@/components/voice/OwnerSummaryVoice";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { useCurrentShop } from "@/hooks/use-current-shop";
import { SHOP_TYPES_WITH_COGS } from "@/lib/accounting/cogs-types";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";
import {
  BarChart3,
  ChevronDown,
  CreditCard,
  HandCoins,
  LayoutDashboard,
  LogOut,
  Menu,
  NotebookText,
  Package,
  PackagePlus,
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
import { Skeleton } from "@/components/ui/skeleton";

type Shop = {
  id: string;
  name: string;
  closingTime?: string | null;
  businessType?: string | null;
};

type RbacUser = {
  id: string;
  email: string | null;
  name: string | null;
  roles: string[];
  permissions: string[];
} | null;

const NAV_SKELETON_DELAY_MS = 180;

const NavSkeleton = () => (
  <div className="space-y-6">
    <div className="flex items-center justify-between gap-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-9 w-28 rounded-lg" />
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <Skeleton className="h-24 rounded-xl" />
      <Skeleton className="h-24 rounded-xl" />
      <Skeleton className="h-24 rounded-xl" />
      <Skeleton className="h-24 rounded-xl" />
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Skeleton className="h-56 rounded-2xl" />
      <Skeleton className="h-56 rounded-2xl" />
    </div>

    <Skeleton className="h-72 rounded-2xl" />
  </div>
);

const navItems: { href: string; label: string; Icon: LucideIcon }[] = [
  { href: "/dashboard", label: "ড্যাশবোর্ড", Icon: LayoutDashboard },
  { href: "/dashboard/shops", label: "দোকান", Icon: Store },
  { href: "/dashboard/products", label: "পণ্য", Icon: Package },
  { href: "/dashboard/purchases", label: "পণ্য ক্রয়", Icon: PackagePlus },
  { href: "/dashboard/suppliers", label: "সরবরাহকারী", Icon: Users },
  { href: "/dashboard/sales", label: "বিক্রি", Icon: ShoppingCart },
  { href: "/dashboard/expenses", label: "খরচ", Icon: Receipt },
  { href: "/dashboard/due", label: "ধার / পাওনা", Icon: HandCoins },
  { href: "/dashboard/cash", label: "নগদ খাতা", Icon: NotebookText },
  { href: "/dashboard/reports", label: "রিপোর্ট", Icon: BarChart3 },
  { href: "/dashboard/profile", label: "প্রোফাইল", Icon: User },
  { href: "/dashboard/users", label: "স্টাফ", Icon: Users },
];

// ✅ mobile bottom nav: 6 -> 5 (profile removed)
const bottomNav: { href: string; label: string; Icon: LucideIcon }[] = [
  { href: "/dashboard", label: "ড্যাশ", Icon: LayoutDashboard },
  { href: "/dashboard/sales", label: "বিক্রি", Icon: ShoppingCart },
  { href: "/dashboard/products", label: "পণ্য", Icon: Package },
  { href: "/dashboard/expenses", label: "খরচ", Icon: Receipt },
  { href: "/dashboard/reports", label: "রিপোর্ট", Icon: BarChart3 },
];

const bottomNavTone: Record<
  string,
  { icon: string; iconActive: string; itemActive: string }
> = {
  "/dashboard": {
    icon:
      "bg-gradient-to-br from-sky-400/25 via-sky-300/10 to-sky-600/25 text-sky-600",
    iconActive:
      "bg-gradient-to-br from-sky-500/40 via-sky-400/25 to-sky-600/40 text-sky-700",
    itemActive: "text-sky-700 bg-sky-500/10",
  },
  "/dashboard/sales": {
    icon:
      "bg-gradient-to-br from-emerald-400/25 via-emerald-300/10 to-emerald-600/25 text-emerald-600",
    iconActive:
      "bg-gradient-to-br from-emerald-500/40 via-emerald-400/25 to-emerald-600/40 text-emerald-700",
    itemActive: "text-emerald-700 bg-emerald-500/10",
  },
  "/dashboard/products": {
    icon:
      "bg-gradient-to-br from-violet-400/25 via-violet-300/10 to-violet-600/25 text-violet-600",
    iconActive:
      "bg-gradient-to-br from-violet-500/40 via-violet-400/25 to-violet-600/40 text-violet-700",
    itemActive: "text-violet-700 bg-violet-500/10",
  },
  "/dashboard/expenses": {
    icon:
      "bg-gradient-to-br from-rose-400/25 via-rose-300/10 to-rose-600/25 text-rose-600",
    iconActive:
      "bg-gradient-to-br from-rose-500/40 via-rose-400/25 to-rose-600/40 text-rose-700",
    itemActive: "text-rose-700 bg-rose-500/10",
  },
  "/dashboard/reports": {
    icon:
      "bg-gradient-to-br from-amber-400/25 via-amber-300/10 to-amber-600/25 text-amber-600",
    iconActive:
      "bg-gradient-to-br from-amber-500/40 via-amber-400/25 to-amber-600/40 text-amber-700",
    itemActive: "text-amber-700 bg-amber-500/10",
  },
};

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
  "/dashboard/purchases": {
    href: "/dashboard/purchases/new",
    label: "নতুন ক্রয় যোগ করুন",
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
  const [isNavigating, startTransition] = useTransition();
  const [showNavSkeleton, setShowNavSkeleton] = useState(false);
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
    return (
      shops.find((s) => s.id === safeShopId)?.name || "দোকান নির্বাচন করুন"
    );
  }, [safeShopId, shops]);

  const currentBusinessType = useMemo(() => {
    if (!safeShopId) return null;
    return shops.find((s) => s.id === safeShopId)?.businessType ?? null;
  }, [safeShopId, shops]);

  const hasInventory = Boolean(
    currentBusinessType && SHOP_TYPES_WITH_COGS.has(currentBusinessType)
  );

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
    if (!isNavigating) {
      setShowNavSkeleton(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setShowNavSkeleton(true);
    }, NAV_SKELETON_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [isNavigating]);

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
      const raw = safeLocalStorageGet("dashboard.sidebarCollapsed");
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
        safeLocalStorageSet("dashboard.sidebarCollapsed", next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  };

  const isSuperAdmin = rbacUser?.roles?.includes("super_admin") ?? false;
  const isAdmin = rbacUser?.roles?.includes("admin") ?? false;
  const canViewUserCreationLog = isSuperAdmin || isAdmin;

  const hasPermission = (permission: string | null | undefined) => {
    if (!permission) return true;
    if (!rbacLoaded) return false;
    if (isSuperAdmin) return true;
    const perms = rbacUser?.permissions ?? [];
    return perms.includes(permission);
  };

  const effectiveDashboardHref = "/dashboard";

  const canAccessRbacAdmin = hasPermission("access_rbac_admin");
  const userCreationLogHref = "/dashboard/admin/user-creation-log";
  const systemSettingsHref = "/super-admin/system-settings";

  const buildShopHref = useMemo(() => {
    return (href: string) => {
      if (!safeShopId) return href;
      if (!href.startsWith("/dashboard")) return href;
      const [path, queryString] = href.split("?");
      const params = new URLSearchParams(queryString ?? "");
      params.set("shopId", safeShopId);
      return `${path}?${params.toString()}`;
    };
  }, [safeShopId]);

  const handleNavPrefetch = (href: string) => {
    if (!online) return;
    if (typeof window !== "undefined") {
      const connection = (navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }).connection;
      if (connection?.saveData) return;
      if (connection?.effectiveType?.includes("2g")) return;
    }
    router.prefetch(buildShopHref(href));
  };

  const handleNavClick = (
    event: ReactMouseEvent<HTMLAnchorElement>,
    href: string
  ) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey
    ) {
      return;
    }

    event.preventDefault();
    startTransition(() => {
      router.push(buildShopHref(href));
    });
  };



  const routePermissionMap: Record<string, string> = {
    "/dashboard": "view_dashboard_summary",
    "/dashboard/shops": "view_shops",
    "/dashboard/products": "view_products",
    "/dashboard/purchases": "view_purchases",
    "/dashboard/suppliers": "view_suppliers",
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
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  const visibleNavItems = useMemo(
    () =>
      navItems.filter((item) => {
        if (item.href === "/dashboard/purchases") return hasInventory;
        if (item.href === "/dashboard/suppliers") return hasInventory;
        return true;
      }),
    [hasInventory]
  );

  const navGroupClass = sidebarCollapsed
    ? "flex flex-col gap-1"
    : "grid grid-cols-2 gap-2";

  const navItemClass = (active: boolean) => {
    if (sidebarCollapsed) {
      return `group relative flex items-center gap-3 rounded-xl border-l-4 border-transparent px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar ${
        active
          ? "bg-sidebar-primary text-sidebar-primary-foreground border-sidebar-ring"
          : "text-sidebar-foreground hover:bg-sidebar-accent"
      } lg:justify-center`;
    }

    return `group relative flex flex-col items-start gap-2 rounded-2xl border border-sidebar-border/60 bg-gradient-to-br from-sidebar/80 via-sidebar to-sidebar-accent/40 px-3.5 py-3.5 text-[13px] font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar shadow-[0_8px_18px_rgba(15,23,42,0.06)] hover:shadow-[0_12px_22px_rgba(15,23,42,0.1)] card-lift ${
      active
        ? "bg-sidebar-primary text-sidebar-primary-foreground border-sidebar-ring shadow-[0_12px_26px_rgba(15,23,42,0.16)]"
        : "text-sidebar-foreground hover:bg-sidebar-accent/80 hover:border-sidebar-border"
    }`;
  };

  const navIconTone: Record<
    string,
    { accent: string; ring: string; icon: string }
  > = {
    "/dashboard": { accent: "bg-sky-500/15", ring: "ring-sky-300/70", icon: "text-sky-800" },
    "/dashboard/shops": { accent: "bg-emerald-500/15", ring: "ring-emerald-300/70", icon: "text-emerald-800" },
    "/dashboard/products": { accent: "bg-indigo-500/15", ring: "ring-indigo-300/60", icon: "text-indigo-700" },
    "/dashboard/purchases": { accent: "bg-violet-500/15", ring: "ring-violet-300/60", icon: "text-violet-700" },
    "/dashboard/suppliers": { accent: "bg-cyan-500/15", ring: "ring-cyan-300/60", icon: "text-cyan-700" },
    "/dashboard/sales": { accent: "bg-amber-500/15", ring: "ring-amber-300/60", icon: "text-amber-700" },
    "/dashboard/expenses": { accent: "bg-rose-500/15", ring: "ring-rose-300/60", icon: "text-rose-700" },
    "/dashboard/due": { accent: "bg-orange-500/15", ring: "ring-orange-300/60", icon: "text-orange-700" },
    "/dashboard/cash": { accent: "bg-teal-500/15", ring: "ring-teal-300/60", icon: "text-teal-700" },
    "/dashboard/reports": { accent: "bg-lime-500/15", ring: "ring-lime-300/60", icon: "text-lime-700" },
    "/dashboard/profile": { accent: "bg-slate-500/15", ring: "ring-slate-300/60", icon: "text-slate-700" },
    "/dashboard/users": { accent: "bg-fuchsia-500/15", ring: "ring-fuchsia-300/60", icon: "text-fuchsia-700" },
  };

  const navIconWrapClass = (href: string, active: boolean) => {
    const tone = navIconTone[href] ?? {
      accent: "bg-sidebar-accent/80",
      ring: "ring-sidebar-border",
      icon: "text-sidebar-accent-foreground",
    };
    if (sidebarCollapsed) {
      return `inline-flex h-9 w-9 items-center justify-center rounded-lg ${
        active
          ? "bg-sidebar-primary/20"
          : `${tone.accent} group-hover:bg-sidebar-accent`
      }`;
    }
    return `inline-flex h-10 w-10 items-center justify-center rounded-full ring-1 ${
      active
        ? "bg-sidebar-primary/15 ring-sidebar-ring"
        : `${tone.accent} ${tone.ring} group-hover:bg-sidebar-accent`
    }`;
  };

  const navIconClass = (href: string, active: boolean) => {
    if (active) return "text-sidebar-primary-foreground";
    const tone = navIconTone[href];
    return tone?.icon ?? "text-sidebar-accent-foreground";
  };

  const navLabelClass = sidebarCollapsed
    ? "lg:hidden truncate"
    : "truncate text-[13px] leading-snug";

  const handleShopChange = (id: string) => {
    if (!id || id === safeShopId) return;
    setShop(id);
    document.cookie = `activeShopId=${id}; path=/; max-age=${
      60 * 60 * 24 * 30
    }`;

    const params = new URLSearchParams(searchParams?.toString() || "");
    params.set("shopId", id);
    const next = `${pathname}?${params.toString()}`;
    startTransition(() => {
      router.replace(next, { scroll: false });
    });
  };

  const profileHref = "/dashboard/profile";

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

  const showFabLabel = pathname === "/dashboard";

  const baseFabConfig =
    fabByRoute[
      bottomNav.find((item) => pathname.startsWith(item.href))?.href || pathname
    ] || null;
  const fabConfig =
    pathname.startsWith("/dashboard/sales/new") ||
    (!hasInventory && baseFabConfig?.href.startsWith("/dashboard/purchases"))
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
    <div className="h-screen overflow-x-hidden bg-background print:h-auto print:overflow-visible print:bg-white">
      {/* Overlay for drawer on mobile */}
      {drawerOpen && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 bg-foreground/30 z-30 lg:hidden print:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <div className="flex h-full print:block print:h-auto">
        {/* Sidebar / Drawer */}
        <aside
          className={`fixed z-40 inset-y-0 left-0 bg-sidebar backdrop-blur border-r border-sidebar-border transform transition-[transform,width] duration-200 ease-out lg:sticky lg:top-0 lg:translate-x-0 lg:h-dvh lg:shadow-none print:hidden ${
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
                      : "bg-danger-soft text-danger"
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

              <div className={navGroupClass}>
                {visibleNavItems
                  .filter((item) =>
                    hasPermission(routePermissionMap[item.href])
                  )
                  .map((item) => {
                    const targetHref =
                      item.href === "/dashboard"
                        ? effectiveDashboardHref
                        : item.href;
                    const scopedHref = buildShopHref(targetHref);
                    const active = isActive(targetHref);
                    const Icon = item.Icon;

                    return (
                      <Link
                        key={item.href}
                        href={scopedHref}
                        prefetch={false}
                        onClick={(event) => {
                          // Prevent multi-clicks on rapid consecutive clicks
                          if (event.detail > 1) return;
                          setDrawerOpen(false);
                          handleNavClick(event, targetHref);
                        }}
                        onMouseEnter={() => handleNavPrefetch(scopedHref)}
                        onTouchStart={() => handleNavPrefetch(scopedHref)}
                        className={navItemClass(active)}
                      >
                    <span
                      className={navIconWrapClass(item.href, active)}
                    >
                      <Icon
                        className={`h-4 w-4 ${navIconClass(item.href, active)}`}
                      />
                    </span>

                        <span className={navLabelClass}>
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

                  <div className={navGroupClass}>
                    {canViewUserCreationLog && (
                      <Link
                        href={buildShopHref(userCreationLogHref)}
                        prefetch={false}
                        onClick={(event) => {
                          setDrawerOpen(false);
                          handleNavClick(event, userCreationLogHref);
                        }}
                        onMouseEnter={() =>
                          handleNavPrefetch(userCreationLogHref)
                        }
                        onTouchStart={() =>
                          handleNavPrefetch(userCreationLogHref)
                        }
                        className={navItemClass(isActive(userCreationLogHref))}
                      >
                        <span
                          className={navIconWrapClass(
                            userCreationLogHref,
                            isActive(userCreationLogHref)
                          )}
                        >
                          <Users
                            className={`h-4 w-4 ${navIconClass(
                              userCreationLogHref,
                              isActive(userCreationLogHref)
                            )}`}
                          />
                        </span>

                        <span className={navLabelClass}>
                          ব্যবহারকারী তৈরি লগ
                        </span>
                      </Link>
                    )}

                    {canAccessRbacAdmin && (
                      <Link
                        href={buildShopHref("/dashboard/admin/rbac")}
                        prefetch={false}
                        onClick={(event) => {
                          setDrawerOpen(false);
                          handleNavClick(event, "/dashboard/admin/rbac");
                        }}
                        onMouseEnter={() =>
                          handleNavPrefetch("/dashboard/admin/rbac")
                        }
                        onTouchStart={() =>
                          handleNavPrefetch("/dashboard/admin/rbac")
                        }
                        className={navItemClass(
                          isActive("/dashboard/admin/rbac")
                        )}
                      >
                        <span
                          className={navIconWrapClass(
                            "/dashboard/admin/rbac",
                            isActive("/dashboard/admin/rbac")
                          )}
                        >
                          <Settings
                            className={`h-4 w-4 ${navIconClass(
                              "/dashboard/admin/rbac",
                              isActive("/dashboard/admin/rbac")
                            )}`}
                          />
                        </span>

                        <span className={navLabelClass}>
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

                  <div className={navGroupClass}>
                    <Link
                      href={buildShopHref("/dashboard/admin/business-types")}
                      prefetch={false}
                      onClick={(event) => {
                        setDrawerOpen(false);
                        handleNavClick(
                          event,
                          "/dashboard/admin/business-types"
                        );
                      }}
                      onMouseEnter={() =>
                        handleNavPrefetch("/dashboard/admin/business-types")
                      }
                      onTouchStart={() =>
                        handleNavPrefetch("/dashboard/admin/business-types")
                      }
                      className={navItemClass(
                        isActive("/dashboard/admin/business-types")
                      )}
                    >
                      <span
                        className={navIconWrapClass(
                          "/dashboard/admin/business-types",
                          isActive("/dashboard/admin/business-types")
                        )}
                      >
                        <Settings
                          className={`h-4 w-4 ${navIconClass(
                            "/dashboard/admin/business-types",
                            isActive("/dashboard/admin/business-types")
                          )}`}
                        />
                      </span>

                      <span className={navLabelClass}>
                        Business Types
                      </span>
                    </Link>

                    <Link
                      href={buildShopHref(
                        "/dashboard/admin/business-product-library"
                      )}
                      prefetch={false}
                      onClick={(event) => {
                        setDrawerOpen(false);
                        handleNavClick(
                          event,
                          "/dashboard/admin/business-product-library"
                        );
                      }}
                      onMouseEnter={() =>
                        handleNavPrefetch(
                          "/dashboard/admin/business-product-library"
                        )
                      }
                      onTouchStart={() =>
                        handleNavPrefetch(
                          "/dashboard/admin/business-product-library"
                        )
                      }
                      className={navItemClass(
                        isActive("/dashboard/admin/business-product-library")
                      )}
                    >
                      <span
                        className={navIconWrapClass(
                          "/dashboard/admin/business-product-library",
                          isActive("/dashboard/admin/business-product-library")
                        )}
                      >
                        <Package
                          className={`h-4 w-4 ${navIconClass(
                            "/dashboard/admin/business-product-library",
                            isActive("/dashboard/admin/business-product-library")
                          )}`}
                        />
                      </span>

                      <span className={navLabelClass}>
                        Product Library
                      </span>
                    </Link>

                    <Link
                      href={buildShopHref("/dashboard/admin/billing")}
                      prefetch={false}
                      onClick={(event) => {
                        setDrawerOpen(false);
                        handleNavClick(event, "/dashboard/admin/billing");
                      }}
                      onMouseEnter={() =>
                        handleNavPrefetch("/dashboard/admin/billing")
                      }
                      onTouchStart={() =>
                        handleNavPrefetch("/dashboard/admin/billing")
                      }
                      className={navItemClass(
                        isActive("/dashboard/admin/billing")
                      )}
                    >
                      <span
                        className={navIconWrapClass(
                          "/dashboard/admin/billing",
                          isActive("/dashboard/admin/billing")
                        )}
                      >
                        <CreditCard
                          className={`h-4 w-4 ${navIconClass(
                            "/dashboard/admin/billing",
                            isActive("/dashboard/admin/billing")
                          )}`}
                        />
                      </span>

                      <span className={navLabelClass}>
                        Billing
                      </span>
                    </Link>

                    <Link
                      href={buildShopHref(systemSettingsHref)}
                      prefetch={false}
                      onClick={(event) => {
                        setDrawerOpen(false);
                        handleNavClick(event, systemSettingsHref);
                      }}
                      onMouseEnter={() => handleNavPrefetch(systemSettingsHref)}
                      onTouchStart={() => handleNavPrefetch(systemSettingsHref)}
                      className={navItemClass(
                        pathname === systemSettingsHref
                      )}
                    >
                      <span
                        className={navIconWrapClass(
                          systemSettingsHref,
                          pathname === systemSettingsHref
                        )}
                      >
                        <Settings
                          className={`h-4 w-4 ${navIconClass(
                            systemSettingsHref,
                            pathname === systemSettingsHref
                          )}`}
                        />
                      </span>

                      <span className={navLabelClass}>
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
                        href={buildShopHref(profileHref)}
                        onClick={(event) => {
                          setUserMenuOpen(false);
                          setDrawerOpen(false);
                          handleNavClick(event, profileHref);
                        }}
                        prefetch={false}
                        onMouseEnter={() => handleNavPrefetch(profileHref)}
                        onTouchStart={() => handleNavPrefetch(profileHref)}
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
        <div className="flex-1 flex flex-col h-full lg:pl-0 overflow-hidden print:h-auto print:overflow-visible">
          <header className="sticky top-0 z-20 bg-card/90 backdrop-blur border-b border-border/70 shadow-[0_1px_0_rgba(15,23,42,0.08)] relative print:hidden">
            {isNavigating && (
              <div className="absolute inset-x-0 top-0 h-0.5 bg-primary/20">
                <div className="h-full w-1/3 bg-primary animate-pulse" />
              </div>
            )}
            <div className="flex flex-col gap-2 px-4 sm:px-6 lg:px-8 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {/* Drawer toggle */}
                  <button
                    className="lg:hidden inline-flex items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background shrink-0 h-10 w-10"
                    onClick={() => setDrawerOpen((p) => !p)}
                    aria-label="Toggle navigation"
                  >
                    <Menu className="h-5 w-5" />
                  </button>

                  {/* Shop name (click to view full name) */}
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => setShopNameOpen(true)}
                      className="text-left w-full"
                    >
                      <h2 className="text-base font-bold text-foreground leading-snug tracking-tight line-clamp-1 sm:line-clamp-2 hover:underline">
                        {currentShopName}
                      </h2>
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`inline-flex h-7 items-center gap-1 rounded-full border px-3 text-[11px] font-semibold shadow-sm ${
                      online
                        ? "border-success/30 bg-success-soft text-success"
                        : "border-danger/30 bg-danger-soft text-danger"
                    }`}
                  >
                    <span
                      className={`inline-flex h-1.5 w-1.5 rounded-full ${
                        online ? "bg-success" : "bg-danger"
                      }`}
                    />
                    {online ? "অনলাইন" : "অফলাইন"}
                  </span>
                  <OwnerSummaryVoice
                    userId={rbacUser?.id ?? null}
                    roles={rbacUser?.roles ?? []}
                    shopId={safeShopId}
                    closingTime={
                      shops.find((shop) => shop.id === safeShopId)
                        ?.closingTime ?? null
                    }
                    online={online}
                  />
                  <ThemeToggle />
                </div>
              </div>

              <div className="flex items-center gap-2">
                {shops?.length > 0 ? (
                  mounted ? (
                    <Select
                      value={safeShopId ?? undefined}
                      onValueChange={(value) => handleShopChange(value)}
                    >
                      <SelectTrigger className="w-full sm:w-[240px] h-11 rounded-xl border border-border/80 bg-muted/40 text-left text-foreground shadow-sm focus:ring-2 focus:ring-primary/30">
                        <SelectValue placeholder="দোকান নির্বাচন করুন" />
                      </SelectTrigger>
                      <SelectContent align="start" className="w-[240px]">
                        {shops.map((shop) => (
                          <SelectItem key={shop.id} value={shop.id}>
                            {shop.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <select
                      value={safeShopId ?? ""}
                      onChange={(event) =>
                        handleShopChange(event.target.value)
                      }
                      className="h-11 w-full sm:w-[240px] rounded-xl border border-border/80 bg-muted/40 px-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="" disabled>
                        দোকান নির্বাচন করুন
                      </option>
                      {shops.map((shop) => (
                        <option key={shop.id} value={shop.id}>
                          {shop.name}
                        </option>
                      ))}
                    </select>
                  )
                ) : (
                  <Link
                    href={buildShopHref("/dashboard/shops/new")}
                    prefetch={false}
                    onClick={(event) =>
                      handleNavClick(event, "/dashboard/shops/new")
                    }
                    onMouseEnter={() =>
                      handleNavPrefetch("/dashboard/shops/new")
                    }
                    onTouchStart={() =>
                      handleNavPrefetch("/dashboard/shops/new")
                    }
                    className="text-sm font-semibold text-primary hover:text-primary-hover"
                  >
                    নতুন দোকান যোগ করুন
                  </Link>
                )}
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

          <main
            className="relative flex-1 pb-28 lg:pb-10 overflow-y-auto print:pb-0 print:overflow-visible"
            aria-busy={isNavigating}
          >
            {showNavSkeleton && (
              <div className="absolute inset-0 z-10 bg-background/70 backdrop-blur-sm">
                <div className="px-4 sm:px-6 lg:px-8 py-6">
                  <NavSkeleton />
                </div>
              </div>
            )}
            <div
              className={`px-4 sm:px-6 lg:px-8 py-6 print:p-0 ${
                showNavSkeleton ? "opacity-0" : ""
              }`}
            >
              {children}
            </div>
          </main>
        </div>
      </div>

      {/* Bottom nav for mobile */}
      <nav className="fixed bottom-0 inset-x-0 z-30 lg:hidden px-3 pb-3 print:hidden">
        <div
          className={`relative grid ${bottomGridClass} rounded-t-2xl bg-card/90 backdrop-blur-sm border border-border shadow-[0_-4px_18px_rgba(15,23,42,0.12)] px-3 pt-4 pb-3`}
        >
          {mobileNavItems.map((item) => {
            const targetHref =
              item.href === "/dashboard" ? effectiveDashboardHref : item.href;
            const scopedHref = buildShopHref(targetHref);
            const Icon = item.Icon;
            const isActiveItem = isActive(targetHref);
            const tone = bottomNavTone[item.href] ?? {
              icon: "bg-muted/40 text-muted-foreground",
              iconActive: "bg-primary/15 text-primary",
              itemActive: "text-primary bg-primary-soft",
            };

            return (
              <Link
                key={item.href}
                href={scopedHref}
                prefetch={false}
                onClick={(event) => handleNavClick(event, targetHref)}
                onMouseEnter={() => handleNavPrefetch(scopedHref)}
                onTouchStart={() => handleNavPrefetch(scopedHref)}
                aria-current={isActiveItem ? "page" : undefined}
                className={`group flex flex-col items-center justify-center py-2 text-[11px] font-semibold gap-1 rounded-2xl transition-colors ${
                  isActiveItem
                    ? tone.itemActive
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-2xl transition-transform group-active:scale-95 ${
                    isActiveItem ? tone.iconActive : tone.icon
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </span>
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
          href={`${fabConfig.href}?shopId=${safeShopId}`}
          prefetch={false}
          onClick={(event) =>
            handleNavClick(event, `${fabConfig.href}?shopId=${safeShopId}`)
          }
          onMouseEnter={() =>
            handleNavPrefetch(`${fabConfig.href}?shopId=${safeShopId}`)
          }
          onTouchStart={() =>
            handleNavPrefetch(`${fabConfig.href}?shopId=${safeShopId}`)
          }
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
      print:hidden
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

export default DashboardShell;
