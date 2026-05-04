"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  MessageSquare,
  ChevronRight,
} from "lucide-react";
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

const PRIORITY_META: Record<SupportTicketPriority, { label: string; dotClass: string }> = {
  low: { label: "কম", dotClass: "bg-muted-foreground" },
  normal: { label: "সাধারণ", dotClass: "bg-foreground" },
  high: { label: "জরুরি", dotClass: "bg-destructive" },
};

const CATEGORY_LABELS: Record<SupportTicketCategory, string> = {
  technical: "প্রযুক্তিগত",
  billing: "বিলিং",
  feature_request: "ফিচার",
  other: "অন্যান্য",
};

const NEXT_STATUSES: Partial<Record<SupportTicketStatus, { value: SupportTicketStatus; label: string }[]>> = {
  open: [{ value: "in_progress", label: "চলমান করুন" }, { value: "resolved", label: "সমাধান করুন" }],
  in_progress: [{ value: "resolved", label: "সমাধান করুন" }, { value: "open", label: "পুনরায় খুলুন" }],
  resolved: [{ value: "closed", label: "বন্ধ করুন" }, { value: "open", label: "পুনরায় খুলুন" }],
  closed: [{ value: "open", label: "পুনরায় খুলুন" }],
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("bn-BD", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type QuickUpdateProps = {
  ticket: TicketRow;
  action: (formData: FormData) => Promise<void>;
};

function QuickStatusUpdate({ ticket, action }: QuickUpdateProps) {
  const [isPending, startTransition] = useTransition();
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");
  const [pendingStatus, setPendingStatus] = useState<SupportTicketStatus | null>(null);

  const nextStatuses = NEXT_STATUSES[ticket.status] ?? [];
  if (nextStatuses.length === 0) return null;

  function submit(status: SupportTicketStatus) {
    const fd = new FormData();
    fd.set("ticketId", ticket.id);
    fd.set("status", status);
    if (note) fd.set("resolvedNote", note);
    startTransition(async () => {
      await action(fd);
      setShowNote(false);
      setNote("");
      setPendingStatus(null);
    });
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {nextStatuses.map((s) => (
        <button
          key={s.value}
          disabled={isPending}
          onClick={() => {
            if (s.value === "resolved") {
              setPendingStatus(s.value);
              setShowNote(true);
            } else {
              submit(s.value);
            }
          }}
          className="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
        >
          {s.label}
        </button>
      ))}
      {showNote && pendingStatus && (
        <div className="w-full flex gap-2 mt-1">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="সমাধানের নোট (ঐচ্ছিক)"
            className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            onClick={() => submit(pendingStatus)}
            disabled={isPending}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            নিশ্চিত করুন
          </button>
          <button
            onClick={() => { setShowNote(false); setPendingStatus(null); }}
            className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted"
          >
            বাতিল
          </button>
        </div>
      )}
    </div>
  );
}

type Props = {
  tickets: TicketRow[];
  statusUpdateAction: (formData: FormData) => Promise<void>;
};

export function AdminSupportClient({ tickets, statusUpdateAction }: Props) {
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
              <div
                key={ticket.id}
                className="rounded-2xl border border-border bg-card p-4 shadow-sm"
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
                      <span className="flex items-center gap-1 text-xs">
                        <span className={`h-2 w-2 rounded-full ${priority.dotClass}`} />
                        {priority.label}
                      </span>
                    </div>
                    <Link
                      href={`/dashboard/support/${ticket.id}`}
                      className="group font-medium text-sm hover:text-primary flex items-center gap-1"
                    >
                      {ticket.title}
                      <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                      <span>দোকান: <span className="font-medium text-foreground">{ticket.shopName}</span></span>
                      <span>জমাকারী: <span className="font-medium text-foreground">{ticket.createdByName ?? "অজানা"}</span></span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {ticket.replyCount}
                      </span>
                      <span>{formatDate(ticket.createdAtIso)}</span>
                    </div>
                  </div>
                </div>

                <QuickStatusUpdate ticket={ticket} action={statusUpdateAction} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
