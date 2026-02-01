// app/actions/system-settings.ts

"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-session";
import { revalidatePath } from "next/cache";
import {
  getSupportContactCachedData,
  revalidateSupportContact,
} from "@/lib/system/support-contact";

type SupportContactInput = {
  supportPhone?: string | null;
  supportWhatsapp?: string | null;
};

function normalizePhone(value?: string | null) {
  if (value === undefined) return undefined;
  const str = value?.toString().trim() ?? "";
  return str ? str : null;
}

async function ensureSettingsRow() {
  const row = await prisma.systemSetting.findFirst();
  if (row) return row;
  return prisma.systemSetting.create({
    data: { id: "singleton", updatedAt: new Date() },
  });
}

export async function getSupportContact() {
  return getSupportContactCachedData();
}

export async function updateSupportContact(input: SupportContactInput) {
  const user = await requireUser();
  const isSuperAdmin = user.roles?.includes("super_admin") ?? false;
  if (!isSuperAdmin) {
    throw new Error("Only super admin can update support contact");
  }

  const supportPhone = normalizePhone(input.supportPhone);
  const supportWhatsapp = normalizePhone(input.supportWhatsapp);

  await ensureSettingsRow();

  await prisma.systemSetting.update({
    where: { id: "singleton" },
    data: {
      supportPhone,
      supportWhatsapp,
      updatedBy: user.id,
    },
  });

  revalidateSupportContact();
  revalidatePath("/dashboard/shops");
  revalidatePath("/super-admin/system-settings");
}
