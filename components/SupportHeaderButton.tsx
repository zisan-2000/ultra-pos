"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LifeBuoy,
  X,
  ExternalLink,
  Phone,
  MessageCircle,
  TicketPlus,
  ClipboardList,
} from "lucide-react";
import { getSupportContact } from "@/app/actions/support-tickets";

type ContactInfo = {
  supportPhone: string | null;
  supportWhatsapp: string | null;
};

type Props = {
  shopId?: string | null;
  canCreate?: boolean;
};

export function SupportHeaderButton({ shopId, canCreate = true }: Props) {
  const [open, setOpen] = useState(false);
  const [contact, setContact] = useState<ContactInfo | null>(null);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Close on route change
  useEffect(() => { setOpen(false); }, [pathname]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  // Fetch contact info once on first open
  function handleOpen() {
    setOpen((v) => !v);
    if (!contact) {
      startTransition(async () => {
        const data = await getSupportContact();
        setContact(data);
      });
    }
  }

  const newTicketHref = shopId
    ? `/dashboard/support/new?shopId=${shopId}`
    : `/dashboard/support/new`;

  const whatsappHref = contact?.supportWhatsapp
    ? `https://wa.me/${contact.supportWhatsapp.replace(/\D/g, "")}`
    : null;

  const phoneHref = contact?.supportPhone
    ? `tel:${contact.supportPhone.replace(/\s/g, "")}`
    : null;

  const hasContact = contact && (contact.supportPhone || contact.supportWhatsapp);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleOpen}
        aria-label="সাপোর্ট"
        className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
          open
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
        } shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
      >
        <LifeBuoy className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-64 rounded-2xl border border-border bg-card shadow-xl ring-1 ring-black/5 dark:ring-white/10 overflow-hidden animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40">
            <div className="flex items-center gap-2">
              <LifeBuoy className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">সাপোর্ট</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded p-0.5 hover:bg-muted transition-colors text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Ticket actions */}
          <div className="p-2 space-y-1">
            {canCreate && (
              <Link
                href={newTicketHref}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-muted transition-colors group"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors shrink-0">
                  <TicketPlus className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-medium leading-none">নতুন টিকেট খুলুন</p>
                  <p className="text-xs text-muted-foreground mt-0.5">সমস্যা জানান</p>
                </div>
              </Link>
            )}

            <Link
              href="/dashboard/support"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-muted transition-colors group"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:bg-muted/70 transition-colors shrink-0">
                <ClipboardList className="h-4 w-4" />
              </span>
              <div>
                <p className="font-medium leading-none">আমার টিকেট</p>
                <p className="text-xs text-muted-foreground mt-0.5">পূর্বের অনুরোধ দেখুন</p>
              </div>
            </Link>
          </div>

          {/* Direct contact */}
          {hasContact && (
            <>
              <div className="mx-4 border-t border-border" />
              <div className="p-2 space-y-1">
                <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  সরাসরি যোগাযোগ
                </p>

                {phoneHref && (
                  <a
                    href={phoneHref}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-muted transition-colors group"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 group-hover:bg-blue-200 dark:group-hover:bg-blue-900/60 transition-colors shrink-0">
                      <Phone className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium leading-none">কল করুন</p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {contact.supportPhone}
                      </p>
                    </div>
                    <ExternalLink className="h-3 w-3 text-muted-foreground ml-auto shrink-0" />
                  </a>
                )}

                {whatsappHref && (
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-muted transition-colors group"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400 group-hover:bg-green-200 dark:group-hover:bg-green-900/60 transition-colors shrink-0">
                      <MessageCircle className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium leading-none">WhatsApp</p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {contact.supportWhatsapp}
                      </p>
                    </div>
                    <ExternalLink className="h-3 w-3 text-muted-foreground ml-auto shrink-0" />
                  </a>
                )}
              </div>
            </>
          )}

          {/* Loading state for contact */}
          {!contact && (
            <>
              <div className="mx-4 border-t border-border" />
              <div className="p-4 flex justify-center">
                <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
