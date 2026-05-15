import Link from "next/link";
import { cookies } from "next/headers";
import { getShopsByUser } from "@/app/actions/shops";
import { requireUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/rbac";
import AuditLogClient from "./components/AuditLogClient";

type AuditPageProps = {
  searchParams?: Promise<{ shopId?: string; from?: string; to?: string } | undefined>;
};

function dhakaToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function AuditPage({ searchParams }: AuditPageProps) {
  const [user, shops, resolvedSearch] = await Promise.all([
    requireUser(),
    getShopsByUser(),
    searchParams,
  ]);

  if (!hasPermission(user, "view_audit_log")) {
    return (
      <div className="rounded-3xl border border-danger/20 bg-danger-soft p-8 text-center">
        <h1 className="text-2xl font-extrabold text-foreground">অডিট লগ</h1>
        <p className="mt-2 text-sm font-semibold text-danger">
          এই পেইজ owner/super-admin access ছাড়া দেখা যাবে না।
        </p>
        <Link
          href="/dashboard"
          className="mt-5 inline-flex rounded-xl bg-card px-5 py-2 text-sm font-bold text-foreground shadow-sm"
        >
          ড্যাশবোর্ডে ফিরুন
        </Link>
      </div>
    );
  }

  if (!shops?.length) {
    return (
      <div className="rounded-3xl border border-border bg-card p-8 text-center">
        <h1 className="text-2xl font-extrabold text-foreground">অডিট লগ</h1>
        <p className="mt-2 text-muted-foreground">দোকান যুক্ত করলে audit log দেখা যাবে।</p>
      </div>
    );
  }

  const cookieStore = await cookies();
  const cookieShopId = cookieStore.get("activeShopId")?.value;
  const selectedShopId =
    resolvedSearch?.shopId && shops.some((shop) => shop.id === resolvedSearch.shopId)
      ? resolvedSearch.shopId
      : cookieShopId && shops.some((shop) => shop.id === cookieShopId)
      ? cookieShopId
      : shops[0].id;
  const today = dhakaToday();

  return (
    <AuditLogClient
      shops={shops.map((shop) => ({ id: shop.id, name: shop.name }))}
      initialShopId={selectedShopId}
      initialFrom={resolvedSearch?.from ?? today}
      initialTo={resolvedSearch?.to ?? today}
    />
  );
}

