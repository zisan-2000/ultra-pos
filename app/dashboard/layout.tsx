// app/dashboard/layout.tsx
"use client";

import Link from "next/link";
import { useOnlineStatus } from "@/lib/sync/net-status";
import LogoutButton from "@/components/LogoutButton";
import { usePathname } from "next/navigation";

export default function DashboardLayout({ children }: any) {
  const online = useOnlineStatus();
  const pathname = usePathname();

  const navItems = [
    { href: "/dashboard", label: "ড্যাশবোর্ড" },
    { href: "/dashboard/shops", label: "দোকান" },
    { href: "/dashboard/products", label: "পণ্য" },
    { href: "/dashboard/sales", label: "বিক্রি" },
    { href: "/dashboard/expenses", label: "খরচ" },
    { href: "/dashboard/due", label: "ধার / বাকি" },
    { href: "/dashboard/cash", label: "ক্যাশ খাতা" },
    { href: "/dashboard/reports", label: "রিপোর্ট" },
  ];

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 h-screen bg-white border-r border-gray-200 p-6 overflow-y-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">আল্ট্রা পিওএস</h1>
          <p className="text-sm text-gray-500 mt-1">দোকানের হিসাব</p>
        </div>

        <nav className="space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-4 py-3 rounded-lg text-base font-medium transition-colors ${
                isActive(item.href)
                  ? "bg-green-50 text-green-700 border-l-4 border-green-600"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-8 pt-6 border-t border-gray-200">
          <LogoutButton />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
          <div></div>

          <div className="flex items-center gap-4">
            <span
              className={`text-sm px-3 py-1 rounded-full font-medium ${
                online
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {online ? "অনলাইন" : "অফলাইন"}
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="p-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
