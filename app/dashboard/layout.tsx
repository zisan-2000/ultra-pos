// app/dashboard/layout.tsx

import Link from "next/link";

export default function DashboardLayout({ children }: any) {
  return (
    <div className="flex">
      {/* Sidebar */}
      <aside className="w-64 h-screen bg-gray-100 p-4 space-y-3">
        <h2 className="text-lg font-bold">My POS</h2>

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
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6">
        <header className="border-b pb-4 mb-6">
          <h1 className="text-2xl font-bold">Dashboard</h1>
        </header>

        {children}
      </main>
    </div>
  );
}
