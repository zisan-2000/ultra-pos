import { redirect } from "next/navigation";
import {
  approveFeatureAccessRequest,
  rejectFeatureAccessRequest,
} from "@/app/actions/feature-access-requests";
import {
  approveShopCreationRequest,
  rejectShopCreationRequest,
} from "@/app/actions/shop-creation-requests";
import { requireUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { FEATURE_ACCESS_META } from "@/lib/feature-access";

const statusTone: Record<string, string> = {
  pending: "text-warning",
  approved: "text-success",
  rejected: "text-danger",
};

const formatDateTime = (value?: Date | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("bn-BD", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

export default async function FeatureAccessRequestsPage() {
  const user = await requireUser();
  const canViewFeature = hasPermission(user, "view_feature_access_requests");
  const canManageFeature = hasPermission(user, "manage_feature_access_requests");
  const canViewShopCreation = hasPermission(user, "view_shop_creation_requests");
  const canManageShopCreation = hasPermission(
    user,
    "manage_shop_creation_requests"
  );

  if (
    !canViewFeature &&
    !canManageFeature &&
    !canViewShopCreation &&
    !canManageShopCreation
  ) {
    redirect("/dashboard");
  }

  const pendingRequests =
    canViewFeature || canManageFeature
      ? await prisma.featureAccessRequest.findMany({
          where: { status: "pending" },
          include: {
            shop: { select: { id: true, name: true, phone: true } },
            owner: { select: { id: true, name: true, email: true } },
            requestedByUser: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: "desc" },
        })
      : [];

  const recentRequests =
    canViewFeature || canManageFeature
      ? await prisma.featureAccessRequest.findMany({
          where: { status: { in: ["approved", "rejected"] } },
          include: {
            shop: { select: { id: true, name: true, phone: true } },
            owner: { select: { id: true, name: true, email: true } },
            requestedByUser: { select: { id: true, name: true, email: true } },
            decidedByUser: { select: { id: true, name: true, email: true } },
          },
          orderBy: { decidedAt: "desc" },
          take: 120,
        })
      : [];

  const pendingShopCreationRequests =
    canViewShopCreation || canManageShopCreation
      ? await prisma.shopCreationRequest.findMany({
          where: { status: "pending" },
          include: {
            owner: { select: { id: true, name: true, email: true, shopLimit: true } },
            requestedByUser: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: "desc" },
        })
      : [];

  const recentShopCreationRequests =
    canViewShopCreation || canManageShopCreation
      ? await prisma.shopCreationRequest.findMany({
          where: { status: { in: ["approved", "rejected"] } },
          include: {
            owner: { select: { id: true, name: true, email: true, shopLimit: true } },
            requestedByUser: { select: { id: true, name: true, email: true } },
            decidedByUser: { select: { id: true, name: true, email: true } },
          },
          orderBy: { decidedAt: "desc" },
          take: 120,
        })
      : [];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h1 className="text-2xl font-bold text-foreground">Feature Access Requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Owner থেকে আসা entitlement request review করুন।
        </p>
      </div>

      {canViewShopCreation || canManageShopCreation ? (
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">
              Shop slot requests (pending)
            </h2>
            <span className="text-xs text-muted-foreground">
              {pendingShopCreationRequests.length} টি pending
            </span>
          </div>
          {pendingShopCreationRequests.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
              কোনো pending shop slot request নেই।
            </div>
          ) : (
            <div className="space-y-3">
              {pendingShopCreationRequests.map((request) => {
                const ownerLabel = request.owner.name || request.owner.email || "Unknown owner";
                const requesterLabel =
                  request.requestedByUser.name ||
                  request.requestedByUser.email ||
                  "Unknown user";
                return (
                  <div
                    key={request.id}
                    className="rounded-xl border border-border bg-muted/20 p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {ownerLabel} - Additional shop slot
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Requested by: {requesterLabel}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Current shops: {request.currentShopCount} | Current limit:{" "}
                          {request.owner.shopLimit}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Snapshot shop: {request.primaryShopNameSnapshot || "-"}
                          {request.primaryShopPhoneSnapshot
                            ? ` (${request.primaryShopPhoneSnapshot})`
                            : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Requested: {formatDateTime(request.createdAt)}
                        </p>
                      </div>
                      <span className="inline-flex items-center rounded-full border border-warning/30 bg-warning-soft px-2.5 py-1 text-xs font-semibold text-warning">
                        Pending
                      </span>
                    </div>
                    {request.reason ? (
                      <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">
                        {request.reason}
                      </div>
                    ) : null}
                    {canManageShopCreation ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <form action={approveShopCreationRequest} className="space-y-2">
                          <input type="hidden" name="requestId" value={request.id} />
                          <input
                            type="text"
                            name="decisionNote"
                            placeholder="Optional note for approval"
                            className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground shadow-sm"
                          />
                          <button
                            type="submit"
                            className="h-9 w-full rounded-lg bg-success px-3 text-sm font-semibold text-white hover:brightness-95"
                          >
                            Approve & Add +1 Limit
                          </button>
                        </form>
                        <form action={rejectShopCreationRequest} className="space-y-2">
                          <input type="hidden" name="requestId" value={request.id} />
                          <input
                            type="text"
                            name="decisionNote"
                            placeholder="Reason for rejection (recommended)"
                            className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground shadow-sm"
                          />
                          <button
                            type="submit"
                            className="h-9 w-full rounded-lg border border-danger/40 bg-danger-soft px-3 text-sm font-semibold text-danger hover:bg-danger-soft/80"
                          >
                            Reject
                          </button>
                        </form>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {canViewShopCreation || canManageShopCreation ? (
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">
              Shop slot decisions
            </h2>
            <span className="text-xs text-muted-foreground">
              সর্বশেষ {recentShopCreationRequests.length} টি
            </span>
          </div>
          {recentShopCreationRequests.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
              এখনো কোনো shop slot decision history নেই।
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-3">Owner</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Shops/Limit</th>
                    <th className="py-2 pr-3">Approved Limit</th>
                    <th className="py-2 pr-3">Requested</th>
                    <th className="py-2 pr-3">Decided</th>
                    <th className="py-2 pr-3">By</th>
                  </tr>
                </thead>
                <tbody>
                  {recentShopCreationRequests.map((request) => {
                    const ownerLabel =
                      request.owner.name || request.owner.email || "Unknown owner";
                    const decider =
                      request.decidedByUser?.name || request.decidedByUser?.email || "-";
                    return (
                      <tr
                        key={request.id}
                        className="border-t border-border/60 align-top text-foreground"
                      >
                        <td className="py-2 pr-3">{ownerLabel}</td>
                        <td className="py-2 pr-3">
                          <span
                            className={`font-semibold ${
                              statusTone[request.status] || "text-foreground"
                            }`}
                          >
                            {request.status}
                          </span>
                        </td>
                        <td className="py-2 pr-3">
                          {request.currentShopCount} / {request.owner.shopLimit}
                        </td>
                        <td className="py-2 pr-3">
                          {request.approvedLimitAfter ?? "-"}
                        </td>
                        <td className="py-2 pr-3">{formatDateTime(request.createdAt)}</td>
                        <td className="py-2 pr-3">{formatDateTime(request.decidedAt)}</td>
                        <td className="py-2 pr-3">{decider}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {canViewFeature || canManageFeature ? (
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Feature requests (pending)</h2>
          <span className="text-xs text-muted-foreground">
            {pendingRequests.length} টি pending
          </span>
        </div>
        {pendingRequests.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            কোনো pending request নেই।
          </div>
        ) : (
          <div className="space-y-3">
            {pendingRequests.map((request) => {
              const meta = FEATURE_ACCESS_META[request.featureKey as keyof typeof FEATURE_ACCESS_META];
              const featureLabel = meta?.title || request.featureKey;
              const ownerLabel =
                request.owner.name || request.owner.email || "Unknown owner";
              const requesterLabel =
                request.requestedByUser.name ||
                request.requestedByUser.email ||
                "Unknown user";
              return (
                <div
                  key={request.id}
                  className="rounded-xl border border-border bg-muted/20 p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {request.shop.name} - {featureLabel}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Owner: {ownerLabel} | Requested by: {requesterLabel}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Owner contact: {request.shop.phone || "ফোন নম্বর নেই"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Requested: {formatDateTime(request.createdAt)}
                      </p>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-warning/30 bg-warning-soft px-2.5 py-1 text-xs font-semibold text-warning">
                      Pending
                    </span>
                  </div>
                  {request.reason ? (
                    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">
                      {request.reason}
                    </div>
                  ) : null}
                  {canManageFeature ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <form action={approveFeatureAccessRequest} className="space-y-2">
                        <input type="hidden" name="requestId" value={request.id} />
                        <input
                          type="text"
                          name="decisionNote"
                          placeholder="Optional note for approval"
                          className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground shadow-sm"
                        />
                        <button
                          type="submit"
                          className="h-9 w-full rounded-lg bg-success px-3 text-sm font-semibold text-white hover:brightness-95"
                        >
                          Approve & Enable Entitlement
                        </button>
                      </form>
                      <form action={rejectFeatureAccessRequest} className="space-y-2">
                        <input type="hidden" name="requestId" value={request.id} />
                        <input
                          type="text"
                          name="decisionNote"
                          placeholder="Reason for rejection (recommended)"
                          className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground shadow-sm"
                        />
                        <button
                          type="submit"
                          className="h-9 w-full rounded-lg border border-danger/40 bg-danger-soft px-3 text-sm font-semibold text-danger hover:bg-danger-soft/80"
                        >
                          Reject
                        </button>
                      </form>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
      ) : null}

      {canViewFeature || canManageFeature ? (
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Feature decisions</h2>
          <span className="text-xs text-muted-foreground">সর্বশেষ {recentRequests.length} টি</span>
        </div>
        {recentRequests.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
            এখনো কোনো decision history নেই।
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3">Shop</th>
                  <th className="py-2 pr-3">Feature</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Requested</th>
                  <th className="py-2 pr-3">Decided</th>
                  <th className="py-2 pr-3">By</th>
                </tr>
              </thead>
              <tbody>
                {recentRequests.map((request) => {
                  const meta =
                    FEATURE_ACCESS_META[request.featureKey as keyof typeof FEATURE_ACCESS_META];
                  const featureLabel = meta?.title || request.featureKey;
                  const decider =
                    request.decidedByUser?.name ||
                    request.decidedByUser?.email ||
                    "-";
                  return (
                    <tr
                      key={request.id}
                      className="border-t border-border/60 align-top text-foreground"
                    >
                      <td className="py-2 pr-3">
                        <div className="space-y-0.5">
                          <p>{request.shop.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {request.shop.phone || "ফোন নম্বর নেই"}
                          </p>
                        </div>
                      </td>
                      <td className="py-2 pr-3">{featureLabel}</td>
                      <td className="py-2 pr-3">
                        <span
                          className={`font-semibold ${
                            statusTone[request.status] || "text-foreground"
                          }`}
                        >
                          {request.status}
                        </span>
                      </td>
                      <td className="py-2 pr-3">{formatDateTime(request.createdAt)}</td>
                      <td className="py-2 pr-3">{formatDateTime(request.decidedAt)}</td>
                      <td className="py-2 pr-3">{decider}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      ) : null}
    </div>
  );
}
