"use client";

import { useState } from "react";

interface SidebarItem {
  id: string;
  label: string;
  icon?: string;
}

const menuItems: SidebarItem[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "products", label: "Products" },
  { id: "sales", label: "Sales" },
  { id: "customers", label: "Customers" },
  { id: "inventory", label: "Inventory" },
  { id: "reports", label: "Reports" },
  { id: "settings", label: "Settings" },
];

export const Sidebar = () => {
  const [activeItem, setActiveItem] = useState("sales");

  return (
    <aside className="w-64 bg-card border-r border-border/30 min-h-screen shadow-md">
      <div className="p-6">
        <div className="mb-8">
          <h2 className="text-lg font-bold text-primary">POS Menu</h2>
          <p className="text-xs text-muted-foreground mt-1">Navigation</p>
        </div>
        <ul className="space-y-1">
          {menuItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => setActiveItem(item.id)}
                className={`
                  w-full text-left px-4 py-3 rounded-lg transition-all duration-200 font-medium
                  ${
                    activeItem === item.id
                      ? "bg-linear-to-r from-primary to-primary/80 text-white shadow-lg scale-105 border-l-4 border-white/30"
                      : "text-secondary-foreground hover:bg-primary/10 hover:text-primary border-l-4 border-transparent"
                  }
                `}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Bottom Section */}
      <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-border/20 bg-card">
        <button className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg transition-colors font-medium text-sm">
          <span>⚙️</span>
          Settings
        </button>
      </div>
    </aside>
  );
};
