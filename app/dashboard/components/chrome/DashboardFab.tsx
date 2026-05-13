// app/dashboard/components/chrome/DashboardFab.tsx

"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

type FabConfig = {
  href: string;
  label: string;
};

type Props = {
  fabConfig: FabConfig | null;
  safeShopId: string | null;
  drawerOpen: boolean;
  showFabLabel: boolean;
  onNavClick: (event: React.MouseEvent<HTMLAnchorElement>, href: string) => void;
  onNavPrefetch: (href: string) => void;
};

export function DashboardFab({
  fabConfig,
  safeShopId,
  drawerOpen,
  showFabLabel,
  onNavClick,
  onNavPrefetch,
}: Props) {
  if (!fabConfig || !safeShopId || drawerOpen) return null;

  const fullHref = `${fabConfig.href}?shopId=${safeShopId}`;

  return (
    <Link
      href={fullHref}
      prefetch={false}
      onClick={(event) => onNavClick(event, fullHref)}
      onMouseEnter={() => onNavPrefetch(fullHref)}
      onTouchStart={() => onNavPrefetch(fullHref)}
      aria-label={fabConfig.label}
      title={fabConfig.label}
      style={{ bottom: "calc(6.75rem + env(safe-area-inset-bottom, 0px))" }}
      className={`
        fixed left-1/2 -translate-x-1/2 z-40 lg:hidden
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
      <span
        className={`flex items-center justify-center rounded-full bg-[#ECFEFF]/20 ${
          showFabLabel ? "h-8 w-8" : "h-10 w-10 bg-transparent"
        }`}
      >
        <Plus className="h-5 w-5 stroke-[2.5]" />
      </span>
      {showFabLabel && (
        <span className="text-sm font-semibold whitespace-nowrap">
          {fabConfig.label}
        </span>
      )}
    </Link>
  );
}
