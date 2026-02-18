import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/rbac";
import { getShopsByUser } from "@/app/actions/shops";
import {
  callNextQueueToken,
  closeQueueBusinessDay,
  createQueueToken,
  getQueueBoardSnapshot,
  getQueueProductOptions,
  settleQueueTokenAsCashSale,
  updateQueueTokenStatus,
} from "@/app/actions/queue-tokens";
import { resolveQueueTokenPrefix } from "@/lib/queue-token";
import {
  getQueueNextAction,
  getQueueOrderTypeLabel,
  getQueueOrderTypeOptions,
  getQueueStatusLabel,
  isQueueTerminalStatus,
  resolveQueueWorkflowProfile,
} from "@/lib/queue-workflow";
import QueueShopSelectorClient from "./ShopSelectorClient";
import CreateQueueTokenForm from "./CreateQueueTokenForm";

type QueuePageProps = {
  searchParams?: Promise<{ shopId?: string } | undefined>;
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  WAITING: "border-border bg-muted text-muted-foreground",
  CALLED: "border-primary/30 bg-primary-soft text-primary",
  IN_PROGRESS: "border-warning/30 bg-warning-soft text-warning",
  READY: "border-success/30 bg-success-soft text-success",
  DONE: "border-success/30 bg-success-soft text-success",
  CANCELLED: "border-danger/30 bg-danger-soft text-danger",
};

function formatDateTime(value: Date | null) {
  if (!value) return "N/A";
  return value.toLocaleString("bn-BD", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(value: string | number) {
  const num = Number(value || 0);
  return num.toLocaleString("bn-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatTokenAge(value: Date, nowMs: number) {
  const diffMs = Math.max(0, nowMs - value.getTime());
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return "এখনই";
  if (diffMinutes < 60) return `${diffMinutes} মিনিট`;
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  return minutes > 0 ? `${hours} ঘ ${minutes} মি` : `${hours} ঘ`;
}

function parseTokenItemsFromForm(formData: FormData) {
  const raw = formData.get("itemsJson");
  if (!raw || typeof raw !== "string") {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => {
        const productId =
          item && typeof item === "object" && "productId" in item
            ? String((item as { productId: unknown }).productId || "").trim()
            : "";
        const quantity =
          item && typeof item === "object" && "quantity" in item
            ? Number((item as { quantity: unknown }).quantity || 0)
            : 0;
        return { productId, quantity };
      })
      .filter((item) => item.productId && Number.isFinite(item.quantity) && item.quantity > 0);
  } catch {
    return [];
  }
}

export default async function QueuePage({ searchParams }: QueuePageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  if (!hasPermission(user, "view_queue_board")) {
    redirect("/dashboard");
  }

  const shops = await getShopsByUser();
  const resolvedSearch = await searchParams;

  if (!shops || shops.length === 0) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4 text-foreground">টোকেন বোর্ড</h1>
        <p className="mb-6 text-muted-foreground">প্রথমে একটি দোকান তৈরি করুন।</p>
        <Link
          href="/dashboard/shops/new"
          className="inline-block px-6 py-3 bg-primary-soft text-primary border border-primary/30 rounded-lg font-medium hover:bg-primary/15 hover:border-primary/40 transition-colors"
        >
          দোকান তৈরি করুন
        </Link>
      </div>
    );
  }

  const cookieStore = await cookies();
  const cookieShopId = cookieStore.get("activeShopId")?.value;
  const cookieSelectedShopId =
    cookieShopId && shops.some((shop) => shop.id === cookieShopId)
      ? cookieShopId
      : null;

  const selectedShopId =
    resolvedSearch?.shopId && shops.some((shop) => shop.id === resolvedSearch.shopId)
      ? resolvedSearch.shopId
      : cookieSelectedShopId ?? shops[0].id;

  const snapshot = await getQueueBoardSnapshot(selectedShopId);
  const selectedShop = shops.find((shop) => shop.id === selectedShopId)!;

  const canCreateToken = hasPermission(user, "create_queue_token");
  const canUpdateToken = hasPermission(user, "update_queue_token_status");
  const canPrintToken = hasPermission(user, "print_queue_token");
  const canSettleToken = hasPermission(user, "create_sale");
  const canManageQueueFeature = hasPermission(user, "manage_shop_queue_feature");

  const productOptions =
    snapshot.shop.queueTokenEnabled && canCreateToken
      ? await getQueueProductOptions(selectedShopId)
      : [];
  const workflowProfile = resolveQueueWorkflowProfile({
    queueWorkflow: snapshot.shop.queueWorkflow,
    businessType: snapshot.shop.businessType,
  });
  const orderTypeOptions = getQueueOrderTypeOptions(workflowProfile);
  const hasTokenEligibleProduct = productOptions.some(
    (product) => !product.trackStock || Number(product.availableStock || 0) > 0
  );

  async function createTokenAction(formData: FormData) {
    "use server";
    const shopId = formData.get("shopId");
    if (!shopId || typeof shopId !== "string") return;

    await createQueueToken({
      shopId,
      orderType:
        typeof formData.get("orderType") === "string"
          ? (formData.get("orderType") as string)
          : undefined,
      customerName:
        typeof formData.get("customerName") === "string"
          ? (formData.get("customerName") as string)
          : undefined,
      customerPhone:
        typeof formData.get("customerPhone") === "string"
          ? (formData.get("customerPhone") as string)
          : undefined,
      note:
        typeof formData.get("note") === "string"
          ? (formData.get("note") as string)
          : undefined,
      items: parseTokenItemsFromForm(formData),
    });
  }

  async function callNextAction(formData: FormData) {
    "use server";
    const shopId = formData.get("shopId");
    const businessDate = formData.get("businessDate");
    if (!shopId || typeof shopId !== "string") return;
    await callNextQueueToken(
      shopId,
      typeof businessDate === "string" ? businessDate : undefined
    );
  }

  async function updateStatusAction(formData: FormData) {
    "use server";
    const tokenId = formData.get("tokenId");
    const status = formData.get("status");
    if (!tokenId || typeof tokenId !== "string") return;
    if (!status || typeof status !== "string") return;
    await updateQueueTokenStatus({ tokenId, status });
  }

  async function settleAsSaleAction(formData: FormData) {
    "use server";
    const tokenId = formData.get("tokenId");
    if (!tokenId || typeof tokenId !== "string") return;
    await settleQueueTokenAsCashSale({ tokenId });
  }

  async function closeBusinessDayAction(formData: FormData) {
    "use server";
    const shopId = formData.get("shopId");
    const businessDate = formData.get("businessDate");
    if (!shopId || typeof shopId !== "string") return;
    await closeQueueBusinessDay({
      shopId,
      businessDate: typeof businessDate === "string" ? businessDate : undefined,
    });
  }

  const waitingCount = snapshot.tokens.filter((token) => token.status === "WAITING").length;
  const activeCount = snapshot.tokens.filter((token) => !isQueueTerminalStatus(token.status)).length;
  const nextWaitingToken = snapshot.tokens.find((token) => token.status === "WAITING");
  const pendingTokens = snapshot.tokens.filter(
    (token) => token.status !== "CANCELLED" && !token.settledSaleId
  );
  const pendingCount = pendingTokens.length;
  const pendingTotal = pendingTokens.reduce(
    (sum, token) => sum + Number(token.totalAmount || 0),
    0
  );
  const nowMs = Date.now();
  const overduePendingCount = pendingTokens.filter(
    (token) => nowMs - token.createdAt.getTime() >= 30 * 60 * 1000
  ).length;

  return (
    <div className="space-y-4 sm:space-y-5 section-gap">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_16px_36px_rgba(15,23,42,0.08)] animate-fade-in">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-soft/60 via-card to-card" />
        <div className="pointer-events-none absolute -top-20 right-0 h-40 w-40 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="relative space-y-3 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                Queue
              </p>
              <h1 className="text-2xl font-bold text-foreground leading-tight tracking-tight sm:text-3xl">
                টোকেন বোর্ড
              </h1>
              <p className="text-xs text-muted-foreground">
                দোকান: <span className="font-semibold text-foreground">{selectedShop.name}</span>
              </p>
            </div>
            <div className="w-full sm:w-auto">
              <QueueShopSelectorClient shops={shops} selectedShopId={selectedShopId} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-3 text-xs">
            <span className="inline-flex h-7 items-center rounded-full border border-border bg-card/80 px-3 font-semibold text-foreground">
              Date: {snapshot.businessDate}
            </span>
            <span className="inline-flex h-7 items-center rounded-full border border-border bg-card/80 px-3 font-semibold text-muted-foreground">
              Prefix: {resolveQueueTokenPrefix(snapshot.shop.queueTokenPrefix)}
            </span>
            <span className="inline-flex h-7 items-center rounded-full border border-warning/30 bg-warning-soft px-3 font-semibold text-warning">
              Waiting: {waitingCount}
            </span>
            <span className="inline-flex h-7 items-center rounded-full border border-primary/30 bg-primary-soft px-3 font-semibold text-primary">
              Active: {activeCount}
            </span>
          </div>
        </div>
      </div>

      {!snapshot.shop.queueTokenEnabled ? (
        <div className="rounded-2xl border border-warning/30 bg-warning-soft p-4 text-warning">
          <p className="text-sm font-semibold">এই দোকানে Queue Token feature এখনো চালু করা হয়নি।</p>
          {canManageQueueFeature ? (
            <Link
              href={`/dashboard/shops/${selectedShopId}`}
              className="mt-2 inline-flex h-9 items-center rounded-full border border-warning/40 px-3 text-xs font-semibold text-warning hover:bg-warning/15"
            >
              দোকানের সেটিংসে গিয়ে চালু করুন
            </Link>
          ) : null}
        </div>
      ) : null}

      {snapshot.shop.queueTokenEnabled && pendingCount > 0 ? (
        <div
          className={`rounded-2xl border p-4 ${
            overduePendingCount > 0
              ? "border-danger/30 bg-danger-soft text-danger"
              : "border-warning/30 bg-warning-soft text-warning"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">
              Reminder: {pendingCount}টি unsettled token এখনো close হয়নি
            </p>
            <span className="inline-flex h-7 items-center rounded-full border border-current/30 px-3 text-xs font-semibold">
              Pending ৳ {formatMoney(pendingTotal)}
            </span>
          </div>
          <p className="mt-1 text-xs">
            {overduePendingCount > 0
              ? `${overduePendingCount}টি token ৩০ মিনিটের বেশি সময় ধরে pending আছে।`
              : "দিন শেষে token close করতে End-of-day action ব্যবহার করুন।"}
          </p>
        </div>
      ) : null}

      {snapshot.shop.queueTokenEnabled && canCreateToken ? (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="text-base font-semibold text-foreground">নতুন টোকেন তৈরি</h2>
          {productOptions.length === 0 ? (
            <p className="mt-3 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
              টোকেন তৈরি করতে অন্তত ১টি active পণ্য লাগবে।
            </p>
          ) : !hasTokenEligibleProduct ? (
            <p className="mt-3 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
              স্টক-ট্র্যাকড সব পণ্যের available stock শেষ। নতুন stock না আসা পর্যন্ত token issue করা যাবে না।
            </p>
          ) : (
            <CreateQueueTokenForm
              shopId={selectedShopId}
              products={productOptions}
              orderTypeOptions={orderTypeOptions}
              action={createTokenAction}
            />
          )}

          {canUpdateToken ? (
            <form action={callNextAction} className="mt-3">
              <input type="hidden" name="shopId" value={selectedShopId} />
              <input type="hidden" name="businessDate" value={snapshot.businessDate} />
              <button
                type="submit"
                className="inline-flex h-11 items-center rounded-full border border-warning/30 bg-warning-soft px-4 text-sm font-semibold text-warning hover:bg-warning/15"
                title={
                  nextWaitingToken
                    ? `Next: ${nextWaitingToken.tokenLabel}`
                    : "অপেক্ষায় কোনো টোকেন নেই"
                }
              >
                Next কল করুন
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {snapshot.shop.queueTokenEnabled && canUpdateToken && !canCreateToken ? (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <form action={callNextAction}>
            <input type="hidden" name="shopId" value={selectedShopId} />
            <input type="hidden" name="businessDate" value={snapshot.businessDate} />
            <button
              type="submit"
              className="inline-flex h-11 items-center rounded-full border border-warning/30 bg-warning-soft px-4 text-sm font-semibold text-warning hover:bg-warning/15"
              title={
                nextWaitingToken
                  ? `Next: ${nextWaitingToken.tokenLabel}`
                  : "অপেক্ষায় কোনো টোকেন নেই"
              }
            >
              Next কল করুন
            </button>
          </form>
        </div>
      ) : null}

      {snapshot.shop.queueTokenEnabled ? (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-foreground">End-of-day Closing</h2>
              <p className="text-xs text-muted-foreground">
                Date {snapshot.businessDate} এর pending token report
              </p>
            </div>
            <span className="inline-flex h-7 items-center rounded-full border border-border bg-muted/35 px-3 text-xs font-semibold text-foreground">
              Pending: {pendingCount}
            </span>
          </div>

          <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
            <p>
              Unsettled token:{" "}
              <span className="font-semibold text-foreground">{pendingCount}</span>
            </p>
            <p>
              Pending amount:{" "}
              <span className="font-semibold text-foreground">৳ {formatMoney(pendingTotal)}</span>
            </p>
            <p>
              Over 30 min:{" "}
              <span className="font-semibold text-foreground">{overduePendingCount}</span>
            </p>
          </div>

          {pendingCount > 0 ? (
            <div className="mt-3 overflow-hidden rounded-lg border border-border bg-muted/20">
              <div className="grid grid-cols-12 border-b border-border bg-muted/45 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <span className="col-span-3">Token</span>
                <span className="col-span-3">Status</span>
                <span className="col-span-3 text-right">Amount</span>
                <span className="col-span-3 text-right">Age</span>
              </div>
              <div className="divide-y divide-border">
                {pendingTokens.map((token) => (
                  <div key={token.id} className="grid grid-cols-12 px-3 py-2 text-xs">
                    <span className="col-span-3 font-mono text-foreground">{token.tokenLabel}</span>
                    <span className="col-span-3 text-muted-foreground">
                      {getQueueStatusLabel(token.status, workflowProfile)}
                    </span>
                    <span className="col-span-3 text-right font-semibold text-foreground">
                      ৳ {formatMoney(token.totalAmount)}
                    </span>
                    <span className="col-span-3 text-right text-muted-foreground">
                      {formatTokenAge(token.createdAt, nowMs)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-3 rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-xs text-success">
              Pending token নেই। আজকের queue closing clean আছে।
            </p>
          )}

          {canUpdateToken ? (
            <form action={closeBusinessDayAction} className="mt-3">
              <input type="hidden" name="shopId" value={selectedShopId} />
              <input type="hidden" name="businessDate" value={snapshot.businessDate} />
              <button
                type="submit"
                disabled={pendingCount === 0}
                className="inline-flex h-11 items-center rounded-full border border-danger/30 bg-danger-soft px-4 text-sm font-semibold text-danger hover:bg-danger/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                End-of-day close (pending token cancel)
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/35 px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">আজকের টোকেন তালিকা</h2>
          <span className="text-xs font-semibold text-muted-foreground">মোট: {snapshot.tokens.length}</span>
        </div>

        {snapshot.tokens.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">এখনো কোনো token issue হয়নি।</div>
        ) : (
          <div className="divide-y divide-border">
            {snapshot.tokens.map((token) => {
              const nextAction = getQueueNextAction(token.status, workflowProfile);
              const isCompleted = isQueueTerminalStatus(token.status);
              const isSettled = Boolean(token.settledSaleId);
              const canSettleNow = canSettleToken && !isSettled && token.status !== "CANCELLED";

              return (
                <div key={token.id} className="space-y-3 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-lg font-bold text-foreground">{token.tokenLabel}</span>
                      <span
                        className={`inline-flex h-7 items-center rounded-full border px-3 text-xs font-semibold ${
                          STATUS_BADGE_CLASS[token.status] ||
                          "border-border bg-muted text-muted-foreground"
                        }`}
                      >
                        {getQueueStatusLabel(token.status, workflowProfile)}
                      </span>
                      <span className="inline-flex h-7 items-center rounded-full border border-border bg-card px-3 text-xs font-semibold text-muted-foreground">
                        {getQueueOrderTypeLabel(token.orderType, workflowProfile)}
                      </span>
                      {isSettled ? (
                        <span className="inline-flex h-7 items-center rounded-full border border-success/30 bg-success-soft px-3 text-xs font-semibold text-success">
                          Sale সম্পন্ন
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2">
                      {canPrintToken ? (
                        <Link
                          href={`/dashboard/queue/${token.id}/print`}
                          className="inline-flex h-8 items-center rounded-full border border-primary/30 bg-primary-soft px-3 text-xs font-semibold text-primary hover:bg-primary/15"
                        >
                          প্রিন্ট
                        </Link>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-5">
                    <p>
                      কাস্টমার: <span className="font-semibold text-foreground">{token.customerName || "Walk-in"}</span>
                    </p>
                    <p>
                      ফোন: <span className="font-semibold text-foreground">{token.customerPhone || "N/A"}</span>
                    </p>
                    <p>
                      মোট: <span className="font-semibold text-foreground">৳ {formatMoney(token.totalAmount)}</span>
                    </p>
                    <p>
                      ইস্যু: <span className="font-semibold text-foreground">{formatDateTime(token.createdAt)}</span>
                    </p>
                    <p>
                      আপডেট: <span className="font-semibold text-foreground">{formatDateTime(token.updatedAt)}</span>
                    </p>
                  </div>

                  {token.items.length > 0 ? (
                    <div className="overflow-hidden rounded-lg border border-border bg-muted/20">
                      <div className="grid grid-cols-12 border-b border-border bg-muted/45 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        <span className="col-span-6">আইটেম</span>
                        <span className="col-span-2 text-right">Qty</span>
                        <span className="col-span-2 text-right">Rate</span>
                        <span className="col-span-2 text-right">Total</span>
                      </div>
                      <div className="divide-y divide-border">
                        {token.items.map((item) => (
                          <div key={item.id} className="grid grid-cols-12 px-3 py-2 text-xs">
                            <span className="col-span-6 text-foreground">{item.productName}</span>
                            <span className="col-span-2 text-right text-foreground">{item.quantity}</span>
                            <span className="col-span-2 text-right text-muted-foreground">
                              ৳ {formatMoney(item.unitPrice)}
                            </span>
                            <span className="col-span-2 text-right font-semibold text-foreground">
                              ৳ {formatMoney(item.lineTotal)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {token.note ? (
                    <p className="rounded-lg border border-border bg-muted/35 px-3 py-2 text-xs text-foreground">
                      নোট: {token.note}
                    </p>
                  ) : null}

                  {isSettled ? (
                    <p className="text-xs text-muted-foreground">
                      Sale ID: <span className="font-mono text-foreground">{token.settledSaleId}</span>
                      {token.settledAt ? (
                        <>
                          {" "}• Settled: <span className="text-foreground">{formatDateTime(token.settledAt)}</span>
                        </>
                      ) : null}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2">
                    {canSettleNow ? (
                      <form action={settleAsSaleAction}>
                        <input type="hidden" name="tokenId" value={token.id} />
                        <button
                          type="submit"
                          className="inline-flex h-8 items-center rounded-full border border-success/30 bg-success-soft px-3 text-xs font-semibold text-success hover:bg-success/15"
                        >
                          Sale এ convert করুন
                        </button>
                      </form>
                    ) : null}

                    {canUpdateToken && !isCompleted ? (
                      <>
                        {nextAction ? (
                          <form action={updateStatusAction}>
                            <input type="hidden" name="tokenId" value={token.id} />
                            <input type="hidden" name="status" value={nextAction.status} />
                            <button
                              type="submit"
                              className="inline-flex h-8 items-center rounded-full border border-primary/30 bg-primary-soft px-3 text-xs font-semibold text-primary hover:bg-primary/15"
                            >
                              {nextAction.label}
                            </button>
                          </form>
                        ) : null}

                        {token.status !== "CANCELLED" ? (
                          <form action={updateStatusAction}>
                            <input type="hidden" name="tokenId" value={token.id} />
                            <input type="hidden" name="status" value="CANCELLED" />
                            <button
                              type="submit"
                              className="inline-flex h-8 items-center rounded-full border border-danger/30 bg-danger-soft px-3 text-xs font-semibold text-danger hover:bg-danger/15"
                            >
                              বাতিল
                            </button>
                          </form>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
