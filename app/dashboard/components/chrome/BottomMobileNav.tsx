// app/dashboard/components/chrome/BottomMobileNav.tsx

"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  Icon: LucideIcon;
};

type NavTone = {
  icon: string;
  iconActive: string;
  itemActive: string;
};

type Props = {
  mobileNavItems: NavItem[];
  bottomGridClass: string;
  effectiveDashboardHref: string;
  bottomNavTone: Record<string, NavTone>;
  isActive: (href: string) => boolean;
  onNavClick: (event: React.MouseEvent<HTMLAnchorElement>, href: string) => void;
  onNavPrefetch: (href: string) => void;
  buildShopHref: (path: string) => string;
};

export function BottomMobileNav({
  mobileNavItems,
  bottomGridClass,
  effectiveDashboardHref,
  bottomNavTone,
  isActive,
  onNavClick,
  onNavPrefetch,
  buildShopHref,
}: Props) {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-30 lg:hidden px-3 print:hidden"
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
    >
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
              onClick={(event) => onNavClick(event, targetHref)}
              onMouseEnter={() => onNavPrefetch(scopedHref)}
              onTouchStart={() => onNavPrefetch(scopedHref)}
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
  );
}
