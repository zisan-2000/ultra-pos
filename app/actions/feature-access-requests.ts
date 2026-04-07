"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/rbac";
import { assertShopAccess } from "@/lib/shop-access";
import {
  FEATURE_ACCESS_META,
  isFeatureAccessKey,
  type FeatureAccessKey,
  type FeatureAccessRequestStatus,
} from "@/lib/feature-access";
import { prisma } from "@/lib/prisma";

type FeatureAccessRequestSnapshot = {
  id: string;
  featureKey: FeatureAccessKey;
  status: FeatureAccessRequestStatus;
  reason: string | null;
  decisionNote: string | null;
  createdAtIso: string;
  decidedAtIso: string | null;
};

export type FeatureAccessRequestMap = Partial<
  Record<FeatureAccessKey, FeatureAccessRequestSnapshot>
>;

export async function getLatestFeatureAccessRequestSnapshots(
  shopId: string
): Promise<FeatureAccessRequestMap> {
  const user = await requireUser();
  await assertShopAccess(shopId, user);

  const requests = await prisma.featureAccessRequest.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      featureKey: true,
      status: true,
      reason: true,
      decisionNote: true,
      createdAt: true,
      decidedAt: true,
    },
  });

  const map: FeatureAccessRequestMap = {};
  for (const request of requests) {
    if (!isFeatureAccessKey(request.featureKey)) continue;
    if (map[request.featureKey]) continue;
    map[request.featureKey] = {
      id: request.id,
      featureKey: request.featureKey,
      status: request.status as FeatureAccessRequestStatus,
      reason: request.reason ?? null,
      decisionNote: request.decisionNote ?? null,
      createdAtIso: request.createdAt.toISOString(),
      decidedAtIso: request.decidedAt ? request.decidedAt.toISOString() : null,
    };
  }

  return map;
}

export async function requestFeatureAccess(input: {
  shopId: string;
  featureKey: FeatureAccessKey;
  reason?: string | null;
}) {
  const user = await requireUser();
  if (!user.roles.includes("owner")) {
    throw new Error("Only shop owner can request feature access");
  }

  const feature = FEATURE_ACCESS_META[input.featureKey];
  if (!feature) {
    throw new Error("Invalid feature key");
  }

  const shop = await prisma.shop.findFirst({
    where: {
      id: input.shopId,
      ownerId: user.id,
      deletedAt: null,
    },
    select: {
      id: true,
      ownerId: true,
      name: true,
      salesInvoiceEntitled: true,
      queueTokenEntitled: true,
      discountFeatureEntitled: true,
      taxFeatureEntitled: true,
      barcodeFeatureEntitled: true,
      smsSummaryEntitled: true,
      inventoryFeatureEntitled: true,
      cogsFeatureEntitled: true,
    },
  });

  if (!shop) {
    throw new Error("Shop not found or access denied");
  }

  if (Boolean((shop as Record<string, unknown>)[feature.entitlementField])) {
    return {
      ok: true,
      message: `${feature.title} entitlement already enabled for this shop.`,
      status: "already_enabled" as const,
      request: null,
    };
  }

  const normalizedReason = (input.reason || "").trim().slice(0, 500) || null;

  const pending = await prisma.featureAccessRequest.findFirst({
    where: {
      shopId: shop.id,
      featureKey: input.featureKey,
      status: "pending",
    },
    orderBy: { createdAt: "desc" },
  });

  let requestRecord = pending;
  if (pending) {
    if (normalizedReason && normalizedReason !== pending.reason) {
      requestRecord = await prisma.featureAccessRequest.update({
        where: { id: pending.id },
        data: { reason: normalizedReason },
      });
    }
  } else {
    requestRecord = await prisma.featureAccessRequest.create({
      data: {
        shopId: shop.id,
        ownerId: shop.ownerId,
        requestedByUserId: user.id,
        featureKey: input.featureKey,
        reason: normalizedReason,
      },
    });
  }

  revalidatePath(`/dashboard/shops/${shop.id}`);
  revalidatePath("/dashboard/admin/feature-access");
  revalidatePath("/dashboard/admin/billing");

  return {
    ok: true,
    message: `${feature.title} access request submitted.`,
    status: "pending" as const,
    request: requestRecord
      ? {
          id: requestRecord.id,
          featureKey: requestRecord.featureKey as FeatureAccessKey,
          status: requestRecord.status as FeatureAccessRequestStatus,
          reason: requestRecord.reason ?? null,
          decisionNote: requestRecord.decisionNote ?? null,
          createdAtIso: requestRecord.createdAt.toISOString(),
          decidedAtIso: requestRecord.decidedAt
            ? requestRecord.decidedAt.toISOString()
            : null,
        }
      : null,
  };
}

function requireFeatureAccessManager(user: Awaited<ReturnType<typeof requireUser>>) {
  if (!hasPermission(user, "manage_feature_access_requests")) {
    throw new Error("Forbidden: missing permission manage_feature_access_requests");
  }
}

export async function approveFeatureAccessRequest(formData: FormData) {
  const user = await requireUser();
  requireFeatureAccessManager(user);

  const requestId = String(formData.get("requestId") || "").trim();
  const decisionNote = String(formData.get("decisionNote") || "")
    .trim()
    .slice(0, 500);
  if (!requestId) {
    throw new Error("Missing feature access request id");
  }

  let revalidateShopId: string | null = null;
  await prisma.$transaction(async (tx) => {
    const request = await tx.featureAccessRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        shopId: true,
        featureKey: true,
        status: true,
      },
    });

    if (!request) {
      throw new Error("Feature access request not found");
    }
    if (!isFeatureAccessKey(request.featureKey)) {
      throw new Error("Invalid feature key in request");
    }
    if (request.status !== "pending") {
      revalidateShopId = request.shopId;
      return;
    }

    const feature = FEATURE_ACCESS_META[request.featureKey];
    const patch: Record<string, boolean> = {
      [feature.entitlementField]: true,
    };

    await tx.shop.update({
      where: { id: request.shopId },
      data: patch as Prisma.ShopUpdateInput,
    });

    await tx.featureAccessRequest.update({
      where: { id: request.id },
      data: {
        status: "approved",
        decidedAt: new Date(),
        decidedByUserId: user.id,
        decisionNote: decisionNote || null,
      },
    });

    revalidateShopId = request.shopId;
  });

  revalidatePath("/dashboard/admin/feature-access");
  if (revalidateShopId) {
    revalidatePath(`/dashboard/shops/${revalidateShopId}`);
  }
}

export async function rejectFeatureAccessRequest(formData: FormData) {
  const user = await requireUser();
  requireFeatureAccessManager(user);

  const requestId = String(formData.get("requestId") || "").trim();
  const decisionNote = String(formData.get("decisionNote") || "")
    .trim()
    .slice(0, 500);
  if (!requestId) {
    throw new Error("Missing feature access request id");
  }

  const request = await prisma.featureAccessRequest.findUnique({
    where: { id: requestId },
    select: { shopId: true, status: true },
  });
  if (!request) {
    throw new Error("Feature access request not found");
  }
  if (request.status !== "pending") {
    return;
  }

  await prisma.featureAccessRequest.update({
    where: { id: requestId },
    data: {
      status: "rejected",
      decidedAt: new Date(),
      decidedByUserId: user.id,
      decisionNote: decisionNote || null,
    },
  });

  revalidatePath("/dashboard/admin/feature-access");
  revalidatePath(`/dashboard/shops/${request.shopId}`);
}
