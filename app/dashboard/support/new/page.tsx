import Link from "next/link";
import { requireUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/rbac";
import { getShopsByUser } from "@/app/actions/shops";
import { createSupportTicket } from "@/app/actions/support-tickets";
import { redirect } from "next/navigation";
import { NewTicketFormClient } from "./NewTicketFormClient";

type Props = {
  searchParams?: Promise<{ shopId?: string }>;
};

export default async function NewTicketPage({ searchParams }: Props) {
  const [user, shops, resolvedSearch] = await Promise.all([
    requireUser(),
    getShopsByUser(),
    searchParams,
  ]);

  if (!hasPermission(user, "create_support_ticket")) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">টিকেট তোলার অনুমতি নেই।</p>
        <Link href="/dashboard/support" className="text-primary underline mt-4 block">
          ফিরে যান
        </Link>
      </div>
    );
  }

  const shopId = resolvedSearch?.shopId;
  const shop = shops.find((s) => s.id === shopId) ?? shops[0];

  if (!shop) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">কোনো দোকান নেই।</p>
      </div>
    );
  }

  async function handleCreate(formData: FormData) {
    "use server";
    await createSupportTicket({
      shopId: formData.get("shopId"),
      title: formData.get("title"),
      description: formData.get("description"),
      category: formData.get("category"),
      priority: formData.get("priority"),
    });
    redirect(`/dashboard/support?shopId=${formData.get("shopId")}`);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <NewTicketFormClient
        shops={shops}
        defaultShopId={shop.id}
        action={handleCreate}
        backHref={`/dashboard/support?shopId=${shop.id}`}
      />
    </div>
  );
}
