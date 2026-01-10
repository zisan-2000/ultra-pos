// app/owner/dashboard/page.tsx

import { cookies } from "next/headers";
import { getShopsByUser } from "@/app/actions/shops";
import { requireUser } from "@/lib/auth-session";
import OwnerDashboardClient from "./OwnerDashboardClient";

type DashboardPageProps = {
  searchParams?: Promise<{ shopId?: string } | undefined>;
};

async function fetchSummary(shopId: string, cookieHeader: string) {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000";

  const res = await fetch(
    `${baseUrl}/api/reports/today-summary?shopId=${shopId}`,
    {
      cache: "no-store",
      headers: {
        cookie: cookieHeader,
      },
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to load summary (${res.status})`);
  }

  return await res.json();
}

export default async function OwnerDashboardPage({
  searchParams,
}: DashboardPageProps) {
  const user = await requireUser();
  const shops = await getShopsByUser();

  if (!shops || shops.length === 0) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-foreground">ড্যাশবোর্ড</h1>
        <p className="mt-4 text-muted-foreground">প্রথমে একটি দোকান তৈরি করুন।</p>
      </div>
    );
  }

  const resolvedSearch = await searchParams;
  const cookieStore = await cookies();
  const cookieShopId = cookieStore.get("activeShopId")?.value;
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
    .join("; ");

  const cookieSelectedShopId =
    cookieShopId && shops.some((s) => s.id === cookieShopId)
      ? cookieShopId
      : null;

  const selectedShopId =
    resolvedSearch?.shopId && shops.some((s) => s.id === resolvedSearch.shopId)
      ? resolvedSearch.shopId
      : cookieSelectedShopId ?? shops[0].id;

  const summary = await fetchSummary(selectedShopId, cookieHeader);
  const shopSnapshot = shops.map((shop) => ({ id: shop.id, name: shop.name }));

  return (
    <OwnerDashboardClient
      userId={user.id}
      initialData={{
        shopId: selectedShopId,
        shops: shopSnapshot,
        summary,
      }}
    />
  );
}
