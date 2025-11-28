// app/dashboard/shops/page.tsx

import Link from "next/link";
import { getShopsByUser } from "@/app/actions/shops";
import { deleteShop } from "@/app/actions/shops";

export default async function ShopsPage() {
  const data = await getShopsByUser();

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">আমার দোকান</h1>
          <p className="text-gray-600 mt-2">সব দোকান দেখুন এবং পরিচালনা করুন।</p>
        </div>
        <Link
          href="/dashboard/shops/new"
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg text-lg transition-colors text-center"
        >
          + নতুন দোকান যোগ করুন
        </Link>
      </div>

      {data.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <p className="text-gray-600 mb-4">এখনও কোনো দোকান নেই।</p>
          <Link
            href="/dashboard/shops/new"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-colors"
          >
            প্রথম দোকান তৈরি করুন
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
                  📍 {shop.address || "ঠিকানা নেই"}
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  📞 {shop.phone || "ফোন নেই"}
                </p>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <Link
                  href={`/dashboard/shops/${shop.id}`}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-center transition-colors"
                >
                  ✏️ সম্পাদনা করুন
                </Link>

                <form
                  action={async () => {
                    "use server";
                    await deleteShop(shop.id);
                  }}
                  className="flex-1"
                >
                  <button className="w-full bg-red-500 hover:bg-red-600 text-white font-medium py-2 px-4 rounded-lg transition-colors">
                    🗑️ মুছে ফেলুন
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
