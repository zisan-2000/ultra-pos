"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageSquare, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import type { TicketRow } from "@/app/actions/support-tickets";
import type {
  SupportTicketStatus,
  SupportTicketCategory,
  SupportTicketPriority,
} from "@prisma/client";

const STATUS_TABS: { value: SupportTicketStatus | "all"; label: string }[] = [
  { value: "all", label: "সব" },
  { value: "open", label: "খোলা" },
  { value: "in_progress", label: "চলমান" },
  { value: "resolved", label: "সমাধান" },
  { value: "closed", label: "বন্ধ" },
];

const STATUS_META: Record<
  SupportTicketStatus,
  { label: string; className: string; Icon: React.ElementType }
> = {
  open: { label: "খোলা", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", Icon: Clock },
  in_progress: { label: "চলমান", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", Icon: AlertCircle },
  resolved: { label: "সমাধান", className: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300", Icon: CheckCircle2 },
  closed: { label: "বন্ধ", className: "bg-muted text-muted-foreground", Icon: XCircle },
};

const PRIORITY_META: Record<SupportTicketPriority, { label: string; className: string }> = {
  low: { label: "কম", className: "text-muted-foreground" },
  normal: { label: "সাধারণ", className: "text-foreground" },
  high: { label: "জরুরি", className: "text-destructive font-semibold" },
};

const CATEGORY_LABELS: Record<SupportTicketCategory, string> = {
  technical: "প্রযুক্তিগত",
  billing: "বিলিং",
  feature_request: "ফিচার",
  other: "অন্যান্য",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("bn-BD", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type Props = {
  tickets: TicketRow[];
  shopId: string;
};

export function TicketsListClient({ tickets, shopId }: Props) {
  const [activeTab, setActiveTab] = useState<SupportTicketStatus | "all">("all");

  const filtered =
    activeTab === "all" ? tickets : tickets.filter((t) => t.status === activeTab);

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {STATUS_TABS.map((tab) => {
          const count =
            tab.value === "all"
              ? tickets.length
              : tickets.filter((t) => t.status === tab.value).length;
          return (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                activeTab === tab.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span className="ml-1.5 rounded-full bg-background/20 px-1.5 text-xs">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Ticket list */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground">
          কোনো টিকেট নেই
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((ticket) => {
            const { label, className, Icon } = STATUS_META[ticket.status];
            const priority = PRIORITY_META[ticket.priority];
            return (
              <Link
                key={ticket.id}
                href={`/dashboard/support/${ticket.id}`}
                className="block rounded-2xl border border-border bg-card p-4 shadow-sm hover:shadow-md hover:border-primary/30 transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs text-muted-foreground font-mono">
                        #{ticket.ticketNumber}
                      </span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
                        <Icon className="h-3 w-3" />
                        {label}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {CATEGORY_LABELS[ticket.category]}
                      </span>
                      <span className={`text-xs ${priority.className}`}>
                        {priority.label}
                      </span>
                    </div>
                    <p className="font-medium text-sm truncate">{ticket.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {ticket.description}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted-foreground space-y-1">
                    <div className="flex items-center gap-1 justify-end">
                      <MessageSquare className="h-3 w-3" />
                      {ticket.replyCount}
                    </div>
                    <div>{formatDate(ticket.createdAtIso)}</div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
