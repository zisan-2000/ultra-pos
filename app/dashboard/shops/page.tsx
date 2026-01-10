import { getShopsByUser } from "@/app/actions/shops";
import { getCurrentUser } from "@/lib/auth-session";
import { getSupportContact } from "@/app/actions/system-settings";
import ShopsClient from "./ShopsClient";

export default async function ShopsPage() {
  const [data, user, support] = await Promise.all([
    getShopsByUser(),
    getCurrentUser(),
    getSupportContact(),
  ]);

  const userSummary = user ? { id: user.id, roles: user.roles || [] } : null;

  return (
    <ShopsClient
      initialShops={data || []}
      user={userSummary}
      support={support}
    />
  );
}
