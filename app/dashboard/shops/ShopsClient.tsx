// app/dashboard/shops/ShopsClient.tsx

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deleteShop } from "@/app/actions/shops";
import ConfirmDialog from "@/components/confirm-dialog";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { useSyncStatus } from "@/lib/sync/sync-status";
import { queueAdminAction, queueRemove } from "@/lib/sync/queue";
import { db } from "@/lib/dexie/db";
import { handlePermissionError } from "@/lib/permission-toast";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";

type Shop = {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
};

type SupportContact = {
  supportPhone?: string | null;
  supportWhatsapp?: string | null;
};

type UserSummary = {
  id: string;
  roles: string[];
};

type Props = {
  initialShops: Shop[];
  user: UserSummary | null;
  support: SupportContact;
};

export default function ShopsClient({ initialShops, user, support }: Props) {
  const online = useOnlineStatus();
  const router = useRouter();
  const { pendingCount, syncing, lastSyncAt } = useSyncStatus();
  const serverSnapshotRef = useRef(initialShops);
  const refreshInFlightRef = useRef(false);
  const lastRefreshAtRef = useRef(0);
  const REFRESH_MIN_INTERVAL_MS = 15_000;
  const [shops, setShops] = useState<Shop[]>(initialShops || []);
  const [supportContact, setSupportContact] = useState<SupportContact>(support);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const cacheKey = useMemo(
    () => `cachedShops:${user?.id || "anon"}`,
    [user?.id]
  );
  const supportKey = useMemo(
    () => `cachedSupportContact:${user?.id || "anon"}`,
    [user?.id]
  );

  useEffect(() => {
    if (online) {
      setShops(initialShops || []);
      setSupportContact(support);
      try {
        safeLocalStorageSet(cacheKey, JSON.stringify(initialShops || []));
      } catch {
        // ignore cache errors
      }
      try {
        safeLocalStorageSet(supportKey, JSON.stringify(support || {}));
      } catch {
        // ignore cache errors
      }
      return;
    }

    try {
      const raw = safeLocalStorageGet(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setShops(parsed);
        }
      }
    } catch {
      // ignore cache errors
    }

    try {
      const raw = safeLocalStorageGet(supportKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        setSupportContact(parsed || {});
      }
    } catch {
      // ignore cache errors
    }
  }, [online, initialShops, support, cacheKey, supportKey]);

  useEffect(() => {
    if (serverSnapshotRef.current !== initialShops) {
      serverSnapshotRef.current = initialShops;
      refreshInFlightRef.current = false;
    }
  }, [initialShops]);

  useEffect(() => {
    if (!online || !lastSyncAt || syncing || pendingCount > 0) return;
    if (refreshInFlightRef.current) return;
    const now = Date.now();
    if (now - lastRefreshAtRef.current < REFRESH_MIN_INTERVAL_MS) return;
    lastRefreshAtRef.current = now;
    refreshInFlightRef.current = true;
    router.refresh();
  }, [online, lastSyncAt, syncing, pendingCount, router]);

  const isSuperAdmin = user?.roles?.includes("super_admin") ?? false;
  const isOwner = user?.roles?.includes("owner") ?? false;
  const canCreateShop = isSuperAdmin || (isOwner && shops.length === 0);

  const handleDelete = useCallback(
    async (id: string) => {
      if (deletingId) return;

      const persistCache = (next: Shop[]) => {
        try {
          safeLocalStorageSet(cacheKey, JSON.stringify(next));
        } catch {
          // ignore cache errors
        }
      };

      const removeFromState = () => {
        setShops((prev) => {
          const next = prev.filter((shop) => shop.id !== id);
          persistCache(next);
          return next;
        });
      };

      const removePendingCreate = async (clientId: string) => {
        try {
          const items = await db.queue.where("type").equals("admin").toArray();
          const matches = items.filter(
            (item) =>
              item.payload?.action === "shop_create" &&
              item.payload?.data?.clientId === clientId
          );
          await Promise.all(
            matches.map((item) =>
              item.id ? queueRemove(item.id) : Promise.resolve()
            )
          );
        } catch (err) {
          handlePermissionError(err);
          console.error("Remove queued shop create failed", err);
        }
      };

      setDeletingId(id);
      try {
        if (!online) {
          removeFromState();
          if (id.startsWith("offline-")) {
            await removePendingCreate(id);
            alert("অফলাইন: কিউ থেকে দোকানটি সরানো হয়েছে।");
          } else {
            await queueAdminAction("shop_delete", { id });
            alert("অফলাইন: দোকান মুছে ফেলা কিউ হয়েছে, অনলাইনে গেলে সিঙ্ক হবে।");
          }
          return;
        }

        await deleteShop(id);
        removeFromState();
        router.refresh();
      } catch (err) {
        handlePermissionError(err);
        const message =
          err instanceof Error && err.message
            ? err.message
            : "Shop delete failed.";
        alert(message);
      } finally {
        setDeletingId(null);
      }
    },
    [online, deletingId, cacheKey, router]
  );

  const confirmShop = confirmDeleteId
    ? shops.find((shop) => shop.id === confirmDeleteId)
    : null;

  const phoneDisplay = supportContact.supportPhone || "সাপোর্ট ফোন নম্বর নেই";
  const waDisplay = supportContact.supportWhatsapp || "WhatsApp নম্বর নেই";

  const phoneHref = supportContact.supportPhone
    ? `tel:${supportContact.supportPhone}`
    : undefined;

  const whatsappHref = supportContact.supportWhatsapp
    ? `https://wa.me/${supportContact.supportWhatsapp.replace(/[^0-9]/g, "")}`
    : undefined;

  return (
    <div className="space-y-8 section-gap">
      {!online && (
        <div className="rounded-lg border border-warning/30 bg-warning-soft text-warning text-xs font-semibold px-3 py-2">
          অফলাইন: আগের দোকানের ডাটা দেখানো হচ্ছে।
        </div>
      )}
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
            <span>+</span>
            দোকান তৈরি করুন
          </Link>
        ) : (
          <div className="w-full md:w-auto bg-muted border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              আপনি আর নতুন দোকান তৈরি করতে পারবেন না
            </div>

            <p className="text-sm text-muted-foreground">
              প্রয়োজনে সাপোর্ট টিমের সাথে যোগাযোগ করুন।
            </p>

            {/* DISABLED DEMO BUTTON */}
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
              <span>+</span>
              দোকান তৈরি করা যাবে না
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
                💬
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
      {shops.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-lg border border-border">
          <p className="text-muted-foreground mb-4">
            এখনও কোনো দোকান যোগ করা হয়নি
          </p>
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
              + নতুন দোকান যোগ করুন
            </Link>
          )}
        </div>
      ) : (
        /* SHOP LIST */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {shops.map((shop) => (
            <div
              key={shop.id}
              className="bg-card rounded-lg border border-border p-4 md:p-6 space-y-4 hover:shadow-md transition"
            >
              <div>
                <h2 className="text-lg md:text-xl font-bold text-foreground">
                  {shop.name}
                </h2>
                <p className="text-sm text-muted-foreground">
                  ঠিকানা: {shop.address || "ঠিকানা নেই"}
                </p>
                <p className="text-sm text-muted-foreground">
                  ফোন: {shop.phone || "ফোন নেই"}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 md:pt-4 md:border-t md:border-border">
                {online ? (
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
                    দেখুন / সেটিংস
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="
                      w-full
                      inline-flex items-center justify-center gap-2
                      bg-primary-soft border border-primary/30
                      text-primary font-semibold
                      py-3 px-4
                      rounded-lg
                      opacity-60 cursor-not-allowed
                    "
                  >
                    দেখুন / সেটিংস
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(shop.id)}
                  disabled={deletingId === shop.id}
                  className="
                    w-full
                    inline-flex items-center justify-center gap-2
                    bg-danger-soft border border-danger/30
                    text-danger font-semibold
                    py-3 px-4
                    rounded-lg
                    hover:bg-danger-soft
                    disabled:opacity-60 disabled:cursor-not-allowed
                  "
                >
                  {deletingId === shop.id ? "মুছছে..." : "মুছুন"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={Boolean(confirmDeleteId)}
        title="দোকান মুছে ফেলবেন?"
        description={
          confirmShop
            ? `${confirmShop.name} দোকানটি মুছে ফেলতে চান?`
            : "এই দোকানটি মুছে ফেলতে চান?"
        }
        confirmLabel="মুছুন"
        cancelLabel="বাতিল"
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteId(null);
        }}
        onConfirm={() => {
          if (!confirmDeleteId) return;
          const id = confirmDeleteId;
          setConfirmDeleteId(null);
          handleDelete(id);
        }}
      />
    </div>
  );
}
