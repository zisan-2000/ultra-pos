import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth-session";
import { getSupportTicketById, replySupportTicket } from "@/app/actions/support-tickets";
import { TicketDetailClient } from "./TicketDetailClient";
import { Breadcrumb } from "@/components/ui/breadcrumb";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function TicketDetailPage({ params }: Props) {
  const [user, { id }] = await Promise.all([requireUser(), params]);

  const result = await getSupportTicketById(id);
  if (!result) notFound();

  const { ticket, replies } = result;

  async function handleReply(formData: FormData) {
    "use server";
    await replySupportTicket({
      ticketId: formData.get("ticketId"),
      content: formData.get("content"),
    });
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Breadcrumb
        items={[
          { label: "হোম", href: "/dashboard" },
          { label: "সাপোর্ট", href: `/dashboard/support?shopId=${ticket.shopId}` },
          { label: "টিকেট বিস্তারিত" },
        ]}
        className="mb-3"
      />
      <TicketDetailClient
        ticket={ticket}
        replies={replies}
        currentUserId={user.id}
        replyAction={handleReply}
        backHref={`/dashboard/support?shopId=${ticket.shopId}`}
      />
    </div>
  );
}
