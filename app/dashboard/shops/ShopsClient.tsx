// app/dashboard/shops/ShopsClient.tsx

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deleteShop } from "@/app/actions/shops";
import { requestAdditionalShopSlot } from "@/app/actions/shop-creation-requests";
import ConfirmDialog from "@/components/confirm-dialog";
import { useOnlineStatus } from "@/lib/sync/net-status";
import { useSyncStatus } from "@/lib/sync/sync-status";
import { queueAdminAction, queueRemove } from "@/lib/sync/queue";
import { db } from "@/lib/dexie/db";
import { handlePermissionError } from "@/lib/permission-toast";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/storage";

type Shop = {
  id: string;
  ownerId?: string | null;
  owner?: {
    id: string;
    name?: string | null;
    email?: string | null;
  } | null;
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
  ownerOverview?: {
    shopLimit: number;
    activeShopCount: number;
    hasPendingRequest: boolean;
    latestRequest: {
      id: string;
      status: "pending" | "approved" | "rejected";
      reason: string | null;
      decisionNote: string | null;
      primaryShopNameSnapshot: string | null;
      primaryShopPhoneSnapshot: string | null;
      createdAtIso: string;
      decidedAtIso: string | null;
    } | null;
  } | null;
};

function normalizeText(value: string | null | undefined) {
  return (value || "").toLowerCase().trim();
}

function formatDateTimeBn(iso?: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("bn-BD", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function ShopsClient({
  initialShops,
  user,
  support,
  ownerOverview,
}: Props) {
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
  const [query, setQuery] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [groupByOwner, setGroupByOwner] = useState<boolean>(
    () => Boolean(user?.roles?.includes("super_admin"))
  );
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestConfirmOpen, setRequestConfirmOpen] = useState(false);
  const [ownerRequestState, setOwnerRequestState] = useState(ownerOverview || null);
  const [requestFeedback, setRequestFeedback] = useState<string | null>(null);

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
  const canManageShopSettings = isSuperAdmin || isOwner;
  const ownerActiveShopCount = ownerRequestState?.activeShopCount ?? shops.length;
  const ownerShopLimit = ownerRequestState?.shopLimit ?? 1;
  const ownerHasPendingRequest = ownerRequestState?.hasPendingRequest ?? false;
  const canCreateShop =
    isSuperAdmin || (isOwner && ownerActiveShopCount < ownerShopLimit);
  const viewModeLabel = isSuperAdmin ? "Super admin view" : "Owner view";
  const latestOwnerRequest = isOwner ? ownerRequestState?.latestRequest ?? null : null;
  const requestConfirmDescription = useMemo(() => {
    const primaryShopName = shops[0]?.name?.trim();
    const summary = `আপনার active shop ${ownerActiveShopCount}/${ownerShopLimit}. এই request Super Admin-এর কাছে যাবে।`;
    if (!primaryShopName) {
      return `${summary} এখন request পাঠাতে চান?`;
    }
    return `${summary} Primary shop: ${primaryShopName}. এখন request পাঠাতে চান?`;
  }, [shops, ownerActiveShopCount, ownerShopLimit]);
  const latestRequestStatusLabel =
    latestOwnerRequest?.status === "approved"
      ? "Approved"
      : latestOwnerRequest?.status === "rejected"
        ? "Rejected"
        : latestOwnerRequest?.status === "pending"
          ? "Pending"
          : null;
  const latestRequestStatusTone =
    latestOwnerRequest?.status === "approved"
      ? "border-success/35 bg-success-soft text-success"
      : latestOwnerRequest?.status === "rejected"
        ? "border-danger/35 bg-danger-soft text-danger"
        : "border-warning/35 bg-warning-soft text-warning";
  const latestRequestedAt = formatDateTimeBn(latestOwnerRequest?.createdAtIso);
  const latestReviewedAt = formatDateTimeBn(latestOwnerRequest?.decidedAtIso);

  useEffect(() => {
    setOwnerRequestState(ownerOverview || null);
  }, [ownerOverview]);

  useEffect(() => {
    if (ownerHasPendingRequest) {
      setRequestConfirmOpen(false);
    }
  }, [ownerHasPendingRequest]);

  const handleRequestAdditionalShopAccess = useCallback(async () => {
    if (requestLoading) return;
    setRequestLoading(true);
    setRequestFeedback(null);
    try {
      const result = await requestAdditionalShopSlot();
      if (result.status === "requested" || result.status === "pending_exists") {
        setOwnerRequestState((prev) => ({
          shopLimit: prev?.shopLimit ?? ownerShopLimit,
          activeShopCount: prev?.activeShopCount ?? ownerActiveShopCount,
          hasPendingRequest: true,
          latestRequest: {
            id: prev?.latestRequest?.id ?? "pending-local",
            status: "pending",
            reason: prev?.latestRequest?.reason ?? "Owner requested additional shop slot",
            decisionNote: null,
            primaryShopNameSnapshot: prev?.latestRequest?.primaryShopNameSnapshot ?? null,
            primaryShopPhoneSnapshot: prev?.latestRequest?.primaryShopPhoneSnapshot ?? null,
            createdAtIso: new Date().toISOString(),
            decidedAtIso: null,
          },
        }));
      }
      if (result.status === "already_has_capacity") {
        setRequestFeedback("আপনার কাছে আগেই shop create করার capacity আছে।");
      } else if (result.status === "pending_exists") {
        setRequestFeedback("আগের request এখনো pending আছে।");
      } else {
        setRequestFeedback("Request পাঠানো হয়েছে। Super admin review করলে approve হবে।");
      }
      router.refresh();
    } catch (err) {
      handlePermissionError(err);
      setRequestFeedback(
        err instanceof Error ? err.message : "Request পাঠানো যায়নি। আবার চেষ্টা করুন।"
      );
    } finally {
      setRequestLoading(false);
    }
  }, [requestLoading, ownerShopLimit, ownerActiveShopCount, router]);

  const ownerOptions = useMemo(() => {
    const byOwner = new Map<string, string>();
    shops.forEach((shop) => {
      const ownerId = shop.owner?.id || shop.ownerId || "unknown";
      const ownerName = shop.owner?.name?.trim() || "";
      const ownerEmail = shop.owner?.email?.trim() || "";
      const label = ownerName || ownerEmail || "Unknown owner";
      if (!byOwner.has(ownerId)) {
        byOwner.set(ownerId, label);
      }
    });

    return Array.from(byOwner.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "bn"));
  }, [shops]);

  const filteredShops = useMemo(() => {
    const normalizedQuery = normalizeText(query);

    return shops.filter((shop) => {
      if (isSuperAdmin && ownerFilter !== "all") {
        const ownerId = shop.owner?.id || shop.ownerId || "unknown";
        if (ownerId !== ownerFilter) return false;
      }

      if (!normalizedQuery) return true;

      const haystack = normalizeText(
        [
          shop.name,
          shop.address || "",
          shop.phone || "",
          shop.owner?.name || "",
          shop.owner?.email || "",
        ].join(" ")
      );

      return haystack.includes(normalizedQuery);
    });
  }, [shops, query, ownerFilter, isSuperAdmin]);

  const groupedShops = useMemo(() => {
    const groups = new Map<string, { label: string; shops: Shop[] }>();

    filteredShops.forEach((shop) => {
      const ownerId = shop.owner?.id || shop.ownerId || "unknown";
      const ownerName = shop.owner?.name?.trim() || "";
      const ownerEmail = shop.owner?.email?.trim() || "";
      const label = ownerName || ownerEmail || "Unknown owner";

      if (!groups.has(ownerId)) {
        groups.set(ownerId, { label, shops: [] });
      }
      groups.get(ownerId)!.shops.push(shop);
    });

    return Array.from(groups.entries())
      .map(([key, value]) => ({ key, label: value.label, shops: value.shops }))
      .sort((a, b) => a.label.localeCompare(b.label, "bn"));
  }, [filteredShops]);

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
            alert("অফলাইন: দোকান আর্কাইভ কিউ হয়েছে, অনলাইনে গেলে সিঙ্ক হবে।");
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
            : "Shop archive failed.";
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

  const renderShopCard = (shop: Shop) => {
    const ownerName = shop.owner?.name || null;
    const ownerEmail = shop.owner?.email || null;

    return (
      <div
        key={shop.id}
        className="bg-card rounded-lg border border-border p-4 md:p-6 space-y-4 hover:shadow-md transition"
      >
        <div>
          <h2 className="text-lg md:text-xl font-bold text-foreground">
            {shop.name}
          </h2>
          {isSuperAdmin ? (
            <p className="text-xs text-muted-foreground">
              Owner: {ownerName || ownerEmail || "Unknown owner"}
              {ownerName && ownerEmail ? ` • ${ownerEmail}` : ""}
            </p>
          ) : null}
          <p className="text-sm text-muted-foreground">
            ঠিকানা: {shop.address || "ঠিকানা নেই"}
          </p>
          <p className="text-sm text-muted-foreground">
            ফোন: {shop.phone || "ফোন নেই"}
          </p>
        </div>

        <div
          className={`pt-2 md:pt-4 md:border-t md:border-border ${
            canManageShopSettings ? "grid grid-cols-2 gap-3" : ""
          }`}
        >
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
              {canManageShopSettings ? "দেখুন / সেটিংস" : "দেখুন"}
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
              {canManageShopSettings ? "দেখুন / সেটিংস" : "দেখুন"}
            </button>
          )}

          {canManageShopSettings ? (
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
              {deletingId === shop.id ? "আর্কাইভ হচ্ছে..." : "আর্কাইভ"}
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 section-gap">
      {!online && (
        <div className="rounded-lg border border-warning/30 bg-warning-soft text-warning text-xs font-semibold px-3 py-2">
          অফলাইন: আগের দোকানের ডাটা দেখানো হচ্ছে।
        </div>
      )}
      {/* TOP STRIP */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="space-y-4">
          <div className="h-fit rounded-2xl border border-border/80 bg-card p-4 md:p-5 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-primary">
                    🏪
                  </span>
                  <h1 className="text-xl md:text-2xl font-bold text-foreground">
                    দোকানসমূহ
                  </h1>
                </div>
                <p className="text-sm text-muted-foreground">
                  আপনার সব দোকান এক জায়গা থেকে দেখুন, সেটিংস আপডেট করুন, নতুন দোকান যোগ করুন।
                </p>
              </div>
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/25 bg-primary-soft px-3 py-1.5 text-xs font-semibold text-primary">
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                Active: {shops.length}
              </div>
            </div>
          </div>

          {shops.length > 0 ? (
            <div className="space-y-3 rounded-2xl border border-border/80 bg-card p-3 md:p-4 shadow-sm">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                <div className="relative min-w-0 flex-1">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Shop/Owner খুঁজুন..."
                    className="h-10 w-full rounded-lg border border-border bg-card pl-4 pr-10 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  {query ? (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-xs text-muted-foreground hover:bg-muted"
                      aria-label="Clear search"
                    >
                      ×
                    </button>
                  ) : null}
                </div>

                {isSuperAdmin ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:w-auto">
                    <select
                      value={ownerFilter}
                      onChange={(e) => setOwnerFilter(e.target.value)}
                      className="h-10 min-w-[170px] rounded-lg border border-border bg-card px-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="all">সব Owner</option>
                      {ownerOptions.map((owner) => (
                        <option key={owner.id} value={owner.id}>
                          {owner.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setGroupByOwner((prev) => !prev)}
                      className="h-10 min-w-[160px] rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground hover:bg-muted"
                    >
                      {groupByOwner ? "Ungroup view" : "Group by owner"}
                    </button>
                    <div className="h-10 min-w-[110px] rounded-lg border border-border bg-muted/50 px-3 text-sm text-foreground flex items-center justify-center font-medium">
                      Total: {filteredShops.length}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 lg:flex lg:items-center">
                    <div className="h-10 rounded-lg border border-border bg-muted/50 px-3 text-sm text-muted-foreground flex items-center justify-center">
                      {viewModeLabel}
                    </div>
                    <div className="h-10 rounded-lg border border-border bg-muted/50 px-3 text-sm text-foreground flex items-center justify-center font-medium">
                      Total: {filteredShops.length}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <p className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2.5 py-1">
                  Showing {filteredShops.length} / {shops.length} shops
                </p>
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="inline-flex h-8 items-center rounded-full border border-border bg-card px-3 font-semibold text-primary hover:bg-primary-soft"
                  >
                    Clear filter
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="h-fit rounded-2xl border border-border/80 bg-card p-4 shadow-sm xl:sticky xl:top-20">
          {canCreateShop ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">Shop Action</p>
                <span className="inline-flex items-center rounded-full border border-success/30 bg-success-soft px-2.5 py-1 text-xs font-semibold text-success">
                  Ready
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                নতুন দোকান যোগ করতে নিচের বাটনে ক্লিক করুন।
              </p>
              <Link
                href="/dashboard/shops/new"
                className="
                  w-full
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
              {latestOwnerRequest && latestRequestStatusLabel ? (
                <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Last request
                    </p>
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${latestRequestStatusTone}`}
                    >
                      {latestRequestStatusLabel}
                    </span>
                  </div>
                  {latestRequestedAt ? (
                    <p className="text-xs text-muted-foreground">
                      Requested: {latestRequestedAt}
                    </p>
                  ) : null}
                  {latestReviewedAt && latestOwnerRequest.status !== "pending" ? (
                    <p className="text-xs text-muted-foreground">
                      Reviewed: {latestReviewedAt}
                    </p>
                  ) : null}
                  {latestOwnerRequest.decisionNote ? (
                    <p className="rounded-md border border-border bg-card px-2.5 py-2 text-xs text-foreground">
                      Admin note: {latestOwnerRequest.decisionNote}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3 rounded-xl border border-warning/30 bg-warning-soft/40 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-foreground">
                    নতুন দোকান যোগ করতে approval লাগবে
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Shop limit পূর্ণ হয়েছে। Super Admin approve করলে limit বাড়বে।
                  </p>
                </div>
                {isOwner ? (
                  <span className="shrink-0 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground">
                    {ownerActiveShopCount}/{ownerShopLimit}
                  </span>
                ) : null}
              </div>

              {isOwner ? (
                <button
                  type="button"
                  onClick={() => setRequestConfirmOpen(true)}
                  disabled={requestLoading || ownerHasPendingRequest}
                  className="
                    w-full
                    inline-flex items-center justify-center gap-2
                    bg-card border border-primary/40
                    text-primary font-semibold
                    py-3
                    rounded-lg
                    hover:bg-primary-soft
                    disabled:opacity-60
                    disabled:cursor-not-allowed
                  "
                >
                  <span>+</span>
                  {ownerHasPendingRequest
                    ? "Request Pending"
                    : requestLoading
                      ? "Request পাঠানো হচ্ছে..."
                      : "Request Additional Shop Access"}
                </button>
              ) : (
                <button
                  disabled
                  className="
                    w-full
                    inline-flex items-center justify-center gap-2
                    bg-card border border-primary/40
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
              )}

              {requestFeedback ? (
                <p className="text-xs font-medium text-primary">{requestFeedback}</p>
              ) : null}

              {latestOwnerRequest && latestRequestStatusLabel ? (
                <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Latest request update
                    </p>
                    <span
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${latestRequestStatusTone}`}
                    >
                      {latestRequestStatusLabel}
                    </span>
                  </div>
                  {latestRequestedAt ? (
                    <p className="text-xs text-muted-foreground">
                      Requested: {latestRequestedAt}
                    </p>
                  ) : null}
                  {latestReviewedAt && latestOwnerRequest.status !== "pending" ? (
                    <p className="text-xs text-muted-foreground">
                      Reviewed: {latestReviewedAt}
                    </p>
                  ) : null}
                  {latestOwnerRequest.decisionNote ? (
                    <p className="rounded-md border border-border bg-card px-2.5 py-2 text-xs text-foreground">
                      Admin note: {latestOwnerRequest.decisionNote}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="space-y-1.5 border-t border-warning/30 pt-2 text-xs text-muted-foreground">
                <p>
                  Support:
                  {" "}
                  {phoneHref ? (
                    <a
                      href={phoneHref}
                      className="font-semibold text-primary hover:underline"
                    >
                      {phoneDisplay}
                    </a>
                  ) : (
                    phoneDisplay
                  )}
                </p>
                <p>
                  WhatsApp:
                  {" "}
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
                    waDisplay
                  )}
                </p>
              </div>
            </div>
          )}
        </div>
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
      ) : filteredShops.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-lg border border-border">
          <p className="text-muted-foreground mb-2">কোনো দোকান match করেনি</p>
          <p className="text-xs text-muted-foreground">
            সার্চ/Owner filter পরিবর্তন করে আবার দেখুন
          </p>
        </div>
      ) : (
        /* SHOP LIST */
        isSuperAdmin && groupByOwner ? (
          <div className="space-y-5">
            {groupedShops.map((group) => (
              <div key={group.key} className="space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    👤 {group.label}
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {group.shops.length} দোকান
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                  {group.shops.map((shop) => renderShopCard(shop))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            {filteredShops.map((shop) => renderShopCard(shop))}
          </div>
        )
      )}
      <ConfirmDialog
        open={Boolean(confirmDeleteId)}
        title="দোকান আর্কাইভ করবেন?"
        description={
          confirmShop
            ? `${confirmShop.name} দোকানটি আর্কাইভ করতে চান?`
            : "এই দোকানটি আর্কাইভ করতে চান?"
        }
        confirmLabel="আর্কাইভ"
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
      <ConfirmDialog
        open={requestConfirmOpen}
        title="Shop access request পাঠাবেন?"
        description={requestConfirmDescription}
        confirmLabel={requestLoading ? "Request পাঠানো হচ্ছে..." : "Send Request"}
        cancelLabel="বাতিল"
        confirmDisabled={requestLoading}
        onOpenChange={setRequestConfirmOpen}
        onConfirm={() => {
          setRequestConfirmOpen(false);
          void handleRequestAdditionalShopAccess();
        }}
      />
    </div>
  );
}
