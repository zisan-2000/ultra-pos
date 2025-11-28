// app/dashboard/shops/page.tsx

import Link from "next/link";
import { getShopsByUser, deleteShop } from "@/app/actions/shops";
import { revalidatePath } from "next/cache";

export default async function ShopsPage() {
  const data = await getShopsByUser();

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Your Shops</h1>
          <p className="text-gray-600 mt-2">Manage all your shops from one place.</p>
        </div>
        <Link
          href="/dashboard/shops/new"
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg text-lg transition-colors text-center"
        >
          + Add New Shop
        </Link>
      </div>

      {data.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <p className="text-gray-600 mb-4">No shops found.</p>
          <Link
            href="/dashboard/shops/new"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
          >
            Create your first shop
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {data.map((shop) => (
            <div
              key={shop.id}
              className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow"
            >
              <div className="mb-4">
                <h2 className="text-xl font-bold text-gray-900">{shop.name}</h2>
                <p className="text-sm text-gray-600 mt-2">
                  📍 {shop.address || "No address"}
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  📞 {shop.phone || "No phone"}
                </p>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <Link
                  href={`/dashboard/shops/${shop.id}`}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-center transition-colors"
                >
                  Edit shop
                </Link>

                <form
                  action={async () => {
                    "use server";
                    await deleteShop(shop.id);
                    revalidatePath("/dashboard/shops");
                  }}
                  className="flex-1"
                >
                  <button className="w-full bg-red-500 hover:bg-red-600 text-white font-medium py-2 px-4 rounded-lg transition-colors">
                    Delete
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
