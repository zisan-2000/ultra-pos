// app/dashboard/layout.tsx
"use client";

import Link from "next/link";
import { useOnlineStatus } from "@/lib/sync/net-status";
import LogoutButton from "@/components/LogoutButton";

export default function DashboardLayout({ children }: any) {
  const online = useOnlineStatus();

  return (
    <div className="flex">
      {/* Sidebar */}
      <aside className="w-64 h-screen bg-gray-100 p-4 space-y-3">
        <h2 className="text-lg font-bold">Task</h2>

        <nav className="space-y-2">
          <Link href="/dashboard" className="block p-2">
            Dashboard
          </Link>
          <Link href="/dashboard/shops" className="block p-2">
            Shops
          </Link>
          <Link href="/dashboard/products" className="block p-2">
            Products
          </Link>
          <Link href="/dashboard/sales" className="block p-2">
            Sales
          </Link>
          <Link href="/dashboard/expenses" className="block p-2">
            Expenses
          </Link>
          <Link href="/dashboard/cash" className="block p-2">
            Cashbook
          </Link>
          <Link href="/dashboard/reports" className="block p-2">
            Reports
          </Link>
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6">
        <header className="border-b pb-4 mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Dashboard</h1>

          <div className="flex items-center gap-3">
            <span
              className={`text-xs px-2 py-1 rounded ${
                online
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {online ? "Online" : "Offline"}
            </span>

            <LogoutButton />
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}
