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
  const isOwner = user?.roles?.includes("owner") ?? false;
  const canCreateShop = isSuperAdmin || (isOwner && data.length === 0);

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
      {/* HEADER */}
      <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-primary">
              🏪
            </span>
            <h1 className="text-xl md:text-3xl font-bold text-foreground">
              দোকানসমূহ
            </h1>
          </div>
          {/* <p className="text-sm md:text-base text-muted-foreground">
            এক জায়গায় সব দোকান পরিচালনা করুন
          </p> */}
        </div>

        {/* CREATE SHOP */}
        {canCreateShop ? (
          <Link
            href="/dashboard/shops/new"
            className="
              w-full md:w-auto
              inline-flex items-center justify-center gap-2
              bg-primary-soft border border-primary/30
              text-primary font-bold
              py-3 px-6
              rounded-lg
              hover:bg-primary/20 hover:border-primary/50
              transition
            "
          >
            <span>＋</span>
            নতুন দোকান
          </Link>
        ) : (
          <div className="w-full md:w-auto bg-muted border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              🔒 নতুন দোকান যোগ করতে সুপার অ্যাডমিন অনুমোদন প্রয়োজন
            </div>

            <p className="text-sm text-muted-foreground">
              দোকান যোগ করার জন্য সাপোর্টে যোগাযোগ করুন
            </p>

            {/* DISABLED DEMO BUTTON (MOBILE + DESKTOP SAME COLOR) */}
            <button
              disabled
              className="
                w-full
                inline-flex items-center justify-center gap-2
                bg-primary-soft border border-primary/30
                text-primary font-semibold
                py-3
                rounded-lg
                opacity-60
                cursor-not-allowed
              "
            >
              <span>＋</span>
              নতুন দোকান যোগ করুন
            </button>

            {/* SUPPORT */}
            <div className="pt-1 space-y-1 text-sm">
              <div className="flex items-center gap-2">
                📞
                {phoneHref ? (
                  <a
                    href={phoneHref}
                    className="font-semibold text-primary hover:underline"
                  >
                    {phoneDisplay}
                  </a>
                ) : (
                  <span className="text-muted-foreground">{phoneDisplay}</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                🟢
                {whatsappHref ? (
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-success hover:underline"
                  >
                    {waDisplay}
                  </a>
                ) : (
                  <span className="text-muted-foreground">{waDisplay}</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* EMPTY STATE */}
      {data.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-lg border border-border">
          <p className="text-muted-foreground mb-4">এখনও কোনো দোকান যোগ করা হয়নি</p>
          {canCreateShop && (
            <Link
              href="/dashboard/shops/new"
              className="
                inline-flex items-center justify-center gap-2
                bg-primary-soft border border-primary/30
                text-primary font-bold
                py-3 px-6 rounded-lg
                hover:bg-primary/20
              "
            >
              ＋ নতুন দোকান যোগ করুন
            </Link>
          )}
        </div>
      ) : (
        /* SHOP LIST */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {data.map((shop) => (
            <div
              key={shop.id}
              className="bg-card rounded-lg border border-border p-4 md:p-6 space-y-4 hover:shadow-md transition"
            >
              <div>
                <h2 className="text-lg md:text-xl font-bold text-foreground">
                  {shop.name}
                </h2>
                <p className="text-sm text-muted-foreground">
                  ঠিকানা: {shop.address || "উপলব্ধ নয়"}
                </p>
                <p className="text-sm text-muted-foreground">
                  ফোন: {shop.phone || "উপলব্ধ নয়"}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 md:pt-4 md:border-t md:border-border">
                <Link
                  href={`/dashboard/shops/${shop.id}`}
                  className="
                    w-full
                    inline-flex items-center justify-center gap-2
                    bg-primary-soft border border-primary/30
                    text-primary font-semibold
                    py-3 px-4
                    rounded-lg
                    hover:bg-primary/20
                  "
                >
                  ✏️ দেখুন / সম্পাদনা
                </Link>

                <form
                  action={async () => {
                    "use server";
                    await deleteShop(shop.id);
                    revalidatePath("/dashboard/shops");
                  }}
                >
                  <button
                    type="submit"
                    className="
                      w-full
                      inline-flex items-center justify-center gap-2
                      bg-danger-soft border border-danger/30
                      text-danger font-semibold
                      py-3 px-4
                      rounded-lg
                      hover:bg-danger-soft
                    "
                  >
                    🗑️ মুছুন
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
