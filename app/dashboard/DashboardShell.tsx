"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import LogoutButton from "@/components/LogoutButton";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { useCurrentShop } from "@/hooks/use-current-shop";

type Shop = { id: string; name: string };

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
  { href: "/dashboard", label: "ড্যাশ", icon: "D" },
  { href: "/dashboard/sales", label: "বিক্রি", icon: "S" },
  { href: "/dashboard/products", label: "পণ্য", icon: "P" },
  { href: "/dashboard/expenses", label: "খরচ", icon: "E" },
  { href: "/dashboard/reports", label: "রিপোর্ট", icon: "R" }
];

const fabByRoute: Record<string, { href: string; label: string } | null> = {
  "/dashboard": { href: "/dashboard/sales/new", label: "নতুন বিক্রি যোগ করুন" },
  "/dashboard/sales": { href: "/dashboard/sales/new", label: "নতুন বিক্রি যোগ করুন" },
  "/dashboard/products": { href: "/dashboard/products/new", label: "+ নতুন পণ্য" },
  "/dashboard/expenses": { href: "/dashboard/expenses/new", label: "+ নতুন খরচ" },
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
  const safeShopId = useMemo(() => {
    if (!shops || shops.length === 0) return null;
    if (shopId && shops.some((s) => s.id === shopId)) return shopId;
    return shops[0]?.id || null;
  }, [shops, shopId]);

  const currentShopName = useMemo(() => {
    if (!safeShopId) return "দোকান নির্বাচন করুন";
    return shops.find((s) => s.id === safeShopId)?.name || "দোকান নির্বাচন করুন";
  }, [safeShopId, shops]);

  useEffect(() => {
    if (safeShopId && safeShopId !== shopId) {
      setShop(safeShopId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeShopId]);

  const isActive = (href: string) => {
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
    <div className="min-h-screen bg-gray-50">
      {/* Overlay for drawer on mobile */}
      {drawerOpen && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <div className="flex min-h-screen">
        {/* Sidebar / Drawer */}
        <aside
          className={`fixed z-40 inset-y-0 left-0 w-72 bg-white border-r border-gray-200 p-6 transform transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${
            drawerOpen ? "translate-x-0 shadow-xl" : "-translate-x-full"
          }`}
        >
          <div className="mb-8 flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">আল্ট্রা মাইক্রো</h1>
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
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setDrawerOpen(false)}
                  className={`flex items-center justify-between gap-2 rounded-lg px-4 py-3 text-base font-medium transition-colors ${
                    isActive(item.href)
                      ? "bg-green-50 text-green-700 border border-green-100"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <span>{item.label}</span>
                  {isActive(item.href) ? (
                    <span className="text-xs text-green-600">চলমান</span>
                  ) : null}
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-gray-200">
            <LogoutButton />
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-h-screen lg:pl-0">
          <header className="sticky top-0 z-20 bg-white border-b border-gray-200">
            <div className="flex items-center gap-3 px-4 sm:px-6 lg:px-8 py-3">
              <button
                className="lg:hidden rounded-lg border border-gray-200 px-3 py-2 text-gray-700 bg-white shadow-sm"
                onClick={() => setDrawerOpen((p) => !p)}
                aria-label="Toggle navigation"
              >
                ☰
              </button>

              <div className="flex-1">
                <p className="text-xs text-gray-500">বর্তমান দোকান</p>
                <h2 className="text-lg font-semibold text-gray-900 leading-tight">
                  {currentShopName}
                </h2>
              </div>

              {shops?.length > 0 ? (
                <select
                  value={safeShopId || undefined}
                  onChange={(e) => handleShopChange(e.target.value)}
                  className="w-40 sm:w-56 lg:w-64 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
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

          <main className="flex-1 pb-24 lg:pb-10">
            <div className="px-4 sm:px-6 lg:px-8 py-6">{children}</div>
          </main>
        </div>
      </div>

      {/* Bottom nav for mobile */}
      <nav className="fixed bottom-0 inset-x-0 z-30 lg:hidden bg-white border-t border-gray-200 shadow-lg">
        <div className="grid grid-cols-5">
          {bottomNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center py-3 text-xs font-semibold ${
                isActive(item.href)
                  ? "text-green-700 bg-green-50"
                  : "text-gray-600"
              }`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              <span className="mt-1">{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>

      {/* Floating Add button for primary actions */}
      {fabConfig && safeShopId ? (
        <Link
          href={`${fabConfig.href}?shopId=${safeShopId}`}
          className="fixed bottom-20 right-4 z-30 lg:hidden inline-flex items-center gap-2 rounded-full bg-blue-600 text-white px-5 py-3 shadow-lg hover:bg-blue-700 transition-colors"
        >
          <span className="text-lg">+</span>
          <span className="font-semibold text-sm">{fabConfig.label}</span>
        </Link>
      ) : null}
    </div>
  );
}
