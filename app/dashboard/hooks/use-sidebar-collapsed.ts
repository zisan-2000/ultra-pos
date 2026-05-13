// app/dashboard/hooks/use-sidebar-collapsed.ts

import { useState, useEffect } from "react";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";

export function useSidebarCollapsed() {
  const [mounted, setMounted] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  return { sidebarCollapsed, mounted, toggleSidebarCollapsed };
}
