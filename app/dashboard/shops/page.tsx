import { getShopsByUser } from "@/app/actions/shops";
import { getCurrentUser } from "@/lib/auth-session";
import { getSupportContact } from "@/app/actions/system-settings";
import { getOwnerShopCreationRequestOverview } from "@/app/actions/shop-creation-requests";
import ShopsClient from "./ShopsClient";

export default async function ShopsPage() {
  const [data, user, support] = await Promise.all([
    getShopsByUser(),
    getCurrentUser(),
    getSupportContact(),
  ]);
  const isOwner = user?.roles?.includes("owner") ?? false;
  const isSuperAdmin = user?.roles?.includes("super_admin") ?? false;
  const ownerOverview =
    isOwner && !isSuperAdmin
      ? await getOwnerShopCreationRequestOverview().catch(() => null)
      : null;

  const userSummary = user ? { id: user.id, roles: user.roles || [] } : null;

  return (
    <ShopsClient
      initialShops={data || []}
      user={userSummary}
      support={support}
      ownerOverview={ownerOverview}
    />
  );
}
