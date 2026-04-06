"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

type RequestStatus = "pending" | "approved" | "rejected";

export type OwnerShopCreationRequestOverview = {
  shopLimit: number;
  activeShopCount: number;
  latestRequest: {
    id: string;
    status: RequestStatus;
    reason: string | null;
    decisionNote: string | null;
    primaryShopNameSnapshot: string | null;
    primaryShopPhoneSnapshot: string | null;
    createdAtIso: string;
    decidedAtIso: string | null;
  } | null;
  hasPendingRequest: boolean;
};

function requireShopCreationRequestManager(
  user: Awaited<ReturnType<typeof requireUser>>
) {
  if (!hasPermission(user, "manage_shop_creation_requests")) {
    throw new Error("Forbidden: missing permission manage_shop_creation_requests");
  }
}

export async function getOwnerShopCreationRequestOverview(): Promise<OwnerShopCreationRequestOverview> {
  const user = await requireUser();
  if (!user.roles.includes("owner")) {
    throw new Error("Only owner can access this overview");
  }

  const [owner, activeShopCount, latestRequest, pending] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: { shopLimit: true },
    }),
    prisma.shop.count({
      where: { ownerId: user.id, deletedAt: null },
    }),
    prisma.shopCreationRequest.findFirst({
      where: { ownerId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        reason: true,
        decisionNote: true,
        primaryShopNameSnapshot: true,
        primaryShopPhoneSnapshot: true,
        createdAt: true,
        decidedAt: true,
      },
    }),
    prisma.shopCreationRequest.findFirst({
      where: { ownerId: user.id, status: "pending" },
      select: { id: true },
    }),
  ]);

  return {
    shopLimit: Math.max(1, owner?.shopLimit ?? 1),
    activeShopCount,
    latestRequest: latestRequest
      ? {
          id: latestRequest.id,
          status: latestRequest.status as RequestStatus,
          reason: latestRequest.reason ?? null,
          decisionNote: latestRequest.decisionNote ?? null,
          primaryShopNameSnapshot: latestRequest.primaryShopNameSnapshot ?? null,
          primaryShopPhoneSnapshot: latestRequest.primaryShopPhoneSnapshot ?? null,
          createdAtIso: latestRequest.createdAt.toISOString(),
          decidedAtIso: latestRequest.decidedAt
            ? latestRequest.decidedAt.toISOString()
            : null,
        }
      : null,
    hasPendingRequest: Boolean(pending),
  };
}

export async function requestAdditionalShopSlot() {
  const user = await requireUser();
  if (!user.roles.includes("owner")) {
    throw new Error("Only owner can request additional shop slot");
  }

  const [owner, activeShopCount, primaryShop] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: { shopLimit: true, name: true, email: true },
    }),
    prisma.shop.count({
      where: { ownerId: user.id, deletedAt: null },
    }),
    prisma.shop.findFirst({
      where: { ownerId: user.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, phone: true },
    }),
  ]);

  const shopLimit = Math.max(1, owner?.shopLimit ?? 1);
  if (activeShopCount < shopLimit) {
    return {
      ok: true,
      status: "already_has_capacity" as const,
      message: "You already have available shop capacity.",
    };
  }

  const pending = await prisma.shopCreationRequest.findFirst({
    where: { ownerId: user.id, status: "pending" },
    select: { id: true },
  });
  if (pending) {
    return {
      ok: true,
      status: "pending_exists" as const,
      message: "A pending request already exists.",
    };
  }

  await prisma.shopCreationRequest.create({
    data: {
      ownerId: user.id,
      requestedByUserId: user.id,
      currentShopCount: activeShopCount,
      primaryShopIdSnapshot: primaryShop?.id ?? null,
      primaryShopNameSnapshot: primaryShop?.name ?? null,
      primaryShopPhoneSnapshot: primaryShop?.phone ?? null,
      reason: "Owner requested additional shop slot",
      status: "pending",
    },
  });

  revalidatePath("/dashboard/shops/new");
  revalidatePath("/dashboard/admin/feature-access");

  return {
    ok: true,
    status: "requested" as const,
    message: "Additional shop slot request submitted.",
  };
}

export async function approveShopCreationRequest(formData: FormData) {
  const user = await requireUser();
  requireShopCreationRequestManager(user);

  const requestId = String(formData.get("requestId") || "").trim();
  const decisionNote = String(formData.get("decisionNote") || "")
    .trim()
    .slice(0, 500);
  if (!requestId) {
    throw new Error("Missing shop creation request id");
  }

  let ownerIdForRevalidate: string | null = null;
  await prisma.$transaction(async (tx) => {
    const request = await tx.shopCreationRequest.findUnique({
      where: { id: requestId },
      select: { id: true, ownerId: true, status: true },
    });
    if (!request) {
      throw new Error("Shop creation request not found");
    }
    ownerIdForRevalidate = request.ownerId;
    if (request.status !== "pending") {
      return;
    }

    const owner = await tx.user.update({
      where: { id: request.ownerId },
      data: { shopLimit: { increment: 1 } },
      select: { shopLimit: true },
    });

    await tx.shopCreationRequest.update({
      where: { id: request.id },
      data: {
        status: "approved",
        decidedAt: new Date(),
        decidedByUserId: user.id,
        decisionNote: decisionNote || null,
        approvedLimitAfter: owner.shopLimit,
      },
    });
  });

  revalidatePath("/dashboard/admin/feature-access");
  revalidatePath("/dashboard/shops/new");
  if (ownerIdForRevalidate) {
    revalidatePath("/dashboard/shops");
  }
}

export async function rejectShopCreationRequest(formData: FormData) {
  const user = await requireUser();
  requireShopCreationRequestManager(user);

  const requestId = String(formData.get("requestId") || "").trim();
  const decisionNote = String(formData.get("decisionNote") || "")
    .trim()
    .slice(0, 500);
  if (!requestId) {
    throw new Error("Missing shop creation request id");
  }

  const request = await prisma.shopCreationRequest.findUnique({
    where: { id: requestId },
    select: { ownerId: true, status: true },
  });
  if (!request) {
    throw new Error("Shop creation request not found");
  }
  if (request.status !== "pending") {
    return;
  }

  await prisma.shopCreationRequest.update({
    where: { id: requestId },
    data: {
      status: "rejected",
      decidedAt: new Date(),
      decidedByUserId: user.id,
      decisionNote: decisionNote || null,
    },
  });

  revalidatePath("/dashboard/admin/feature-access");
  revalidatePath("/dashboard/shops/new");
}
