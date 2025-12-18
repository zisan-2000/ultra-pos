// app/dashboard/shops/page.tsx

import Link from "next/link";
import { getShopsByUser, deleteShop } from "@/app/actions/shops";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth-session";
import { getSupportContact } from "@/app/actions/system-settings";

export default async function ShopsPage() {
  const [data, user, support] = await Promise.all([
    getShopsByUser(),
    getCurrentUser(),
    getSupportContact(),
  ]);

  const isSuperAdmin = user?.roles?.includes("super_admin") ?? false;
  const canCreateShop = isSuperAdmin;

  const phoneDisplay = support.supportPhone || "ফোন নম্বর পাওয়া যায়নি";
  const waDisplay = support.supportWhatsapp || "WhatsApp নম্বর পাওয়া যায়নি";
  const phoneHref = support.supportPhone
    ? `tel:${support.supportPhone}`
    : undefined;
  const whatsappHref = support.supportWhatsapp
    ? `https://wa.me/${support.supportWhatsapp.replace(/[^0-9]/g, "")}`
    : undefined;

  return (
    <div className="space-y-8 section-gap">
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-700">
              🏪
            </span>
            <h1 className="text-3xl font-bold text-gray-900 leading-tight">
              দোকানসমূহ
            </h1>
          </div>
          <p className="text-gray-600 leading-snug">
            এক জায়গায় সব দোকান পরিচালনা করুন
          </p>
        </div>
        {canCreateShop ? (
          <Link
            href="/dashboard/shops/new"
            className="w-full md:w-auto inline-flex items-center justify-center gap-2 bg-blue-50 border border-blue-200 text-blue-800 font-bold py-3 px-6 rounded-lg text-lg transition-colors text-center hover:border-blue-300 hover:bg-blue-100 pressable"
          >
            <span aria-hidden="true">+</span>
            <span>নতুন দোকান</span>
          </Link>
        ) : (
          <div className="w-full md:w-auto text-sm text-slate-700 border border-slate-200 bg-slate-50 rounded-lg px-4 py-3 shadow-sm">
            <div className="font-semibold text-slate-900 flex items-center gap-2">
              <span aria-hidden="true">🔒</span>
              <span>নতুন দোকান যোগ করতে সুপার অ্যাডমিন অনুমোদন প্রয়োজন</span>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              দোকান যোগ করার জন্য অনুগ্রহ করে নিচের মাধ্যমে যোগাযোগ করুনঃ
            </p>
            <div className="mt-3">
              <button
                type="button"
                disabled
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-500 cursor-not-allowed"
              >
                <span aria-hidden="true">🚫</span>
                <span>নতুন দোকান যুক্ত করুন</span>
              </button>
            </div>
            <div className="mt-2 space-y-1 text-sm">
              <div className="flex items-center gap-2">
                <span aria-hidden="true">📞</span>
                {phoneHref ? (
                  <a
                    href={phoneHref}
                    className="text-blue-700 font-semibold hover:underline"
                  >
                    ফোন: {phoneDisplay}
                  </a>
                ) : (
                  <span className="text-slate-500">ফোন: {phoneDisplay}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span aria-hidden="true">🟢</span>
                {whatsappHref ? (
                  <a
                    href={whatsappHref}
                    className="text-green-700 font-semibold hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    WhatsApp: {waDisplay}
                  </a>
                ) : (
                  <span className="text-slate-500">WhatsApp: {waDisplay}</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {data.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <p className="text-gray-600 mb-4">এখনও কোনো দোকান যোগ করা হয়নি</p>
          {canCreateShop ? (
            <Link
              href="/dashboard/shops/new"
              className="inline-flex items-center justify-center gap-2 bg-blue-50 border border-blue-200 text-blue-800 font-bold py-3 px-6 rounded-lg transition-colors hover:border-blue-300 hover:bg-blue-100 pressable"
            >
              <span aria-hidden="true">+</span>
              <span>নতুন দোকান যোগ করুন</span>
            </Link>
          ) : (
            <p className="text-sm text-slate-500">
              নতুন দোকান যোগ করতে সাপোর্টের সঙ্গে যোগাযোগ করুন
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {data.map((shop) => (
            <div
              key={shop.id}
              className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg card-lift space-y-4"
            >
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-gray-900">{shop.name}</h2>
                <p className="text-sm text-gray-600">
                  ঠিকানা: {shop.address || "উপলব্ধ নয়"}
                </p>
                <p className="text-sm text-gray-600">
                  ফোন: {shop.phone || "উপলব্ধ নয়"}
                </p>
              </div>

              <div className="w-full grid grid-cols-2 gap-3 pt-4 border-t border-slate-200">
                <Link
                  href={`/dashboard/shops/${shop.id}`}
                  className="w-full inline-flex items-center justify-center gap-2 bg-blue-50 border border-blue-200 text-blue-800 font-semibold py-3 px-4 rounded-lg text-center transition-colors hover:border-blue-300 hover:bg-blue-100 pressable"
                >
                  <span aria-hidden="true">✏️</span>
                  <span>দোকান দেখুন / সম্পাদনা</span>
                </Link>

                <form
                  action={async () => {
                    "use server";
                    await deleteShop(shop.id);
                    revalidatePath("/dashboard/shops");
                  }}
                  className="w-full"
                >
                  <button className="w-full inline-flex items-center justify-center gap-2 bg-red-50 border border-red-200 text-red-800 font-semibold py-3 px-4 rounded-lg transition-colors hover:border-red-300 hover:bg-red-100 pressable">
                    <span aria-hidden="true">🗑️</span>
                    <span>মুছুন</span>
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
