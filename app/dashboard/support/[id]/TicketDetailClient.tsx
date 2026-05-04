"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Send, User as UserIcon } from "lucide-react";
import type { TicketRow, ReplyRow } from "@/app/actions/support-tickets";
import type {
  SupportTicketStatus,
  SupportTicketCategory,
  SupportTicketPriority,
} from "@prisma/client";

const STATUS_META: Record<
  SupportTicketStatus,
  { label: string; className: string }
> = {
  open: { label: "খোলা", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  in_progress: { label: "চলমান", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  resolved: { label: "সমাধান হয়েছে", className: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  closed: { label: "বন্ধ", className: "bg-muted text-muted-foreground" },
};

const PRIORITY_LABELS: Record<SupportTicketPriority, string> = {
  low: "কম গুরুত্বপূর্ণ",
  normal: "সাধারণ",
  high: "জরুরি",
};

const CATEGORY_LABELS: Record<SupportTicketCategory, string> = {
  technical: "প্রযুক্তিগত",
  billing: "বিলিং",
  feature_request: "ফিচার",
  other: "অন্যান্য",
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("bn-BD", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Props = {
  ticket: TicketRow;
  replies: ReplyRow[];
  currentUserId: string;
  replyAction: (formData: FormData) => Promise<void>;
  backHref: string;
};

export function TicketDetailClient({
  ticket,
  replies,
  currentUserId,
  replyAction,
  backHref,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const { label: statusLabel, className: statusClass } = STATUS_META[ticket.status];
  const isClosed = ticket.status === "closed" || ticket.status === "resolved";

  function handleReply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await replyAction(formData);
        if (textareaRef.current) textareaRef.current.value = "";
        formRef.current?.reset();
      } catch (err) {
        setError(err instanceof Error ? err.message : "কিছু একটা ভুল হয়েছে");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={backHref} className="rounded-lg p-2 hover:bg-muted transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground font-mono">
              #{ticket.ticketNumber}
            </span>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass}`}>
              {statusLabel}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {CATEGORY_LABELS[ticket.category]}
            </span>
          </div>
          <h1 className="text-lg font-bold mt-1 truncate">{ticket.title}</h1>
        </div>
      </div>

      {/* Ticket info card */}
      <div className="rounded-2xl border border-border bg-card shadow p-4 space-y-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>দোকান: <span className="font-medium text-foreground">{ticket.shopName}</span></span>
          <span>গুরুত্ব: <span className="font-medium text-foreground">{PRIORITY_LABELS[ticket.priority]}</span></span>
          <span>তারিখ: <span className="font-medium text-foreground">{formatDateTime(ticket.createdAtIso)}</span></span>
          {ticket.assignedToName && (
            <span>দায়িত্বপ্রাপ্ত: <span className="font-medium text-foreground">{ticket.assignedToName}</span></span>
          )}
        </div>
        <div className="rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-wrap">
          {ticket.description}
        </div>
        {ticket.resolvedNote && (
          <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3 text-sm text-green-800 dark:text-green-200">
            <span className="font-medium">সমাধানের নোট: </span>
            {ticket.resolvedNote}
          </div>
        )}
      </div>

      {/* Replies */}
      {replies.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground px-1">
            উত্তরসমূহ ({replies.length})
          </h2>
          {replies.map((reply) => {
            const isMe = reply.userId === currentUserId;
            return (
              <div
                key={reply.id}
                className={`rounded-2xl border p-4 ${
                  isMe
                    ? "border-primary/20 bg-primary/5 ml-4"
                    : "border-border bg-card mr-4"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center">
                      <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <span className="text-sm font-medium">
                      {reply.userName ?? reply.userEmail ?? "ব্যবহারকারী"}
                    </span>
                    {isMe && (
                      <span className="text-xs text-muted-foreground">(আপনি)</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatDateTime(reply.createdAtIso)}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{reply.content}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Reply form */}
      {!isClosed && (
        <div className="rounded-2xl border border-border bg-card shadow p-4">
          <h2 className="text-sm font-semibold mb-3">উত্তর দিন</h2>
          <form ref={formRef} onSubmit={handleReply} className="space-y-3">
            <input type="hidden" name="ticketId" value={ticket.id} />
            <textarea
              ref={textareaRef}
              name="content"
              required
              minLength={1}
              rows={3}
              placeholder="আপনার উত্তর লিখুন..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
            {error && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {isPending ? "পাঠানো হচ্ছে..." : "পাঠান"}
              </button>
            </div>
          </form>
        </div>
      )}

      {isClosed && (
        <div className="rounded-2xl border border-border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
          এই টিকেটটি {statusLabel} — আর কোনো উত্তর দেওয়া যাবে না।
        </div>
      )}
    </div>
  );
}
