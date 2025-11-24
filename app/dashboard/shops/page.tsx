// app/dashboard/shops/page.tsx

import Link from "next/link";
import { getShopsByUser } from "@/app/actions/shops";
import { deleteShop } from "@/app/actions/shops";

export default async function ShopsPage() {
  const data = await getShopsByUser();

  return (
    <div>
      <div className="flex justify-between mb-4">
        <h1 className="text-xl font-bold">Shops</h1>
        <Link
          href="/dashboard/shops/new"
          className="px-4 py-2 bg-black text-white rounded"
        >
          New Shop
        </Link>
      </div>

      <div className="space-y-4">
        {data.map((shop) => (
          <div
            key={shop.id}
            className="p-4 border rounded flex justify-between"
          >
            <div>
              <h2 className="font-semibold">{shop.name}</h2>
              <p className="text-sm">{shop.address}</p>
              <p className="text-sm">{shop.phone}</p>
            </div>

            <div className="flex gap-2">
              <Link
                href={`/dashboard/shops/${shop.id}`}
                className="px-3 py-1 border rounded"
              >
                Edit
              </Link>

              <form
                action={async () => {
                  "use server";
                  await deleteShop(shop.id);
                }}
              >
                <button className="px-3 py-1 bg-red-500 text-white rounded">
                  Delete
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
