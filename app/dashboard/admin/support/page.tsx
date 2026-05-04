import Link from "next/link";
import { requireUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/rbac";
import { getAllSupportTickets } from "@/app/actions/support-tickets";
import { updateTicketStatus } from "@/app/actions/support-tickets";
import { AdminSupportClient } from "./AdminSupportClient";

export default async function AdminSupportPage() {
  const user = await requireUser();

  if (!hasPermission(user, "manage_support_tickets")) {
    return (
      <div className="text-center py-12">
        <h1 className="text-xl font-bold mb-2">সব সাপোর্ট টিকেট</h1>
        <p className="text-destructive">এই পেজ দেখার অনুমতি নেই।</p>
        <Link href="/dashboard" className="text-primary underline mt-4 block">
          ড্যাশবোর্ডে ফিরুন
        </Link>
      </div>
    );
  }

  const tickets = await getAllSupportTickets();

  async function handleStatusUpdate(formData: FormData) {
    "use server";
    await updateTicketStatus({
      ticketId: formData.get("ticketId"),
      status: formData.get("status"),
      resolvedNote: formData.get("resolvedNote") || undefined,
    });
  }

  return (
    <div className="space-y-4 sm:space-y-5 section-gap">
      <div className="rounded-2xl border border-border bg-card shadow p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">সাপোর্ট টিকেট</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              সব দোকানের টিকেট পরিচালনা করুন
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 px-3 py-1 font-medium">
              {tickets.filter((t) => t.status === "open").length} খোলা
            </span>
            <span className="rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 px-3 py-1 font-medium">
              {tickets.filter((t) => t.status === "in_progress").length} চলমান
            </span>
          </div>
        </div>
      </div>

      <AdminSupportClient tickets={tickets} statusUpdateAction={handleStatusUpdate} />
    </div>
  );
}
