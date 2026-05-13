// app/dashboard/components/chrome/SidebarUserMenu.tsx

"use client";

import { type RefObject } from "react";
import Link from "next/link";
import { ChevronDown, User } from "lucide-react";
import LogoutButton from "@/components/LogoutButton";
import StopImpersonationButton from "@/components/impersonation/StopImpersonationButton";
import { useClickOutside } from "@/app/dashboard/hooks/use-click-outside";

type RbacUser = {
  id: string;
  email: string | null;
  name: string | null;
  roles: string[];
  permissions: string[];
  actorUserId?: string;
  effectiveUserId?: string;
  sessionId?: string | null;
  isImpersonating?: boolean;
  impersonatedBy?: string | null;
  impersonatorName?: string | null;
  impersonatorEmail?: string | null;
} | null;

type Props = {
  userMenuOpen: boolean;
  setUserMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  userMenuRef: RefObject<HTMLDivElement | null>;
  sidebarCollapsed: boolean;
  userInitials: string;
  userDisplayName: string;
  userEmail: string | null | undefined;
  primaryRoleLabel: string;
  rbacUser: RbacUser;
  profileHref: string;
  buildShopHref: (path: string) => string;
  onNavClick: (event: React.MouseEvent<HTMLAnchorElement>, href: string) => void;
  onNavPrefetch: (href: string) => void;
  onCloseDrawer: () => void;
};

export function SidebarUserMenu({
  userMenuOpen,
  setUserMenuOpen,
  userMenuRef,
  sidebarCollapsed,
  userInitials,
  userDisplayName,
  userEmail,
  primaryRoleLabel,
  rbacUser,
  profileHref,
  buildShopHref,
  onNavClick,
  onNavPrefetch,
  onCloseDrawer,
}: Props) {
  useClickOutside(userMenuRef, () => setUserMenuOpen(false), userMenuOpen);

  return (
    <div ref={userMenuRef} className="relative">
      {/* User trigger button */}
      <button
        type="button"
        onClick={() => setUserMenuOpen((p) => !p)}
        className={`w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-sidebar-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar ${
          sidebarCollapsed ? "lg:justify-center" : ""
        }`}
        aria-label="Open user menu"
        aria-expanded={userMenuOpen}
      >
        {/* Avatar */}
        <span className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground text-xs font-bold shadow-sm">
          {userInitials}
          <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-success border-2 border-sidebar" />
        </span>

        {/* Name + role */}
        <span className={sidebarCollapsed ? "hidden" : "min-w-0 flex-1"}>
          <span className="block truncate text-[13px] font-semibold text-sidebar-foreground leading-tight">
            {userDisplayName}
          </span>
          {primaryRoleLabel ? (
            <span className="block truncate text-[11px] text-sidebar-accent-foreground leading-tight mt-0.5">
              {primaryRoleLabel}
            </span>
          ) : userEmail ? (
            <span className="block truncate text-[11px] text-sidebar-accent-foreground leading-tight mt-0.5">
              {userEmail}
            </span>
          ) : null}
        </span>

        {/* Chevron */}
        <ChevronDown
          className={`hidden ${sidebarCollapsed ? "" : "lg:block"} h-3.5 w-3.5 shrink-0 text-sidebar-accent-foreground transition-transform ${
            userMenuOpen ? "rotate-180" : "rotate-0"
          }`}
        />
      </button>

      {/* Popup menu */}
      {userMenuOpen && (
        <div
          className={`absolute bottom-[calc(100%+8px)] z-50 overflow-hidden rounded-2xl border border-border bg-card shadow-[0_20px_48px_rgba(15,23,42,0.18)] ${
            sidebarCollapsed ? "left-0 w-64" : "left-0 right-0"
          }`}
        >
          {/* User info header */}
          <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground text-sm font-bold">
              {userInitials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{userDisplayName}</p>
              {userEmail ? (
                <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
              ) : null}
            </div>
            {primaryRoleLabel ? (
              <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground shrink-0">
                {primaryRoleLabel}
              </span>
            ) : null}
          </div>

          <div className="p-1.5 space-y-0.5">
            <Link
              href={buildShopHref(profileHref)}
              onClick={(event) => {
                setUserMenuOpen(false);
                onCloseDrawer();
                onNavClick(event, profileHref);
              }}
              prefetch={false}
              onMouseEnter={() => onNavPrefetch(profileHref)}
              onTouchStart={() => onNavPrefetch(profileHref)}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              <User className="h-4 w-4 text-muted-foreground" />
              <span>প্রোফাইল</span>
            </Link>

            {rbacUser?.isImpersonating ? (
              <div className="mx-1 my-1 rounded-xl border border-warning/30 bg-warning-soft/50 px-3 py-2.5">
                <p className="text-xs font-semibold text-warning">ইমপার্সোনেশন চালু</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  অন্য user-এর permission view করছেন।
                </p>
                <div className="mt-2">
                  <StopImpersonationButton compact />
                </div>
              </div>
            ) : null}
          </div>

          <div className="border-t border-border/60 p-1.5">
            <LogoutButton variant="menu" />
          </div>
        </div>
      )}
    </div>
  );
}
