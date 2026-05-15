import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/rbac";
import { assertShopAccess } from "@/lib/shop-access";
import { prisma } from "@/lib/prisma";
import { parseDhakaDateOnlyRange } from "@/lib/dhaka-date";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    if (!hasPermission(user, "view_audit_log")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const shopId = url.searchParams.get("shopId")?.trim();
    if (!shopId) {
      return NextResponse.json({ error: "shopId required" }, { status: 400 });
    }
    try {
      await assertShopAccess(shopId, user);
    } catch (accessError) {
      const message =
        accessError instanceof Error
          ? accessError.message
          : "Unauthorized access to this shop";
      return NextResponse.json({ error: message }, { status: 403 });
    }

  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;
  const action = url.searchParams.get("action")?.trim() || undefined;
  const severity = url.searchParams.get("severity")?.trim() || undefined;
  const userId = url.searchParams.get("userId")?.trim() || undefined;
  const q = url.searchParams.get("q")?.trim() || undefined;
  const cursorAt = url.searchParams.get("cursorAt") || undefined;
  const cursorId = url.searchParams.get("cursorId") || undefined;
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") || DEFAULT_LIMIT), 1),
    MAX_LIMIT,
  );

  const { start, end } = parseDhakaDateOnlyRange(from, to, true);
  const where: Prisma.AuditLogWhereInput = {
    shopId,
    ...(start && end ? { at: { gte: start, lte: end } } : {}),
    ...(action ? { action } : {}),
    ...(severity ? { severity } : {}),
    ...(userId ? { userId } : {}),
    ...(q
      ? {
          OR: [
            { summary: { contains: q, mode: "insensitive" } },
            { action: { contains: q, mode: "insensitive" } },
            { targetType: { contains: q, mode: "insensitive" } },
            { targetId: { contains: q, mode: "insensitive" } },
            { userName: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(cursorAt && cursorId
      ? {
          OR: [
            { at: { lt: new Date(cursorAt) } },
            { at: new Date(cursorAt), id: { lt: cursorId } },
          ],
        }
      : {}),
  };

  const [rows, counts, users, actions] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: [{ at: "desc" }, { id: "desc" }],
      take: limit + 1,
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        summary: true,
        metadata: true,
        severity: true,
        userId: true,
        userName: true,
        userRoles: true,
        ipAddress: true,
        userAgent: true,
        correlationId: true,
        businessDate: true,
        at: true,
      },
    }),
    prisma.auditLog.groupBy({
      by: ["severity"],
      where: { shopId, ...(start && end ? { at: { gte: start, lte: end } } : {}) },
      _count: { _all: true },
    }),
    prisma.auditLog.findMany({
      where: { shopId, userId: { not: null } },
      distinct: ["userId"],
      orderBy: { userName: "asc" },
      select: { userId: true, userName: true },
      take: 200,
    }),
    prisma.auditLog.findMany({
      where: { shopId },
      distinct: ["action"],
      orderBy: { action: "asc" },
      select: { action: true },
      take: 200,
    }),
  ]);

  const pageRows = rows.slice(0, limit);
  const last = pageRows[pageRows.length - 1];

    return NextResponse.json({
      items: pageRows.map((row) => ({ ...row, at: row.at.toISOString() })),
      hasMore: rows.length > limit,
      nextCursor: last
        ? { cursorAt: last.at.toISOString(), cursorId: last.id }
        : null,
      facets: {
        severityCounts: Object.fromEntries(
          counts.map((row) => [row.severity, row._count._all]),
        ),
        users,
        actions: actions.map((row) => row.action),
      },
    });
  } catch (error) {
    console.error("[audit/list] unexpected error", error);
    const message =
      error instanceof Error ? error.message : "Audit log fetch failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

