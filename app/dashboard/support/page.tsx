import Link from "next/link";
import { cookies } from "next/headers";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/rbac";
import { getShopsByUser } from "@/app/actions/shops";
import { getSupportTicketsByShop } from "@/app/actions/support-tickets";
import ShopSelectorClient from "./ShopSelectorClient";
import { TicketsListClient } from "./TicketsListClient";

type Props = {
  searchParams?: Promise<{ shopId?: string }>;
};

export default async function SupportPage({ searchParams }: Props) {
  const [user, shops, resolvedSearch] = await Promise.all([
    requireUser(),
    getShopsByUser(),
    searchParams,
  ]);

  if (!hasPermission(user, "view_support_tickets")) {
    return (
      <div className="text-center py-12">
        <h1 className="text-xl font-bold mb-2">সাপোর্ট</h1>
        <p className="text-destructive">এই পেজ দেখার অনুমতি নেই।</p>
        <Link href="/dashboard" className="text-primary underline mt-4 block">
          ড্যাশবোর্ডে ফিরুন
        </Link>
      </div>
    );
  }

  if (shops.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">কোনো দোকান নেই।</p>
      </div>
    );
  }

  const cookieStore = await cookies();
  const cookieShopId = cookieStore.get("activeShopId")?.value;
  const selectedShopId =
    resolvedSearch?.shopId && shops.some((s) => s.id === resolvedSearch.shopId)
      ? resolvedSearch.shopId
      : cookieShopId && shops.some((s) => s.id === cookieShopId)
        ? cookieShopId
        : shops[0].id;

  const canCreate = hasPermission(user, "create_support_ticket");
  const tickets = await getSupportTicketsByShop(selectedShopId);

  return (
    <div className="space-y-4 sm:space-y-5 section-gap">
      <div className="rounded-2xl border border-border bg-card shadow p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">সাপোর্ট</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              আপনার সমস্যা বা প্রশ্ন আমাদের জানান
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ShopSelectorClient shops={shops} selectedShopId={selectedShopId} />
            {canCreate && (
              <Link
                href={`/dashboard/support/new?shopId=${selectedShopId}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
              >
                <Plus className="h-4 w-4" />
                নতুন টিকেট
              </Link>
            )}
          </div>
        </div>
      </div>

      <TicketsListClient tickets={tickets} shopId={selectedShopId} />
    </div>
  );
}
