import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/rbac";
import { assertShopAccess } from "@/lib/shop-access";
import { prisma } from "@/lib/prisma";
import { parseDhakaDateOnlyRange } from "@/lib/dhaka-date";
import { getAuditActionLabel } from "@/lib/audit/actions";

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

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
  };

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: [{ at: "desc" }, { id: "desc" }],
    take: 5000,
    select: {
      at: true,
      businessDate: true,
      severity: true,
      action: true,
      userName: true,
      targetType: true,
      targetId: true,
      summary: true,
      correlationId: true,
      ipAddress: true,
    },
  });

  const lines = [
    [
      "Time",
      "Business Date",
      "Severity",
      "Action",
      "Action Label",
      "User",
      "Target Type",
      "Target ID",
      "Summary",
      "Correlation ID",
      "IP",
    ].map(csvCell).join(","),
    ...rows.map((row) =>
      [
        row.at.toISOString(),
        row.businessDate,
        row.severity,
        row.action,
        getAuditActionLabel(row.action),
        row.userName,
        row.targetType,
        row.targetId,
        row.summary,
        row.correlationId,
        row.ipAddress,
      ].map(csvCell).join(","),
    ),
  ];

    return new Response(`\uFEFF${lines.join("\n")}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-log-${shopId}-${from ?? "all"}-${to ?? "all"}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[audit/export] unexpected error", error);
    const message =
      error instanceof Error ? error.message : "Audit log export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

