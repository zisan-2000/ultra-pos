"use client";

import Link, { type LinkProps } from "next/link";
import { type AnchorHTMLAttributes, type MouseEvent } from "react";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { isOfflineCapableRoute } from "@/lib/offline/offline-capable-routes";
import { getOfflineRouteFallbackHref } from "@/lib/offline/route-readiness";

export type OfflineAwareLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & {
    href: string;
  };

function getPathname(href: string) {
  try {
    return new URL(href, window.location.origin).pathname;
  } catch {
    return href.split("?")[0]?.split("#")[0] || href;
  }
}

export default function OfflineAwareLink({
  href,
  onClick,
  children,
  ...props
}: OfflineAwareLinkProps) {
  const online = useOnlineStatus();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey
    ) {
      return;
    }

    if (!online && isOfflineCapableRoute(getPathname(href))) {
      event.preventDefault();
      window.location.assign(getOfflineRouteFallbackHref(href));
    }
  };

  return (
    <Link href={href} onClick={handleClick} {...props}>
      {children}
    </Link>
  );
}
