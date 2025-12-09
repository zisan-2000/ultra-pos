// app/dashboard/DashboardShell.tsx

"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import LogoutButton from "@/components/LogoutButton";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { useCurrentShop } from "@/hooks/use-current-shop";

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
];

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
    label: "+ নতুন পণ্য",
  },
  "/dashboard/expenses": {
    href: "/dashboard/expenses/new",
    label: "+ নতুন খরচ",
  },
  "/dashboard/cash": { href: "/dashboard/cash/new", label: "+ নতুন এন্ট্রি" },
};

export function DashboardShell({
  shops,
  children,
}: {
  shops: Shop[];
  children: ReactNode;
}) {
  const online = useOnlineStatus();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { shopId, setShop } = useCurrentShop();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [rbacUser, setRbacUser] = useState<RbacUser>(null);
  const [rbacLoaded, setRbacLoaded] = useState(false);

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
    let cancelled = false;

    async function loadRbac() {
      try {
        const res = await fetch("/api/rbac/me", { credentials: "include" });
        if (!res.ok) {
          if (!cancelled) {
            setRbacUser(null);
            setRbacLoaded(true);
          }
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setRbacUser(data.user ?? null);
          setRbacLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setRbacUser(null);
          setRbacLoaded(true);
        }
      }
    }

    loadRbac();

    return () => {
      cancelled = true;
    };
  }, []);

  const isSuperAdmin = rbacUser?.roles?.includes("super_admin") ?? false;

  const hasPermission = (permission: string | null | undefined) => {
    if (!permission) return true;
    if (!rbacLoaded) return false;
    if (isSuperAdmin) return true;
    const perms = rbacUser?.permissions ?? [];
    return perms.includes(permission);
  };

  const effectiveDashboardHref = useMemo(() => {
    if (!rbacUser) return "/dashboard";

    const roles = rbacUser.roles || [];

    if (isSuperAdmin) return "/super-admin/dashboard";
    if (roles.includes("admin")) return "/admin/dashboard";
    if (roles.includes("agent")) return "/agent/dashboard";
    if (roles.includes("owner")) return "/owner/dashboard";
    if (roles.includes("staff")) return "/staff/dashboard";

    return "/dashboard";
  }, [rbacUser, isSuperAdmin]);

  const canAccessRbacAdmin = hasPermission("access_rbac_admin");

  const routePermissionMap: Record<string, string> = {
    "/dashboard": "view_dashboard_summary",
    "/dashboard/shops": "view_shops",
    "/dashboard/products": "view_products",
    "/dashboard/sales": "view_sales",
    "/dashboard/expenses": "view_expenses",
    "/dashboard/due": "view_due_summary",
    "/dashboard/cash": "view_cashbook",
    "/dashboard/reports": "view_reports",
  };

  const isActive = (href: string) => {
    if (!mounted) return false;
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  const handleShopChange = (id: string) => {
    setShop(id);
    const params = new URLSearchParams(searchParams?.toString() || "");
    params.set("shopId", id);
    const next = `${pathname}?${params.toString()}`;
    router.replace(next);
  };

  const fabConfig =
    fabByRoute[
      bottomNav.find((item) => pathname.startsWith(item.href))?.href || pathname
    ] || null;

  return (
    <div className="h-screen overflow-hidden bg-gray-50">
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
                    item.href === "/dashboard" ? effectiveDashboardHref : item.href;

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

          {canAccessRbacAdmin && (
            <div className="mt-6 space-y-2">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                অ্যাডমিন
              </div>
              <Link
                href="/dashboard/admin/rbac"
                onClick={(e) => {
                  e.preventDefault();
                  setDrawerOpen(false);
                  router.push("/dashboard/admin/rbac");
                }}
                className={`flex items-center justify-between gap-2 rounded-lg px-4 py-3 text-base font-medium transition-colors cursor-pointer ${
                  isActive("/dashboard/admin/rbac")
                    ? "bg-green-50 text-green-700 border border-green-100"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <span>RBAC ব্যবস্থাপনা</span>
                {isActive("/dashboard/admin/rbac") ? (
                  <span className="text-xs text-green-600">চলমান</span>
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
          <header className="sticky top-0 z-20 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200 shadow-sm">
            <div className="flex items-center gap-3 px-4 sm:px-6 lg:px-8 py-3">
              <button
                className="lg:hidden rounded-lg border border-slate-200 px-3 py-2 text-gray-700 bg-white shadow-sm"
                onClick={() => setDrawerOpen((p) => !p)}
                aria-label="Toggle navigation"
              >
                ☰
              </button>

              <div className="flex-1">
                <p className="text-[11px] text-gray-500">বর্তমান দোকান</p>
                <h2 className="text-base font-semibold text-gray-900 leading-tight">
                  {currentShopName}
                </h2>
              </div>

              {shops?.length > 0 ? (
                <select
                  value={safeShopId || undefined}
                  onChange={(e) => handleShopChange(e.target.value)}
                  className="w-40 sm:w-56 lg:w-64 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  {shops.map((shop) => (
                    <option key={shop.id} value={shop.id}>
                      {shop.name}
                    </option>
                  ))}
                </select>
              ) : (
                <Link
                  href="/dashboard/shops/new"
                  className="text-sm font-semibold text-blue-600"
                >
                  দোকান তৈরি করুন
                </Link>
              )}
            </div>
          </header>

          <main className="flex-1 pb-24 lg:pb-10 overflow-y-auto">
            <div className="px-4 sm:px-6 lg:px-8 py-6">{children}</div>
          </main>
        </div>
      </div>

      {/* Bottom nav for mobile */}
      <nav className="fixed bottom-0 inset-x-0 z-30 lg:hidden px-3 pb-3">
        <div className="relative grid grid-cols-5 rounded-t-2xl bg-white/90 backdrop-blur-sm border border-slate-200 shadow-[0_-4px_18px_rgba(15,23,42,0.12)] px-3 pt-4 pb-3">
          {bottomNav
            .filter((item) => hasPermission(routePermissionMap[item.href]))
            .map((item) => {
              const targetHref =
                item.href === "/dashboard" ? effectiveDashboardHref : item.href;

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

      {/* Floating Add button for primary actions */}
      {fabConfig && safeShopId ? (
        <Link
          href={`${fabConfig.href}?shopId=${safeShopId}`}
          aria-label={fabConfig.label}
          className="fixed bottom-[100px] left-1/2 -translate-x-1/2 z-40 lg:hidden inline-flex items-center justify-center h-[52px] w-[52px] rounded-full bg-blue-500 text-white shadow-[0_6px_14px_rgba(0,0,0,0.12)] hover:bg-blue-600 transition-colors fab-tap"
        >
          <span className="text-lg leading-none">＋</span>
        </Link>
      ) : null}
    </div>
  );
}
