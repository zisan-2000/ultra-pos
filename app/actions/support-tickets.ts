"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth-session";
import { hasPermission } from "@/lib/rbac";
import { assertShopAccess } from "@/lib/shop-access";
import { prisma } from "@/lib/prisma";
import { getSupportContactCachedData } from "@/lib/system/support-contact";

export async function getSupportContact() {
  return getSupportContactCachedData();
}
import {
  createTicketSchema,
  replyTicketSchema,
  updateTicketStatusSchema,
} from "@/lib/validators/support-ticket";
import type {
  SupportTicketStatus,
  SupportTicketPriority,
  SupportTicketCategory,
} from "@prisma/client";

export type TicketRow = {
  id: string;
  ticketNumber: number;
  title: string;
  description: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  resolvedNote: string | null;
  createdAtIso: string;
  updatedAtIso: string;
  resolvedAtIso: string | null;
  shopId: string;
  shopName: string;
  createdByUserId: string;
  createdByName: string | null;
  assignedToUserId: string | null;
  assignedToName: string | null;
  replyCount: number;
};

export type ReplyRow = {
  id: string;
  content: string;
  createdAtIso: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
};

function toTicketRow(t: {
  id: string;
  ticketNumber: number;
  title: string;
  description: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  resolvedNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  shopId: string;
  shop: { name: string };
  createdBy: { id: string; name: string | null };
  assignedTo: { id: string; name: string | null } | null;
  _count: { replies: number };
}): TicketRow {
  return {
    id: t.id,
    ticketNumber: t.ticketNumber,
    title: t.title,
    description: t.description,
    category: t.category,
    priority: t.priority,
    status: t.status,
    resolvedNote: t.resolvedNote,
    createdAtIso: t.createdAt.toISOString(),
    updatedAtIso: t.updatedAt.toISOString(),
    resolvedAtIso: t.resolvedAt?.toISOString() ?? null,
    shopId: t.shopId,
    shopName: t.shop.name,
    createdByUserId: t.createdBy.id,
    createdByName: t.createdBy.name,
    assignedToUserId: t.assignedTo?.id ?? null,
    assignedToName: t.assignedTo?.name ?? null,
    replyCount: t._count.replies,
  };
}

const ticketInclude = {
  shop: { select: { name: true } },
  createdBy: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true } },
  _count: { select: { replies: true } },
} as const;

export async function createSupportTicket(input: unknown) {
  const user = await requireUser();
  if (!hasPermission(user, "create_support_ticket")) {
    throw new Error("সাপোর্ট টিকেট তোলার অনুমতি নেই");
  }
  const parsed = createTicketSchema.parse(input);
  await assertShopAccess(parsed.shopId, user);

  await prisma.supportTicket.create({
    data: {
      shopId: parsed.shopId,
      createdByUserId: user.id,
      title: parsed.title,
      description: parsed.description,
      category: parsed.category,
      priority: parsed.priority,
    },
  });

  revalidatePath("/dashboard/support");
}

export async function getSupportTicketsByShop(shopId: string): Promise<TicketRow[]> {
  const user = await requireUser();
  if (!hasPermission(user, "view_support_tickets")) return [];
  await assertShopAccess(shopId, user);

  const tickets = await prisma.supportTicket.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
    include: ticketInclude,
  });

  return tickets.map(toTicketRow);
}

export async function getAllSupportTickets(filters?: {
  status?: SupportTicketStatus;
}): Promise<TicketRow[]> {
  const user = await requireUser();
  if (!hasPermission(user, "manage_support_tickets")) {
    throw new Error("সব টিকেট দেখার অনুমতি নেই");
  }

  const tickets = await prisma.supportTicket.findMany({
    where: filters?.status ? { status: filters.status } : undefined,
    orderBy: { createdAt: "desc" },
    include: ticketInclude,
  });

  return tickets.map(toTicketRow);
}

export async function getSupportTicketById(ticketId: string): Promise<{
  ticket: TicketRow;
  replies: ReplyRow[];
} | null> {
  const user = await requireUser();

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: {
      ...ticketInclude,
      replies: {
        orderBy: { createdAt: "asc" },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  if (!ticket) return null;

  const canManage = hasPermission(user, "manage_support_tickets");
  const isOwner = ticket.createdByUserId === user.id;
  if (!canManage && !isOwner) {
    throw new Error("এই টিকেট দেখার অনুমতি নেই");
  }

  return {
    ticket: toTicketRow(ticket),
    replies: ticket.replies.map((r) => ({
      id: r.id,
      content: r.content,
      createdAtIso: r.createdAt.toISOString(),
      userId: r.user.id,
      userName: r.user.name,
      userEmail: r.user.email,
    })),
  };
}

export async function replySupportTicket(input: unknown) {
  const user = await requireUser();
  const parsed = replyTicketSchema.parse(input);

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: parsed.ticketId },
    select: { id: true, createdByUserId: true, status: true },
  });

  if (!ticket) throw new Error("টিকেট পাওয়া যায়নি");

  const canManage = hasPermission(user, "manage_support_tickets");
  const isOwner = ticket.createdByUserId === user.id;
  if (!canManage && !isOwner) {
    throw new Error("এই টিকেটে উত্তর দেওয়ার অনুমতি নেই");
  }

  await prisma.$transaction(async (tx) => {
    await tx.supportTicketReply.create({
      data: {
        ticketId: parsed.ticketId,
        userId: user.id,
        content: parsed.content,
      },
    });

    if (canManage && ticket.status === "open") {
      await tx.supportTicket.update({
        where: { id: parsed.ticketId },
        data: { status: "in_progress" },
      });
    }
  });

  revalidatePath(`/dashboard/support/${parsed.ticketId}`);
}

export async function updateTicketStatus(input: unknown) {
  const user = await requireUser();
  if (!hasPermission(user, "manage_support_tickets")) {
    throw new Error("টিকেট আপডেট করার অনুমতি নেই");
  }

  const parsed = updateTicketStatusSchema.parse(input);

  await prisma.supportTicket.update({
    where: { id: parsed.ticketId },
    data: {
      status: parsed.status,
      resolvedNote: parsed.resolvedNote ?? null,
      resolvedAt:
        parsed.status === "resolved" || parsed.status === "closed"
          ? new Date()
          : null,
    },
  });

  revalidatePath(`/dashboard/support/${parsed.ticketId}`);
  revalidatePath("/dashboard/admin/support");
}
