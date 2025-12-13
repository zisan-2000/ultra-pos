import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { isSuperAdmin } from "@/lib/rbac";

function parseDateParam(value: string | null, endOfDay = false): Date | null {
  if (!value) return null;

  const trimmed = value.trim();
  const hasTimeComponent = trimmed.includes("T");
  const candidate = hasTimeComponent
    ? new Date(trimmed)
    : new Date(`${trimmed}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);

  if (Number.isNaN(candidate.getTime())) {
    return null;
  }

  return candidate;
}

export async function GET(req: NextRequest) {
  try {
    const requester = await requireUser();
    const requesterRoles = requester.roles || [];
    const superAdmin = isSuperAdmin(requester);
    const isAdmin = requesterRoles.includes("admin");

    if (!superAdmin && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);

    const startDate = parseDateParam(searchParams.get("startDate"));
    const endDate = parseDateParam(searchParams.get("endDate"), true);

    if (searchParams.get("startDate") && !startDate) {
      return NextResponse.json({ error: "Invalid startDate" }, { status: 400 });
    }
    if (searchParams.get("endDate") && !endDate) {
      return NextResponse.json({ error: "Invalid endDate" }, { status: 400 });
    }

    if (startDate && endDate && startDate > endDate) {
      return NextResponse.json(
        { error: "startDate cannot be after endDate" },
        { status: 400 },
      );
    }

    const creatorId = searchParams.get("creatorId")?.trim() || null;
    const q = searchParams.get("q")?.trim() || "";

    const requestedLimit = Number.parseInt(searchParams.get("limit") || "", 10);
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 500)
      : 200;

    let accessibleCreatorIds: string[] | null = null;

    if (superAdmin) {
      accessibleCreatorIds = null;
    } else if (isAdmin) {
      const agents = await prisma.user.findMany({
        where: {
          createdBy: requester.id,
          roles: { some: { name: "agent" } },
        },
        select: { id: true },
      });
      const ids = new Set<string>();
      // Only the admin's agents; exclude admin themselves so their own creations are hidden.
      agents.forEach((a) => ids.add(a.id));
      accessibleCreatorIds = Array.from(ids);
    }

    if (!superAdmin && isAdmin && creatorId && !accessibleCreatorIds?.includes(creatorId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const filters: Prisma.UserWhereInput[] = [
      {
        createdBy: { not: null },
      },
    ];

    if (accessibleCreatorIds) {
      filters.push({ createdBy: { in: accessibleCreatorIds } });
    }

    if (creatorId) {
      filters.push({ createdBy: creatorId });
    }

    if (startDate || endDate) {
      filters.push({
        createdAt: {
          ...(startDate ? { gte: startDate } : {}),
          ...(endDate ? { lte: endDate } : {}),
        },
      });
    }

    if (q) {
      filters.push({
        OR: [
          { email: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
          {
            createdByUser: {
              OR: [
                { email: { contains: q, mode: "insensitive" } },
                { name: { contains: q, mode: "insensitive" } },
              ],
            },
          },
        ],
      });
    }

    const where: Prisma.UserWhereInput = filters.length ? { AND: filters } : {};

    const creatorListWhere: Prisma.UserWhereInput =
      superAdmin || !accessibleCreatorIds
        ? { createdUsers: { some: {} } }
        : accessibleCreatorIds.length > 0
        ? { id: { in: accessibleCreatorIds } }
        : { id: "___none___" };

    const [entries, creators] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
          createdByUser: {
            select: { id: true, email: true, name: true },
          },
        },
      }),
      prisma.user.findMany({
        where: creatorListWhere,
        select: { id: true, email: true, name: true },
        orderBy: [{ name: "asc" }, { email: "asc" }],
      }),
    ]);

    const data = entries.map((entry) => ({
      createdAt: entry.createdAt,
      createdUser: {
        id: entry.id,
        email: entry.email,
        name: entry.name,
      },
      createdBy: entry.createdByUser
        ? {
          id: entry.createdByUser.id,
          email: entry.createdByUser.email,
          name: entry.createdByUser.name,
        }
        : null,
    }));

    return NextResponse.json({
      data,
      meta: {
        count: data.length,
        limit,
        filters: {
          startDate: startDate ? startDate.toISOString() : null,
          endDate: endDate ? endDate.toISOString() : null,
          creatorId,
          q: q || null,
        },
      },
      creators,
    });
  } catch (error) {
    console.error("Failed to load user creation log", error);
    return NextResponse.json(
      { error: "Failed to load user creation log" },
      { status: 500 },
    );
  }
}
